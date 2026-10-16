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
// aviation.worker.ts — Aviation CSV parsing worker
//
// Web Worker that parses the airport/navaid/runway CSVs into a spatial grid index
// for fast lookups. Runs off the main thread; communicate with it through
// AviationDbService, not directly.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: aviation-worker @ r1 (2026-06-19)
// ---------------------------------------------------------------------------

export interface Airport {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  elevation: number;
  type: string;
  municipality: string;
  iso_country: string;
}

export interface Navaid {
  ident: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  elevation: number;
  frequency: number;
  associated_airport: string;
}

export interface Runway {
  airport_ident: string;
  id: string;
  length: number;
  width: number;
  surface: string;
  lighted: boolean;
  closed: boolean;
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
  le_heading: number;
  he_heading: number;
}

interface SpatialGrid<T> {
  cells: Map<string, T[]>;
  cellSize: number;
}

// --- In-memory data stores populated during init ---
let airportsList: Airport[] = [];
let navaidsList: Navaid[] = [];
let runwaysMap = new Map<string, Runway[]>(); // keyed by airport ICAO code

// Spatial grid indices for sub-millisecond range lookups.
// Cell size of 1.0 degree means each grid bucket covers ~60 NM of latitude.
const airportsGrid = createGrid<Airport>(1.0);
const navaidsGrid = createGrid<Navaid>(1.0);

// Haversine great-circle distance between two geographic points, returned in nautical miles.
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- Spatial grid helpers ---
// The grid maps a string key "latIndex,lonIndex" to a bucket of items in that cell.
// addToGrid inserts; queryGrid finds all candidates within rangeNm then filters precisely.
function createGrid<T>(cellSize: number): SpatialGrid<T> {
  return {
    cells: new Map<string, T[]>(),
    cellSize,
  };
}

// Inserts an item into the grid cell corresponding to its lat/lon.
function addToGrid<T extends { lat: number; lon: number }>(grid: SpatialGrid<T>, item: T) {
  const latIndex = Math.floor(item.lat / grid.cellSize);
  const lonIndex = Math.floor(item.lon / grid.cellSize);
  const key = `${latIndex},${lonIndex}`;

  let cell = grid.cells.get(key);
  if (!cell) {
    cell = [];
    grid.cells.set(key, cell);
  }
  cell.push(item);
}

// Queries the grid for all items within rangeNm of (lat, lon).
// First collects candidates from nearby cells (cheap integer math), then filters
// with precise haversine distance to eliminate false positives from rectangular cells.
function queryGrid<T extends { lat: number; lon: number }>(
  grid: SpatialGrid<T>,
  lat: number,
  lon: number,
  rangeNm: number
): T[] {
  // How many cells to check in latitude: range in degrees = rangeNm / 60
  const cellRangeLat = Math.ceil(rangeNm / 60 / grid.cellSize);
  const latRad = (lat * Math.PI) / 180;
  const cosLat = Math.cos(latRad);

  // Longitude cells are wider near the equator and narrower near poles.
  // Guard against division by zero at extreme latitudes.
  const cellRangeLon = cosLat > 0.01
    ? Math.ceil(rangeNm / 60 / cosLat / grid.cellSize)
    : Math.floor(180 / grid.cellSize);

  const centerLatIndex = Math.floor(lat / grid.cellSize);
  const centerLonIndex = Math.floor(lon / grid.cellSize);

  const candidates: T[] = [];

  for (let dLat = -cellRangeLat; dLat <= cellRangeLat; dLat++) {
    for (let dLon = -cellRangeLon; dLon <= cellRangeLon; dLon++) {
      const latIdx = centerLatIndex + dLat;
      let lonIdx = centerLonIndex + dLon;

      // Wrap longitude coordinates (-180 to 180)
      const maxLonIdx = Math.floor(180 / grid.cellSize);
      const minLonIdx = Math.floor(-180 / grid.cellSize);

      if (lonIdx > maxLonIdx) {
        lonIdx = minLonIdx + (lonIdx - maxLonIdx - 1);
      } else if (lonIdx < minLonIdx) {
        lonIdx = maxLonIdx - (minLonIdx - lonIdx - 1);
      }

      const key = `${latIdx},${lonIdx}`;
      const cell = grid.cells.get(key);
      if (cell) {
        candidates.push(...cell);
      }
    }
  }

  // Filter items using the precise Haversine distance
  return candidates.filter((item) => {
    const dist = haversineDistance(lat, lon, item.lat, item.lon);
    return dist <= rangeNm;
  });
}

