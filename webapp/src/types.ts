export type DeviceInfo = {
  name?: string;
  talId?: string;
  compatible?: string[];
  deviceTalId?: string;
  slot?: string | number;
  slotId?: string;
  deviceId?: string;
  online?: boolean;
  raw?: unknown;
};

export type DuckHuntGameState = 'ready' | 'waiting' | 'flying' | 'hit_anim' | 'falling' | 'gameover' | 'unknown';

export type AppStatus = 'idle' | 'loading' | 'ready' | 'installing' | 'connecting' | 'connected' | 'error';

// Kept for the copied template helpers that are not part of the Duck Hunt routes.
export type TimerStyle = 'radar' | 'progress' | 'spinner';
export type TimerPreset = {
  id: string;
  name: string;
  min: number;
  sec: number;
  style: TimerStyle;
};
