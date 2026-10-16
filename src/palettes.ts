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
// Additional coordinated radar, airspace, and interface palettes.

export const EXTRA_PALETTES = [
  { value: 'obsidian-gold', label: 'Obsidian Gold', description: 'Charcoal and signal gold', bg: '#0c0e12', accent: '#f5c86a', secondary: '#8ddbd2', hue: 42 },
  { value: 'violet-dusk', label: 'Violet Dusk', description: 'Deep violet and lavender', bg: '#120d20', accent: '#c4a0ff', secondary: '#72e4db', hue: 268 },
  { value: 'copper-wire', label: 'Copper Wire', description: 'Burnished copper and ice', bg: '#180e0b', accent: '#ffb084', secondary: '#8dd5f2', hue: 23 },
  { value: 'jade-night', label: 'Jade Night', description: 'Forest jade and soft gold', bg: '#061510', accent: '#6fe2b5', secondary: '#eed38c', hue: 155 },
  { value: 'cobalt', label: 'Cobalt', description: 'Deep blue and electric azure', bg: '#080e20', accent: '#86b0ff', secondary: '#f1c878', hue: 220 },
  { value: 'rose-quartz', label: 'Rose Quartz', description: 'Smoky plum and rose', bg: '#1a0d18', accent: '#f3a9cc', secondary: '#afcbff', hue: 330 },
  { value: 'solar-flare', label: 'Solar Flare', description: 'Warm orange and sky blue', bg: '#190f07', accent: '#ffbf70', secondary: '#83cffa', hue: 33 },
  { value: 'glacier', label: 'Glacier', description: 'Glacial teal and silver', bg: '#07151b', accent: '#8de2ee', secondary: '#c8b5ff', hue: 186 },
  { value: 'moonstone', label: 'Moonstone', description: 'Graphite and silver-blue', bg: '#101218', accent: '#c3cedf', secondary: '#b8d9b0', hue: 215 },
  { value: 'orchid', label: 'Orchid', description: 'Rich purple and mint', bg: '#180b20', accent: '#e6a0f2', secondary: '#8ae4ba', hue: 286 },
] as const;

export type ExtraPaletteKey = typeof EXTRA_PALETTES[number]['value'];

export function getUiPalette(key: string | undefined): Record<string, string> {
  const palette = EXTRA_PALETTES.find((entry) => entry.value === key);
  if (!palette) return {};
  const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const blend = (a: string, b: string, amount: number) => rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * amount)).join(' ');
  return {
    '--ui-bg': rgb(palette.bg).join(' '),
    '--ui-surface': blend(palette.bg, palette.accent, 0.07),
    '--ui-raised': blend(palette.bg, palette.accent, 0.18),
    '--ui-accent': rgb(palette.accent).join(' '),
    '--ui-muted': blend(palette.accent, '#ffffff', 0.35),
    '--ui-text': blend(palette.accent, '#ffffff', 0.85),
  };
}
