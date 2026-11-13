import random
import time

import audio_service
import micropyxel as pyxel
from maopaoBleApp import BleAppService, DATA_TYPE_RAW
from pyxel_prompt_sound import PromptSoundPlayer


SCR_W = 32
SCR_H = 16
FPS = 30
BANK = 0
COLKEY = 0
ASSET_PATH = "assets/duck_hunt.png"

CROSSHAIR_NORMAL = (67, 119, 3, 3)
CROSSHAIR_FIRE = (73, 119, 3, 3)
CROSSHAIR_STEP = 1
FIRE_FLASH_MS = 120
VISIBLE_X_MIN = 4
VISIBLE_X_MAX = 27

DUCK_FRAMES = (
    (64, 124, 8, 7),
    (73, 124, 8, 7),
    (82, 124, 8, 7),
)
DUCK_W = 8
DUCK_H = 7
DUCK_X_MIN = VISIBLE_X_MIN
DUCK_X_MAX = VISIBLE_X_MAX - DUCK_W + 1
DUCK_FRAME_MS = 120
DUCK_DURATION_MIN_MS = 2000
DUCK_DURATION_MAX_MS = 5000
SPAWN_DELAY_MS = 450

HIT_FRAMES = (
    (96, 118, 9, 8, 1000),
    (112, 118, 10, 9, 30),
    (128, 118, 8, 12, 100),
)
FALL_STEP_MS = 50
MAX_MISSES = 3

STATE_READY = "ready"
STATE_WAITING = "waiting"
STATE_FLYING = "flying"
STATE_HIT_ANIM = "hit_anim"
STATE_FALLING = "falling"
STATE_GAME_OVER = "gameover"

FIRE_SOUND = "fire.ogg"
SOUND_VOLUME = 100
SOUND_PACKETS_PER_UPDATE = 5
SOUND_PRIME_PACKETS = 2
SOUND_FRAME_DURATION_MS = 20

COL_BLACK = 0
COL_WHITE = 7
COL_RED = 8

SIMPLE_AIM = 0x01
SIMPLE_FIRE = 0x02


def ticks_ms():
    return time.ticks_ms()


def ticks_diff(a, b):
    return time.ticks_diff(a, b)


def ticks_add(a, b):
    return time.ticks_add(a, b)


