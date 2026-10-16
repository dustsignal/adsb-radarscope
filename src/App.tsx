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
// App.tsx — Root component, theme routing & crash boundary
//
// Wraps the app in RadarProvider and an ErrorBoundary, then mounts the active
// radar layout directly. Edit here to change startup loading or layout routing.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: App @ r4 (2026-10-16)
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useRef } from 'react';
import { RadarProvider, useRadar } from './context/RadarContext';
import { aviationDb } from './services/aviationDb';
import { PhosphorView } from './components/PhosphorView';
import { ConsoleView } from './components/ConsoleView';
import { getUiPalette } from './palettes';
import { SetupPanel } from './components/SetupPanel';

/** Milliseconds before showing a "taking longer than expected" warning */
const DB_LOAD_TIMEOUT_MS = 30_000;



/**
 * Catches render/runtime errors thrown by any descendant (e.g. a bad aircraft
 * record reaching the canvas) and shows a safe recovery screen instead of letting
 * a single throw unmount the entire React tree into a blank white page.
 */
interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown): void {
    // Log details to the console for debugging; keep the UI message generic.
    console.error('[App] Unhandled render error:', error, info);
  }

  private handleReload = (): void => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#070b12] text-[#e2e8f0] font-sans">
          <div className="p-8 bg-[#1c0c0c]/80 border border-red-900/60 rounded-xl shadow-2xl text-center max-w-md w-full">
            <div className="text-red-500 text-3xl mb-4">&#9888;</div>
            <h2 className="text-sm font-bold tracking-widest uppercase mb-3 text-red-400">
              Display Error
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              The radar display encountered an unexpected error. Details have been logged to the
              browser console.
            </p>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-red-950/60 border border-red-800/80 hover:bg-red-900/50 text-red-200 text-xs font-semibold rounded transition-colors duration-150"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const AppContent: React.FC = () => {
  const { settings } = useRadar();
  const shutdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  // Warning flag shown when DB init exceeds DB_LOAD_TIMEOUT_MS (not a hard error)
  const [dbSlowWarning, setDbSlowWarning] = useState(false);
  // Initialise both aviation databases in parallel on mount.
  // A 30-second timeout sets a warning flag (not an error) so the user knows
  // the app has not frozen — the databases may still finish loading.
  useEffect(() => {
    // StrictMode replays setup/cleanup; keep shared workers alive for that replay.
    if (shutdownTimer.current) clearTimeout(shutdownTimer.current);
    let active = true;
    // Start a slow-load warning timer
    const slowTimer = setTimeout(() => {
      setDbSlowWarning(true);
    }, DB_LOAD_TIMEOUT_MS);

    const initDb = async () => {
      try {
        setDbLoading(true);
        // Resolve subfolder-aware base URL to support hosting in subdirectories
        const baseUrl = new URL('./', window.location.href).href.replace(/\/$/, '');
        await Promise.all([
          aviationDb.init(baseUrl),
        ]);
        if (!active) return;
        clearTimeout(slowTimer);
        setDbLoading(false);
      } catch (err: unknown) {
        if (!active) return;
        clearTimeout(slowTimer);
        // Log the real error for debugging but show a generic message in the UI
        // to avoid exposing internal file paths or stack traces to the user.
        console.error('Failed to load databases:', err);
        setDbError('Could not initialise the aviation database. Check the browser console for details.');
        setDbLoading(false);
      }
    };

    initDb();

    return () => {
      clearTimeout(slowTimer);
      active = false;
      // Terminate on a real unmount, after a possible immediate effect replay.
      shutdownTimer.current = setTimeout(() => {
        aviationDb.terminate();
      }, 0);
    };
  }, []);

  if (settings.setupEnabled !== false && !settings.setupCompleted) return <SetupPanel />;

  // --- Loading state: show spinner while databases initialise ---
  if (dbLoading) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#070b12] text-[#e2e8f0] font-sans selection:bg-[#38bdf8]/30">
        <div className="relative flex flex-col items-center p-8 bg-[#0b1329]/50 border border-slate-800 rounded-xl shadow-2xl backdrop-blur-md max-w-sm w-full text-center">
          {/* Glowing loading spinner */}
          <div className="relative w-16 h-16 mb-6">
            <div className="absolute inset-0 border-4 border-slate-800 rounded-full" />
            <div className="absolute inset-0 border-4 border-[#38bdf8] border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-0 border border-[#38bdf8]/40 rounded-full animate-ping" />
          </div>

          <span className="text-sm font-bold tracking-widest uppercase mb-2">ADSB RADARSCOPE V2</span>
          <p className="text-xs text-slate-400 leading-relaxed">
            Initializing offline aviation databases...
          </p>
          {/* Show a slow-load warning after DB_LOAD_TIMEOUT_MS so the user
              knows the app is still working, not frozen */}
          {dbSlowWarning && (
            <p className="mt-3 text-[11px] text-amber-400 leading-relaxed">
              Loading is taking longer than expected...
            </p>
          )}
          <div className="mt-4 text-[9px] font-mono text-slate-500 tracking-wider">
            PARSING CSVs IN BACKGROUND THREAD
          </div>
        </div>
      </div>
    );
  }

  // --- Error state: show a safe, generic message (details logged to console) ---
  if (dbError) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#070b12] text-[#e2e8f0] font-sans">
        <div className="p-8 bg-[#1c0c0c]/80 border border-red-900/60 rounded-xl shadow-2xl text-center max-w-md w-full">
          <div className="text-red-500 text-3xl mb-4">&#9888;</div>
          <h2 className="text-sm font-bold tracking-widest uppercase mb-3 text-red-400">
            Database Loading Error
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed mb-4">
            {dbError}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-950/60 border border-red-800/80 hover:bg-red-900/50 text-red-200 text-xs font-semibold rounded transition-colors duration-150"
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  // Open directly into the saved layout; fresh installs use rotating sweep.
  return (
    <div className={`radar-display w-full h-full ${settings.vfdEffect ? 'vfd-effect' : ''}`} style={getUiPalette(settings.uiPalette) as React.CSSProperties}>
      {settings.uiTheme === 'console' ? <ConsoleView /> : <PhosphorView />}
    </div>
  );
};

export default function App() {
  return (
    <RadarProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </RadarProvider>
  );
}
