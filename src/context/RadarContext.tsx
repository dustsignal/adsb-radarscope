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
// RadarContext.tsx — Global state & data orchestration
//
// React Context holding the aircraft map (ref + throttled state), persisted
// settings, session stats, conflict state, and airspace data. Hosts the polling/
// throttle loops and settings sanitation. The single source of truth most
// components subscribe to.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: RadarContext @ r5 (2026-10-16)
// ---------------------------------------------------------------------------

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { CONFIG } from '../config';
import { Aircraft, ScopeSettings, SessionStats } from '../types';
import { NetworkManager } from '../network/NetworkManager';
import { SoundManager } from '../audio/SoundManager';
import { ConflictPair, detectConflicts } from '../utils/ConflictDetector';
import { AirspacePolygon } from '../workers/airspace.worker';
import { Airport } from '../workers/aviation.worker';
import { aviationDb } from '../services/aviationDb';
import { getRuntimeSettings } from '../runtimeConfig';
import { fillsRadarViewport } from '../utils/scopeGeometry';

// Display-adapted shapes stored in context (mapped from the worker's Navaid/Runway
// rows). These intentionally match the Scope component's prop element types.
export interface ScopeNavaid {
  id: string;
  lat: number;
  lon: number;
}

export interface ScopeRunway {
  airportIcao: string;
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
  name: string;
}

export interface RadarContextType {
  aircraftMap: Record<string, Aircraft>;
  aircraftMapRef: React.MutableRefObject<Record<string, Aircraft>>;
  settings: ScopeSettings;
  selectedHex: string | null;
  networkStatus: string;
  sessionStats: SessionStats;
  conflicts: ConflictPair[];
  airspacePolygons: AirspacePolygon[];
  airports: Airport[];
  navaids: ScopeNavaid[];
  runways: ScopeRunway[];
  updateSettings: (newSettings: Partial<ScopeSettings> | ((prev: ScopeSettings) => ScopeSettings)) => void;
  selectAircraft: (hex: string | null) => void;
  setNetworkStatus: React.Dispatch<React.SetStateAction<string>>;
  updateAircraftDeltas: (updates: Aircraft[]) => void;
  clearAircraft: () => void;
}

const RadarContext = createContext<RadarContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'adsb_radar_settings';

const BASE_DEFAULT_SETTINGS: ScopeSettings = {
  range: CONFIG.DEFAULT_RANGE_NM,
  showVectors: true,
  showTrails: true,
  showAirports: true,
  showNavaids: true,
  showRunways: true,
  showAirspaces: true,
  airspaceOpacity: 100,
  showClassB: true,
  showClassC: true,
  showClassD: true,
  showClassE: true,
  showClassOther: true,
  airspaceColorScheme: 'theme',
  soundEnabled: false,
  alertSound: 'classic-siren',
  themeIndex: 0,
  uiTheme: 'phosphor',
  scopeTheme: 'phosphor',
  uiPalette: 'layout',
  fillViewport: false,
  stationName: '',
  setupEnabled: true,
  setupCompleted: false,
  compactSettings: true,
  keepScopeInView: true,
  crtEffect: false,
  vfdEffect: false,
  sweepStyle: 'rotate',
  labelDensity: 'full',
  ringCount: 4,
  altColor: false,
  showConflicts: true,
  // Use nullish coalescing (??) instead of logical OR (||) so that
  // intentional zero values (e.g. homeLat = 0) are not replaced by fallbacks.
  homeLat: CONFIG.DEFAULT_HOME_LAT ?? 42.3601,
  homeLon: CONFIG.DEFAULT_HOME_LON ?? -71.0589,
  wsUrl: CONFIG.WEBSOCKET_URL ?? '',
  wsEnabled: false,
  dataUrl: CONFIG.DEFAULT_DATA_URL,            // keep in sync with config.ts
  fetchIntervalMs: CONFIG.FETCH_INTERVAL_MS ?? 1000,
  sweepDurationS: CONFIG.SWEEP_DURATION_S ?? 3.8,
  maxTrailLength: CONFIG.MAX_TRAIL_LENGTH ?? 50,
  trailFadeTimeMinutes: CONFIG.TRAIL_FADE_TIME_MINUTES ?? 5,
  aircraftSymbolSize: CONFIG.AIRCRAFT_SYMBOL_SIZE ?? 4,
  headingLineLength: CONFIG.HEADING_LINE_LENGTH ?? 10,
  vectorMinutes: CONFIG.VECTOR_MINUTES ?? 2,
  maxAirportsDisplay: CONFIG.AIRPORT_DISPLAY.MAX_AIRPORTS_DISPLAY ?? 50,
  minRunwayLengthFt: CONFIG.AIRPORT_DISPLAY.MIN_RUNWAY_LENGTH_FT ?? 3000,
  enableDragPan: true,
};

