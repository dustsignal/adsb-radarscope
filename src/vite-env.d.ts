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
// vite-env.d.ts — Vite ambient type declarations
//
// Ambient TypeScript types for Vite's import.meta.env, including the optional
// VITE_DATA_URL build variable. Add new VITE_* env vars to ImportMetaEnv here so
// they are type-checked. Contains no runtime code.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: vite-env @ r1 (2026-06-19)
// ---------------------------------------------------------------------------

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override for the default aircraft.json polling endpoint (set in .env / deployment). */
  readonly VITE_DATA_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
