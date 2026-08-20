import { computed, reactive } from 'vue';
import { hasJeeWebBridge, loadPixelMug, sendDuckHuntResultToBot } from '../template/bubbleClient';
import { openMpsApp } from '../template/mpsLaunch';
import { useBleSession } from '../template/bleSession';
import { t } from '../i18n';
import type { AppStatus, DeviceInfo, DuckHuntGameState } from '../types';

type LaunchPhase = 'idle' | 'requesting' | 'preparing' | 'switching' | 'ready' | 'failed';
type DuckHuntMessage = {
  event?: string;
  state?: DuckHuntGameState;
  hits?: number;
  misses?: number;
  canFire?: boolean;
  soundEnabled?: boolean;
};

const state = reactive({
  status: 'idle' as AppStatus,
  message: '',
  device: null as DeviceInfo | null,
  bleState: 'idle',
  launchPhase: 'idle' as LaunchPhase,
  gameState: 'unknown' as DuckHuntGameState,
  hits: 0,
  misses: 0,
  canFire: false,
  soundEnabled: true,
  soundUpdating: false,
});

let bleSession: ReturnType<typeof useBleSession> | null = null;
let dataCleanup: (() => void) | null = null;
const SIMPLE_AIM = 0x01;
const SIMPLE_FIRE = 0x02;
let simpleSending = false;
let pendingAim: Uint8Array | null = null;
let pendingFire = 0;
let lastAimX = -1;
let lastAimY = -1;

function getBle() {
  if (!bleSession) bleSession = useBleSession();
  return bleSession;
}

const busy = computed(() => ['loading', 'installing', 'connecting'].includes(state.status));
const canSend = computed(() => Boolean(state.device) && getBle().isReady.value);
const canEnter = computed(() => state.launchPhase === 'ready');
const statusText = computed(() => {
  if (!state.message) return '';
  return hasJeeWebBridge() ? state.message : `${state.message} ${t('status.browserMock')}`;
});
const openButtonLabel = computed(() => {
  if (busy.value) return t('landing.opening');
  if (state.launchPhase === 'failed') return t('landing.retry');
  return t('landing.install');
});

export function useDuckHunt() {
  async function refreshDevice() {
    state.status = 'loading';
    state.message = t('status.findingDevice');
    try {
      state.device = await loadPixelMug();
      state.status = state.device ? 'ready' : 'error';
      state.message = state.device ? t('status.deviceReady') : t('status.deviceMissing');
    } catch (error) {
      state.status = 'error';
      state.message = errorMessage(error);
    }
  }

  async function openOnDevice() {
    if (!state.device) await refreshDevice();
    if (!state.device) return false;
    state.status = 'installing';
    state.launchPhase = 'requesting';
    state.message = t('status.launching');
    try {
      await openMpsApp(state.device, undefined, { onPhase: updateLaunchPhase });
      state.status = 'ready';
      state.launchPhase = 'ready';
      state.message = t('status.launchReady');
      return true;
    } catch (error) {
      state.status = 'error';
      state.launchPhase = 'failed';
      state.message = errorMessage(error);
      return false;
    }
  }

  async function connectDevice() {
    if (!state.device) await refreshDevice();
    if (!state.device) return;
    state.status = 'connecting';
    state.message = t('status.connectingBle');
    try {
      await getBle().ensureConnected(state.device);
      state.bleState = getBle().state.connection;
      state.status = 'connected';
      state.message = t('status.bleConnected');
      await syncState();
    } catch (error) {
      state.status = 'error';
      state.message = errorMessage(error);
    }
  }

  async function control(command: 'U' | 'D' | 'L' | 'R' | 'F') {
    if (!state.device || !canSend.value) return false;
    if (command === 'F') return fire();
    try {
      await getBle().sendSimpleRaw(new Uint8Array([command.charCodeAt(0)]));
      return true;
    } catch (error) {
      state.status = 'error';
      state.message = errorMessage(error);
      return false;
    }
  }

  function aim(x: number, y: number) {
    if (!state.device || !canSend.value) return false;
    const nextX = Math.max(0, Math.min(31, Math.round(x)));
    const nextY = Math.max(0, Math.min(15, Math.round(y)));
    if (nextX === lastAimX && nextY === lastAimY) return true;
    lastAimX = nextX;
    lastAimY = nextY;
    pendingAim = new Uint8Array([SIMPLE_AIM, nextX, nextY]);
    void pumpSimple();
    return true;
  }

  function fire() {
    if (!state.device || !canSend.value) return false;
    pendingFire = Math.min(2, pendingFire + 1);
    void pumpSimple();
    if (!hasJeeWebBridge()) state.canFire = true;
    return true;
  }

  async function toggleSound() {
    if (!state.device || !canSend.value || state.soundUpdating) return false;
    const enabled = !state.soundEnabled;
    state.soundUpdating = true;
    try {
      const response = await getBle().send(state.device, {
        method: 'duckHuntSetSound',
        params: { enabled },
        id: `duck_hunt_sound_${Date.now()}`,
      }, { priority: 1, timeoutMillis: 2500 });
      const payload = responsePayload(response) as DuckHuntMessage;
      if (typeof payload?.soundEnabled === 'boolean') applyStatus(payload);
      else state.soundEnabled = enabled;
      return true;
    } catch (error) {
      state.status = 'error';
      state.message = errorMessage(error);
      return false;
    } finally {
      state.soundUpdating = false;
    }
  }

  function bindBleState() {
    void refreshDevice();
    const ble = getBle();
    const cleanupState = ble.bindState();
    dataCleanup?.();
    dataCleanup = ble.bindData(handleBleData);
    return () => {
      cleanupState();
      dataCleanup?.();
      dataCleanup = null;
    };
  }

  return {
    state,
    busy,
    canSend,
    canEnter,
    openButtonLabel,
    statusText,
    bindBleState,
    connectDevice,
    control,
    aim,
    fire,
    toggleSound,
    openOnDevice,
    refreshDevice,
  };
}

