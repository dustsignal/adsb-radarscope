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
// Scope.tsx — Canvas radar rendering engine
//
// The core HTML5 Canvas render loop (~60fps via requestAnimationFrame). Draws
// aircraft, trails, rings, airspace, runways and labels using offscreen caching
// and object pooling. This is the performance-critical hot path — profile before
// and after any change here.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: Scope @ r5 (2026-10-16)
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../config';
import { useRadar } from '../context/RadarContext';
import { Aircraft, TrailPoint } from '../types';
import { EXTRA_PALETTES } from '../palettes';
import { scopeGeometry, fillsRadarViewport } from '../utils/scopeGeometry';
import { AirspacePolygon } from '../workers/airspace.worker';
import { airspaceDb } from '../services/AirspaceDbService';

export interface ScopeThemeDefinition {
  bg: string;
  ringStroke: string;
  ringMajor: string;
  compass: string;
  compassFaint: string;
  sweepHue: number;
  sweepAlpha: number;
  sweepLight?: boolean;
  crosshair: string;
  altLow: string;
  altHigh: string;
  symbolStroke: string;
  symbolAccent: string;
  ghostTrail: string;
  label: string;
  labelMuted: string;
  labelBoxFill: string;
  labelBoxStroke: string;
  leader: string;
  airport: string;
  airportLabel: string;
  navaid: string;
  vector: string;
  wx: string[];
  emg: string;
  conflict: string;
  gridFont: string;
  labelFont: string;
  labelFontBold: string;
}