// Earth radius in nautical miles for Haversine distance calculations
const EARTH_RADIUS_NM = 3440.065;

function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

// Clamp/validate settings loaded from localStorage. localStorage is untrusted
// (another script, or a stale/corrupt entry, could inject out-of-range numerics
// or a hostile data/ws URL), so we bound the safety-critical fields and re-check
// URL schemes before the values reach the network/render layers.
const sanitizeSettings = (
  s: ScopeSettings,
  defaults: ScopeSettings = BASE_DEFAULT_SETTINGS
): ScopeSettings => {
  const clamp = (v: unknown, min: number, max: number, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
  const validUrl = (url: unknown, schemes: string[], fallback: string): string =>
    typeof url === 'string' && schemes.some((sc) => url.startsWith(sc)) ? url : fallback;

  // The 'cartograph' and 'industrial' themes were removed; remap any stale
  // persisted value back to the default so the UI never references a gone theme.
  const removedThemes = ['cartograph', 'industrial'];
  return {
    ...s,
    fillViewport: typeof s.fillViewport === 'boolean' ? s.fillViewport : false,
    uiTheme: removedThemes.includes(s.uiTheme) ? 'phosphor' : s.uiTheme,
    scopeTheme: removedThemes.includes(s.scopeTheme) ? 'phosphor' : s.scopeTheme,
    airspaceOpacity: clamp(s.airspaceOpacity, 0, 100, defaults.airspaceOpacity ?? 100),
    range: clamp(s.range, 1, 1000, defaults.range),
    homeLat: clamp(s.homeLat, -90, 90, defaults.homeLat),
    homeLon: clamp(s.homeLon, -180, 180, defaults.homeLon),
    fetchIntervalMs: clamp(s.fetchIntervalMs, 100, 60000, defaults.fetchIntervalMs ?? 1000),
    maxTrailLength: clamp(s.maxTrailLength, 1, 5000, defaults.maxTrailLength ?? 50),
    trailFadeTimeMinutes: clamp(s.trailFadeTimeMinutes, 0, 240, defaults.trailFadeTimeMinutes ?? 5),
    sweepDurationS: clamp(s.sweepDurationS, 0.1, 60, defaults.sweepDurationS ?? 3.8),
    // Allow same-origin relative ('/...') as well as absolute http(s) data feeds.
    dataUrl: validUrl(s.dataUrl, ['http://', 'https://', '/'], defaults.dataUrl),
    // Empty wsUrl means "disabled" and is preserved; a non-empty value must be ws(s)://.
    wsUrl: s.wsUrl ? validUrl(s.wsUrl, ['ws://', 'wss://'], defaults.wsUrl) : s.wsUrl,
  };
};

/** Build-time release defaults, sanitized before they enter application state. */
export const getDefaultSettings = (): ScopeSettings =>
  sanitizeSettings(
    { ...BASE_DEFAULT_SETTINGS, ...getRuntimeSettings() },
    BASE_DEFAULT_SETTINGS
  );

const loadSettings = (): ScopeSettings => {
  const defaults = getDefaultSettings();
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return sanitizeSettings({ ...defaults, setupCompleted: true, ...parsed, fillViewport: typeof parsed.fillViewport === 'boolean' ? parsed.fillViewport : parsed.sweepStyle === 'none' }, defaults);
    }
  } catch (e) {
    console.error('Failed to load settings from localStorage', e);
  }
  return defaults;
};

