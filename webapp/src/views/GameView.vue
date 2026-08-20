<script setup lang="ts">
import { computed, ref } from 'vue';
import { t } from '../i18n';
import { useDuckHunt } from '../state/duckHunt';

const store = useDuckHunt();
const aimX = ref(16);
const aimY = ref(8);
const firePressed = ref(false);
const gameOver = computed(() => store.state.gameState === 'gameover');
let activePointer: number | null = null;

function updateAim(event: PointerEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  const normalizedX = portrait
    ? (event.clientY - rect.top) / rect.height
    : (event.clientX - rect.left) / rect.width;
  const normalizedY = portrait
    ? (rect.right - event.clientX) / rect.width
    : (event.clientY - rect.top) / rect.height;
  const x = Math.max(0, Math.min(31, Math.round(normalizedX * 31)));
  const y = Math.max(0, Math.min(15, Math.round(normalizedY * 15)));
  if (x === aimX.value && y === aimY.value) return;
  aimX.value = x;
  aimY.value = y;
  store.aim(x, y);
}

function startAim(event: PointerEvent) {
  if (!store.canSend.value || activePointer !== null) return;
  activePointer = event.pointerId;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  updateAim(event);
}

function moveAim(event: PointerEvent) {
  if (event.pointerId === activePointer) updateAim(event);
}

function releaseAim(event: PointerEvent) {
  if (event.pointerId !== activePointer) return;
  activePointer = null;
}

function pressFire(event: PointerEvent) {
  if (!store.canSend.value) return;
  firePressed.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  store.fire();
  navigator.vibrate?.(24);
}

function releaseFire() {
  firePressed.value = false;
}

function keyboardFire(event: KeyboardEvent) {
  if (event.repeat || !store.canSend.value) return;
  firePressed.value = true;
  store.fire();
}
</script>

<template>
  <main class="controller-page">
    <header class="controller-hud">
      <span class="brand">DUCK HUNT</span>
      <span>{{ t('game.hits') }} <b>{{ store.state.hits }}</b></span>
      <span>{{ t('game.misses') }} <b>{{ store.state.misses }}/3</b></span>
      <button
        class="sound-toggle"
        :class="{ muted: !store.state.soundEnabled }"
        :disabled="!store.canSend.value || store.state.soundUpdating"
        :aria-label="store.state.soundEnabled ? 'Mute sound effects' : 'Enable sound effects'"
        :aria-pressed="store.state.soundEnabled"
        @click="store.toggleSound"
      >
        SFX {{ store.state.soundEnabled ? 'ON' : 'OFF' }}
      </button>
    </header>

    <section class="gamepad" :class="{ disconnected: !store.canSend.value }">
      <div class="control-half aim-half">
        <div
          class="aim-pad"
          role="application"
          :aria-label="t('game.aimPad')"
          @pointerdown.prevent="startAim"
          @pointermove.prevent="moveAim"
          @pointerup.prevent="releaseAim"
          @pointercancel.prevent="releaseAim"
        >
          <span class="aim-pad-grid" aria-hidden="true" />
          <span
            class="aim-pad-cursor"
            :style="{ left: `${aimX / 31 * 100}%`, top: `${aimY / 15 * 100}%` }"
            aria-hidden="true"
          />
          <span class="aim-pad-label">AIM&nbsp; {{ aimX.toString().padStart(2, '0') }},{{ aimY.toString().padStart(2, '0') }}</span>
        </div>
      </div>

      <div class="gamepad-center" aria-hidden="true"><i /><i /><i /></div>

      <div class="control-half fire-half">
        <button
          class="fire-button"
          :class="{ pressed: firePressed, restart: gameOver }"
          :disabled="!store.canSend.value"
          @pointerdown.prevent="pressFire"
          @pointerup.prevent="releaseFire"
          @pointercancel.prevent="releaseFire"
          @keydown.space.prevent="keyboardFire"
          @keydown.enter.prevent="keyboardFire"
          @keyup.space.prevent="releaseFire"
          @keyup.enter.prevent="releaseFire"
        >
          <span>{{ gameOver ? t('game.restart') : 'FIRE' }}</span>
          <small>{{ gameOver ? t('game.restartHint') : 'F' }}</small>
        </button>
      </div>
    </section>
  </main>
</template>