export const THEMES: Record<string, ScopeThemeDefinition> = {
  phosphor: {
    bg: '#020705',
    ringStroke: 'rgba(80,220,120,0.22)',
    ringMajor: 'rgba(110,240,150,0.38)',
    compass: 'rgba(120,240,160,0.55)',
    compassFaint: 'rgba(80,180,120,0.3)',
    sweepHue: 135, // green
    sweepAlpha: 0.38,
    crosshair: 'rgba(90,220,130,0.18)',
    altLow: '#8effb2',  // bright phosphor (low alt)
    altHigh: '#2a8f4a', // dimmer saturated (high alt)
    symbolStroke: '#aaffc8',
    symbolAccent: '#fff3a0',
    ghostTrail: 'rgba(140,255,180,0.55)',
    label: '#d9ffe6',
    labelMuted: 'rgba(180,230,200,0.7)',
    labelBoxFill: 'rgba(8,22,14,0.85)',
    labelBoxStroke: 'rgba(120,255,160,0.45)',
    leader: 'rgba(170,255,200,0.7)',
    airport: '#9accff',
    airportLabel: 'rgba(180,200,255,0.75)',
    navaid: 'rgba(140,255,200,0.5)',
    vector: 'rgba(255,220,140,0.7)',
    wx: ['rgba(60,200,120,0.08)', 'rgba(180,200,80,0.14)', 'rgba(255,140,60,0.22)'],
    emg: '#ff3355',
    conflict: '#ffbb33',
    gridFont: '10px "JetBrains Mono", ui-monospace, monospace',
    labelFont: '11px "JetBrains Mono", ui-monospace, monospace',
    labelFontBold: 'bold 11px "JetBrains Mono", ui-monospace, monospace',
  },

  console: {
    bg: '#0a0e14',
    ringStroke: 'rgba(140,170,200,0.14)',
    ringMajor: 'rgba(180,210,240,0.28)',
    compass: 'rgba(180,210,240,0.55)',
    compassFaint: 'rgba(120,150,180,0.3)',
    sweepHue: 190, // cyan
    sweepAlpha: 0.28,
    crosshair: 'rgba(100,140,180,0.12)',
    altLow: '#8ad7ff',
    altHigh: '#4a6b85',
    symbolStroke: '#d8e6f2',
    symbolAccent: '#ffd66b',
    ghostTrail: 'rgba(140,200,240,0.45)',
    label: '#e6eef7',
    labelMuted: 'rgba(170,195,220,0.75)',
    labelBoxFill: 'rgba(15,22,32,0.9)',
    labelBoxStroke: 'rgba(100,160,210,0.5)',
    leader: 'rgba(160,200,240,0.7)',
    airport: '#ffcf6b',
    airportLabel: 'rgba(255,210,140,0.8)',
    navaid: 'rgba(170,200,220,0.5)',
    vector: 'rgba(255,200,120,0.7)',
    wx: ['rgba(100,180,220,0.07)', 'rgba(180,160,80,0.14)', 'rgba(240,110,80,0.22)'],
    emg: '#ff4d5a',
    conflict: '#ffb84d',
    gridFont: '10px "IBM Plex Mono", ui-monospace, monospace',
    labelFont: '11px "IBM Plex Mono", ui-monospace, monospace',
    labelFontBold: '600 11px "IBM Plex Mono", ui-monospace, monospace',
  },

  'amber-crt': {
    bg: '#140c02',
    ringStroke: 'rgba(255,160,0,0.18)',
    ringMajor: 'rgba(255,176,0,0.34)',
    compass: 'rgba(255,180,0,0.55)',
    compassFaint: 'rgba(180,110,0,0.3)',
    sweepHue: 30, // amber
    sweepAlpha: 0.35,
    crosshair: 'rgba(220,130,0,0.18)',
    altLow: '#ffd075',
    altHigh: '#b36b00',
    symbolStroke: '#ffeacc',
    symbolAccent: '#ffffff',
    ghostTrail: 'rgba(255,180,100,0.5)',
    label: '#ffeacc',
    labelMuted: 'rgba(230,170,120,0.7)',
    labelBoxFill: 'rgba(20,12,4,0.85)',
    labelBoxStroke: 'rgba(255,180,0,0.45)',
    leader: 'rgba(255,180,100,0.7)',
    airport: '#ff9f00',
    airportLabel: 'rgba(255,159,0,0.85)',
    navaid: 'rgba(255,180,0,0.5)',
    vector: 'rgba(255,220,140,0.7)',
    wx: ['rgba(255,140,60,0.08)', 'rgba(255,100,20,0.14)', 'rgba(220,30,0,0.22)'],
    emg: '#ff3333',
    conflict: '#ff8800',
    gridFont: '10px "JetBrains Mono", ui-monospace, monospace',
    labelFont: '11px "JetBrains Mono", ui-monospace, monospace',
    labelFontBold: 'bold 11px "JetBrains Mono", ui-monospace, monospace',
  },

  'arctic-blue': {
    bg: '#050a14',
    ringStroke: 'rgba(20,41,79,0.3)',
    ringMajor: 'rgba(99,199,255,0.28)',
    compass: 'rgba(99,199,255,0.55)',
    compassFaint: 'rgba(99,199,255,0.3)',
    sweepHue: 195, // cyan/sky blue
    sweepAlpha: 0.28,
    crosshair: 'rgba(99,199,255,0.15)',
    altLow: '#00ffff',
    altHigh: '#294f80',
    symbolStroke: '#dcf0ff',
    symbolAccent: '#ffff00',
    ghostTrail: 'rgba(99,199,255,0.45)',
    label: '#dcf0ff',
    labelMuted: 'rgba(160,200,240,0.7)',
    labelBoxFill: 'rgba(5,10,20,0.9)',
    labelBoxStroke: 'rgba(99,199,255,0.4)',
    leader: 'rgba(99,199,255,0.7)',
    airport: '#ffcf6b',
    airportLabel: 'rgba(255,210,140,0.8)',
    navaid: 'rgba(0,255,255,0.5)',
    vector: 'rgba(255,215,0,0.7)',
    wx: ['rgba(100,180,220,0.07)', 'rgba(180,160,80,0.14)', 'rgba(240,110,80,0.22)'],
    emg: '#ff3333',
    conflict: '#ffd700',
    gridFont: '10px "IBM Plex Mono", ui-monospace, monospace',
    labelFont: '11px "IBM Plex Mono", ui-monospace, monospace',
    labelFontBold: '600 11px "IBM Plex Mono", ui-monospace, monospace',
  },

  cyberpunk: {
    bg: '#0c0018',
    ringStroke: 'rgba(255,0,255,0.18)',
    ringMajor: 'rgba(255,0,255,0.32)',
    compass: 'rgba(255,0,255,0.6)',
    compassFaint: 'rgba(255,0,255,0.3)',
    sweepHue: 300, // magenta
    sweepAlpha: 0.25,
    crosshair: 'rgba(255,0,255,0.15)',
    altLow: '#00ffff',
    altHigh: '#800080',
    symbolStroke: '#ff00ff',
    symbolAccent: '#ffff00',
    ghostTrail: 'rgba(255,0,255,0.4)',
    label: '#dcdcfe',
    labelMuted: 'rgba(220,160,255,0.75)',
    labelBoxFill: 'rgba(12,0,24,0.9)',
    labelBoxStroke: 'rgba(255,0,255,0.4)',
    leader: 'rgba(255,0,255,0.6)',
    airport: '#00ff00',
    airportLabel: 'rgba(0,255,0,0.8)',
    navaid: 'rgba(255,0,255,0.5)',
    vector: '#00ffff',
    wx: ['rgba(0,255,255,0.07)', 'rgba(255,0,255,0.14)', 'rgba(255,20,148,0.22)'],
    emg: '#ff1494',
    conflict: '#ffff00',
    gridFont: '10px "JetBrains Mono", ui-monospace, monospace',
    labelFont: '11px "JetBrains Mono", ui-monospace, monospace',
    labelFontBold: 'bold 11px "JetBrains Mono", ui-monospace, monospace',
  },

  parchment: {
    bg: '#f3efe6', // original warm paper background
    ringStroke: 'rgba(60,40,20,0.14)',
    ringMajor: 'rgba(60,40,20,0.28)',
    compass: 'rgba(60,40,20,0.75)',
    compassFaint: 'rgba(60,40,20,0.4)',
    sweepHue: 35, // warm amber sweep
    sweepAlpha: 0.16,
    sweepLight: true,
    crosshair: 'rgba(60,40,20,0.08)',
    altLow: '#c2410c', // warm dark orange (low alt)
    altHigh: '#1e3a5f', // deep ocean blue (high alt)
    symbolStroke: '#1a1410',
    symbolAccent: '#b45309',
    ghostTrail: 'rgba(80,60,40,0.35)',
    label: '#1a1410',
    labelMuted: 'rgba(60,40,20,0.65)',
    labelBoxFill: 'rgba(245,240,230,0.95)',
    labelBoxStroke: 'rgba(60,40,20,0.3)',
    leader: 'rgba(60,40,20,0.5)',
    airport: '#7a3a1a',
    airportLabel: 'rgba(90,50,30,0.8)',
    navaid: 'rgba(90,70,50,0.45)',
    vector: 'rgba(180,80,30,0.55)',
    wx: ['rgba(100,150,80,0.06)', 'rgba(200,140,60,0.12)', 'rgba(200,80,60,0.2)'],
    emg: '#9a1a2a',
    conflict: '#b45309',
    gridFont: 'italic 10px "EB Garamond", Georgia, serif',
    labelFont: '11px "EB Garamond", Georgia, serif',
    labelFontBold: '600 12px "EB Garamond", Georgia, serif',
  },

  'deep-ocean': {
    bg: '#000816',
    ringStroke: 'rgba(0,114,168,0.22)',
    ringMajor: 'rgba(0,190,230,0.36)',
    compass: 'rgba(102,220,255,0.68)',
    compassFaint: 'rgba(42,146,184,0.34)',
    sweepHue: 191,
    sweepAlpha: 0.32,
    crosshair: 'rgba(0,190,230,0.16)',
    altLow: '#62e5ff',
    altHigh: '#17618a',
    symbolStroke: '#b8f1ff',
    symbolAccent: '#ffdf78',
    ghostTrail: 'rgba(63,205,238,0.46)',
    label: '#e0f8ff',
    labelMuted: 'rgba(157,215,232,0.78)',
    labelBoxFill: 'rgba(0,12,28,0.92)',
    labelBoxStroke: 'rgba(74,205,238,0.48)',
    leader: 'rgba(116,226,250,0.72)',
    airport: '#ffd166',
    airportLabel: 'rgba(255,220,140,0.86)',
    navaid: 'rgba(83,220,218,0.62)',
    vector: 'rgba(255,214,107,0.78)',
    wx: ['rgba(25,210,170,0.08)', 'rgba(245,196,66,0.15)', 'rgba(255,95,95,0.24)'],
    emg: '#ff5364',
    conflict: '#ffc857',
    gridFont: '10px "IBM Plex Mono", ui-monospace, monospace',
    labelFont: '11px "IBM Plex Mono", ui-monospace, monospace',
    labelFontBold: '600 11px "IBM Plex Mono", ui-monospace, monospace',
  },

  'crimson-alert': {
    bg: '#160306',
    ringStroke: 'rgba(194,45,64,0.2)',
    ringMajor: 'rgba(255,74,96,0.36)',
    compass: 'rgba(255,151,162,0.68)',
    compassFaint: 'rgba(184,66,80,0.34)',
    sweepHue: 350,
    sweepAlpha: 0.3,
    crosshair: 'rgba(255,80,100,0.15)',
    altLow: '#ffb3bd',
    altHigh: '#8e2635',
    symbolStroke: '#ffd9de',
    symbolAccent: '#ffe86b',
    ghostTrail: 'rgba(255,105,122,0.45)',
    label: '#fff0f2',
    labelMuted: 'rgba(242,174,183,0.78)',
    labelBoxFill: 'rgba(27,4,8,0.92)',
    labelBoxStroke: 'rgba(255,90,110,0.48)',
    leader: 'rgba(255,155,166,0.7)',
    airport: '#ffbd66',
    airportLabel: 'rgba(255,202,130,0.84)',
    navaid: 'rgba(255,135,150,0.58)',
    vector: 'rgba(255,226,108,0.78)',
    wx: ['rgba(220,70,90,0.08)', 'rgba(255,176,55,0.15)', 'rgba(255,235,85,0.23)'],
    emg: '#ffff5c',
    conflict: '#ff9f43',
    gridFont: '10px "JetBrains Mono", ui-monospace, monospace',
    labelFont: '11px "JetBrains Mono", ui-monospace, monospace',
    labelFontBold: 'bold 11px "JetBrains Mono", ui-monospace, monospace',
  },

  'night-vision': {
    bg: '#000400',
    ringStroke: 'rgba(34,180,70,0.18)',
    ringMajor: 'rgba(80,255,112,0.34)',
    compass: 'rgba(128,255,146,0.62)',
    compassFaint: 'rgba(55,180,78,0.31)',
    sweepHue: 125,
    sweepAlpha: 0.24,
    crosshair: 'rgba(70,255,102,0.13)',
    altLow: '#9dffac',
    altHigh: '#237a32',
    symbolStroke: '#c8ffd0',
    symbolAccent: '#ffffff',
    ghostTrail: 'rgba(85,235,107,0.4)',
    label: '#dfffe4',
    labelMuted: 'rgba(144,220,156,0.75)',
    labelBoxFill: 'rgba(0,8,1,0.92)',
    labelBoxStroke: 'rgba(93,235,116,0.42)',
    leader: 'rgba(145,255,161,0.65)',
    airport: '#b9ff66',
    airportLabel: 'rgba(202,255,135,0.8)',
    navaid: 'rgba(101,225,120,0.52)',
    vector: 'rgba(222,255,117,0.68)',
    wx: ['rgba(55,190,75,0.07)', 'rgba(170,210,65,0.13)', 'rgba(235,170,60,0.21)'],
    emg: '#ff4c59',
    conflict: '#ffe066',
    gridFont: '10px "JetBrains Mono", ui-monospace, monospace',
    labelFont: '11px "JetBrains Mono", ui-monospace, monospace',
    labelFontBold: 'bold 11px "JetBrains Mono", ui-monospace, monospace',
  },

  'aurora-borealis': {
    bg: '#020b12',
    ringStroke: 'rgba(44,196,169,0.2)',
    ringMajor: 'rgba(80,255,198,0.34)',
    compass: 'rgba(132,255,220,0.64)',
    compassFaint: 'rgba(63,180,157,0.32)',
    sweepHue: 155,
    sweepAlpha: 0.29,
    crosshair: 'rgba(66,240,190,0.14)',
    altLow: '#74f5cf',
    altHigh: '#6644a4',
    symbolStroke: '#d8fff3',
    symbolAccent: '#ff87c8',
    ghostTrail: 'rgba(73,230,188,0.44)',
    label: '#e8fff9',
    labelMuted: 'rgba(170,224,213,0.78)',
    labelBoxFill: 'rgba(3,13,22,0.92)',
    labelBoxStroke: 'rgba(87,229,195,0.46)',
    leader: 'rgba(130,244,215,0.7)',
    airport: '#ff91c9',
    airportLabel: 'rgba(255,165,213,0.86)',
    navaid: 'rgba(125,182,255,0.6)',
    vector: 'rgba(255,214,117,0.76)',
    wx: ['rgba(60,220,175,0.08)', 'rgba(235,206,88,0.14)', 'rgba(255,100,150,0.23)'],
    emg: '#ff5470',
    conflict: '#ffd166',
    gridFont: '10px "IBM Plex Mono", ui-monospace, monospace',
    labelFont: '11px "IBM Plex Mono", ui-monospace, monospace',
    labelFontBold: '600 11px "IBM Plex Mono", ui-monospace, monospace',
  },

  daylight: {
    bg: '#dce8f2',
    ringStroke: 'rgba(35,78,112,0.22)',
    ringMajor: 'rgba(21,87,137,0.38)',
    compass: 'rgba(16,61,96,0.72)',
    compassFaint: 'rgba(48,91,124,0.42)',
    sweepHue: 203,
    sweepAlpha: 0.14,
    sweepLight: true,
    crosshair: 'rgba(28,76,111,0.13)',
    altLow: '#005f99',
    altHigh: '#7a265a',
    symbolStroke: '#102f47',
    symbolAccent: '#a33b00',
    ghostTrail: 'rgba(30,86,125,0.42)',
    label: '#0a263b',
    labelMuted: 'rgba(25,61,87,0.76)',
    labelBoxFill: 'rgba(240,247,251,0.95)',
    labelBoxStroke: 'rgba(20,69,104,0.42)',
    leader: 'rgba(25,72,105,0.65)',
    airport: '#8f3f00',
    airportLabel: 'rgba(111,55,13,0.86)',
    navaid: 'rgba(41,80,108,0.62)',
    vector: 'rgba(145,72,0,0.66)',
    wx: ['rgba(37,145,96,0.09)', 'rgba(215,151,30,0.14)', 'rgba(200,55,55,0.21)'],
    emg: '#b5162d',
    conflict: '#a34b00',
    gridFont: '10px "IBM Plex Mono", ui-monospace, monospace',
    labelFont: '11px "IBM Plex Mono", ui-monospace, monospace',
    labelFontBold: '600 11px "IBM Plex Mono", ui-monospace, monospace',
  },

  'navy-strike': {
    bg: '#000814',
    ringStroke: 'rgba(0,100,160,0.22)',
    ringMajor: 'rgba(0,180,216,0.36)',
    compass: 'rgba(117,220,240,0.68)',
    compassFaint: 'rgba(39,126,160,0.34)',
    sweepHue: 45,
    sweepAlpha: 0.31,
    crosshair: 'rgba(255,195,0,0.14)',
    altLow: '#68e5ff',
    altHigh: '#1b5c84',
    symbolStroke: '#caf0f8',
    symbolAccent: '#ffc300',
    ghostTrail: 'rgba(0,180,216,0.44)',
    label: '#e2f9ff',
    labelMuted: 'rgba(159,212,226,0.78)',
    labelBoxFill: 'rgba(0,8,20,0.92)',
    labelBoxStroke: 'rgba(0,180,216,0.48)',
    leader: 'rgba(112,221,239,0.7)',
    airport: '#ffc300',
    airportLabel: 'rgba(255,211,80,0.86)',
    navaid: 'rgba(0,180,216,0.58)',
    vector: 'rgba(255,195,0,0.76)',
    wx: ['rgba(0,180,150,0.08)', 'rgba(255,195,0,0.15)', 'rgba(255,70,90,0.23)'],
    emg: '#ff3e73',
    conflict: '#ffc300',
    gridFont: '10px "IBM Plex Mono", ui-monospace, monospace',
    labelFont: '11px "IBM Plex Mono", ui-monospace, monospace',
    labelFontBold: '600 11px "IBM Plex Mono", ui-monospace, monospace',
  },
};

