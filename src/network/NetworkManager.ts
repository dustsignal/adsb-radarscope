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
// NetworkManager.ts — Feed ingestion orchestrator
//
// Drives data ingestion — HTTP polling (with AbortController timeouts) or Beast
// WebSocket — normalizing and validating aircraft records before handing them to
// RadarContext. Edit to change feed handling or add a new data source.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: NetworkManager @ r1 (2026-06-19)
// ---------------------------------------------------------------------------

import { Aircraft } from '../types';
import { CONFIG } from '../config';
import { AircraftWebSocketClient } from './WebSocketClient';

export interface NetworkManagerOptions {
  onAircraftUpdate: (aircraft: Aircraft[]) => void;
  onStatusChange?: (status: string) => void;
  dataUrl?: string;
  wsUrl?: string | null;
  wsEnabled?: boolean;
  fetchIntervalMs?: number;
  maxRetryAttempts?: number;
}

// Earth radius in nautical miles — used by the Haversine formula below.
const EARTH_RADIUS_NM = 3440.065;
const LOCAL_PROXY_PATH = '/__adsb_proxy';

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized === '0.0.0.0' ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

/**
 * Route cross-origin HTTP feeds through the local build/runtime relay. Hosted
 * deployments keep using their configured URL directly; only a loopback-hosted
 * app opts into this workaround.
 */
export function resolveDataRequestUrl(dataUrl: string, pageUrl?: string): string {
  const currentPage = pageUrl ?? (
    typeof window !== 'undefined' ? window.location.href : undefined
  );
  if (!currentPage) return dataUrl;

  try {
    const page = new URL(currentPage);
    const target = new URL(dataUrl, page);
    const isHttpFeed = target.protocol === 'http:' || target.protocol === 'https:';
    if (
      isLoopbackHostname(page.hostname) &&
      isHttpFeed &&
      target.origin !== page.origin
    ) {
      return `${page.origin}${LOCAL_PROXY_PATH}?url=${encodeURIComponent(target.href)}`;
    }
  } catch {
    // Preserve the original value so the normal polling error remains actionable.
  }
  return dataUrl;
}

/**
 * Haversine great-circle distance between two lat/lon points.
 *
 * Returns the distance in nautical miles.  The formula works by:
 *   1. Converting the lat/lon deltas to radians
 *   2. Computing the central angle via the Haversine identity
 *   3. Multiplying by Earth's radius in NM
 *
 * Used to filter aircraft within the configured range from the home position.
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_NM * c;
}

/**
 * Validates that a raw aircraft object has the minimum required fields:
 * a non-empty hex identifier and valid lat/lon coordinates within range.
 */
export function isValidAircraft(raw: any): boolean {
  return (
    raw &&
    raw.hex &&
    typeof raw.hex === 'string' &&
    raw.hex.trim() !== '' &&
    raw.lat !== undefined &&
    raw.lon !== undefined &&
    !isNaN(Number(raw.lat)) &&
    !isNaN(Number(raw.lon)) &&
    Math.abs(Number(raw.lat)) <= 90 &&
    Math.abs(Number(raw.lon)) <= 180
  );
}

/**
 * Normalizes a raw aircraft JSON object into the canonical Aircraft shape.
 *
 * Handles several backend variations:
 *   - alt_baro may be the string "ground", a number, or absent (fall back to alt_geom)
 *   - squawk codes 7500/7600/7700 are flagged as emergencies
 *   - field aliases (track/trk, squawk/sqk, type/t, registration/r) are mapped
 *     so downstream renderers can use a consistent interface
 */
