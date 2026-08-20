declare module '../../../../jeejio-bubble/sdk/WebApp.js' {
  export class BubbleWebApp {
    constructor(options?: Record<string, unknown>);
    ble?: {
      connect(device: unknown, options?: Record<string, unknown>): Promise<unknown>;
      send(device: unknown, payload: unknown, options?: Record<string, unknown>): Promise<unknown>;
      onState(listener: (event: { state?: string; data?: string }) => void): void;
      off(event: string, listener: (...args: unknown[]) => void): void;
    };
    getDevice(options?: Record<string, unknown>): Promise<unknown>;
    getDevices(options?: Record<string, unknown>): Promise<unknown[]>;
  }
}
declare module '../../../../jeejio-bubble/sdk/BleAppClient.js' {
  export class BleAppClient {
    constructor(ble: unknown, options?: Record<string, unknown>);
    state: { connection: string; message: string; lastError: string };
    ensureConnected(device?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    reconnect(options?: Record<string, unknown>): Promise<unknown>;
    send(device: unknown, payload: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
    sendRealtime(channel: string, data: unknown, options?: Record<string, unknown>): Promise<unknown>;
    on(type: string, handler: (event: any) => void): void;
    off(type: string, handler: (event: any) => void): void;
  }
  export function isBleAppDisconnectError(error: unknown): boolean;
}
