// ADSB Radarscope
// Author: dustsignal
// GitHub: https://github.com/dustsignal/adsb-radarscope
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// ---------------------------------------------------------------------------
// WebSocketClient.ts — Beast-protocol WebSocket client
//
// Low-level WebSocket client that decodes the Beast binary protocol into aircraft
// records. Used by NetworkManager when the WebSocket data source is selected.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: WebSocketClient @ r1 (2026-06-19)
// ---------------------------------------------------------------------------

import { Aircraft } from '../types';

export interface WSConnectPayload {
  timestamp: number;
  url: string;
}

export interface WSDisconnectPayload {
  timestamp: number;
  willReconnect: boolean;
}

export interface WSAircraftPayload {
  type: 'init' | 'update';
  aircraft: any[]; // Raw aircraft structures received from the WebSocket
  timestamp: number;
}

export interface WSErrorPayload {
  type: string;
  message: string;
}

export interface WSMsgInit {
  type: 'init';
  aircraft: any[];
  timestamp: number;
}

export interface WSMsgUpdate {
  type: 'update';
  aircraft: any[];
  timestamp: number;
}

export interface WSMsgPong {
  type: 'pong';
}

export type WSIncomingMessage = WSMsgInit | WSMsgUpdate | WSMsgPong;

export interface WSMsgPing {
  type: 'ping';
}

export type WSOutgoingMessage = WSMsgPing;

export interface WebSocketClientOptions {
  /** Base delay in ms before the first reconnect attempt (default 3000) */
  reconnectDelay?: number;
  /** Upper bound in ms for the exponential backoff delay (default 30000) */
  maxReconnectDelay?: number;
}

/**
 * Maps event names to their callback signatures.
 * This type drives the generic on/off/emit methods so that listeners
 * receive correctly-typed payloads without manual casting.
 */
type EventCallbackMap = {
  connect: (data: WSConnectPayload) => void;
  disconnect: (data: WSDisconnectPayload) => void;
  aircraft: (data: WSAircraftPayload) => void;
  error: (data: WSErrorPayload) => void;
};