for (const palette of EXTRA_PALETTES) {
  THEMES[palette.value] = {
    ...THEMES.phosphor,
    bg: palette.bg,
    ringStroke: withAlpha(palette.accent, 0.18),
    ringMajor: withAlpha(palette.accent, 0.38),
    compass: withAlpha(palette.accent, 0.8),
    compassFaint: withAlpha(palette.accent, 0.45),
    sweepHue: palette.hue,
    crosshair: withAlpha(palette.accent, 0.2),
    altLow: palette.accent,
    altHigh: palette.secondary,
    symbolStroke: palette.accent,
    symbolAccent: palette.secondary,
    ghostTrail: withAlpha(palette.accent, 0.45),
    label: '#eef2f7',
    labelMuted: withAlpha(palette.accent, 0.8),
    labelBoxFill: withAlpha(palette.bg, 0.92),
    labelBoxStroke: withAlpha(palette.accent, 0.5),
    leader: withAlpha(palette.accent, 0.65),
    airport: palette.secondary,
    airportLabel: withAlpha(palette.secondary, 0.85),
    navaid: withAlpha(palette.accent, 0.65),
    vector: withAlpha(palette.secondary, 0.8),
  };
}


/** Nautical miles per degree of latitude (constant for spherical Earth approximation) */
const NM_PER_DEG_LAT = 60;

/**
 * Projects a geographic coordinate (lat/lon) to canvas pixel position.
 *
 * Uses equirectangular projection with cosine latitude correction for longitude.
 * This is accurate enough for the display ranges used (typically <250 nm) and
 * avoids the cost of a full Mercator projection.
 *
 * @param home - Center reference point (radar station location)
 * @param lat/lon - Target position to project
 * @param range - Current display range in nautical miles
 * @param cx/cy - Canvas center point in CSS pixels
 * @param radius - Radius of the outer ring in CSS pixels
 * @returns {x, y} canvas pixel coordinates and {nm} distance from home
 */
export function latLonToXY(
  home: { lat: number; lon: number },
  lat: number,
  lon: number,
  range: number,
  cx: number,
  cy: number,
  radius: number
) {
  const dLat = (lat - home.lat) * NM_PER_DEG_LAT;
  // Wrap the longitude delta to the shortest arc so targets straddling the
  // ±180° antimeridian project to the correct (near) side instead of ~360° away.
  let dLonDeg = lon - home.lon;
  if (dLonDeg > 180) dLonDeg -= 360;
  else if (dLonDeg < -180) dLonDeg += 360;
  const dLon = dLonDeg * NM_PER_DEG_LAT * Math.cos((home.lat * Math.PI) / 180);
  const scale = radius / range;
  return {
    x: cx + dLon * scale,
    y: cy - dLat * scale,
    nm: Math.hypot(dLat, dLon),
  };
}

/** Normalize altitude to 0..1 range for color gradient interpolation (0 ft = 0, 45000 ft = 1) */
const altNorm = (alt: number) => Math.min(1, Math.max(0, alt / 45000));

function hexToRgb(h: string): { r: number; g: number; b: number } {
  let s = h.replace('#', '');
  if (s.length === 3) {
    s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  }
  return {
    r: parseInt(s.slice(0, 2), 16) || 0,
    g: parseInt(s.slice(2, 4), 16) || 0,
    b: parseInt(s.slice(4, 6), 16) || 0,
  };
}

