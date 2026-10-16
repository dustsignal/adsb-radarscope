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
// AirspaceDbService.ts — Airspace DB worker wrapper
//
// Main-thread wrapper around airspace.worker.ts: queries airspace polygons from
// the MBTiles tileset (with request timeouts). Edit to change how airspace is
// requested or cached on the main thread.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: AirspaceDbService @ r1 (2026-06-19)
// ---------------------------------------------------------------------------

import { AirspacePolygon } from '../workers/airspace.worker';

// Represents a single in-flight request awaiting a worker response
interface PendingRequest {
  resolve: (data: any) => void;
  reject: (err: any) => void;
}

// Initialization fetches only the tile index; queries load visible tiles.
// Timeouts bound failures when a local or remote static host stops responding.
const WORKER_INIT_TIMEOUT_MS = 60000;
const WORKER_QUERY_TIMEOUT_MS = 15000;

export class AirspaceDbService {
  private worker: Worker | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private initialized: boolean = false;
  private initPromise: Promise<string> | null = null;

  constructor() {
    this.instantiateWorker();
  }

  // Creates the Web Worker using Vite/webpack-compatible URL import syntax.
  private instantiateWorker() {
    try {
      this.worker = new Worker(
        new URL('../workers/airspace.worker.ts', import.meta.url),
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
        console.error('[Airspace DB Service] Web Worker execution error:', err);
        // Reject all outstanding requests to prevent thread hang
        this.pendingRequests.forEach((req) => req.reject(new Error('Airspace database worker crashed')));
        this.pendingRequests.clear();
      };
    } catch (err) {
      console.error('[Airspace DB Service] Failed to initialize Web Worker:', err);
    }
  }

  /**
   * Registers a pending request with a timeout guard. If the worker never replies
   * (e.g. it hung mid-load or crashed without firing onerror), the request is
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
        reject(new Error(`Airspace worker request "${label}" timed out after ${timeoutMs} ms`));
      }
    }, timeoutMs);

    this.pendingRequests.set(requestId, {
      resolve: (data) => { clearTimeout(timeoutId); resolve(data); },
      reject: (err) => { clearTimeout(timeoutId); reject(err); },
    });
  }

  /**
   * Loads the small viewport tile index inside the background thread
   * @param baseUrl App base URL origin
   */
  public init(baseUrl: string): Promise<string> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Airspace database worker is not instantiated'));
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
          this.initPromise = null; // reset to allow retry
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
          dbPath: 'data/class_airspace.mbtiles',
        },
      });
    });

    return this.initPromise;
  }

  /**
   * Queries nearby vector airspace boundaries
   * @param lat Center coordinate latitude
   * @param lon Center coordinate longitude
   * @param range Radar range (NM)
   */
  public queryAirspaces(lat: number, lon: number, range: number, halfWidthNm = range, halfHeightNm = range): Promise<AirspacePolygon[]> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        return reject(new Error('Airspace worker is not instantiated'));
      }
      if (!this.initialized) {
        return reject(new Error('Airspace service is not initialized'));
      }

      const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`; // SECURITY: use crypto.randomUUID to prevent request ID collisions

      this.registerPending(
        requestId,
        (data) => resolve(data as AirspacePolygon[]),
        reject,
        WORKER_QUERY_TIMEOUT_MS,
        'query_airspaces'
      );

      this.worker.postMessage({
        id: requestId,
        type: 'query_airspaces',
        payload: { lat, lon, range, halfWidthNm, halfHeightNm },
      });
    });
  }

  /**
   * Safe termination hook
   */
  public cancelQueries(): void {
    this.worker?.postMessage({ type: 'cancel_queries' });
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.pendingRequests.forEach((req) => req.reject(new Error('Airspace service terminated')));
    this.pendingRequests.clear();
    this.initialized = false;
    this.initPromise = null;
  }
}

export const airspaceDb = new AirspaceDbService();