async function pumpSimple() {
  if (simpleSending || !state.device || !canSend.value) return;

  let packet: Uint8Array | null;
  if (pendingFire > 0) {
    pendingFire -= 1;
    packet = new Uint8Array([SIMPLE_FIRE]);
  } else {
    packet = pendingAim;
    pendingAim = null;
  }
  if (!packet) return;

  simpleSending = true;
  try {
    await getBle().sendSimpleRaw(packet);
  } catch (error) {
    lastAimX = -1;
    lastAimY = -1;
    state.status = 'error';
    state.message = errorMessage(error);
  } finally {
    simpleSending = false;
    if (pendingFire > 0 || pendingAim) queueMicrotask(() => void pumpSimple());
  }
}

function handleBleData(event: { message?: unknown }) {
  const message = event.message as DuckHuntMessage | undefined;
  if (!message) return;
  applyStatus(message);
  if (message.event === 'duckHuntGameOver') {
    sendDuckHuntResultToBot({
      event: 'duckHuntGameOver',
      hits: state.hits,
      misses: state.misses,
      reportedAt: Date.now(),
    });
  }
}

async function syncState() {
  if (!state.device) return;
  try {
    const response = await getBle().send(state.device, {
      method: 'duckHuntGetState',
      id: `duck_hunt_state_${Date.now()}`,
    }, { priority: 1, timeoutMillis: 2500 });
    applyStatus(responsePayload(response) as DuckHuntMessage);
  } catch (error) {
    console.warn('[duck-hunt] failed to sync state', error);
  }
}

function applyStatus(message?: DuckHuntMessage) {
  if (!message) return;
  if (message.state) state.gameState = message.state;
  if (typeof message.hits === 'number') state.hits = Math.max(0, Math.floor(message.hits));
  if (typeof message.misses === 'number') state.misses = Math.max(0, Math.floor(message.misses));
  if (typeof message.canFire === 'boolean') state.canFire = message.canFire;
  if (typeof message.soundEnabled === 'boolean') state.soundEnabled = message.soundEnabled;
}

function responsePayload(response: unknown) {
  const item = response as { result?: unknown; message?: unknown } | undefined;
  const result = item?.result as { result?: unknown; message?: unknown } | undefined;
  return result?.result || result?.message || item?.message || item?.result || response;
}

function updateLaunchPhase(phase: LaunchPhase) {
  state.launchPhase = phase;
  if (phase === 'preparing') state.message = t('status.preparing');
  else if (phase === 'switching') state.message = t('status.switching');
  else if (phase === 'ready') state.message = t('status.launchReady');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || t('status.unknownError'));
}
