import { reactive } from 'vue';

export type AppLocale = 'zh-CN' | 'en-US';
type MessageKey =
  | 'landing.subtitle' | 'landing.opening' | 'landing.enter' | 'landing.retry' | 'landing.install'
  | 'status.browserMock' | 'status.findingDevice' | 'status.deviceReady' | 'status.deviceMissing'
  | 'status.launching' | 'status.preparing' | 'status.switching' | 'status.launchReady'
  | 'status.connectingBle' | 'status.bleConnected' | 'status.unknownError'
  | 'game.hits' | 'game.misses' | 'game.joystick' | 'game.aimPad' | 'game.restart' | 'game.restartHint'
  | 'ble.connected' | 'ble.connecting' | 'ble.disconnected' | 'ble.retry';

const messages: Record<AppLocale, Record<MessageKey, string>> = {
  'zh-CN': {
    'landing.subtitle': '拿起手机手柄，瞄准飞鸭并开火。',
    'landing.opening': '正在打开…',
    'landing.enter': '进入手柄',
    'landing.retry': '重试',
    'landing.install': '在 PixelMug 上安装',
    'status.browserMock': '当前为浏览器模拟模式。',
    'status.findingDevice': '正在查找 PixelMug…',
    'status.deviceReady': 'PixelMug 已就绪。',
    'status.deviceMissing': '还没有绑定 PixelMug。',
    'status.launching': '正在启动 Duck Hunt…',
    'status.preparing': '正在准备应用…',
    'status.switching': '正在切换应用…',
    'status.launchReady': 'Duck Hunt 已准备好。',
    'status.connectingBle': '正在连接 BLE…',
    'status.bleConnected': 'BLE 已连接。',
    'status.unknownError': '未知错误',
    'game.hits': '命中',
    'game.misses': 'MISS',
    'game.joystick': '瞄准摇杆',
    'game.aimPad': '滑动瞄准',
    'game.restart': '重开',
    'game.restartHint': 'GAME OVER',
    'ble.connected': 'BLE 已连接',
    'ble.connecting': '正在连接 BLE（{seconds}s）',
    'ble.disconnected': 'BLE 未连接',
    'ble.retry': '重试',
  },
  'en-US': {
    'landing.subtitle': 'Grab the controller, line up the sight, and fire.',
    'landing.opening': 'Opening…',
    'landing.enter': 'Enter controller',
    'landing.retry': 'Retry',
    'landing.install': 'Install on PixelMug',
    'status.browserMock': 'Browser mock mode.',
    'status.findingDevice': 'Finding PixelMug…',
    'status.deviceReady': 'PixelMug is ready.',
    'status.deviceMissing': 'No PixelMug is bound yet.',
    'status.launching': 'Launching Duck Hunt…',
    'status.preparing': 'Preparing app…',
    'status.switching': 'Switching app…',
    'status.launchReady': 'Duck Hunt is ready.',
    'status.connectingBle': 'Connecting BLE…',
    'status.bleConnected': 'BLE connected.',
    'status.unknownError': 'Unknown error',
    'game.hits': 'HITS',
    'game.misses': 'MISS',
    'game.joystick': 'Aim joystick',
    'game.aimPad': 'Aim touchpad',
    'game.restart': 'RESTART',
    'game.restartHint': 'GAME OVER',
    'ble.connected': 'BLE connected',
    'ble.connecting': 'Connecting BLE ({seconds}s)',
    'ble.disconnected': 'BLE disconnected',
    'ble.retry': 'Retry',
  },
};

const state = reactive({ locale: detectLocale() });

export function t(key: MessageKey, params: Record<string, string | number> = {}) {
  const template = messages[state.locale][key] || messages['en-US'][key] || key;
  return Object.entries(params).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
    template,
  );
}

function detectLocale(): AppLocale {
  const bridgeLocale = (globalThis as { JeeWeb?: { Language?: string } }).JeeWeb?.Language;
  const queryLocale = new URLSearchParams(globalThis.location?.search || '').get('lang');
  return String(queryLocale || bridgeLocale || navigator.language).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}
