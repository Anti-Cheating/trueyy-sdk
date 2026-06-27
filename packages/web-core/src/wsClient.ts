import { io, type Socket } from "socket.io-client";
import type { SocketEventMap, SocketEventName } from "./types.js";

export interface WsClientOptions {
  baseUrl: string;
  token: string;
  onReconnect?: () => void;
  /** Fires on every (re)connect — used to (re)join the session room. */
  onConnect?: () => void;
}

/**
 * Thin Socket.io wrapper with token-in-handshake and typed events.
 * Cortex's existing socketService accepts `auth.token` in the handshake.
 */
export class WsClient {
  private socket: Socket | null = null;
  private opts: WsClientOptions;
  private listeners = new Map<SocketEventName, Set<(e: unknown) => void>>();

  constructor(opts: WsClientOptions) {
    this.opts = opts;
  }

  connect(): void {
    if (this.socket) return;
    this.socket = io(this.opts.baseUrl, {
      auth: { token: this.opts.token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    // "connect" fires on the initial connection AND every reconnection —
    // socket.io room membership is per-connection, so we re-join each time.
    this.socket.on("connect", () => this.opts.onConnect?.());
    this.socket.on("reconnect", () => this.opts.onReconnect?.());

    // Replay any registered listeners onto the new socket.
    for (const [evt, set] of this.listeners.entries()) {
      for (const fn of set) {
        // socket.io-client's typed-event listener overloads are very strict
        // about callback shapes; cast to any for our typed event-emitter
        // boundary (types are enforced by `on()` below, not by the raw socket).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.socket.on(evt, fn as any);
      }
    }
  }

  on<E extends SocketEventName>(event: E, fn: (e: SocketEventMap[E]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const wrapped = fn as (e: unknown) => void;
    set.add(wrapped);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.socket?.on(event, wrapped as any);
    return () => {
      set?.delete(wrapped);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.socket?.off(event, wrapped as any);
    };
  }

  emit(event: string, ...args: unknown[]): void {
    this.socket?.emit(event, ...args);
  }

  /**
   * Swap the active token (used when refreshSessionToken fires before
   * expiry). Disconnects + reconnects with the new auth.
   */
  updateToken(newToken: string): void {
    this.opts.token = newToken;
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connect();
    }
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
