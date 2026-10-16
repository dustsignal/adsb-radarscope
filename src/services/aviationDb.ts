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
// aviationDb.ts — Shared AviationDbService singleton
//
// Exports the single shared AviationDbService instance. Import this (rather than
// `new AviationDbService()`) so the whole app shares one Web Worker thread.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: aviationDb @ r1 (2026-06-19)
// ---------------------------------------------------------------------------

import { AviationDbService } from './AviationDbService';

export const aviationDb = new AviationDbService();