// --- CSV parsing ---
// Custom parser that correctly handles commas inside double-quoted fields.
// Standard String.split(',') would break on fields like "Los Angeles, CA".
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim().replace(/"/g, ''));
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim().replace(/"/g, ''));
  return values;
}

function parseCSVRows(csvText: string): { headers: string[]; rows: string[][] } {
  const lines = csvText.split('\n');
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCSVLine(lines[0]).map((h) => h.trim().replace(/"/g, '')); // FIX: use parseCSVLine for headers too, handles quoted commas

  const rows: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    rows.push(parseCSVLine(line));
  }

  return { headers, rows };
}

// --- Worker message dispatch ---
// Each message carries a unique 'id' so the main thread can match responses to requests.
// The 'type' field selects the handler; 'payload' carries the query parameters.
self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'init': {
        const { baseUrl, paths } = payload;

        // Fetch files in parallel to prevent bottlenecking
        const [airportsRes, navaidsRes, runwaysRes] = await Promise.all([
          fetch(`${baseUrl}/${paths.AIRPORTS}`),
          fetch(`${baseUrl}/${paths.NAVAIDS}`),
          fetch(`${baseUrl}/${paths.RUNWAYS}`),
        ]);

        if (!airportsRes.ok) throw new Error(`Failed to fetch airports: ${airportsRes.status}`);
        if (!navaidsRes.ok) throw new Error(`Failed to fetch navaids: ${navaidsRes.status}`);
        if (!runwaysRes.ok) throw new Error(`Failed to fetch runways: ${runwaysRes.status}`);

        const [airportsText, navaidsText, runwaysText] = await Promise.all([
          airportsRes.text(),
          navaidsRes.text(),
          runwaysRes.text(),
        ]);

        // 1. Parse & Index Airports - map CSV columns to Airport objects and insert into spatial grid
        const parsedAirports = parseCSVRows(airportsText);
        airportsList = [];
        airportsGrid.cells.clear();

        parsedAirports.rows.forEach((row, rowIdx) => {
          try {
            const item: Record<string, string> = {};
            parsedAirports.headers.forEach((h, index) => {
              item[h] = row[index] || '';
            });

            if (item.latitude_deg && item.longitude_deg && item.icao_code && item.icao_code.length === 4) {
              const lat = parseFloat(item.latitude_deg);
              const lon = parseFloat(item.longitude_deg);
              if (isNaN(lat) || isNaN(lon)) return; // FIX: skip rows with invalid coordinates to prevent NaN in spatial grid
              const airport: Airport = {
                icao: item.icao_code,
                name: item.name,
                lat,
                lon,
                elevation: parseFloat(item.elevation_ft) || 0,
                type: item.type,
                municipality: item.municipality,
                iso_country: item.iso_country,
              };
              airportsList.push(airport);
              addToGrid(airportsGrid, airport);
            }
          } catch (rowErr) {
            console.warn(`[Aviation Worker] Skipping malformed airport row ${rowIdx}:`, rowErr);
          }
        });

        // 2. Parse & Index Navaids - VORs, NDBs, DMEs, etc.
        const parsedNavaids = parseCSVRows(navaidsText);
        navaidsList = [];
        navaidsGrid.cells.clear();

        parsedNavaids.rows.forEach((row, rowIdx) => {
          try {
            const item: Record<string, string> = {};
            parsedNavaids.headers.forEach((h, index) => {
              item[h] = row[index] || '';
            });

            if (item.latitude_deg && item.longitude_deg && item.ident) {
              const lat = parseFloat(item.latitude_deg);
              const lon = parseFloat(item.longitude_deg);
              if (isNaN(lat) || isNaN(lon)) return; // FIX: skip rows with invalid coordinates to prevent NaN in spatial grid
              const navaid: Navaid = {
                ident: item.ident,
                name: item.name,
                type: item.type,
                lat,
                lon,
                elevation: parseFloat(item.elevation_ft) || 0,
                frequency: parseFloat(item.frequency_khz) || 0,
                associated_airport: item.associated_airport,
              };
              navaidsList.push(navaid);
              addToGrid(navaidsGrid, navaid);
            }
          } catch (rowErr) {
            console.warn(`[Aviation Worker] Skipping malformed navaid row ${rowIdx}:`, rowErr);
          }
        });

        // 3. Parse & Index Runways - keyed by airport ICAO for fast lookup
        const parsedRunways = parseCSVRows(runwaysText);
        runwaysMap.clear();

        parsedRunways.rows.forEach((row, rowIdx) => {
          try {
            const item: Record<string, string> = {};
            parsedRunways.headers.forEach((h, index) => {
              item[h] = row[index] || '';
            });

            if (
              item.le_latitude_deg &&
              item.le_longitude_deg &&
              item.he_latitude_deg &&
              item.he_longitude_deg &&
              item.airport_ident
            ) {
              const length = parseFloat(item.length_ft) || 0;
              const runway: Runway = {
                airport_ident: item.airport_ident,
                id: `${item.le_ident}/${item.he_ident}`,
                length,
                width: parseFloat(item.width_ft) || 0,
                surface: item.surface,
                lighted: item.lighted === '1',
                closed: item.closed === '1',
                lat1: parseFloat(item.le_latitude_deg),
                lon1: parseFloat(item.le_longitude_deg),
                lat2: parseFloat(item.he_latitude_deg),
                lon2: parseFloat(item.he_longitude_deg),
                le_heading: parseFloat(item.le_heading_degT) || 0,
                he_heading: parseFloat(item.he_heading_degT) || 0,
              };

              let list = runwaysMap.get(runway.airport_ident);
              if (!list) {
                list = [];
                runwaysMap.set(runway.airport_ident, list);
              }
              list.push(runway);
            }
          } catch (rowErr) {
            console.warn(`[Aviation Worker] Skipping malformed runway row ${rowIdx}:`, rowErr);
          }
        });

        self.postMessage({
          id,
          type: 'init_success',
          payload: {
            airportsCount: airportsList.length,
            navaidsCount: navaidsList.length,
            runwaysCount: Array.from(runwaysMap.values()).reduce((acc, curr) => acc + curr.length, 0),
          },
        });
        break;
      }

      case 'getAirportsInRange': {
        const { lat, lon, range, limit = 50 } = payload;
        const results = queryGrid(airportsGrid, lat, lon, range);

        // Sort by closest distance
        results.sort((a, b) => {
          const distA = haversineDistance(lat, lon, a.lat, a.lon);
          const distB = haversineDistance(lat, lon, b.lat, b.lon);
          return distA - distB;
        });

        self.postMessage({
          id,
          type: 'query_success',
          payload: results.slice(0, limit),
        });
        break;
      }

      case 'getNavaidsInRange': {
        const { lat, lon, range, limit = 50 } = payload;
        const results = queryGrid(navaidsGrid, lat, lon, range);

        results.sort((a, b) => {
          const distA = haversineDistance(lat, lon, a.lat, a.lon);
          const distB = haversineDistance(lat, lon, b.lat, b.lon);
          return distA - distB;
        });

        self.postMessage({
          id,
          type: 'query_success',
          payload: results.slice(0, limit),
        });
        break;
      }

      case 'getRunwaysForAirport': {
        const { icao } = payload;
        const results = runwaysMap.get(icao) || [];

        self.postMessage({
          id,
          type: 'query_success',
          payload: results,
        });
        break;
      }

      case 'searchAirports': {
        const { query } = payload;
        const q = (query || '').toLowerCase().trim();
        if (!q) {
          self.postMessage({
            id,
            type: 'query_success',
            payload: [],
          });
          break;
        }

        // Search in airportsList
        const results = airportsList.filter(
          (a) => a.icao.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
        ).slice(0, 10);

        self.postMessage({
          id,
          type: 'query_success',
          payload: results,
        });
        break;
      }

      default:
        throw new Error(`Unknown worker message type: ${type}`);
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    self.postMessage({
      id,
      type: 'error',
      payload: errMsg,
    });
  }
};