class DuckHuntApp:
    def __init__(self):
        self.ble = BleAppService(
            "DuckHunt",
            app_version="1.0.0",
            max_message=384,
            simple_queue_limit=8,
        )
        self.sound_enabled = True
        self._register_ble_protocol()
        self.audio = audio_service.audio
        self.audio_initialized = False
        self.sound = PromptSoundPlayer(
            audio=self.audio,
            asset_root="assets",
            debug=False,
            log_prefix="[DuckHuntSound]",
            prime_packets=SOUND_PRIME_PACKETS,
            packets_per_update=SOUND_PACKETS_PER_UPDATE,
            frame_duration_ms=SOUND_FRAME_DURATION_MS,
            stop_handler=self.stop_sound,
        )

        pyxel.init(start_audio=False)
        pyxel.images(BANK).load_from_png(0, 0, ASSET_PATH, True)
        self.prepare_sound()
        self.reset_game(start=False)

    def start(self):
        self.ble.start()
        pyxel.run(self.update, self.draw, fps=FPS, on_exit=self.on_exit)

    def on_exit(self, rt, reason, exc):
        try:
            self.sound.deinit()
        except Exception:
            pass
        if self.audio_initialized:
            try:
                self.audio.deinit()
            except Exception:
                pass
        try:
            pyxel.destroy()
        except Exception:
            pass
        self.ble.deinit()

    def _register_ble_protocol(self):
        self.ble.on_simple(self._handle_simple_control)
        for command in ("U", "D", "L", "R", "F"):
            self.ble.realtime(command, self._make_realtime_handler(command))
            self.ble.command(command, self._make_command_handler(command), priority=0, mutates=False)
        self.ble.realtime("control", self._handle_realtime_control)
        self.ble.command("duckHuntControl", self._cmd_control, priority=0, mutates=False)
        self.ble.command("duckHuntSetSound", self._cmd_set_sound, priority=1, mutates=True)
        self.ble.command("duckHuntGetState", self._cmd_get_state, priority=1, mutates=False)
        self.ble.command("getState", self._cmd_get_state, priority=1, mutates=False)
        self.ble.set_state_provider(self.state_payload)

    def _handle_simple_control(self, data_type, payload, context):
        if data_type != DATA_TYPE_RAW:
            return
        if len(payload) == 3 and payload[0] == SIMPLE_AIM:
            self.aim(payload[1], payload[2])
            return
        if len(payload) == 1 and payload[0] == SIMPLE_FIRE:
            self.fire()
            return
        if len(payload) != 1:
            return
        command = payload[0]
        if command == 85:
            self.control("U")
        elif command == 68:
            self.control("D")
        elif command == 76:
            self.control("L")
        elif command == 82:
            self.control("R")
        elif command == 70:
            self.control("F")

    def _make_realtime_handler(self, command):
        def handler(data, message=None):
            self.control(command)
        return handler

    def _make_command_handler(self, command):
        def handler(params, message=None):
            self.control(command)
            return self.state_payload()
        return handler

    def _handle_realtime_control(self, data, message=None):
        if isinstance(data, dict):
            self.control(data.get("command", ""))
        else:
            self.control(data)

    def _cmd_control(self, params, message=None):
        if isinstance(params, dict):
            self.control(params.get("command", ""))
        else:
            self.control(params)
        return self.state_payload()

    def _cmd_get_state(self, params, message=None):
        return self.state_payload()

    def _cmd_set_sound(self, params, message=None):
        value = params.get("enabled") if isinstance(params, dict) else params
        if isinstance(value, str):
            enabled = value.strip().lower() not in ("0", "false", "off", "no")
        else:
            enabled = bool(value)
        self.sound_enabled = enabled
        if not enabled:
            self.stop_sound()
        self.publish_state("duckHuntSoundChanged")
        return self.state_payload()

    def reset_game(self, start=False):
        now = ticks_ms()
        self.state = STATE_WAITING if start else STATE_READY
        self.hits = 0
        self.misses = 0
        self.crosshair_x = (SCR_W - CROSSHAIR_NORMAL[2]) // 2
        self.crosshair_y = (SCR_H - CROSSHAIR_NORMAL[3]) // 2
        self.fire_until_ms = now
        self.duck = None
        self.next_spawn_ms = now if start else None
        self.hit_x = 0
        self.hit_y = 0
        self.hit_frame = 0
        self.hit_frame_started_ms = now
        self.fall_last_ms = now
        self.publish_state("duckHuntRestarted" if start else "duckHuntReady")

    def control(self, value):
        command = str(value or "").strip().upper()
        if command == "U":
            self.crosshair_y = max(0, self.crosshair_y - CROSSHAIR_STEP)
        elif command == "D":
            self.crosshair_y = min(SCR_H - CROSSHAIR_NORMAL[3], self.crosshair_y + CROSSHAIR_STEP)
        elif command == "L":
            self.crosshair_x = max(0, self.crosshair_x - CROSSHAIR_STEP)
        elif command == "R":
            self.crosshair_x = min(SCR_W - CROSSHAIR_NORMAL[2], self.crosshair_x + CROSSHAIR_STEP)
        elif command == "F":
            self.fire()

    def aim(self, x, y):
        # The WebApp sends the desired sight center in the native 32x16 space.
        x = max(0, min(SCR_W - 1, int(x)))
        y = max(0, min(SCR_H - 1, int(y)))
        self.crosshair_x = max(
            0,
            min(SCR_W - CROSSHAIR_NORMAL[2], x - CROSSHAIR_NORMAL[2] // 2),
        )
        self.crosshair_y = max(
            0,
            min(SCR_H - CROSSHAIR_NORMAL[3], y - CROSSHAIR_NORMAL[3] // 2),
        )

    def fire(self):
        if self.state == STATE_GAME_OVER:
            self.reset_game(start=True)
            return

        now = ticks_ms()
        self.fire_until_ms = ticks_add(now, FIRE_FLASH_MS)
        self.play_sound(FIRE_SOUND)

        if self.state == STATE_READY:
            self.state = STATE_WAITING
            self.next_spawn_ms = now
            self.publish_state("duckHuntStarted")
            return
        if self.state != STATE_FLYING or self.duck is None:
            return

        if self.aim_over_duck(now):
            self.start_hit(now)

    def aim_over_duck(self, now):
        x, y = self.duck_position(now)
        aim_x = self.crosshair_x + CROSSHAIR_NORMAL[2] // 2
        aim_y = self.crosshair_y + CROSSHAIR_NORMAL[3] // 2
        local_x = aim_x - x
        local_y = aim_y - y
        if not (0 <= local_x < DUCK_W and 0 <= local_y < DUCK_H):
            return False

        elapsed = max(0, ticks_diff(now, self.duck["start_ms"]))
        frame = DUCK_FRAMES[(elapsed // DUCK_FRAME_MS) % len(DUCK_FRAMES)]
        source_x = local_x
        if self.duck["direction"] < 0:
            source_x = frame[2] - 1 - local_x
        return pyxel.images(BANK).pget(
            frame[0] + source_x,
            frame[1] + local_y,
        ) != COLKEY

    def spawn_duck(self, now):
        start_x = random.randint(DUCK_X_MIN, DUCK_X_MAX)
        left_space = start_x - DUCK_X_MIN
        right_space = DUCK_X_MAX - start_x
        if left_space == 0:
            direction = 1
            available = right_space
        elif right_space == 0:
            direction = -1
            available = left_space
        else:
            direction = random.choice((-1, 1))
            available = left_space if direction < 0 else right_space
        distance = random.randint(min(6, available), min(14, available))
        target_x = start_x + distance * direction
        self.duck = {
            "start_ms": now,
            "duration_ms": random.randint(DUCK_DURATION_MIN_MS, DUCK_DURATION_MAX_MS),
            "start_x": start_x,
            "target_x": target_x,
            "direction": direction,
        }
        self.state = STATE_FLYING

    def duck_position(self, now):
        elapsed = max(0, ticks_diff(now, self.duck["start_ms"]))
        duration = self.duck["duration_ms"]
        if elapsed > duration:
            elapsed = duration
        x = self.duck["start_x"] + (
            (self.duck["target_x"] - self.duck["start_x"]) * elapsed // duration
        )
        y = SCR_H - ((SCR_H + DUCK_H) * elapsed // duration)
        return x, y

    def start_hit(self, now):
        duck_x, duck_y = self.duck_position(now)
        widest = 10
        hit_x_max = VISIBLE_X_MAX - widest + 1
        self.hit_x = max(VISIBLE_X_MIN, min(hit_x_max, duck_x))
        self.hit_y = duck_y
        self.hit_frame = 0
        self.hit_frame_started_ms = now
        self.fall_last_ms = now
        self.duck = None
        self.hits += 1
        self.state = STATE_HIT_ANIM
        self.publish_state("duckHuntHit")

    def register_miss(self, now):
        self.duck = None
        self.misses += 1
        if self.misses >= MAX_MISSES:
            self.state = STATE_GAME_OVER
            self.publish_state("duckHuntGameOver")
        else:
            self.state = STATE_WAITING
            self.next_spawn_ms = ticks_add(now, SPAWN_DELAY_MS)
            self.publish_state("duckHuntMiss")

    def update(self, rt):
        self.ble.poll(budget_ms=1, max_messages=2, max_simple_messages=4)
        self.sound.update(budget_packets=SOUND_PACKETS_PER_UPDATE)
        now = ticks_ms()

        if self.state == STATE_WAITING and ticks_diff(now, self.next_spawn_ms) >= 0:
            self.spawn_duck(now)
        elif self.state == STATE_FLYING:
            if ticks_diff(now, self.duck["start_ms"]) >= self.duck["duration_ms"]:
                self.register_miss(now)
        elif self.state == STATE_HIT_ANIM:
            self.update_hit_animation(now)
        elif self.state == STATE_FALLING:
            self.update_fall(now)

        self.ble.poll(budget_ms=1, max_messages=2, max_simple_messages=4)

    def update_hit_animation(self, now):
        while self.hit_frame < len(HIT_FRAMES) - 1:
            hold_ms = HIT_FRAMES[self.hit_frame][4]
            if ticks_diff(now, self.hit_frame_started_ms) < hold_ms:
                return
            self.hit_frame_started_ms = ticks_add(self.hit_frame_started_ms, hold_ms)
            self.hit_frame += 1

        hold_ms = HIT_FRAMES[self.hit_frame][4]
        if ticks_diff(now, self.hit_frame_started_ms) >= hold_ms:
            self.state = STATE_FALLING
            self.fall_last_ms = now

    def update_fall(self, now):
        while ticks_diff(now, self.fall_last_ms) >= FALL_STEP_MS:
            self.fall_last_ms = ticks_add(self.fall_last_ms, FALL_STEP_MS)
            self.hit_y += 1
            if self.hit_y >= SCR_H:
                self.state = STATE_WAITING
                self.next_spawn_ms = ticks_add(now, SPAWN_DELAY_MS)
                self.publish_state("duckHuntReady")
                return

    def draw(self, rt):
        pyxel.cls(COL_BLACK)
        if self.state == STATE_READY:
            self.draw_centered_text(3, "FIRE", COL_RED)
            self.draw_centered_text(10, "START", COL_WHITE)
            return
        if self.state == STATE_GAME_OVER:
            self.draw_centered_text(2, "OVER", COL_RED)            
            self.draw_centered_text(10, "HIT:" + str(self.hits), COL_WHITE)
            return

        pyxel.text(0, 0, "M" + str(self.misses), COL_WHITE)
        now = ticks_ms()
        if self.state == STATE_FLYING and self.duck is not None:
            self.draw_duck(now)
        elif self.state == STATE_HIT_ANIM or self.state == STATE_FALLING:
            self.draw_hit_frame()
        self.draw_crosshair(now)

    def draw_duck(self, now):
        elapsed = max(0, ticks_diff(now, self.duck["start_ms"]))
        frame = DUCK_FRAMES[(elapsed // DUCK_FRAME_MS) % len(DUCK_FRAMES)]
        x, y = self.duck_position(now)
        draw_width = frame[2] * self.duck["direction"]
        pyxel.blt(x, y, BANK, frame[0], frame[1], draw_width, frame[3], COLKEY)

    def draw_hit_frame(self):
        frame = HIT_FRAMES[self.hit_frame]
        pyxel.blt(self.hit_x, self.hit_y, BANK, frame[0], frame[1], frame[2], frame[3], COLKEY)

    def draw_crosshair(self, now):
        frame = CROSSHAIR_FIRE if ticks_diff(self.fire_until_ms, now) > 0 else CROSSHAIR_NORMAL
        pyxel.blt(
            self.crosshair_x,
            self.crosshair_y,
            BANK,
            frame[0],
            frame[1],
            frame[2],
            frame[3],
            COLKEY,
        )

    def draw_centered_text(self, y, value, color):
        text = str(value)
        pyxel.text(max(0, (SCR_W - len(text) * 4) // 2), y, text, color)

    def state_payload(self):
        return {
            "state": self.state,
            "hits": self.hits,
            "misses": self.misses,
            "canFire": True,
            "soundEnabled": self.sound_enabled,
        }

    def publish_state(self, event):
        if not self.ble.connected:
            return False
        return self.ble.send_event(event, self.state_payload(), priority=1)

    def prepare_sound(self):
        if not self.ensure_audio():
            return False
        if not self.sound.preload(FIRE_SOUND):
            print("[DuckHunt] preload sound failed:", self.sound.last_error)
            return False
        return True

    def play_sound(self, path):
        if not self.sound_enabled:
            return False
        if not self.ensure_audio():
            return False
        ok = self.sound.play(path, interrupt=True)
        if not ok:
            print("[DuckHunt] sound failed:", self.sound.last_error)
        return ok

    def stop_sound(self, player=None):
        return (player or self.sound).cancel()

    def ensure_audio(self):
        if self.audio_initialized:
            return True
        try:
            self.audio.init(
                enable_input=False,
                enable_output=True,
                with_opus_encoder=False,
                with_opus_decoder=True,
            )
            self.audio.configure(output_volume=SOUND_VOLUME, input_gain=1.0)
            self.audio_initialized = True
            return True
        except Exception as exc:
            print("[DuckHunt] audio init failed:", exc)
            return False


def appMain():
    DuckHuntApp().start()


if __name__ == "__main__":
    appMain()
