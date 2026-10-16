// ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
export interface AirspaceViewport { lat: number; lon: number; range: number; halfWidthNm: number; halfHeightNm: number }
export function viewportBounds(view: AirspaceViewport) {
  const lon = ((view.lon + 180) % 360 + 360) % 360 - 180;
  const dx = Math.min(180, view.halfWidthNm / (60 * Math.max(1e-6, Math.cos(view.lat * Math.PI / 180))));
  const dy = view.halfHeightNm / 60;
  return { west: lon - dx, east: lon + dx, south: Math.max(-85.05112878, view.lat - dy), north: Math.min(85.05112878, view.lat + dy) };
}
/** Exact tile rectangle for the canvas projection, including dateline wrapping. */
export function viewportTiles(view: AirspaceViewport): string[] {
  if (!Object.values(view).every(Number.isFinite) || view.range <= 0 || view.halfWidthNm <= 0 || view.halfHeightNm <= 0) return [];
  const bounds = viewportBounds(view);
  const range = Math.max(view.halfWidthNm, view.halfHeightNm);
  let zoom = range >= 300 ? 4 : range >= 150 ? 5 : range >= 75 ? 6 : range >= 40 ? 7 : 8;
  const tileY = (lat: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n)));
  while (true) {
    const n = 2 ** zoom;
    const x0 = Math.floor((bounds.west + 180) / 360 * n);
    const x1 = Math.floor((bounds.east + 180) / 360 * n);
    const y0 = tileY(bounds.north, n), y1 = tileY(bounds.south, n);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64 && zoom > 4) { zoom--; continue; }
    const keys = new Set<string>();
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.add(`${zoom}/${((x % n) + n) % n}/${y}`);
    return [...keys];
  }
}
