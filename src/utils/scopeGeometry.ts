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
// ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// Shared canvas geometry in CSS pixels.

export function scopeGeometry(width: number, height: number, fillViewport: boolean, keepInView = true) {
  const half = Math.min(width, height) / 2;
  // Reserve room for ticks, three-digit headings, and range text.
  const inset = Math.min(40, Math.max(0, half - 0.5));
  const fitted = Math.max(0.5, half - inset);
  const radius = fillViewport ? Math.max(width, height) / 2 : fitted;
  return { radius, guideRadius: keepInView ? fitted : radius, showHeadings: half >= 45 };
}

/** Static map mode always fills the viewport, regardless of the saved sweep shape. */
export function fillsRadarViewport(settings: { sweepStyle: string; fillViewport?: boolean }): boolean {
  return settings.sweepStyle === 'none' || !!settings.fillViewport;
}