export class AircraftWebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private reconnecting: boolean = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private currentReconnectDelay: number;

  private listeners: {
    [K in keyof EventCallbackMap]: EventCallbackMap[K][];
  } = {
    connect: [],
    disconnect: [],
    aircraft: [],
    error: [],
  };

  constructor(url: string, options: WebSocketClientOptions = {}) {
    this.url = url;
    this.reconnectDelay = options.reconnectDelay || 3000;
    this.maxReconnectDelay = options.maxReconnectDelay || 30000;
    this.currentReconnectDelay = this.reconnectDelay;
  }

  /**
   * Opens a new WebSocket connection. No-op if one is already open.
   * Wires up onopen / onmessage / onerror / onclose handlers that
   * drive the event lifecycle described in the file header.
   */
  public connect(): void {
    if (this.ws) return;

    console.log(`[WebSocket Client] Connecting to ${this.url}`);

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WebSocket Client] Connected');
        this.connected = true;
        this.reconnecting = false;
        this.currentReconnectDelay = this.reconnectDelay;

        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }

        this.emit('connect', {
          timestamp: Date.now(),
          url: this.url,
        });
        this.startPing();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data);
          // SECURITY: validate message shape before processing to prevent malformed data from crashing handlers
          if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
            console.warn('[WebSocket Client] Received malformed message, ignoring');
            return;
          }
          this.handleMessage(message as WSIncomingMessage);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error('[WebSocket Client] Message parse error:', err);
          this.emit('error', {
            type: 'parse_error',
            message: errMsg,
          });
        }
      };

      this.ws.onerror = () => {
        console.error('[WebSocket Client] WebSocket error');
        this.emit('error', {
          type: 'connection_error',
          message: 'WebSocket connection error occurred',
        });
      };

      this.ws.onclose = () => {
        console.log('[WebSocket Client] Connection closed');
        if (this.reconnectTimeout) { // FIX: clear pending reconnect timeout before starting new reconnect to prevent overlapping attempts
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
        this.connected = false;
        this.stopPing();
        this.ws = null;

        const willReconnect = !this.reconnecting;
        this.emit('disconnect', {
          timestamp: Date.now(),
          willReconnect,
        });

        // Auto-reconnect if not explicitly disconnected
        if (willReconnect) {
          this.reconnect();
        }
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[WebSocket Client] Connection failed:', err);
      this.emit('error', {
        type: 'connection_failed',
        message: errMsg,
      });
      this.reconnect();
    }
  }

  /**
   * Schedules a reconnection attempt using exponential backoff.
   *
   * The delay starts at reconnectDelay (default 3 s) and is multiplied
   * by 1.5 after each attempt, up to maxReconnectDelay (default 30 s).
   * The delay resets to the base value in onopen when a connection succeeds.
   */
  private reconnect(): void {
    if (this.reconnecting) return;

    this.reconnecting = true;
    console.log(`[WebSocket Client] Reconnecting in ${this.currentReconnectDelay}ms`);

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.reconnecting = false;
      this.reconnectTimeout = null;
      this.connect();

      // Grow delay for next attempt (applied after connect so the current
      // attempt uses the pre-growth value)
      this.currentReconnectDelay = Math.min(
        this.currentReconnectDelay * 1.5,
        this.maxReconnectDelay
      );
    }, this.currentReconnectDelay);
  }

  /**
   * Routes an incoming parsed message to the appropriate event.
   *   - 'init'   : Full aircraft list on first connect (emitted as 'aircraft')
   *   - 'update' : Incremental aircraft delta (emitted as 'aircraft')
   *   - 'pong'   : Keepalive response — no action needed beyond confirming liveness
   */
  private handleMessage(msg: WSIncomingMessage): void {
    if (msg.type === 'init') {
      console.log(`[WebSocket Client] Initialized with ${msg.aircraft.length} aircraft`);
      this.emit('aircraft', {
        type: 'init',
        aircraft: msg.aircraft,
        timestamp: msg.timestamp,
      });
    } else if (msg.type === 'update') {
      this.emit('aircraft', {
        type: 'update',
        aircraft: msg.aircraft,
        timestamp: msg.timestamp,
      });
    } else if (msg.type === 'pong') {
      // Keepalive response — connection is healthy, nothing to do
    }
  }

  /** Starts a 30-second interval that sends ping frames to keep the connection alive. */
  private startPing(): void {
    if (this.pingInterval) return;
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public send(message: WSOutgoingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  public getStatus() {
    return {
      url: this.url,
      connected: this.connected,
      reconnecting: this.reconnecting,
      readyState: this.ws ? this.ws.readyState : undefined,
    };
  }

  /**
   * Cleanly tears down the WebSocket connection, timers, and listeners.
   *
   * BUG FIX: Previously, listener arrays were not cleared here. When
   * NetworkManager called disconnect() and then connectWebSocket() again,
   * the old callbacks accumulated alongside new ones, causing duplicate
   * event firings. We now reset all listener arrays to empty.
   */
  public disconnect(): void {
    this.stopPing();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.reconnecting = false;
    this.connected = false;

    if (this.ws) {
      // Clear native handlers to prevent double close/reconnect triggers
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    // Clear all registered listeners to prevent accumulation across
    // reconnect cycles (NetworkManager creates fresh on() bindings
    // each time it calls connectWebSocket).
    this.listeners = {
      connect: [],
      disconnect: [],
      aircraft: [],
      error: [],
    };
  }

  /** Registers a typed event listener. Use off() to remove a specific callback. */
  public on<E extends keyof EventCallbackMap>(event: E, callback: EventCallbackMap[E]): void {
    if (this.listeners[event]) {
      this.listeners[event].push(callback as any);
    }
  }

  /** Removes a previously registered listener by reference equality. */
  public off<E extends keyof EventCallbackMap>(event: E, callback: EventCallbackMap[E]): void {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(
        (cb) => cb !== callback
      ) as any;
    }
  }

  /**
   * Invokes all registered listeners for the given event.
   * Each callback is wrapped in try/catch so one failing listener
   * does not prevent subsequent listeners from executing.
   */
  private emit<E extends keyof EventCallbackMap>(event: E, data: Parameters<EventCallbackMap[E]>[0]): void {
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => {
        try {
          (callback as any)(data);
        } catch (err) {
          console.error(`[WebSocket Client] Listener error for ${event}:`, err);
        }
      });
    }
  }
}
