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
// types.ts — Shared TypeScript data contracts
//
// Defines the core interfaces shared across the app (Aircraft, TrailPoint,
// Settings, etc.). Edit here when the shape of aircraft records or persisted
// settings changes — nearly every module imports these types.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: types @ r3 (2026-10-16)
// ---------------------------------------------------------------------------

import type { ExtraPaletteKey } from './palettes';

/**
 * A single breadcrumb in an aircraft's geographic trail history.
 * Trail points are appended as new positions arrive and pruned by age/length
 * in the data layer. The Scope renderer draws fading polylines from these.
 */
export interface TrailPoint {
  /** Latitude in decimal degrees (WGS-84) */
  lat: number;
  /** Longitude in decimal degrees (WGS-84) */
  lon: number;
  /** Unix timestamp in milliseconds when this position was recorded */
  timestamp: number;
}

/**
 * Canonical representation of a tracked aircraft.
 * Fields are populated from ADS-B / MLAT receiver JSON (dump1090, readsb,
 * tar1090, etc.). Optional fields may be absent depending on the receiver
 * and the aircraft's transponder capabilities.
 */
export interface Aircraft {
  /** ICAO 24-bit Mode-S transponder address in lowercase hex (e.g., "a1b2c3") */
  hex: string;
  /** Flight number / callsign from ADS-B identification message (e.g., "UAL123") */
  flight?: string;
  // REFACTOR: flight/cs/callsign ambiguity — normalize to single field during data ingestion
  /** Callsign alias used in prototype/demo scenes — mirrors `flight` semantics */
  cs?: string;
  /** Current latitude in decimal degrees (WGS-84) */
  lat: number;
  /** Current longitude in decimal degrees (WGS-84) */
  lon: number;
  /** Altitude in feet above mean sea level (geometric or barometric, depending on source) */
  alt: number;
  /** Raw barometric altitude in feet from the transponder, before geometric correction */
  alt_baro?: number;
  /** Geometric altitude and source metadata retained for comparable separation checks. */
  alt_geom?: number;
  altitudeSource?: 'barometric' | 'geometric' | 'unknown';
  onGround?: boolean;
  /** Vertical rates in feet per minute; positive means climbing. */
  baro_rate?: number;
  geom_rate?: number;
  /** Ground speed in knots */
  gs: number;
  /** Track angle in degrees true (0-360), representing the aircraft's ground track direction */
  trk: number;
  /** Track alias — some receiver formats use `track` instead of `trk` */
  track?: number;
  /** Squawk transponder code as a 4-digit octal string (e.g., "1200", "7700") */
  sqk?: string;
  /** Squawk alias — some receiver formats use `squawk` instead of `sqk` */
  squawk?: string;
  /** Operator or airline name (e.g., "United Airlines"), enriched from hex database lookup */
  op?: string;
  /** Emergency status string (e.g., "general", "lifeguard", "minfuel"), or null if none */
  emg?: string | null;
  /** ICAO aircraft type designator (e.g., "B738", "A320", "C172") */
  type?: string;
  /** Aircraft registration / tail number (e.g., "N12345") */
  registration?: string;
  /**
   * Multilateration source indicator.
   * - boolean `true` if the position was derived via MLAT rather than ADS-B.
   * - string[] listing the receiver stations that contributed to the MLAT fix.
   */
  // REFACTOR: mlat union type (boolean | string[]) makes type narrowing difficult; consider discriminated union
  mlat?: boolean | string[];
  /** ADS-B protocol version supported by the transponder (0, 1, or 2) */
  adsb_version?: number;
  /** Seconds since the last message was received from this aircraft */
  seen?: number;
  /** Total number of Mode-S messages received from this aircraft in the current session */
  messages?: number;
  /** High-resolution timestamp (seconds since epoch) of the last data update */
  lastUpdateTime?: number;
  /** Geographic trail history — an ordered array of past positions for trail rendering */
  geoTrail?: TrailPoint[];
}

/**
 * Aggregate statistics for the current monitoring session.
 * Displayed in the UI status bar and used for session summaries.
 */
export interface SessionStats {
  /** Total number of unique ICAO hex addresses seen this session */
  uniqueAircraftCount: number;
  /** Total Mode-S messages received across all aircraft */
  messagesCount: number;
  /** Breakdown of position sources by type */
  sourceDistribution: {
    /** Count of positions derived from ADS-B (direct transponder broadcast) */
    adsb: number;
    /** Count of positions derived from multilateration (MLAT) */
    mlat: number;
    /** Count of positions from other sources (TIS-B, ADSR, etc.) */
    other: number;
  };
}

