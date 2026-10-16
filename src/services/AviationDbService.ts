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
// AviationDbService.ts — Aviation DB worker wrapper
//
// Main-thread wrapper around aviation.worker.ts: posts requests and resolves
// typed promises (with timeouts) for airport/navaid/runway lookups. Use the
// shared instance exported from aviationDb.ts.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: AviationDbService @ r1 (2026-06-19)
// ---------------------------------------------------------------------------

import { CONFIG } from '../config';
import { Airport, Navaid, Runway } from '../workers/aviation.worker';

// Represents a single in-flight request awaiting a worker response
interface PendingRequest {
  resolve: (data: any) => void;
  reject: (err: any) => void;
}

// init() parses ~18MB of CSV in the worker, so it gets a generous ceiling;
// queries are fast and fail loudly if the worker stops responding.
const WORKER_INIT_TIMEOUT_MS = 60000;
const WORKER_QUERY_TIMEOUT_MS = 15000;

export class AviationDbService {
  private worker: Worker | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private initialized: boolean = false;
  private initPromise: Promise<{ airportsCount: number; navaidsCount: number; runwaysCount: number }> | null = null;

  constructor() {
    this.instantiateWorker();
  }

  // Creates the Web Worker using Vite/webpack-compatible URL import syntax.
  private instantiateWorker() {
    try {
      this.worker = new Worker(
        new URL('../workers/aviation.worker.ts', import.meta.url),
        { type: 'module' }
      );

      // Match incoming worker responses to their pending promise by unique request ID
      this.worker.onmessage = (event: MessageEvent) => {
        const { id, type, payload } = event.data;
        const request = this.pendingRequests.get(id);

        if (!request) return;
        this.pendingRequests.delete(id);

        if (type === 'error') {
          request.reject(new Error(payload));
        } else {
          request.resolve(payload);
        }
      };

      this.worker.onerror = (err) => {
        console.error('[Aviation DB Service] Web Worker execution error:', err);
        // Reject all outstanding requests to prevent deadlocks
        this.pendingRequests.forEach((req) => req.reject(new Error('Aviation database worker crashed')));
        this.pendingRequests.clear();
      };
    } catch (err) {
      console.error('[Aviation DB Service] Failed to initialize Web Worker:', err);
    }
  }

  /**
   * Registers a pending request with a timeout guard. If the worker never replies
   * (e.g. it hung mid-parse or crashed without firing onerror), the request is
   * rejected and removed instead of hanging forever. The stored resolve/reject
   * clear the timer so a normal reply doesn't leave a dangling timeout.
   */
  private registerPending(
    requestId: string,
    resolve: (data: any) => void,
    reject: (err: any) => void,
    timeoutMs: number,
    label: string
  ): void {
    const timeoutId = setTimeout(() => {
      if (this.pendingRequests.delete(requestId)) {
        reject(new Error(`Aviation worker request "${label}" timed out after ${timeoutMs} ms`));
      }
    }, timeoutMs);

    this.pendingRequests.set(requestId, {
      resolve: (data) => { clearTimeout(timeoutId); resolve(data); },
      reject: (err) => { clearTimeout(timeoutId); reject(err); },
    });
  }

  /**
   * Triggers the Web Worker to download, parse, and build spatial indices for the CSV files
   * @param baseUrl Application origin base URL (e.g. window.location.origin)
   */
  public init(baseUrl: string): Promise<{ airportsCount: number; navaidsCount: number; runwaysCount: number }> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Aviation database worker is not instantiated'));
        return;
      }

      const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`; // SECURITY: use crypto.randomUUID to prevent request ID collisions

      this.registerPending(
        requestId,
        (data) => {
          this.initialized = true;
          resolve(data);
        },
        (err) => {
          this.initPromise = null; // reset so we can retry on connection errors
          reject(err);
        },
        WORKER_INIT_TIMEOUT_MS,
        'init'
      );

      this.worker.postMessage({
        id: requestId,
        type: 'init',
        payload: {
          baseUrl,
          paths: CONFIG.DATA_PATHS,
        },
      });
    });

    return this.initPromise;
  }

  private sendRequest<T>(type: string, payload: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        return reject(new Error('Aviation database worker is not instantiated'));
      }
      if (!this.initialized && type !== 'init') {
        return reject(new Error('Aviation database service is not initialized'));
      }

      const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`; // SECURITY: use crypto.randomUUID to prevent request ID collisions

      this.registerPending(
        requestId,
        (data) => resolve(data as T),
        reject,
        WORKER_QUERY_TIMEOUT_MS,
        type
      );

      this.worker.postMessage({
        id: requestId,
        type,
        payload,
      });
    });
  }

  public getAirportsInRange(lat: number, lon: number, range: number, limit = 50): Promise<Airport[]> {
    return this.sendRequest<Airport[]>('getAirportsInRange', { lat, lon, range, limit });
  }

  public getNavaidsInRange(lat: number, lon: number, range: number, limit = 50): Promise<Navaid[]> {
    return this.sendRequest<Navaid[]>('getNavaidsInRange', { lat, lon, range, limit });
  }

  public getRunwaysForAirport(icao: string): Promise<Runway[]> {
    return this.sendRequest<Runway[]>('getRunwaysForAirport', { icao });
  }

  public searchAirports(query: string): Promise<Airport[]> {
    return this.sendRequest<Airport[]>('searchAirports', { query });
  }

  /**
   * Safely terminates the background worker thread and cleans up pending requests
   */
  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.pendingRequests.forEach((req) => req.reject(new Error('Aviation database service terminated')));
    this.pendingRequests.clear();
    this.initialized = false;
    this.initPromise = null;
  }
}
