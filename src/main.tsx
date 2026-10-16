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
// main.tsx — React application entry point
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: main @ r1 (2026-06-19)
// ---------------------------------------------------------------------------

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { loadRuntimeConfig } from './runtimeConfig';

// Validate the mount point exists before attempting to create the React root.
// A missing #root element usually means index.html is misconfigured.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error(
    'ADSB Radarscope: Could not find #root element in the document. ' +
    'Ensure index.html contains a <div id="root"></div> mount point.'
  );
}
const mountElement = rootElement;

// StrictMode enables additional development-only checks (double-invocation of
// effects, deprecated API warnings) that help catch subtle bugs early.
// It has zero impact on the production build.
async function startApplication(): Promise<void> {
  await loadRuntimeConfig();
  ReactDOM.createRoot(mountElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void startApplication();