/** Interpolate between theme.altLow and theme.altHigh colors based on altitude */
function altGradient(theme: ScopeThemeDefinition, alt: number): string {
  const t = altNorm(alt);
  const a = hexToRgb(theme.altLow);
  const b = hexToRgb(theme.altHigh);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r},${g},${bl})`;
}

export interface ScopeProps {
  airports?: Array<{ icao: string; lat: number; lon: number; name: string }>;
  navaids?: Array<{ id: string; lat: number; lon: number }>;
  runways?: Array<{ airportIcao: string; lat1: number; lon1: number; lat2: number; lon2: number; name: string }>;
  weatherCells?: Array<{ lat: number; lon: number; r: number; int: number }>;
  home?: { lat: number; lon: number; iata?: string };
  conflicts?: Array<{ a: string; b: string; sepNm: number; sepFt: number; eta: number }>;
  airspacePolygons?: AirspacePolygon[];
}

/** Axis-aligned bounding box for a rendered data block label, used for collision detection */
interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** AABB intersection test with padding — used to prevent label overlap on the scope */
function rectsIntersect(r1: LabelRect, r2: LabelRect): boolean {
  const padding = 3;
  return !(
    r2.x > r1.x + r1.width + padding ||
    r2.x + r2.width < r1.x - padding ||
    r2.y > r1.y + r1.height + padding ||
    r2.y + r2.height < r1.y - padding
  );
}

/**
 * Test whether a target angle falls within the arc swept from start to end.
 * Handles the 0/2PI wrap-around boundary correctly — used to detect when the
 * rotating sweep line crosses an aircraft's bearing from center.
 */
function isAngleBetween(target: number, start: number, end: number): boolean {
  const normalize = (ang: number) => {
    ang = ang % (Math.PI * 2);
    return ang < 0 ? ang + Math.PI * 2 : ang;
  };
  const t = normalize(target);
  const s = normalize(start);
  const e = normalize(end);

  if (s <= e) {
    return t >= s && t <= e;
  } else {
    // Swept across the 0/2PI wrap-around boundary
    return t >= s || t <= e;
  }
}

/**
 * Test whether an aircraft at a given distance was crossed by the expanding
 * pulse ring between the previous and current pulse positions.
 */
function isPulseCrossed(distance: number, prevPulse: number, currentPulse: number): boolean {
  if (currentPulse >= prevPulse) {
    return distance >= prevPulse && distance <= currentPulse;
  } else {
    return distance >= prevPulse || distance <= currentPulse;
  }
}

export const Scope: React.FC<ScopeProps> = ({
  airports,
  navaids,
  runways,
  weatherCells,
  home,
  conflicts = [],
  airspacePolygons,
}) => {
  const {
    aircraftMapRef,
    settings,
    selectedHex,
    selectAircraft,
    updateSettings,
    airports: contextAirports,
    navaids: contextNavaids,
    runways: contextRunways,
  } = useRadar();

  const [viewportAirspaces, setViewportAirspaces] = useState<AirspacePolygon[]>([]);
  const activeAirspacePolygons = airspacePolygons ?? viewportAirspaces;
  const activeAirports = airports !== undefined ? airports : contextAirports;
  const activeNavaids = navaids !== undefined ? navaids : contextNavaids;
  const activeRunways = runways !== undefined ? runways : contextRunways;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Query the actual scope rectangle, not the window or an oversized tile grid.
  useEffect(() => {
    if (airspacePolygons !== undefined || !settings.showAirspaces) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const request = ++generation;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const width = wrap.clientWidth, height = wrap.clientHeight;
        if (!width || !height) return;
        const fill = fillsRadarViewport(settings);
        const { radius } = scopeGeometry(width, height, fill, settings.keepScopeInView !== false);
        const lat = home?.lat ?? settings.homeLat, lon = home?.lon ?? settings.homeLon;
        try {
          await airspaceDb.init(new URL('./', window.location.href).href.replace(/\/$/, ''));
          if (request !== generation) return;
          const polygons = await airspaceDb.queryAirspaces(lat, lon, settings.range,
            fill ? width / 2 / radius * settings.range : settings.range,
            fill ? height / 2 / radius * settings.range : settings.range);
          if (request === generation) setViewportAirspaces(polygons);
        } catch (err) { if (request === generation) console.error('[Scope] Viewport airspace query failed:', err); }
      }, 250);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(wrap);
    schedule();
    return () => { generation++; clearTimeout(timer); observer.disconnect(); airspaceDb.cancelQueries(); };
  }, [airspacePolygons, settings.showAirspaces, settings.homeLat, settings.homeLon,
    settings.range, settings.fillViewport, settings.sweepStyle, settings.keepScopeInView, home?.lat, home?.lon]);

  // ── Animation state refs ──────────────────────────────────────────────────
  // These are React refs (not state) so the animation loop can read/write them
  // without triggering re-renders. The rAF callback captures refs once at mount.
  const trailsRef = useRef<Map<string, TrailPoint[]>>(new Map()); // hex -> trail points
  const sweepRef = useRef<number>(0);         // current sweep angle (radians) or time (seconds)
  const pulseProgressRef = useRef<number>(0); // pulse mode: 0..1 normalized expansion
  const lastTickRef = useRef<number>(performance.now()); // previous frame timestamp for delta-time

  // Displayed aircraft snapshot — only updated when the sweep line crosses each
  // aircraft's bearing/distance, simulating real radar refresh behavior.
  // This Map is the source of truth for what gets rendered each frame.
  const displayedAircraftRef = useRef<Map<string, Aircraft>>(new Map());



  // Hit-testing positions (recomputed every frame)
  const hitRef = useRef<Array<{ x: number; y: number; hex: string }>>([]);

  // Reusable Map for aircraft screen positions — cleared and repopulated each frame
  // to avoid GC pressure from allocating a new Map every animation tick
  const aircraftPositionsRef = useRef<Map<string, { x: number; y: number; nm: number }>>(new Map());

  // ── Offscreen canvas caching ────────────────────────────────────────────────
  // Static geometry (rings, crosshairs, compass ticks) is rendered once to an
  // offscreen canvas and composited onto the main canvas each frame via drawImage().
  // This avoids re-stroking dozens of arcs and text labels every tick.
  // The dirty flag is set when range, theme, or ring count changes.
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenDirtyRef = useRef<boolean>(true);
  const airspaceLayerRef = useRef<HTMLCanvasElement | null>(null);
  const airspaceCacheRef = useRef<{ key: string; polygons: AirspacePolygon[] } | null>(null);

  // ── Prop/context refs ──────────────────────────────────────────────────────
  // The rAF loop is created once (empty deps) so it would capture stale closure
  // values. These refs mirror the latest prop/context values so the loop always
  // reads current data without needing to be re-created.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const conflictsRef = useRef(conflicts);
  useEffect(() => {
    conflictsRef.current = conflicts;
  }, [conflicts]);

  const weatherCellsRef = useRef(weatherCells);
  useEffect(() => {
    weatherCellsRef.current = weatherCells;
  }, [weatherCells]);

  const homeRef = useRef(home);
  useEffect(() => {
    homeRef.current = home;
  }, [home]);

  const selectedHexRef = useRef(selectedHex);
  useEffect(() => {
    selectedHexRef.current = selectedHex;
  }, [selectedHex]);

  const airportsRef = useRef(activeAirports);
  useEffect(() => {
    airportsRef.current = activeAirports;
  }, [activeAirports]);

  const navaidsRef = useRef(activeNavaids);
  useEffect(() => {
    navaidsRef.current = activeNavaids;
  }, [activeNavaids]);

  const runwaysRef = useRef(activeRunways);
  useEffect(() => {
    runwaysRef.current = activeRunways;
  }, [activeRunways]);

  const airspacePolygonsRef = useRef(activeAirspacePolygons);
  useEffect(() => {
    airspacePolygonsRef.current = activeAirspacePolygons;
  }, [activeAirspacePolygons]);

  useEffect(() => {
    if (settings.vfdEffect) {
      void document.fonts.load('12px "Radar VFD"').then(() => { offscreenDirtyRef.current = true; });
    }
  }, [settings.vfdEffect]);

  // Trigger static offscreen cache redraws when themes or core settings alter
  useEffect(() => {
    offscreenDirtyRef.current = true;
  }, [settings.range, settings.uiTheme, settings.scopeTheme, settings.ringCount, settings.sweepStyle, settings.fillViewport, settings.keepScopeInView, settings.vfdEffect]);

  // ── Main animation loop ────────────────────────────────────────────────────
  // A single requestAnimationFrame loop drives the entire radar display.
  // On each tick:
  //   1. Compute delta-time (capped at 100ms to handle tab-away pauses)
  //   2. Advance sweep angle or pulse position
  //   3. Check which aircraft the sweep has crossed since last frame
  //   4. Update displayedAircraftRef for crossed aircraft (snapshot their data)
  //   5. Call draw() to render the full frame
  // The empty dependency array ensures this loop runs once and never restarts.
  useEffect(() => {
    let rafId: number;

    const tick = (now: number) => {
      // Cap dt to 100ms to prevent huge jumps when the tab is backgrounded
      const dt = Math.min(100, now - lastTickRef.current);
      lastTickRef.current = now;

      const currentSettings = settingsRef.current;

      // Snapshot previous sweep angle/pulse position before advancing,
      // so we can detect which aircraft fall in the swept arc this frame
      const prevSweep = sweepRef.current;
      const prevPulse = pulseProgressRef.current;

      // Advance sweep: convert dt to angular displacement (rotate) or time-based progress (pulse)
      if (currentSettings.sweepStyle === 'rotate') {
        const sweepDurationMs = (currentSettings.sweepDurationS || CONFIG.SWEEP_DURATION_S || 3.8) * 1000;
        // Increment angle proportional to elapsed time, wrap at 2PI
        sweepRef.current = (sweepRef.current + (dt / sweepDurationMs) * Math.PI * 2) % (Math.PI * 2);
      } else if (currentSettings.sweepStyle === 'pulse') {
        sweepRef.current = now / 1000;
        // 3-second pulse cycle: normalize to 0..1 for distance comparison
        pulseProgressRef.current = (sweepRef.current % 3) / 3;
      }

      // Sync live aircraft data with sweep crossing
      const activeHome = homeRef.current || {
        lat: currentSettings.homeLat,
        lon: currentSettings.homeLon,
        iata: 'BOS',
      };
      const range = currentSettings.range;
      const liveAircraft = Object.values(aircraftMapRef.current);

      // Prune stale displayed aircraft
      for (const hex of displayedAircraftRef.current.keys()) {
        if (!aircraftMapRef.current[hex]) {
          displayedAircraftRef.current.delete(hex);
        }
      }

      // For each live aircraft, determine if the sweep has "painted" it this frame.
      // New aircraft appear immediately; existing ones only update when crossed.
      liveAircraft.forEach((ac) => {
        const exists = displayedAircraftRef.current.has(ac.hex);
        if (!exists) {
          displayedAircraftRef.current.set(ac.hex, { ...ac });
          return;
        }

        // Compute bearing (rotate mode) or distance (pulse mode) from home station
        const dLat = (ac.lat - activeHome.lat) * NM_PER_DEG_LAT;
        const dLon = (ac.lon - activeHome.lon) * NM_PER_DEG_LAT * Math.cos((activeHome.lat * Math.PI) / 180);
        const distance = Math.hypot(dLat, dLon);

        let crossed = false;
        if (currentSettings.sweepStyle === 'rotate') {
          // Calculate bearing from center to aircraft (0 = North, clockwise)
          let bearing = Math.atan2(dLon, dLat);
          if (bearing < 0) bearing += Math.PI * 2;
          // Was the aircraft's bearing between the previous and current sweep angle?
          crossed = isAngleBetween(bearing, prevSweep, sweepRef.current);
        } else if (currentSettings.sweepStyle === 'pulse') {
          const prevPulseRange = range * prevPulse;
          const currentPulseRange = range * pulseProgressRef.current;
          crossed = isPulseCrossed(distance, prevPulseRange, currentPulseRange);
        } else {
          // 'none' style: update every frame (real-time, no sweep gating)
          crossed = true;
        }

        if (crossed) {
          // Mutate the existing snapshot in place (it always exists here, since
          // the !exists case returned early above) rather than allocating a new
          // object every painted frame — same field values, no per-frame GC churn.
          const snap = displayedAircraftRef.current.get(ac.hex);
          if (snap) {
            Object.assign(snap, ac);
          } else {
            displayedAircraftRef.current.set(ac.hex, { ...ac });
          }
        }
      });

      draw(now);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      offscreenCanvasRef.current = null; // PERF: release offscreen canvas on unmount to prevent memory leak
    };
  }, []);
 // Intentional empty dependency array to run a single un-interrupted render loop

  const updateOffscreenCanvas = (
    w: number,
    h: number,
    dpr: number,
    theme: ScopeThemeDefinition,
    settingsVal: typeof settings
  ) => {
    const canvas = offscreenCanvasRef.current;
    if (!canvas) return;

    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // None is an unobstructed map: no rings, crosshair, or compass overlay.
    if (settingsVal.sweepStyle === 'none') return;

    const cx = w / 2;
    const cy = h / 2;
    const fillViewport = fillsRadarViewport(settingsVal);
    const { radius, guideRadius, showHeadings } = scopeGeometry(w, h, fillViewport, settingsVal.keepScopeInView !== false);

    // 1. Draw scope background (disabled to allow rendering airspaces below grid rings)
    // ctx.fillStyle = theme.bg;
    // ctx.fillRect(0, 0, w, h);

    // 2. Draw static rings
    drawRings(ctx, cx, cy, guideRadius, settingsVal.ringCount || 4, settingsVal.range * guideRadius / radius, theme);

    // 3. Draw crosshairs
    drawCrosshair(ctx, cx, cy, guideRadius, theme);

    // 4. Draw compass indices
    if (showHeadings) drawCompass(ctx, cx, cy, guideRadius, theme);
  };

  // ── Frame rendering function ───────────────────────────────────────────────
  // Called once per animation tick. Composites all layers in z-order onto the
  // main canvas. Handles DPR-aware sizing, offscreen cache, and all dynamic layers.
  const draw = (now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const wrap = wrapRef.current;
    if (!wrap) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;

    // If layout is not ready yet, skip rendering this frame
    if (w === 0 || h === 0) return;

    // Device pixel ratio: the canvas backing store is scaled up by DPR to render
    // sharp text and lines on HiDPI/Retina displays. All drawing coordinates
    // remain in CSS pixels via ctx.setTransform(dpr, 0, 0, dpr, 0, 0).
    const dpr = window.devicePixelRatio || 1;

    // Resize the canvas backing store if the container size changed
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      offscreenDirtyRef.current = true;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentSettings = settingsRef.current;
    const activeScopeTheme = currentSettings.scopeTheme || currentSettings.uiTheme || 'phosphor';
    const baseTheme = THEMES[activeScopeTheme] || THEMES.phosphor;
    const currentTheme = currentSettings.vfdEffect ? {
      ...baseTheme,
      gridFont: '11px "Radar VFD", monospace',
      labelFont: '12px "Radar VFD", monospace',
      labelFontBold: '12px "Radar VFD", monospace',
    } : baseTheme;

    // Instantiate offscreen canvas if missing
    if (!offscreenCanvasRef.current && typeof document !== 'undefined') {
      offscreenCanvasRef.current = document.createElement('canvas');
    }

    // Refresh offscreen canvas cache if dirtied
    if (offscreenDirtyRef.current) {
      updateOffscreenCanvas(w, h, dpr, currentTheme, currentSettings);
      offscreenDirtyRef.current = false;
    }

    // Draw pre-rendered static layer at full device pixel resolution
    // Clear screen and draw solid background on main canvas
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = currentTheme.bg;
    ctx.fillRect(0, 0, w * dpr, h * dpr);
    ctx.restore();

    // Reset coordinates to match CSS points
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Compute scope geometry: center point, display radius, and range.
    // Viewport geometry is independent of sweep animation.
    const cx = w / 2;
    const cy = h / 2;
    const fillViewport = fillsRadarViewport(currentSettings);
    const { radius, guideRadius } = scopeGeometry(w, h, fillViewport, currentSettings.keepScopeInView !== false);
    const range = currentSettings.range;

    const activeHome = homeRef.current || {
      lat: currentSettings.homeLat,
      lon: currentSettings.homeLon,
      iata: 'BOS',
    };

    const currentAirspacePolygons = airspacePolygonsRef.current || [];
    const currentAirports = airportsRef.current || [];
    const currentNavaids = navaidsRef.current || [];
    const currentRunways = runwaysRef.current || [];
    const currentWeatherCells = weatherCellsRef.current || [];
    const currentConflicts = conflictsRef.current || [];

    // Draw airspace polygons beneath grid rings
    if (currentSettings.showAirspaces) {
      const key = [w, h, dpr, activeHome.lat, activeHome.lon, range, radius, fillViewport,
        activeScopeTheme, currentSettings.airspaceColorScheme, currentSettings.showClassB,
        currentSettings.showClassC, currentSettings.showClassD, currentSettings.showClassE,
        currentSettings.showClassOther].join('|');
      if (!airspaceLayerRef.current) airspaceLayerRef.current = document.createElement('canvas');
      const layer = airspaceLayerRef.current;
      if (airspaceCacheRef.current?.key !== key || airspaceCacheRef.current?.polygons !== currentAirspacePolygons) {
        layer.width = Math.floor(w * dpr); layer.height = Math.floor(h * dpr);
        const layerCtx = layer.getContext('2d');
        if (layerCtx) {
          layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const filtered = currentAirspacePolygons.filter(poly => {
            const c = /(?:CLASS\s*)?([BCDE])\b/i.exec(poly.class)?.[1]?.toUpperCase();
            return c === 'B' ? currentSettings.showClassB : c === 'C' ? currentSettings.showClassC
              : c === 'D' ? currentSettings.showClassD : c === 'E' ? currentSettings.showClassE : currentSettings.showClassOther;
          });
          drawAirspaces(layerCtx, activeHome, filtered, cx, cy, radius, range,
            currentTheme, activeScopeTheme, fillViewport, currentSettings.airspaceColorScheme || 'theme');
          airspaceCacheRef.current = { key, polygons: currentAirspacePolygons };
        }
      }
      // Fade the cached layer as a whole without rebuilding geometry or fetching tiles.
      ctx.save();
      const opacity = currentSettings.airspaceOpacity ?? 100;
      ctx.globalAlpha = Number.isFinite(opacity) ? Math.max(0, Math.min(100, opacity)) / 100 : 1;
      ctx.drawImage(layer, 0, 0, w, h);
      ctx.restore();
    }

    // Draw pre-rendered static layer (rings + crosshair + compass) on top of the airspaces
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (offscreenCanvasRef.current) {
      ctx.drawImage(offscreenCanvasRef.current, 0, 0);
    }
    ctx.restore();

    // Clip dynamic layers (weather, runways, airports, navaids, sweep, trails, conflicts, aircraft)
    // to the scope circle boundary when the round display is selected.
    const clipDynamic = !fillViewport;
    if (clipDynamic) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
    }

    // 1. Draw weather cells (translucent overlay)
    if (currentWeatherCells.length > 0) {
      drawWeather(ctx, activeHome, currentWeatherCells, cx, cy, radius, range, currentTheme);
    }

    // 2. Draw runways
    if (currentSettings.showRunways && currentRunways.length > 0) {
      drawRunways(ctx, activeHome, currentRunways, cx, cy, radius, range, currentTheme, fillViewport);
    }

    // 3. Draw airports
    if (currentSettings.showAirports && currentAirports.length > 0) {
      drawAirports(ctx, activeHome, currentAirports, cx, cy, radius, range, currentTheme, fillViewport);
    }

    // 4. Draw navaids
    if (currentSettings.showNavaids && currentNavaids.length > 0) {
      drawNavaids(ctx, activeHome, currentNavaids, cx, cy, radius, range, currentTheme, fillViewport);
    }

    // 5. Draw sweep indicators
    if (currentSettings.sweepStyle === 'rotate') {
      drawSweep(ctx, cx, cy, fillViewport ? Math.hypot(cx, cy) : radius, sweepRef.current, currentTheme);
    } else if (currentSettings.sweepStyle === 'pulse') {
      drawPulse(ctx, cx, cy, fillViewport ? Math.hypot(cx, cy) : radius, sweepRef.current, currentTheme);
    }

    // 6. Sync and Render Aircraft Trails
    const activeAircraft = Array.from(displayedAircraftRef.current.values());
    activeAircraft.forEach((ac) => {
      if (ac.geoTrail) {
        trailsRef.current.set(ac.hex, ac.geoTrail);
      }
    });

    if (currentSettings.showTrails) {
      drawTrails(
        ctx,
        activeAircraft,
        trailsRef.current,
        activeHome,
        cx,
        cy,
        radius,
        range,
        currentTheme,
        currentSettings.altColor || false
      );
    }

    // 7. Draw separation alert indicator lines
    if (currentSettings.showConflicts && currentConflicts.length > 0) {
      drawConflictLines(
        ctx,
        activeAircraft,
        currentConflicts,
        activeHome,
        cx,
        cy,
        radius,
        range,
        currentTheme
      );
    }

    // Pre-calculate screen positions (including range in NM) for all displayed
    // aircraft ONCE per frame. drawAircraft reuses these instead of re-projecting,
    // halving the trig-heavy latLonToXY calls per aircraft per frame.
    // Entries are reused in place and stale hexes pruned to avoid per-frame GC churn.
    const positions = aircraftPositionsRef.current;
    const seenHexes = new Set<string>();
    activeAircraft.forEach((ac) => {
      const p = latLonToXY(activeHome, ac.lat, ac.lon, range, cx, cy, radius);
      const existing = positions.get(ac.hex);
      if (existing) {
        existing.x = p.x;
        existing.y = p.y;
        existing.nm = p.nm;
      } else {
        positions.set(ac.hex, { x: p.x, y: p.y, nm: p.nm });
      }
      seenHexes.add(ac.hex);
    });
    // Drop positions for aircraft no longer active this frame
    for (const hex of positions.keys()) {
      if (!seenHexes.has(hex)) positions.delete(hex);
    }
    const aircraftPositions = positions;

    // 8. Render active aircraft icons + HUD text callouts
    const hits: Array<{ x: number; y: number; hex: string }> = [];
    const drawnLabels: LabelRect[] = [];

    activeAircraft.forEach((ac) => {
      const isSelected = ac.hex === selectedHexRef.current;

      // Check conflict status case-insensitively using hex, cs, or flight
      const acHexUpper = ac.hex.toUpperCase();
      const acCsUpper = ac.cs?.toUpperCase();
      const acFlightUpper = ac.flight?.toUpperCase();

      const inConflict = currentConflicts.some((c) => {
        const ca = c.a.toUpperCase();
        const cb = c.b.toUpperCase();
        return (
          ca === acHexUpper ||
          cb === acHexUpper ||
          (acCsUpper && (ca === acCsUpper || cb === acCsUpper)) ||
          (acFlightUpper && (ca === acFlightUpper || cb === acFlightUpper))
        );
      });

      const hasEmergency = !!ac.emg;

      drawAircraft(
        ctx,
        ac,
        activeHome,
        cx,
        cy,
        radius,
        range,
        currentTheme,
        {
          altColor: currentSettings.altColor || false,
          labelDensity: currentSettings.labelDensity,
          showVectors: currentSettings.showVectors,
          vectorMin: currentSettings.vectorMinutes || CONFIG.VECTOR_MINUTES || 2,
          selected: isSelected,
          inConflict,
          emergency: hasEmergency,
          symbolSize: currentSettings.aircraftSymbolSize || 4,
          fillViewport,
        },
        hits,
        aircraftPositions,
        drawnLabels,
        activeAircraft
      );
    });

    if (clipDynamic) {
      ctx.restore();
    }

    hitRef.current = hits;

    // 9. Render range text at baseline
    ctx.fillStyle = currentTheme.compass;
    ctx.font = currentTheme.gridFont;
    ctx.textAlign = 'center';
    if (fillViewport) {
      ctx.fillText(`${range}nm`, cx, h - 15);
    } else {
      if (Math.min(w, h) >= 90) ctx.fillText(`${range}nm`, cx, cy + guideRadius + 30);
    }
  };

  // Click handler to select closest aircraft chevron
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      return; // Do not select aircraft if we were dragging/panning
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    // Ignore clipped targets outside the circular display.
    if (!fillsRadarViewport(settingsRef.current)) {
      const { radius } = scopeGeometry(r.width, r.height, false);
      if (Math.hypot(x - r.width / 2, y - r.height / 2) > radius) return;
    }
    const clickRadius = CONFIG.CLICK_RADIUS_PX || 15;

    for (const h of hitRef.current) {
      if (Math.hypot(x - h.x, y - h.y) < clickRadius) {
        selectAircraft(h.hex);
        return;
      }
    }
    selectAircraft(null);
  };

  // ── Drag-to-pan interaction ─────────────────────────────────────────────────
  // Implements click-drag panning of the radar center point. Uses pointer events
  // (not mouse events) for unified touch/mouse handling. The drag translates pixel
  // deltas back to lat/lon offsets using the inverse of the latLonToXY projection.
  // A 3px dead zone prevents accidental pans from click jitter.
  const dragStartRef = useRef<{ x: number; y: number; homeLat: number; homeLon: number } | null>(null);
  const isDraggingRef = useRef<boolean>(false);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!settingsRef.current.enableDragPan) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.cursor = 'grabbing';
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      homeLat: settingsRef.current.homeLat,
      homeLon: settingsRef.current.homeLon,
    };
    isDraggingRef.current = false;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStartRef.current) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (Math.hypot(dx, dy) > 3) {
      isDraggingRef.current = true;
    }

    if (isDraggingRef.current) {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w === 0 || h === 0) return;

      const fillViewport = fillsRadarViewport(settingsRef.current);
      const { radius } = scopeGeometry(w, h, fillViewport);
      const range = settingsRef.current.range;
      const scale = radius / range;

      const startHomeLat = dragStartRef.current.homeLat;
      const startHomeLon = dragStartRef.current.homeLon;
      const cosLat = Math.cos((startHomeLat * Math.PI) / 180);

      const deltaLon = -dx / (scale * NM_PER_DEG_LAT * Math.max(0.01, cosLat));
      const deltaLat = dy / (scale * NM_PER_DEG_LAT);

      updateSettings({
        homeLat: startHomeLat + deltaLat,
        homeLon: startHomeLon + deltaLon,
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStartRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    e.currentTarget.style.cursor = settingsRef.current.enableDragPan ? 'grab' : 'crosshair';
    dragStartRef.current = null;

    setTimeout(() => {
      isDraggingRef.current = false;
    }, 50);
  };

  // Mouse wheel zooms the display range in/out by CONFIG.RANGE_STEP_NM increments,
  // clamped to MIN_RANGE_NM..MAX_RANGE_NM
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const zoomDirection = e.deltaY < 0 ? -1 : 1;
    const step = CONFIG.RANGE_STEP_NM || 5;

    updateSettings((prev) => {
      let newRange = prev.range + zoomDirection * step;
      newRange = Math.max(CONFIG.MIN_RANGE_NM, Math.min(CONFIG.MAX_RANGE_NM, newRange));
      return { ...prev, range: newRange };
    });
  };

  return (
    <div ref={wrapRef} className={settings.crtEffect ? 'crt-scope' : undefined} style={{ position: 'absolute', inset: 0 }}>
      <canvas
        ref={canvasRef}
        onClick={onClick}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: settings.enableDragPan ? 'grab' : 'crosshair',
          maxWidth: 'none',
          maxHeight: 'none',
          touchAction: 'none',
        }}
      />
      {settings.crtEffect && <div className="crt-glass" aria-hidden="true" />}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Scope Rendering Helpers
//
// Pure functions that draw individual layers onto a 2D canvas context.
// These are called from the main draw() function in z-order and are
// designed to be stateless — all state is passed in via parameters.
// ──────────────────────────────────────────────────────────────────────────────

/** Draw concentric range rings with distance labels at 135 degrees (lower-left) */
function drawRings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  count: number,
  range: number,
  theme: ScopeThemeDefinition
) {
  for (let i = 1; i <= count; i++) {
    const r = (radius * i) / count;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = i === count ? theme.ringMajor : theme.ringStroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    // range indicators at 135 degrees
    const tx = cx + r * Math.cos(Math.PI * 0.75);
    const ty = cy + r * Math.sin(Math.PI * 0.75);
    ctx.fillStyle = theme.compassFaint;
    ctx.font = theme.gridFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round((range * i) / count)}nm`, tx + 4, ty - 6);
  }
}