export const RadarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Settings state with localStorage persistence
  const [settings, setSettingsState] = useState<ScopeSettings>(loadSettings);

  // 2. Selected aircraft state
  const [selectedHex, setSelectedHex] = useState<string | null>(null);

  // 3. Network status state
  const [networkStatus, setNetworkStatus] = useState<string>('Disconnected');

  // 4. Highly efficient aircraft mapping using refs + throttled state
  // This ref contains the real-time, high-frequency aircraft data (e.g. for canvas rendering at 60fps)
  const aircraftMapRef = useRef<Record<string, Aircraft>>({});

  // This state is throttled to UI_UPDATE_INTERVAL_MS to prevent React re-render lag
  const [aircraftMap, setAircraftMap] = useState<Record<string, Aircraft>>({});

  // 5. Session statistics tracking (refs + throttled state)
  const uniqueHexesRef = useRef<Set<string>>(new Set());
  const messagesCountRef = useRef<number>(0);
  const sourceDistributionRef = useRef({ adsb: 0, mlat: 0, other: 0 });

  const [sessionStats, setSessionStats] = useState<SessionStats>({
    uniqueAircraftCount: 0,
    messagesCount: 0,
    sourceDistribution: { adsb: 0, mlat: 0, other: 0 },
  });

  // 6. Conflicts state
  const [conflicts, setConflicts] = useState<ConflictPair[]>([]);
  // Tracks which conflict pairs have already triggered an audio alert so an
  // ongoing conflict doesn't re-alert on every throttle tick. A pair re-alerts
  // only if it clears and later recurs. (SoundManager still applies its own 5s
  // debounce on top of this.)
  const conflictAlertedRef = useRef<Set<string>>(new Set());

  // 7. Airspace polygons state
  const [airspacePolygons] = useState<AirspacePolygon[]>([]);

  // 8. Aviation elements state (Airports, Navaids, Runways)
  const [airports, setAirports] = useState<Airport[]>([]);
  const [navaids, setNavaids] = useState<ScopeNavaid[]>([]);
  const [runways, setRunways] = useState<ScopeRunway[]>([]);

  // 9. Debounced coordinates for database query optimisation
  // When the user pans/zooms, homeLat/homeLon/range change rapidly. We debounce
  // these into dbQueryCoords so the expensive aviationDb and airspaceDb queries
  // only fire after the user stops moving for 250ms.
  const [dbQueryCoords, setDbQueryCoords] = useState({
    lat: settings.homeLat,
    lon: settings.homeLon,
    range: settings.range * (fillsRadarViewport(settings) ? Math.SQRT2 : 1),
  });

  useEffect(() => {
    const handler = setTimeout(() => {
      setDbQueryCoords({
        lat: settings.homeLat,
        lon: settings.homeLon,
        range: settings.range * (fillsRadarViewport(settings) ? Math.SQRT2 : 1),
      });
    }, 250); // 250ms debounce window to keep 60 FPS panning smooth

    return () => clearTimeout(handler);
  }, [settings.homeLat, settings.homeLon, settings.range, settings.fillViewport, settings.sweepStyle]);

  // Fetch airports, navaids, and runways when home position, range, or limits change (debounced)
  useEffect(() => {
    let active = true;
    const fetchAviationData = async () => {
      try {
        const baseUrl = new URL('./', window.location.href).href.replace(/\/$/, '');
        await aviationDb.init(baseUrl);

        const limit = settings.maxAirportsDisplay !== undefined ? settings.maxAirportsDisplay : 50;

        // Query airports in range
        const fetchedAirports = await aviationDb.getAirportsInRange(
          dbQueryCoords.lat,
          dbQueryCoords.lon,
          dbQueryCoords.range,
          limit
        );

        if (!active) return;
        setAirports(fetchedAirports);

        // Query navaids in range (limit to 50 for performance/clutter)
        const fetchedNavaids = await aviationDb.getNavaidsInRange(
          dbQueryCoords.lat,
          dbQueryCoords.lon,
          dbQueryCoords.range,
          50
        );

        if (!active) return;
        // Map Ident to Id for Scope rendering compatibility
        const mappedNavaids = fetchedNavaids.map((n: any) => ({
          id: n.ident,
          lat: n.lat,
          lon: n.lon,
        }));
        setNavaids(mappedNavaids);

        // Query runways for the airports in range
        const fetchedRunways: any[] = [];
        const minLength = settings.minRunwayLengthFt !== undefined ? settings.minRunwayLengthFt : 3000;

        for (const apt of fetchedAirports) {
          const aptRunways = await aviationDb.getRunwaysForAirport(apt.icao);
          const filteredMapped = aptRunways
            .filter((r: any) => r.length >= minLength)
            .map((r: any) => ({
              airportIcao: r.airport_ident,
              lat1: r.lat1,
              lon1: r.lon1,
              lat2: r.lat2,
              lon2: r.lon2,
              name: r.id,
            }));
          fetchedRunways.push(...filteredMapped);
        }

        if (!active) return;
        setRunways(fetchedRunways);

      } catch (err) {
        console.error('[RadarContext] Failed to query aviation data:', err);
      }
    };

    fetchAviationData();

    return () => {
      active = false;
    };
  }, [dbQueryCoords.lat, dbQueryCoords.lon, dbQueryCoords.range, settings.maxAirportsDisplay, settings.minRunwayLengthFt]);

  // Ref tracking settings to keep background effects dependency-free
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Load and apply settings persistence
  const updateSettings = (
    newSettings: Partial<ScopeSettings> | ((prev: ScopeSettings) => ScopeSettings)
  ) => {
    setSettingsState((prev) => {
      const updated = typeof newSettings === 'function' ? newSettings(prev) : { ...prev, ...newSettings };
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save settings to localStorage', e);
      }
      return updated;
    });
  };

  const selectAircraft = (hex: string | null) => {
    setSelectedHex(hex ? hex.trim().toUpperCase() : null);
  };

  const clearAircraft = () => {
    aircraftMapRef.current = {};
    uniqueHexesRef.current.clear();
    messagesCountRef.current = 0;
    sourceDistributionRef.current = { adsb: 0, mlat: 0, other: 0 };
    setAircraftMap({});
    setSelectedHex(null);
    setSessionStats({
      uniqueAircraftCount: 0,
      messagesCount: 0,
      sourceDistribution: { adsb: 0, mlat: 0, other: 0 },
    });
  };

  // ---------------------------------------------------------------------------
  // Aircraft update lifecycle (updateAircraftDeltas)
  //
  // Called by NetworkManager on every fetch/WS message with an array of
  // partial Aircraft objects. For each update:
  //   1. Normalise the hex code (trim + uppercase)
  //   2. Accumulate session statistics (unique hexes, message counts, source)
  //   3. If the aircraft already exists, compute a new geo-trail point when
  //      the position has moved > 0.05 nm (prevents stationary duplicates)
  //   4. Merge the update onto the existing record (or create a new one)
  //   5. Stamp lastUpdateTime for stale-aircraft cleanup
  //
  // This function mutates aircraftMapRef directly (no React setState) so it
  // can handle high-frequency updates without triggering re-renders.
  // ---------------------------------------------------------------------------
  const updateAircraftDeltas = (updates: Aircraft[]) => {
    const now = Date.now();
    const currentMap = aircraftMapRef.current;

    for (const update of updates) {
      if (!update.hex) continue;
      const hex = update.hex.trim().toUpperCase();



      // Track statistics
      uniqueHexesRef.current.add(hex);
      messagesCountRef.current += 1;

      // Update source distribution
      if (Array.isArray(update.mlat) && update.mlat.length > 0) { // FIX: was double-counting MLAT due to redundant truthy check before Array.isArray
        sourceDistributionRef.current.mlat += 1;
      } else if (update.adsb_version !== undefined) {
        sourceDistributionRef.current.adsb += 1;
      } else {
        sourceDistributionRef.current.other += 1;
      }

      const existing = currentMap[hex];

      if (existing) {
        // --- Trail computation ---
        // Only append a new trail point when the aircraft has moved > 0.05 nm
        // from the last recorded position (prevents clutter from stationary
        // or GPS-jittering targets). Trail is capped at maxTrailLength.
        let updatedTrail = existing.geoTrail || [];
        if (typeof update.lat === 'number' && typeof update.lon === 'number') { // FIX: use type check instead of truthy to handle valid 0 coordinates (equator/prime meridian)
          const hasLastPoint = updatedTrail.length > 0;
          const lastPoint = updatedTrail[updatedTrail.length - 1];

          // Append to trail if aircraft moved significantly or if it's the first point
          if (
            !hasLastPoint ||
            calculateHaversineDistance(lastPoint.lat, lastPoint.lon, update.lat, update.lon) > 0.05
          ) {
            // Mutate the trail array in place (push + front-trim) so we don't
            // allocate a fresh array per aircraft per update — this array is owned
            // by the aircraft and only read by the single-threaded render loop.
            updatedTrail.push({ lat: update.lat, lon: update.lon, timestamp: now });

            // Limit trail length based on settings (ring-buffer style front trim)
            const maxTrail = Math.max(1, settingsRef.current.maxTrailLength ?? CONFIG.MAX_TRAIL_LENGTH ?? 50); // clamp to minimum 1 to prevent negative trim
            if (updatedTrail.length > maxTrail) {
              updatedTrail.splice(0, updatedTrail.length - maxTrail);
            }
          }
        }

        // Merge existing aircraft data with updates
        currentMap[hex] = {
          ...existing,
          ...update,
          hex, // ensure uppercase hex
          geoTrail: updatedTrail,
          lastUpdateTime: now,
        };
      } else {
        // First time seeing this aircraft, initialize its trail
        const initialTrail =
          update.lat !== undefined && update.lon !== undefined
            ? [{ lat: update.lat, lon: update.lon, timestamp: now }]
            : [];

        currentMap[hex] = {
          ...update,
          hex,
          geoTrail: initialTrail,
          lastUpdateTime: now,
        };
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Throttled state sync (runs every UI_UPDATE_INTERVAL_MS ~700ms)
  //
  // This interval bridges the high-frequency aircraftMapRef world with
  // React's rendering cycle. On each tick it:
  //   1. Purges stale aircraft — any aircraft whose lastUpdateTime exceeds
  //      (fetchInterval * AIRCRAFT_TIMEOUT_FACTOR) is removed
  //   2. Updates session statistics state
  //   3. Runs conflict/separation detection on the active aircraft list
  //   4. Triggers emergency audio alerts for detected conflicts
  //   5. Copies the current ref map into React state so the UI re-renders
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const fetchInterval = settingsRef.current.fetchIntervalMs ?? CONFIG.FETCH_INTERVAL_MS ?? 1000;
      // Aircraft are considered stale after this many ms without an update
      const timeoutMs = fetchInterval * CONFIG.AIRCRAFT_TIMEOUT_FACTOR;
      let changed = false;

      // 1. Purge stale aircraft from ref map
      const currentMap = { ...aircraftMapRef.current };
      Object.keys(currentMap).forEach((hex) => {
        const ac = currentMap[hex];
        if (ac.lastUpdateTime && now - ac.lastUpdateTime > timeoutMs) {
          delete aircraftMapRef.current[hex];
          delete currentMap[hex];
          changed = true;
        }
      });

      // 2. Update session statistics state
      setSessionStats({
        uniqueAircraftCount: uniqueHexesRef.current.size,
        messagesCount: messagesCountRef.current,
        sourceDistribution: { ...sourceDistributionRef.current },
      });

      // 3. Conflict detection — check all active aircraft pairs for
      //    separation violations within a 2-minute prediction window
      const activeList = Object.values(currentMap);
      const activeConflicts = detectConflicts(
        activeList,
        settingsRef.current.homeLat,
        settingsRef.current.homeLon,
        settingsRef.current.range,
        2 // 2-minute prediction window
      );
      setConflicts(activeConflicts);

      // 4. Trigger audio emergency alerts only for newly-appearing conflict pairs,
      //    so a persistent conflict doesn't re-alert every ~700ms tick.
      if (settingsRef.current.soundEnabled) {
        const activeKeys = new Set(
          activeConflicts.map((c) => (c.a < c.b ? `${c.a}|${c.b}` : `${c.b}|${c.a}`))
        );
        let hasNewConflict = false;
        for (const key of activeKeys) {
          if (!conflictAlertedRef.current.has(key)) {
            hasNewConflict = true;
            break;
          }
        }
        if (hasNewConflict) {
          SoundManager.playEmergencyAlert(settingsRef.current.alertSound || 'classic-siren');
        }
        // Replace the tracked set so cleared conflicts can re-alert if they recur.
        conflictAlertedRef.current = activeKeys;
      }

      // 5. Update UI aircraft map state if items were purged or new updates exist
      setAircraftMap(currentMap);
    }, CONFIG.UI_UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  const networkManagerRef = useRef<NetworkManager | null>(null);

  // Instantiate NetworkManager when connection-relevant settings change.
  // The manager handles HTTP polling (and optional WebSocket) and calls back
  // into updateAircraftDeltas / setNetworkStatus.
  useEffect(() => {
    const manager = new NetworkManager(
      settings.homeLat,
      settings.homeLon,
      settings.range,
      {
        onAircraftUpdate: (aircraft) => {
          updateAircraftDeltas(aircraft);
        },
        onStatusChange: (status) => {
          setNetworkStatus(status);
        },
        dataUrl: settings.dataUrl || CONFIG.DEFAULT_DATA_URL,
        wsUrl: settings.wsUrl || null,
        wsEnabled: settings.wsEnabled,
        fetchIntervalMs: settings.fetchIntervalMs ?? CONFIG.FETCH_INTERVAL_MS,
      }
    );

    manager.start();
    networkManagerRef.current = manager;

    return () => {
      manager.stop();
      networkManagerRef.current = null;
    };
  }, [settings.wsUrl, settings.wsEnabled, settings.dataUrl, settings.fetchIntervalMs]);

  // Update NetworkManager position properties without restarting the connection
  useEffect(() => {
    if (networkManagerRef.current) {
      networkManagerRef.current.updatePosition(settings.homeLat, settings.homeLon, settings.range);
    }
  }, [settings.homeLat, settings.homeLon, settings.range]);

  // Synchronize context sound settings with SoundManager
  useEffect(() => {
    SoundManager.setEnabled(settings.soundEnabled);
  }, [settings.soundEnabled]);

  return (
    <RadarContext.Provider
      value={{
        aircraftMap,
        aircraftMapRef,
        settings,
        selectedHex,
        networkStatus,
        sessionStats,
        conflicts,
        airspacePolygons,
        airports,
        navaids,
        runways,
        updateSettings,
        selectAircraft,
        setNetworkStatus,
        updateAircraftDeltas,
        clearAircraft,
      }}
    >
      {children}
    </RadarContext.Provider>
  );
};

export const useRadar = (): RadarContextType => {
  const context = useContext(RadarContext);
  if (context === undefined) {
    throw new Error('useRadar must be used within a RadarProvider');
  }
  return context;
};