export function normalizeAircraft(raw: any): Aircraft {
  const hex = (raw.hex || '').trim().toUpperCase();
  const flight = raw.flight ? raw.flight.trim() : undefined;

  // Keep unknown altitude distinct from the display's zero fallback.
  const finite = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);
  const onGround = raw.alt_baro === 'ground';
  const altBaroVal = finite(raw.alt_baro) ? raw.alt_baro : undefined;
  const altGeomVal = finite(raw.alt_geom) ? raw.alt_geom : undefined;
  const altitudeSource = altBaroVal !== undefined ? 'barometric'
    : altGeomVal !== undefined ? 'geometric' : 'unknown';
  const alt = onGround ? 0 : (altBaroVal ?? altGeomVal ?? 0);

  // Detect emergency squawk codes (7500 hijack, 7600 radio failure, 7700 general emergency)
  const isEmergency = raw.squawk && ['7500', '7600', '7700'].includes(String(raw.squawk).trim());
  const emgValue = raw.emg || (isEmergency ? 'Emergency' : null);

  return {
    hex,
    flight,
    cs: flight, // compatibility alias with prototype scenes
    lat: Number(raw.lat),
    lon: Number(raw.lon),
    alt,
    alt_baro: altBaroVal,
    alt_geom: altGeomVal,
    altitudeSource,
    onGround,
    baro_rate: finite(raw.baro_rate) ? raw.baro_rate : undefined,
    geom_rate: finite(raw.geom_rate) ? raw.geom_rate : undefined,
    // Guard numeric coercion with Number.isFinite so a malformed field (e.g. "ABC",
    // null, Infinity) cannot seed NaN into downstream conflict/projection math.
    gs: Number.isFinite(Number(raw.gs)) ? Number(raw.gs) : 0,
    trk: Number.isFinite(Number(raw.track)) ? Number(raw.track) : 0,
    track: Number.isFinite(Number(raw.track)) ? Number(raw.track) : undefined,
    sqk: raw.squawk ? String(raw.squawk).trim() : undefined,
    squawk: raw.squawk ? String(raw.squawk).trim() : undefined,
    op: raw.op || raw.operator,
    emg: emgValue,
    type: raw.type || raw.t,
    registration: raw.registration || raw.r,
    mlat: raw.mlat,
    adsb_version: raw.adsb_version,
    seen: raw.seen,
    messages: raw.messages,
    lastUpdateTime: Date.now(),
  };
}

/**
 * Validates that a URL starts with an expected scheme.
 * Logs a warning for invalid URLs rather than throwing, to avoid breaking
 * existing setups that may use non-standard or proxied URLs.
 */
function validateUrl(url: string, expectedSchemes: string[], label: string): boolean {
  const isRelativeHttpUrl =
    label === 'dataUrl' &&
    expectedSchemes.includes('http://') &&
    /^(?:\/|\.\/|\.\.\/)/.test(url);
  const valid = isRelativeHttpUrl || expectedSchemes.some((scheme) => url.startsWith(scheme));
  if (!valid) {
    console.warn(
      `[Network Manager] ${label} "${url}" does not start with ${expectedSchemes.join(' or ')}. ` +
      'Connections may fail.'
    );
  }
  return valid;
}

export class NetworkManager {
  private homeLat: number;
  private homeLon: number;
  private range: number;

  private onAircraftUpdate: (aircraft: Aircraft[]) => void;
  private onStatusChange?: (status: string) => void;

  private dataUrl: string;
  private wsUrl: string | null;
  private wsEnabled: boolean;
  private fetchIntervalMs: number;
  private maxRetryAttempts: number;

  private wsClient: AircraftWebSocketClient | null = null;
  private pollTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Aborts the in-flight HTTP poll on stop()/offline or when it exceeds its timeout. */
  private pollAbortController: AbortController | null = null;
  private active: boolean = false;
  private isOffline: boolean = false;

  /** Guards against polling/WebSocket overlap during connection transitions */
  private isTransitioning: boolean = false;

  private consecutivePollFailures: number = 0;
  private currentPollIntervalMs: number;

  constructor(
    homeLat: number,
    homeLon: number,
    range: number,
    options: NetworkManagerOptions
  ) {
    this.homeLat = homeLat;
    this.homeLon = homeLon;
    this.range = range;

    this.onAircraftUpdate = options.onAircraftUpdate;
    this.onStatusChange = options.onStatusChange;

    this.dataUrl = options.dataUrl || CONFIG.DEFAULT_DATA_URL;
    this.wsUrl = options.wsUrl !== undefined ? options.wsUrl : CONFIG.WEBSOCKET_URL;
    this.wsEnabled = options.wsEnabled !== undefined ? options.wsEnabled : CONFIG.WEBSOCKET_ENABLED;
    this.fetchIntervalMs = options.fetchIntervalMs || CONFIG.FETCH_INTERVAL_MS;
    this.maxRetryAttempts = options.maxRetryAttempts || CONFIG.MAX_RETRY_ATTEMPTS;

    this.currentPollIntervalMs = this.fetchIntervalMs;

    this.handleOnline = this.handleOnline.bind(this);
    this.handleOffline = this.handleOffline.bind(this);

    // Validate configured URLs at construction time so misconfigurations
    // surface early in the console rather than silently failing later.
    validateUrl(this.dataUrl, ['http://', 'https://'], 'dataUrl');
    if (this.wsUrl) {
      validateUrl(this.wsUrl, ['ws://', 'wss://'], 'wsUrl');
    }
  }

