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
// airspace.worker.ts — Airspace MBTiles query worker
//
// Web Worker that fetches only visible static vector tiles and caches decoded
// airspace geometry with bounded memory. Runs off the main thread;
// communicate with it through AirspaceDbService.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: airspace-worker @ r1 (2026-06-19)
// ---------------------------------------------------------------------------

import VectorTile from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { viewportTiles, viewportBounds, AirspaceViewport } from '../utils/airspaceViewport';

export interface AirspacePolygon {
  id: string;
  name: string;
  class: string; // B, C, D, E, Special, etc.
  lowerLimit?: string;
  upperLimit?: string;
  geometry: Array<Array<{ lat: number; lon: number; stroke?: boolean }>>; // Array of coordinate rings (outer + holes)
  tileBounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
}

/**
 * Determines if a line segment between two tile coordinates lies on a tile boundary.
 * Vector tile features in geojson2vt are clipped to [-buffer, extent + buffer] by default.
 * In our python script, extent is 4096 and buffer is 64.
 * We check if both endpoints lie on the same tile boundary (with a small tolerance).
 */
function isBoundarySegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  extent: number
): boolean {
  const eps = 2; // Tolerance for floating point/rounding in tile coordinates

  // Left boundary or buffer: both endpoints are at or beyond the left boundary (0)
  if (ax <= eps && bx <= eps) return true;

  // Right boundary or buffer: both endpoints are at or beyond the right boundary (extent)
  if (ax >= extent - eps && bx >= extent - eps) return true;

  // Top boundary or buffer: both endpoints are at or beyond the top boundary (0)
  if (ay <= eps && by <= eps) return true;

  // Bottom boundary or buffer: both endpoints are at or beyond the bottom boundary (extent)
  if (ay >= extent - eps && by >= extent - eps) return true;

  return false;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Sutherland-Hodgman polygon clipping algorithm.
 * Clips a polygon represented by a list of points against the rectangular [0, extent] tile boundary.
 */
function clipPolygon(polygon: Point[], extent: number): Point[] {
  let outputList = polygon;

  // Clip against Left: x >= 0
  outputList = clipAgainstEdge(outputList, (p) => p.x >= 0, (p1, p2) => {
    const t = -p1.x / (p2.x - p1.x);
    return { x: 0, y: Math.max(0, Math.min(extent, p1.y + t * (p2.y - p1.y))) };
  });

  // Clip against Right: x <= extent
  outputList = clipAgainstEdge(outputList, (p) => p.x <= extent, (p1, p2) => {
    const t = (extent - p1.x) / (p2.x - p1.x);
    return { x: extent, y: Math.max(0, Math.min(extent, p1.y + t * (p2.y - p1.y))) };
  });

  // Clip against Top: y >= 0
  outputList = clipAgainstEdge(outputList, (p) => p.y >= 0, (p1, p2) => {
    const t = -p1.y / (p2.y - p1.y);
    return { x: Math.max(0, Math.min(extent, p1.x + t * (p2.x - p1.x))), y: 0 };
  });

  // Clip against Bottom: y <= extent
  outputList = clipAgainstEdge(outputList, (p) => p.y <= extent, (p1, p2) => {
    const t = (extent - p1.y) / (p2.y - p1.y);
    return { x: Math.max(0, Math.min(extent, p1.x + t * (p2.x - p1.x))), y: extent };
  });

  return outputList;
}

function clipAgainstEdge(
  points: Point[],
  inside: (p: Point) => boolean,
  intersection: (p1: Point, p2: Point) => Point
): Point[] {
  if (points.length === 0) return [];
  const result: Point[] = [];
  let s = points[points.length - 1];

  for (const p of points) {
    if (inside(p)) {
      if (!inside(s)) {
        result.push(intersection(s, p));
      }
      result.push(p);
    } else if (inside(s)) {
      result.push(intersection(s, p));
    }
    s = p;
  }
  return result;
}

function tilePointToLatLon(
  px: number,
  py: number,
  extent: number,
  x: number,
  y: number,
  z: number
): { lat: number; lon: number } {
  // Fractional position within the tile (0..1)
  const fx = px / extent;
  const fy = py / extent;

  // Absolute tile coordinates (can be fractional, spanning tile boundaries)
  const tx = x + fx;
  const ty = y + fy;

  // Reverse Mercator: tile X -> longitude
  const lon = (tx / Math.pow(2, z)) * 360 - 180;

  // Reverse Mercator: tile Y -> latitude (inverse Gudermannian)
  const n = Math.PI - (2 * Math.PI * ty) / Math.pow(2, z);
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

  return { lat, lon };
}


let tileBase = '';
let available = new Set<string>();
let initPromise: Promise<void> | null = null;
let queryController: AbortController | null = null;
const decodedCache = new Map<string, { polygons: AirspacePolygon[]; points: number }>();
let cachedPoints = 0;

async function initialize(baseUrl: string) {
  if (tileBase) return;
  if (!initPromise) initPromise = (async () => {
    const response = await fetch(`${baseUrl}/data/airspace/manifest.json`);
    if (!response.ok) throw new Error('Viewport airspace tiles are missing. Rebuild with build.py to package the existing MBTiles.');
    const manifest = await response.json();
    if (manifest.version !== 1 || !/^[a-f0-9]{20}$/.test(manifest.revision) || !Array.isArray(manifest.tiles)) throw new Error('Invalid airspace tile index');
    available = new Set(manifest.tiles);
    tileBase = `${baseUrl}/data/airspace/${manifest.revision}`;
  })().catch(err => { initPromise = null; throw err; });
  await initPromise;
}

async function loadTile(key: string, signal: AbortSignal): Promise<AirspacePolygon[]> {
  const cached = decodedCache.get(key);
  if (cached) { decodedCache.delete(key); decodedCache.set(key, cached); return cached.polygons; }
  const response = await fetch(`${tileBase}/${key}.pbf`, { signal });
  if (!response.ok) throw new Error(`Airspace tile ${key}: HTTP ${response.status}`);
  let bytes = new Uint8Array(await response.arrayBuffer());
  // Some static hosts transparently decode gzip; support either representation.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  if (signal.aborted) throw new DOMException('View changed', 'AbortError');
  const [tileZoom, tileX, tileY] = key.split('/').map(Number);
  const tile = new (VectorTile as any).VectorTile(new Pbf(bytes));
  const polygonsMap = new Map<string, AirspacePolygon>();
              Object.keys(tile.layers).forEach((layerName) => {
                const layer = tile.layers[layerName];

                // Calculate the geographic bounding box of this tile
                const minLatLon = tilePointToLatLon(0, 0, layer.extent, tileX, tileY, tileZoom);
                const maxLatLon = tilePointToLatLon(layer.extent, layer.extent, layer.extent, tileX, tileY, tileZoom);
                const tileBounds = {
                  minLat: Math.min(minLatLon.lat, maxLatLon.lat),
                  maxLat: Math.max(minLatLon.lat, maxLatLon.lat),
                  minLon: Math.min(minLatLon.lon, maxLatLon.lon),
                  maxLon: Math.max(minLatLon.lon, maxLatLon.lon)
                };

                for (let fIdx = 0; fIdx < layer.length; fIdx++) {
                  const feature = layer.feature(fIdx);
                  const geom = feature.loadGeometry();
                  const props = feature.properties;

                  // Parse rings coordinates projected back to geographic coords, identifying boundary segments
                  const rings: Array<Array<{ lat: number; lon: number; stroke?: boolean }>> = [];
                  geom.forEach((ring: any) => {
                    if (ring.length === 0) return;

                    // Clip the tile-space polygon ring to the exact [0, extent] boundaries to avoid overlapping fills
                    const clippedRing = clipPolygon(ring, layer.extent);
                    if (clippedRing.length === 0) return;

                    const points: Array<{ lat: number; lon: number; stroke?: boolean }> = [];
                    for (let i = 0; i < clippedRing.length; i++) {
                      const pt = clippedRing[i];
                      const nextPt = clippedRing[(i + 1) % clippedRing.length];

                      const segmentIsBoundary = isBoundarySegment(
                        pt.x,
                        pt.y,
                        nextPt.x,
                        nextPt.y,
                        layer.extent
                      );

                      const geoPt = tilePointToLatLon(pt.x, pt.y, layer.extent, tileX, tileY, tileZoom);
                      points.push({
                        lat: geoPt.lat,
                        lon: geoPt.lon,
                        stroke: !segmentIsBoundary
                      });
                    }
                    if (points.length > 0) {
                      rings.push(points);
                    }
                  });

                  if (rings.length > 0) {
                    // Use ?? so a legitimate feature.id of 0 isn't discarded in favor
                    // of the loop index (which would collide distinct features onto one id).
                    const airspaceId = `${key}/${layerName}/${feature.id ?? fIdx}`;
                    polygonsMap.set(airspaceId, {
                      id: airspaceId,
                      name: props.name || 'Unnamed Airspace',
                      class: props.class || props.type || 'Special',
                      lowerLimit: props.lower_limit || props.floor,
                      upperLimit: props.upper_limit || props.ceiling,
                      geometry: rings,
                      tileBounds
                    });
                  }
                }
              });

  const polygons = [...polygonsMap.values()];
  const points = polygons.reduce((sum, poly) => sum + poly.geometry.reduce((n, ring) => n + ring.length, 0), 0);
  if (points <= 250000) {
    decodedCache.set(key, { polygons, points }); cachedPoints += points;
    while (decodedCache.size > 64 || cachedPoints > 250000) {
      const oldest = decodedCache.keys().next().value!;
      cachedPoints -= decodedCache.get(oldest)!.points; decodedCache.delete(oldest);
    }
  }
  return polygons;
}

function intersectsViewport(poly: AirspacePolygon, view: AirspaceViewport) {
  const bounds = viewportBounds(view);
  const center = (bounds.east + bounds.west) / 2;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const ring of poly.geometry) for (const pt of ring) {
    const lon = center + ((pt.lon - center + 540) % 360) - 180;
    minLat = Math.min(minLat, pt.lat); maxLat = Math.max(maxLat, pt.lat);
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
  }
  return maxLat >= bounds.south && minLat <= bounds.north && maxLon >= bounds.west && minLon <= bounds.east;
}

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;
  try {
    if (type === 'cancel_queries') { queryController?.abort(); return; }
    if (type === 'init') {
      await initialize(payload.baseUrl);
      self.postMessage({ id, type: 'init_success', payload: 'Viewport tile index ready' });
    } else if (type === 'query_airspaces') {
      queryController?.abort();
      const controller = new AbortController(); queryController = controller;
      if (!tileBase) throw new Error('Airspace tile index is not initialized');
      const keys = viewportTiles(payload).filter(key => available.has(key));
      const result: AirspacePolygon[] = [];
      let cursor = 0;
      // Bound parallel downloads and decoding, even on wide or polar views.
      await Promise.all(Array.from({ length: Math.min(4, keys.length) }, async () => {
        while (cursor < keys.length && !controller.signal.aborted) {
          const polygons = await loadTile(keys[cursor++], controller.signal);
          result.push(...polygons.filter(poly => intersectsViewport(poly, payload)));
        }
      }));
      if (controller.signal.aborted) throw new DOMException('View changed', 'AbortError');
      self.postMessage({ id, type: 'query_success', payload: result });
    } else throw new Error(`Unknown worker message: ${type}`);
  } catch (err) {
    self.postMessage({ id, type: 'error', payload: err instanceof Error ? err.message : String(err) });
  }
};