/** Draw dashed crosshair lines through the scope center (N-S and E-W axes) */
function drawCrosshair(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, theme: ScopeThemeDefinition) {
  ctx.strokeStyle = theme.crosshair;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Draw compass tick marks every 10 degrees with labels at 30-degree intervals (N/E/S/W at cardinals) */
function drawCompass(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, theme: ScopeThemeDefinition) {
  ctx.font = theme.gridFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let deg = 0; deg < 360; deg += 10) {
    const rad = ((deg - 90) * Math.PI) / 180;
    const isMajor = deg % 30 === 0;
    const isCard = deg % 90 === 0;
    const r1 = radius + 2;
    const r2 = radius + (isMajor ? 7 : 4);

    ctx.beginPath();
    ctx.moveTo(cx + r1 * Math.cos(rad), cy + r1 * Math.sin(rad));
    ctx.lineTo(cx + r2 * Math.cos(rad), cy + r2 * Math.sin(rad));
    ctx.strokeStyle = isMajor ? theme.compass : theme.compassFaint;
    ctx.lineWidth = isMajor ? 1.2 : 0.8;
    ctx.stroke();

    if (isMajor) {
      const lr = radius + 18;
      const lx = cx + lr * Math.cos(rad);
      const ly = cy + lr * Math.sin(rad);
      ctx.fillStyle = isCard ? theme.compass : theme.compassFaint;

      const cardinalMap: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      const lbl = isCard ? cardinalMap[deg] : String(deg).padStart(3, '0');
      ctx.fillText(lbl, lx, ly);
    }
  }
}

