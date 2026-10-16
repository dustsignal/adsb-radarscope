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
// ConflictDetector.ts — Aircraft separation / conflict analysis
//
// Computes pairwise separation and closest-approach predictions to flag potential
// conflicts. Pure logic consumed by RadarContext — edit thresholds and the
// prediction algorithm here.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: ConflictDetector @ r1 (2026-06-19)
// ---------------------------------------------------------------------------

import { Aircraft } from '../types';

export interface ConflictPair {
  a: string; // Callsign/Hex A
  b: string; // Callsign/Hex B
  sepNm: number; // Lateral separation at closest approach (nautical miles)
  sepFt: number; // Vertical separation at closest approach (feet)
  eta: number; // Seconds to closest approach
}

const EARTH_RADIUS_NM = 3440.065;

// Haversine formula: computes great-circle distance between two lat/lon points.
// Returns distance in nautical miles. Uses the spherical law of cosines approximation
// via the numerically stable atan2 formulation.
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

// Use the existing display alert envelope, with both limits breached at the
// same instant. This is a visualization heuristic, not an ATC separation rule.
const LATERAL_NM = 3;
const VERTICAL_FT = 1000;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function verticalPair(a: Aircraft, b: Aircraft): [number, number, number, number] | null {
  if (finite(a.alt_baro) && finite(b.alt_baro)) {
    return [a.alt_baro, b.alt_baro, a.baro_rate ?? 0, b.baro_rate ?? 0];
  }
  if (finite(a.alt_geom) && finite(b.alt_geom)) {
    return [a.alt_geom, b.alt_geom, a.geom_rate ?? 0, b.geom_rate ?? 0];
  }
  // Legacy/demo records carry only alt. Do not mix incompatible feed datums.
  if (a.altitudeSource === undefined && b.altitudeSource === undefined &&
      finite(a.alt) && finite(b.alt)) return [a.alt, b.alt, 0, 0];
  return null;
}

/** Continuous constant-velocity prediction in east/north/altitude space.
 * Missing vertical rates assume level flight; unknown altitudes are excluded.
 * The reported separations and ETA all describe the same predicted instant.
 */
export function detectConflicts(
  aircraftList: Aircraft[], homeLat: number, homeLon: number,
  maxRangeNm: number, predictionMinutes: number
): ConflictPair[] {
  if (![homeLat, homeLon, maxRangeNm, predictionMinutes].every(finite) ||
      maxRangeNm <= 0 || predictionMinutes < 0) return [];
  const visible = aircraftList.filter(ac => !ac.onGround &&
    ac.altitudeSource !== 'unknown' &&
    [ac.lat, ac.lon, ac.gs, ac.trk].every(finite) && ac.gs > 0 &&
    Math.abs(ac.lat) <= 90 && Math.abs(ac.lon) <= 180 &&
    haversineDistance(homeLat, homeLon, ac.lat, ac.lon) <= maxRangeNm * 1.15);
  const conflicts: ConflictPair[] = [];
  for (let i = 0; i < visible.length; i++) {
    const a = visible[i];
    for (let j = i + 1; j < visible.length; j++) {
      const b = visible[j];
      const vertical = verticalPair(a, b);
      if (!vertical) continue;
      const [altA, altB, rateA, rateB] = vertical;
      const z = altB - altA;
      const vz = (finite(rateB) ? rateB : 0) - (finite(rateA) ? rateA : 0);
      let start = 0, end = predictionMinutes;
      // Interval during which vertical separation is strictly below the limit.
      if (vz === 0) {
        if (Math.abs(z) >= VERTICAL_FT) continue;
      } else {
        const t1 = (-VERTICAL_FT - z) / vz;
        const t2 = (VERTICAL_FT - z) / vz;
        start = Math.max(start, Math.min(t1, t2));
        end = Math.min(end, Math.max(t1, t2));
      }
      if (start > end) continue;
      const currentDist = haversineDistance(a.lat, a.lon, b.lat, b.lon);
      if (currentDist > (a.gs + b.gs) * predictionMinutes / 60 + LATERAL_NM) continue;
      // Local tangent plane, with dateline wrapping. Units: NM and minutes.
      const radians = Math.PI / 180;
      const lonDelta = ((b.lon - a.lon + 540) % 360) - 180;
      const x = lonDelta * radians * EARTH_RADIUS_NM * Math.cos((a.lat + b.lat) * radians / 2);
      const y = (b.lat - a.lat) * radians * EARTH_RADIUS_NM;
      const vx = (b.gs * Math.sin(b.trk * radians) - a.gs * Math.sin(a.trk * radians)) / 60;
      const vy = (b.gs * Math.cos(b.trk * radians) - a.gs * Math.cos(a.trk * radians)) / 60;
      const speed2 = vx * vx + vy * vy;
      const dot = x * vx + y * vy;
      const c = x * x + y * y - LATERAL_NM * LATERAL_NM;
      if (speed2 < 1e-12) {
        if (c >= 0) continue;
      } else {
        const discriminant = dot * dot - speed2 * c;
        if (discriminant <= 0) continue;
        const root = Math.sqrt(discriminant);
        start = Math.max(start, (-dot - root) / speed2);
        end = Math.min(end, (-dot + root) / speed2);
      }
      if (start > end) continue;
      // Closest normalized 3D approach inside the overlapping alert intervals.
      const denom = speed2 / LATERAL_NM ** 2 + vz * vz / VERTICAL_FT ** 2;
      const closest = denom > 0 ? -(dot / LATERAL_NM ** 2 + z * vz / VERTICAL_FT ** 2) / denom : start;
      const inset = Math.min(1e-7, (end - start) / 2);
      const t = Math.max(start + inset, Math.min(end - inset, closest));
      const lateral = Math.hypot(x + vx * t, y + vy * t);
      const verticalSep = Math.abs(z + vz * t);
      if (lateral >= LATERAL_NM || verticalSep >= VERTICAL_FT) continue;
      conflicts.push({ a: a.flight || a.cs || a.hex, b: b.flight || b.cs || b.hex,
        sepNm: Math.round(lateral * 100) / 100, sepFt: Math.round(verticalSep),
        eta: Math.round(t * 60) });
    }
  }
  return conflicts;
}