/**
 * All user-configurable parameters for the radar scope.
 * Persisted to localStorage and synchronized via RadarContext.
 * The Scope rendering engine reads these every frame via a ref to avoid
 * re-renders on each settings change.
 */
export interface ScopeSettings {
  /** Radar display range in nautical miles (radius from center to outer ring) */
  range: number;
  /** Whether to draw velocity prediction vector lines extending from each aircraft */
  showVectors: boolean;
  /** Whether to draw fading geographic trail polylines behind each aircraft */
  showTrails: boolean;
  /** Whether to render airport markers (crosses) and ICAO labels */
  showAirports: boolean;
  /** Whether to render navaid markers (VOR/NDB dots) and identifiers */
  showNavaids: boolean;
  /** Whether to render runway centerlines on the scope */
  showRunways: boolean;
  /** Whether to render airspace classification polygons (Class B, C, D, E) */
  showAirspaces: boolean;
  /** Opacity percentage for the entire cached airspace layer (0–100). */
  airspaceOpacity?: number;
  /** Whether to render Class B airspace */
  showClassB: boolean;
  /** Whether to render Class C airspace */
  showClassC: boolean;
  /** Whether to render Class D airspace */
  showClassD: boolean;
  /** Whether to render Class E airspace */
  showClassE: boolean;
  /** Whether to render Special Use and other airspace types */
  showClassOther: boolean;
  /** Color scheme selection for airspace classes */
  airspaceColorScheme?: 'theme' | 'classic' | 'neon' | 'monochrome' | 'high-contrast' | 'pastel' | ExtraPaletteKey;
  /** Whether alert sounds are enabled for emergency squawks and conflicts */
  soundEnabled: boolean;
  /** Legacy numeric theme index (deprecated in favor of string-based theme keys) */
  themeIndex: number;
  /** UI chrome theme key — controls toolbar, panel, and DataTable styling */
  uiTheme: string;
  /** Canvas scope theme key — controls radar colors (may differ from uiTheme) */
  scopeTheme: string;
  /** Independent interface color palette. */
  uiPalette?: 'layout' | ExtraPaletteKey;
  /** Fill the radar viewport independently from sweep animation. */
  fillViewport?: boolean;
  stationName?: string;
  setupEnabled?: boolean;
  setupCompleted?: boolean;
  compactSettings?: boolean;
  keepScopeInView?: boolean;
  crtEffect?: boolean;
  vfdEffect?: boolean;
  /** Sweep animation style: rotating line, expanding pulse ring, or static display */
  sweepStyle: 'rotate' | 'pulse' | 'none';
  /** Label detail level: 'mini' (callsign + FL), 'compact' (+ speed), 'full' (+ heading/type/squawk) */
  labelDensity: 'mini' | 'compact' | 'full';
  /** Number of concentric range rings to draw (default 4) */
  ringCount?: number;
  /** Whether to color aircraft symbols by altitude gradient instead of uniform color */
  altColor?: boolean;
  /** Whether to display separation conflict alert indicators between aircraft pairs */
  showConflicts?: boolean;
  /** Home station latitude in decimal degrees (WGS-84) — center of the radar display */
  homeLat: number;
  /** Home station longitude in decimal degrees (WGS-84) — center of the radar display */
  homeLon: number;
  /** WebSocket URL for real-time aircraft data streaming */
  wsUrl: string;
  /** Whether WebSocket data source is enabled (vs. HTTP polling) */
  wsEnabled: boolean;
  /** HTTP polling URL for aircraft.json endpoint */
  dataUrl: string;
  /** Polling interval in milliseconds for HTTP data fetching */
  fetchIntervalMs: number;
  /** Duration of one full sweep rotation in seconds */
  sweepDurationS: number;
  /** Maximum number of trail points retained per aircraft */
  maxTrailLength: number;
  /** Trail point expiry time in minutes — older points are pruned */
  trailFadeTimeMinutes: number;
  /** Aircraft chevron symbol size in CSS pixels */
  aircraftSymbolSize: number;
  /** Length of the heading indicator line extending from aircraft symbols, in pixels */
  headingLineLength: number;
  /** Velocity vector prediction length in minutes (how far ahead the vector extends) */
  vectorMinutes: number;
  /** Maximum number of airport markers to render (nearest N airports) */
  maxAirportsDisplay: number;
  /** Minimum runway length in feet — shorter runways are hidden to reduce clutter */
  minRunwayLengthFt: number;
  /** Alert sound preset for emergency and conflict notifications */
  alertSound?: 'classic-siren' | 'fast-siren' | 'wobble-siren' | 'hi-lo-alert' | 'tri-tone-alarm' | 'beep' | 'chime' | 'bell' | 'pulsar' | 'radio';
  /** Whether click-drag panning of the radar center is enabled */
  enableDragPan?: boolean;
}