/** One continuous angular gradient; no overlapping wedges or radial seams. */
function drawSweep(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, ang: number, theme: ScopeThemeDefinition) {
  const tail = 0.5;
  const edge = ang - Math.PI / 2;
  const start = edge - tail;
  const color = (alpha: number) => `hsla(${theme.sweepHue}, ${theme.sweepLight ? 70 : 90}%, ${theme.sweepLight ? 45 : 60}%, ${alpha})`;
  ctx.save();
  const glow = ctx.createConicGradient(start, cx, cy);
  // Quadratic phosphor decay with continuous interpolation between color stops.
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    glow.addColorStop(t * tail / (2 * Math.PI), color(t * t * theme.sweepAlpha));
  }
  glow.addColorStop(1, color(0));
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, start, edge); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + radius * Math.cos(edge), cy + radius * Math.sin(edge));
  ctx.strokeStyle = color(0.7);
  ctx.shadowColor = color(0.6); ctx.shadowBlur = 5;
  ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();
}

/** Draw the expanding pulse ring indicator — a circle that grows outward and fades */
function drawPulse(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, t: number, theme: ScopeThemeDefinition) {
  const p = (t % 3) / 3; // normalize 3-second cycle to 0..1
  const r = radius * p;
  const alpha = (1 - p) * theme.sweepAlpha * 0.8;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = theme.sweepLight
    ? `hsla(${theme.sweepHue}, 70%, 40%, ${alpha})`
    : `hsla(${theme.sweepHue}, 90%, 65%, ${alpha * 2})`;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Draw weather cells as translucent radial gradients colored by intensity tier */
function drawWeather(
  ctx: CanvasRenderingContext2D,
  home: { lat: number; lon: number },
  cells: Array<{ lat: number; lon: number; r: number; int: number }>,
  cx: number,
  cy: number,
  radius: number,
  range: number,
  theme: ScopeThemeDefinition
) {
  for (const cell of cells) {
    const p = latLonToXY(home, cell.lat, cell.lon, range, cx, cy, radius);
    const r = cell.r * radius;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, theme.wx[Math.min(theme.wx.length - 1, cell.int)]);
    g.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw airport markers as cross symbols with ICAO labels; home airport gets a box outline */
function drawAirports(
  ctx: CanvasRenderingContext2D,
  home: { lat: number; lon: number; iata?: string },
  airports: Array<{ icao: string; lat: number; lon: number; name: string }>,
  cx: number,
  cy: number,
  radius: number,
  range: number,
  theme: ScopeThemeDefinition,
  fillViewport: boolean
) {
  for (const a of airports) {
    const p = latLonToXY(home, a.lat, a.lon, range, cx, cy, radius);
    if (!fillViewport && p.nm > range * 1.05) continue;

    const isHome = a.icao === 'K' + home.iata || a.icao === home.iata;

    ctx.strokeStyle = theme.airport;
    ctx.lineWidth = isHome ? 1.4 : 1;
    const s = isHome ? 5 : 3.5;

    ctx.beginPath();
    ctx.moveTo(p.x - s, p.y);
    ctx.lineTo(p.x + s, p.y);
    ctx.moveTo(p.x, p.y - s);
    ctx.lineTo(p.x, p.y + s);
    ctx.stroke();

    if (isHome) {
      ctx.strokeRect(p.x - s, p.y - s, s * 2, s * 2);
    }

    ctx.fillStyle = theme.airportLabel;
    ctx.font = theme.gridFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(a.icao, p.x + s + 3, p.y + 2);
  }
}

/** Draw navaid markers as small circles with identifier labels */
function drawNavaids(
  ctx: CanvasRenderingContext2D,
  home: { lat: number; lon: number },
  navaids: Array<{ id: string; lat: number; lon: number }>,
  cx: number,
  cy: number,
  radius: number,
  range: number,
  theme: ScopeThemeDefinition,
  fillViewport: boolean
) {
  for (const n of navaids) {
    const p = latLonToXY(home, n.lat, n.lon, range, cx, cy, radius);
    if (!fillViewport && p.nm > range * 1.05) continue;

    ctx.strokeStyle = theme.navaid;
    ctx.lineWidth = 0.8;

    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = theme.navaid;
    ctx.font = theme.gridFont;
    ctx.textAlign = 'left';
    ctx.fillText(n.id, p.x + 5, p.y - 2);
  }
}

type AirspaceClassKey = 'B' | 'C' | 'D' | 'E' | 'OTHER';

const AIRSPACE_SCHEME_COLORS: Record<string, Record<AirspaceClassKey, string>> = {
  classic: {
    B: '#0033cc',
    C: '#cc0099',
    D: '#0066ff',
    E: '#cc3399',
    OTHER: '#b22222',
  },
  neon: {
    B: '#00ffff',
    C: '#ff00ff',
    D: '#00ff66',
    E: '#ffff00',
    OTHER: '#ff3232',
  },
  monochrome: {
    B: '#f1f5f9',
    C: '#cbd5e1',
    D: '#94a3b8',
    E: '#64748b',
    OTHER: '#ffffff',
  },
  'high-contrast': {
    B: '#00e5ff',
    C: '#ff4fd8',
    D: '#ffe34d',
    E: '#f8fafc',
    OTHER: '#ff6b35',
  },
  pastel: {
    B: '#8ea8ff',
    C: '#ff8ec7',
    D: '#72dfb5',
    E: '#c6a0f6',
    OTHER: '#ff9f8e',
  },
  ...Object.fromEntries(EXTRA_PALETTES.map((palette) => [palette.value, {
    B: palette.accent,
    C: palette.secondary,
    D: '#a8d9f0',
    E: '#c9b6df',
    OTHER: '#ff8f85',
  }])),
};

function withAlpha(color: string, alpha: number): string {
  const hex = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (hex) {
    return `rgba(${parseInt(hex[1], 16)}, ${parseInt(hex[2], 16)}, ${parseInt(hex[3], 16)}, ${alpha})`;
  }

  const rgb = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  return color;
}

/** Map airspace classification (B/C/D/E) to selected palette stroke and fill colors. */
function getAirspaceColor(classStr: string, themeKey: string, colorScheme: string): { stroke: string; fill: string } {
  const normalizedClass = (classStr || '').toUpperCase();
  const classMatch = normalizedClass.match(/(?:^|CLASS[\s_-]*)([BCDE])(?:$|[\s_-])/);
  const classKey = (classMatch?.[1] as AirspaceClassKey | undefined) ?? 'OTHER';

  const selectedScheme = AIRSPACE_SCHEME_COLORS[colorScheme];
  if (selectedScheme) {
    const color = selectedScheme[classKey];
    const strokeAlpha = colorScheme === 'high-contrast' ? 0.88 : colorScheme === 'pastel' ? 0.78 : 0.72;
    return {
      stroke: withAlpha(color, strokeAlpha),
      fill: withAlpha(color, colorScheme === 'high-contrast' ? 0.09 : 0.06),
    };
  }

  const palette = THEMES[themeKey] || THEMES.phosphor;
  const themeColors: Record<AirspaceClassKey, string> = {
    B: palette.symbolStroke,
    C: palette.symbolAccent,
    D: palette.airport,
    E: palette.navaid,
    OTHER: palette.emg,
  };
  const color = themeColors[classKey];
  return {
    stroke: withAlpha(color, classKey === 'E' ? 0.5 : 0.68),
    fill: withAlpha(color, classKey === 'E' ? 0.035 : 0.06),
  };
}

interface CanvasPoint {
  x: number;
  y: number;
  stroke?: boolean;
}

/**
 * Sutherland-Hodgman polygon clipping algorithm adapted for canvas pixel coordinates.
 * Clips a projected polygon ring to a bounding box in screen space.
 */
function clipCanvasPolygon(
  polygon: CanvasPoint[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): CanvasPoint[] {
  let outputList = polygon;

  // Clip against Left: x >= minX
  outputList = clipAgainstCanvasEdge(
    outputList,
    (p) => p.x >= minX,
    (p1, p2) => {
      const t = (minX - p1.x) / (p2.x - p1.x);
      return { x: minX, y: p1.y + t * (p2.y - p1.y) };
    }
  );

  // Clip against Right: x <= maxX
  outputList = clipAgainstCanvasEdge(
    outputList,
    (p) => p.x <= maxX,
    (p1, p2) => {
      const t = (maxX - p1.x) / (p2.x - p1.x);
      return { x: maxX, y: p1.y + t * (p2.y - p1.y) };
    }
  );

  // Clip against Top: y >= minY
  outputList = clipAgainstCanvasEdge(
    outputList,
    (p) => p.y >= minY,
    (p1, p2) => {
      const t = (minY - p1.y) / (p2.y - p1.y);
      return { x: p1.x + t * (p2.x - p1.x), y: minY };
    }
  );

  // Clip against Bottom: y <= maxY
  outputList = clipAgainstCanvasEdge(
    outputList,
    (p) => p.y <= maxY,
    (p1, p2) => {
      const t = (maxY - p1.y) / (p2.y - p1.y);
      return { x: p1.x + t * (p2.x - p1.x), y: maxY };
    }
  );

  return outputList;
}

function clipAgainstCanvasEdge(
  points: CanvasPoint[],
  inside: (p: CanvasPoint) => boolean,
  intersection: (p1: CanvasPoint, p2: CanvasPoint) => { x: number; y: number }
): CanvasPoint[] {
  if (points.length === 0) return [];
  const result: CanvasPoint[] = [];
  let s = points[points.length - 1];

  for (const p of points) {
    if (inside(p)) {
      if (!inside(s)) {
        const intersectPt = intersection(s, p);
        result.push({
          x: intersectPt.x,
          y: intersectPt.y,
          stroke: s.stroke,
        });
      }
      result.push(p);
    } else if (inside(s)) {
      const intersectPt = intersection(s, p);
      result.push({
        x: intersectPt.x,
        y: intersectPt.y,
        stroke: false,
      });
    }
    s = p;
  }
  return result;
}

/** Trace an airspace polygon's geometry rings onto the current canvas path (does not stroke/fill) */
function drawAirspacePolygonPath(
  ctx: CanvasRenderingContext2D,
  home: { lat: number; lon: number },
  geometry: Array<Array<{ lat: number; lon: number; stroke?: boolean }>>,
  range: number,
  cx: number,
  cy: number,
  radius: number,
  strokeOnly: boolean = false
) {
  // Define a safe canvas bounding box to clip against.
  // We use a margin of 100 pixels around the scope radius to avoid visible edge artifacts.
  const minX = cx - radius - 100;
  const maxX = cx + radius + 100;
  const minY = cy - radius - 100;
  const maxY = cy + radius + 100;

  for (const ring of geometry) {
    if (ring.length === 0) continue;

    // 1. Project to canvas coordinates
    const projected: CanvasPoint[] = [];
    for (const pt of ring) {
      const p = latLonToXY(home, pt.lat, pt.lon, range, cx, cy, radius);
      projected.push({ x: p.x, y: p.y, stroke: pt.stroke });
    }

    // 2. Clip against safe canvas boundary
    const clipped = clipCanvasPolygon(projected, minX, minY, maxX, maxY);
    if (clipped.length === 0) continue;

    // 3. Draw the clipped ring
    ctx.moveTo(clipped[0].x, clipped[0].y);
    for (let i = 1; i < clipped.length; i++) {
      const pt = clipped[i];
      if (strokeOnly && clipped[i - 1].stroke === false) {
        ctx.moveTo(pt.x, pt.y);
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }

    if (strokeOnly) {
      // For stroke, handle the connection from the last point back to the first point
      if (clipped[clipped.length - 1].stroke !== false) {
        ctx.lineTo(clipped[0].x, clipped[0].y);
      }
    } else {
      ctx.closePath();
    }
  }
}

/**
 * Draw all airspace classification polygons, clipped to the scope circle.
 * Renders dashed outlines with translucent fills, colored by airspace class.
 */
function drawAirspaces(
  ctx: CanvasRenderingContext2D,
  home: { lat: number; lon: number },
  polygons: AirspacePolygon[],
  cx: number,
  cy: number,
  radius: number,
  range: number,
  theme: ScopeThemeDefinition,
  themeKey: string,
  fillViewport: boolean,
  colorScheme: string
) {
  if (!polygons || polygons.length === 0) return;

  ctx.save();
  if (!fillViewport) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
  }

  for (const poly of polygons) {
    const colors = getAirspaceColor(poly.class, themeKey, colorScheme);

    // 1. Fill pass (unclipped on canvas, since geometry is already clipped in the worker)
    ctx.beginPath();
    drawAirspacePolygonPath(ctx, home, poly.geometry, range, cx, cy, radius, false);
    ctx.fillStyle = colors.fill;
    ctx.fill();

    // 2. Stroke pass (using strokeOnly to skip tile boundaries)
    ctx.beginPath();
    drawAirspacePolygonPath(ctx, home, poly.geometry, range, cx, cy, radius, true);
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

/** Draw runway centerlines as straight lines between threshold endpoints */
function drawRunways(
  ctx: CanvasRenderingContext2D,
  home: { lat: number; lon: number },
  runways: Array<{ airportIcao: string; lat1: number; lon1: number; lat2: number; lon2: number; name: string }>,
  cx: number,
  cy: number,
  radius: number,
  range: number,
  theme: ScopeThemeDefinition,
  fillViewport: boolean
) {
  ctx.strokeStyle = theme.airport;
  ctx.lineWidth = CONFIG.AIRPORT_DISPLAY.RUNWAY_LINE_WIDTH || 2;

  for (const r of runways) {
    const p1 = latLonToXY(home, r.lat1, r.lon1, range, cx, cy, radius);
    const p2 = latLonToXY(home, r.lat2, r.lon2, range, cx, cy, radius);

    // Skip if completely out of bounds
    if (!fillViewport && p1.nm > range * 1.1 && p2.nm > range * 1.1) continue;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
}

/** Replace the alpha channel of any CSS color string (hex, rgb, rgba) with the given value */
function colorWithAlpha(colorStr: string, alpha: number): string {
  if (colorStr.startsWith('#')) {
    const rgb = hexToRgb(colorStr);
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  }
  if (colorStr.startsWith('rgba')) {
    const parts = colorStr.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
    if (parts) {
      return `rgba(${parts[1]},${parts[2]},${parts[3]},${alpha})`;
    }
  }
  if (colorStr.startsWith('rgb')) {
    const parts = colorStr.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (parts) {
      return `rgba(${parts[1]},${parts[2]},${parts[3]},${alpha})`;
    }
  }
  return colorStr;
}

/**
 * Draw aircraft trail polylines with linear gradient alpha fading.
 * Trails fade from transparent (oldest point) to opaque (most recent point),
 * creating a comet-tail effect. Color is either the theme's ghost trail color
 * or altitude-gradient when altColor mode is enabled.
 */
function drawTrails(
  ctx: CanvasRenderingContext2D,
  aircraft: Aircraft[],
  trails: Map<string, TrailPoint[]>,
  home: { lat: number; lon: number },
  cx: number,
  cy: number,
  radius: number,
  range: number,
  theme: ScopeThemeDefinition,
  altColor: boolean
) {
  for (const ac of aircraft) {
    const pts = trails.get(ac.hex);
    if (!pts || pts.length < 2) continue;

    const baseColor = altColor ? altGradient(theme, ac.alt) : theme.ghostTrail;
    const startPt = latLonToXY(home, pts[0].lat, pts[0].lon, range, cx, cy, radius);
    const endPt = latLonToXY(home, pts[pts.length - 1].lat, pts[pts.length - 1].lon, range, cx, cy, radius);

    if (endPt.nm > range * 1.15) continue;

    const dist = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
    if (dist > 1) {
      const grad = ctx.createLinearGradient(startPt.x, startPt.y, endPt.x, endPt.y);
      grad.addColorStop(0, colorWithAlpha(baseColor, 0.03));
      grad.addColorStop(1, colorWithAlpha(baseColor, 0.65));
      ctx.strokeStyle = grad;
    } else {
      ctx.strokeStyle = colorWithAlpha(baseColor, 0.45);
    }

    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(startPt.x, startPt.y);
    for (let i = 1; i < pts.length; i++) {
      const p = latLonToXY(home, pts[i].lat, pts[i].lon, range, cx, cy, radius);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

/** Draw animated dashed lines between aircraft pairs that are in separation conflict */
function drawConflictLines(
  ctx: CanvasRenderingContext2D,
  aircraft: Aircraft[],
  conflicts: Array<{ a: string; b: string; sepNm: number; sepFt: number; eta: number }>,
  home: { lat: number; lon: number },
  cx: number,
  cy: number,
  radius: number,
  range: number,
  theme: ScopeThemeDefinition
) {
  for (const c of conflicts) {
    const ca = c.a.toUpperCase();
    const cb = c.b.toUpperCase();

    const a = aircraft.find((x) => {
      const h = x.hex.toUpperCase();
      const cs = x.cs?.toUpperCase();
      const fl = x.flight?.toUpperCase();
      return h === ca || (cs && cs === ca) || (fl && fl === ca);
    });

    const b = aircraft.find((x) => {
      const h = x.hex.toUpperCase();
      const cs = x.cs?.toUpperCase();
      const fl = x.flight?.toUpperCase();
      return h === cb || (cs && cs === cb) || (fl && fl === cb);
    });

    if (!a || !b) continue;

    const pa = latLonToXY(home, a.lat, a.lon, range, cx, cy, radius);
    const pb = latLonToXY(home, b.lat, b.lon, range, cx, cy, radius);

    ctx.save();
    ctx.strokeStyle = theme.conflict;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -(performance.now() / 40) % 9;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(performance.now() / 150);

    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Render a single aircraft: chevron symbol, selection ring, conflict/emergency
 * pulsator, velocity vector prediction line, and data block label.
 * The chevron points in the direction of the aircraft's ground track.
 */
function drawAircraft(
  ctx: CanvasRenderingContext2D,
  ac: Aircraft,
  home: { lat: number; lon: number },
  cx: number,
  cy: number,
  radius: number,
  range: number,
  theme: ScopeThemeDefinition,
  ctl: {
    altColor: boolean;
    labelDensity: 'mini' | 'compact' | 'full';
    showVectors: boolean;
    vectorMin: number;
    selected: boolean;
    inConflict: boolean;
    emergency: boolean;
    symbolSize: number;
    fillViewport: boolean;
  },
  hits: Array<{ x: number; y: number; hex: string }>,
  aircraftPositions: Map<string, { x: number; y: number; nm: number }>,
  drawnLabels: LabelRect[],
  activeAircraft: Aircraft[]
) {
  // Reuse the position projected once per frame in the main loop; fall back to
  // projecting directly if (unexpectedly) absent from the map.
  const p = aircraftPositions.get(ac.hex) ?? latLonToXY(home, ac.lat, ac.lon, range, cx, cy, radius);
  if (!ctl.fillViewport && p.nm > range * 1.15) return;

  hits.push({ x: p.x, y: p.y, hex: ac.hex });

  const col = ctl.emergency
    ? theme.emg
    : ctl.inConflict
    ? theme.conflict
    : ctl.altColor
    ? altGradient(theme, ac.alt)
    : theme.symbolStroke;

  // Render aircraft chevron pointing in track direction
  const trkRad = ((ac.trk - 90) * Math.PI) / 180;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(trkRad);
  ctx.fillStyle = col;
  ctx.beginPath();
  const symbolSize = ctl.symbolSize;
  ctx.moveTo(symbolSize * 1.5, 0);
  ctx.lineTo(-symbolSize * 0.75, symbolSize * 0.75);
  ctx.lineTo(-symbolSize * 0.75, -symbolSize * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Selection Ring
  if (ctl.selected) {
    ctx.strokeStyle = theme.symbolAccent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const symbolSize = ctl.symbolSize;
    ctx.arc(p.x, p.y, symbolSize * 2.75, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Conflict / Emergency warning pulsator rings
  if (ctl.inConflict || ctl.emergency) {
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 250);
    ctx.strokeStyle = ctl.emergency ? theme.emg : theme.conflict;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    const symbolSize = ctl.symbolSize;
    ctx.arc(p.x, p.y, symbolSize * 2.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Velocity Vector Predictor line
  if (ctl.showVectors && ac.gs) {
    const distNm = (ac.gs / 60) * ctl.vectorMin;
    const rPx = (distNm / range) * radius;
    const vx = p.x + rPx * Math.cos(trkRad);
    const vy = p.y + rPx * Math.sin(trkRad);

    ctx.strokeStyle = theme.vector;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(vx, vy);
    ctx.stroke();

    // Arrow tip dot
    ctx.beginPath();
    ctx.arc(vx, vy, 1.3, 0, Math.PI * 2);
    ctx.fillStyle = theme.vector;
    ctx.fill();
  }

  // Render Data Block labels with collision checks
  drawLabel(
    ctx,
    ac,
    p,
    theme,
    {
      labelDensity: ctl.labelDensity,
      selected: ctl.selected,
      symbolSize: ctl.symbolSize,
    },
    aircraftPositions,
    drawnLabels,
    activeAircraft
  );
}

/**
 * Render the data block label for an aircraft with collision avoidance.
 *
 * Label placement algorithm:
 *   1. Build text lines based on labelDensity (mini/compact/full)
 *   2. Measure the bounding box of the label text
 *   3. Try 8 candidate positions around the aircraft (top-right first, then
 *      clockwise) at a fixed radius from the symbol center
 *   4. For each candidate, test AABB intersection against already-placed labels
 *      and against other aircraft icon positions
 *   5. Place at the first collision-free position; skip if none found (unless selected)
 *   6. Draw a leader line from the aircraft to the label anchor, then the
 *      bracket-cornered box and text lines
 */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  ac: Aircraft,
  p: { x: number; y: number },
  theme: ScopeThemeDefinition,
  ctl: {
    labelDensity: 'mini' | 'compact' | 'full';
    selected: boolean;
    symbolSize: number;
  },
  aircraftPositions: Map<string, { x: number; y: number }>,
  drawnLabels: LabelRect[],
  activeAircraft: Aircraft[]
) {
  const lines: string[] = [];
  const label = ac.flight || ac.cs || ac.hex;

  if (ctl.labelDensity === 'mini') {
    lines.push(label);
    lines.push(`${Math.round(ac.alt / 100)}`);
  } else if (ctl.labelDensity === 'compact') {
    lines.push(label);
    lines.push(`FL${String(Math.round(ac.alt / 100)).padStart(3, '0')}  ${Math.round(ac.gs)}`);
  } else {
    lines.push(label);
    lines.push(`FL${String(Math.round(ac.alt / 100)).padStart(3, '0')}  ${Math.round(ac.gs)}kt`);

    const typeStr = ac.type ? `  ${ac.type}` : '';
    const sqkStr = ac.sqk ? `  ${ac.sqk}` : '';
    lines.push(`${String(Math.round(ac.trk)).padStart(3, '0')}°${typeStr}${sqkStr}`);
  }

  const scale = ctl.selected ? 1.5 : 1.0;
  const labelFont = ctl.selected ? getScaledFont(theme.labelFont, scale) : theme.labelFont;
  const labelFontBold = ctl.selected ? getScaledFont(theme.labelFontBold, scale) : theme.labelFontBold;

  ctx.font = labelFont;
  const widths = lines.map((l, i) => {
    ctx.font = i === 0 ? labelFontBold : labelFont;
    return ctx.measureText(l).width;
  });
  const w = Math.max(...widths) + 10 * scale;
  const lh = 13 * scale;
  const h = lines.length * lh + 6 * scale;

  // Candidate bias angles for 8 compass positions
  const numCandidates = 8;
  const placementRadius = 24 * scale;
  const biasAngles = [
    -Math.PI / 4, // Top-Right (recommended default)
    0,            // Right
    Math.PI / 4,  // Bottom-Right
    -Math.PI / 2, // Top
    Math.PI / 2,  // Bottom
    -3 * Math.PI / 4, // Top-Left
    Math.PI,      // Left
    3 * Math.PI / 4,  // Bottom-Left
  ];

  let placedRect: LabelRect | null = null;
  let chosenPos: { dx: number; dy: number; anchorX: number } | null = null;

  for (let i = 0; i < numCandidates; i++) {
    const angle = biasAngles[i];
    const dx = placementRadius * Math.cos(angle);
    const dy = placementRadius * Math.sin(angle);

    // If dx >= 0, label is placed to the right of anchor -> anchorX = 0
    // If dx < 0, label is placed to the left of anchor -> anchorX = 1
    const anchorX = dx >= 0 ? 0 : 1;

    const rect: LabelRect = {
      x: p.x + dx - w * anchorX,
      y: p.y + dy - h / 2,
      width: w,
      height: h,
    };

    let collision = false;

    // 1. Check intersection with already drawn labels
    for (const existing of drawnLabels) {
      if (rectsIntersect(rect, existing)) {
        collision = true;
        break;
      }
    }

    // 2. Check collision with other aircraft icons
    if (!collision) {
      for (const otherAc of activeAircraft) {
        if (otherAc.hex !== ac.hex) {
          const otherPos = aircraftPositions.get(otherAc.hex);
          if (otherPos) {
            // Check if other aircraft center falls inside rect with safety padding
            const margin = ctl.symbolSize + 6 * scale;
            if (
              otherPos.x >= rect.x - margin &&
              otherPos.x <= rect.x + rect.width + margin &&
              otherPos.y >= rect.y - margin &&
              otherPos.y <= rect.y + rect.height + margin
            ) {
              collision = true;
              break;
            }
          }
        }
      }
    }

    if (!collision) {
      placedRect = rect;
      chosenPos = { dx, dy, anchorX };
      break;
    }
  }

  // Fallback for selected aircraft to ensure details are always visible
  if (!placedRect && ctl.selected) {
    const angle = biasAngles[0];
    const dx = placementRadius * Math.cos(angle);
    const dy = placementRadius * Math.sin(angle);
    const anchorX = dx >= 0 ? 0 : 1;
    placedRect = {
      x: p.x + dx - w * anchorX,
      y: p.y + dy - h / 2,
      width: w,
      height: h,
    };
    chosenPos = { dx, dy, anchorX };
  }

  // Skip rendering if no candidate is collision-free (unless selected)
  if (!placedRect || !chosenPos) {
    return;
  }

  // Draw connector leader line from aircraft center boundary to label anchor
  ctx.strokeStyle = theme.leader;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  const dist = Math.hypot(chosenPos.dx, chosenPos.dy);
  const startRatio = (6 * scale) / dist; // Offset start of line 6px along vector
  ctx.moveTo(p.x + chosenPos.dx * startRatio, p.y + chosenPos.dy * startRatio);
  ctx.lineTo(p.x + chosenPos.dx, p.y + chosenPos.dy);
  ctx.stroke();

  // Draw bracket box container
  ctx.fillStyle = theme.labelBoxFill;
  ctx.strokeStyle = ctl.selected ? theme.symbolAccent : theme.labelBoxStroke;
  ctx.lineWidth = ctl.selected ? 1.3 : 0.8;
  drawBracketBox(ctx, placedRect.x, placedRect.y, placedRect.width, placedRect.height, scale);

  // Render text lines inside label
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => {
    ctx.font = i === 0 ? labelFontBold : labelFont;
    ctx.fillStyle = i === 0 ? theme.label : theme.labelMuted;
    ctx.fillText(l, placedRect!.x + 5 * scale, placedRect!.y + 3 * scale + i * lh);
  });

  // Track placed label bounds
  drawnLabels.push(placedRect);
}

/** Draw a label box with ATC-style bracket corners (short strokes at each corner instead of full border) */
function drawBracketBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number = 1.0
) {
  const c = 4 * scale; // size of corners

  ctx.fillRect(x, y, w, h);

  ctx.beginPath();
  // Top Left
  ctx.moveTo(x, y + c);
  ctx.lineTo(x, y);
  ctx.lineTo(x + c, y);

  // Top Right
  ctx.moveTo(x + w - c, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + c);

  // Bottom Right
  ctx.moveTo(x + w, y + h - c);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - c, y + h);

  // Bottom Left
  ctx.moveTo(x + c, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - c);

  ctx.stroke();
}

/** Scale the pixel size in a CSS font string by a multiplier (used for selected aircraft labels) */
function getScaledFont(fontStr: string, scale: number): string {
  return fontStr.replace(/(\d+(?:\.\d+)?)px/, (_, size) => {
    const newSize = parseFloat(size) * scale;
    return `${newSize}px`;
  });
}