  public updatePosition(lat: number, lon: number, range: number): void {
    this.homeLat = lat;
    this.homeLon = lon;
    this.range = range;
  }

  /**
   * Starts the network manager: registers browser online/offline listeners
   * and initiates either a WebSocket connection or HTTP polling.
   *
   * Wrapped in try-catch so that if anything throws during startup the
   * event listeners are cleaned up, preventing a leak where stop() is
   * never called by the consumer.
   */
  public start(): void {
    if (this.active) return;
    this.active = true;

    try {
      // Check initial online status (guard for SSR / non-browser environments)
      this.isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

      // Register online/offline event listeners so we can pause activity
      // when the device loses connectivity and resume when it returns.
      if (typeof window !== 'undefined') {
        window.addEventListener('online', this.handleOnline);
        window.addEventListener('offline', this.handleOffline);
      }

      if (this.isOffline) {
        this.updateStatus('Offline');
        return;
      }

      if (this.wsEnabled && this.wsUrl) {
        this.connectWebSocket();
      } else {
        this.startPolling();
      }
    } catch (err) {
      // Clean up listeners so they don't leak if the caller never calls stop()
      console.error('[Network Manager] Error during start:', err);
      this.active = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
      }
    }
  }

  public stop(): void {
    if (!this.active) return;
    this.active = false;

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }

    this.stopPolling();

    if (this.wsClient) {
      this.wsClient.disconnect();
      this.wsClient = null;
    }

    this.updateStatus('Disconnected');
  }

  private updateStatus(status: string): void {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  /**
   * Creates a WebSocket client, wires up event handlers, and connects.
   * On success the client stops any active polling. On failure or
   * disconnect, it falls back to HTTP polling via fallbackToPolling().
   *
   * The isTransitioning flag prevents a race where stopPolling() has not
   * finished before fallbackToPolling() re-starts it (e.g. when the WS
   * fails immediately after connect).
   */
  private connectWebSocket(): void {
    if (!this.active || this.isOffline || !this.wsUrl) return;

    this.isTransitioning = true;
    this.updateStatus('Connecting (WS)...');

    this.wsClient = new AircraftWebSocketClient(this.wsUrl);

    this.wsClient.on('connect', () => {
      console.log('[Network Manager] WebSocket connection established');
      this.updateStatus('Connected (WS)');
      this.stopPolling();
      // Transition complete — polling is stopped and WS is live
      this.isTransitioning = false;
    });

    this.wsClient.on('aircraft', (data) => {
      const rawList = data.aircraft || [];
      const validList = rawList.filter(isValidAircraft).map(normalizeAircraft);
      this.onAircraftUpdate(validList);
    });

    this.wsClient.on('disconnect', (data) => {
      console.warn('[Network Manager] WebSocket disconnected');
      if (data.willReconnect) {
        this.updateStatus('Reconnecting (WS)...');
      } else {
        this.updateStatus('Disconnected (WS)');
      }

      this.isTransitioning = false;
      this.fallbackToPolling();
    });

    this.wsClient.on('error', (data) => {
      console.error('[Network Manager] WebSocket client error:', data.message);
      this.updateStatus('Error (WS)');

      this.isTransitioning = false;
      this.fallbackToPolling();
    });

    this.wsClient.connect();
  }

  /**
   * Begins the HTTP polling loop. Each iteration fetches aircraft JSON from
   * dataUrl, validates/normalizes the results, and schedules the next poll.
   *
   * Retry / backoff strategy:
   *   - On success: reset interval to the configured base (fetchIntervalMs).
   *   - On failure: multiply interval by 1.5, capped at 30 seconds.
   *   - After maxRetryAttempts consecutive failures, report disconnected
   *     but keep polling so recovery is automatic.
   */
  private startPolling(): void {
    if (!this.active || this.isOffline) return;
    if (this.pollTimeout) return; // Already polling

    const poll = async () => {
      // Abort the request if it outlives twice the poll interval (min 5 s) so a
      // hung/dead backend can't block indefinitely or let requests pile up.
      const controller = new AbortController();
      this.pollAbortController = controller;
      const timeoutMs = Math.max(this.fetchIntervalMs * 2, 5000);
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const requestUrl = resolveDataRequestUrl(this.dataUrl);
        const response = await fetch(requestUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseText = await response.text();
        let data: { aircraft?: unknown[] };
        try {
          data = JSON.parse(responseText) as { aircraft?: unknown[] };
        } catch {
          throw new Error(
            'Feed returned invalid JSON. For a local build, start the app with the provided local server.'
          );
        }

        // Reset backoff on success
        this.consecutivePollFailures = 0;
        this.currentPollIntervalMs = this.fetchIntervalMs;

        this.updateStatus('Connected');

        const rawList = Array.isArray(data.aircraft) ? data.aircraft : [];
        const validList = rawList.filter(isValidAircraft).map(normalizeAircraft);
        this.onAircraftUpdate(validList);

      } catch (err: unknown) {
        this.consecutivePollFailures += 1;
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Network Manager] Poll error (${this.consecutivePollFailures}/${this.maxRetryAttempts}):`, errMsg);

        // Exponential backoff: multiply by 1.5 each failure, cap at 30 s
        this.currentPollIntervalMs = Math.min(
          this.currentPollIntervalMs * 1.5,
          30000
        );

        if (this.consecutivePollFailures >= this.maxRetryAttempts) {
          this.updateStatus('Disconnected (Retry limit exceeded)');
        } else {
          this.updateStatus('Error (Retrying...)');
        }
      } finally {
        clearTimeout(timeoutId);
        if (this.pollAbortController === controller) {
          this.pollAbortController = null;
        }
      }

      // Schedule next poll if manager is still active
      if (this.active && !this.isOffline) {
        this.pollTimeout = setTimeout(poll, this.currentPollIntervalMs);
      }
    };

    // Initial poll fires immediately (0 ms delay)
    this.pollTimeout = setTimeout(poll, 0);
  }

  private stopPolling(): void {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    // Abort any in-flight fetch so a slow/dead backend request doesn't linger
    // after the manager is stopped or the device goes offline.
    if (this.pollAbortController) {
      this.pollAbortController.abort();
      this.pollAbortController = null;
    }
  }

  /**
   * Switches from WebSocket to HTTP polling when the WS connection is lost.
   * The isTransitioning guard prevents this from firing while connectWebSocket
   * is still in the middle of stopping polling and setting up a new WS client.
   */
  private fallbackToPolling(): void {
    if (this.isTransitioning) return;
    if (!this.pollTimeout && this.active && !this.isOffline) {
      console.log('[Network Manager] Falling back to HTTP polling');
      this.currentPollIntervalMs = this.fetchIntervalMs; // FIX: reset backoff interval when falling back to polling, was staying at exponential max (30s)
      this.startPolling();
    }
  }

  /** Browser 'online' event handler — resets backoff and re-establishes the preferred connection strategy. */
  private handleOnline(): void {
    console.log('[Network Manager] Network connection online');
    this.isOffline = false;
    this.consecutivePollFailures = 0;
    this.currentPollIntervalMs = this.fetchIntervalMs;

    if (this.active) {
      if (this.wsEnabled && this.wsUrl) {
        // Re-establish WebSocket connection
        if (this.wsClient) {
          this.wsClient.disconnect();
        }
        this.connectWebSocket();
      } else {
        this.startPolling();
      }
    }
  }

  /** Browser 'offline' event handler — tears down all connections to avoid futile requests. */
  private handleOffline(): void {
    console.log('[Network Manager] Network connection offline');
    this.isOffline = true;
    this.updateStatus('Offline');

    // Pause all activity — both polling and WS are stopped until we come back online
    this.stopPolling();
    if (this.wsClient) {
      this.wsClient.disconnect();
    }
  }
}
