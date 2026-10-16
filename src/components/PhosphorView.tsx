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
// PhosphorView.tsx — 'Phosphor' theme layout
//
// One of four interchangeable theme layouts wrapping the shared <Scope> canvas.
// Provides the Phosphor-style chrome (panels, readouts, styling) around the
// radar. Edit to restyle this theme; rendering logic stays in Scope.tsx.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: PhosphorView @ r3 (2026-10-16)
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useMemo } from 'react';
import { useRadar } from '../context/RadarContext';
import { Scope } from './Scope';
import { CmdPalette } from './CmdPalette';
import { SettingsPanel } from './SettingsPanel';
import { DataTable } from './DataTable';

export interface PhosphorViewProps {
  onBackToMenu?: () => void;
}

export const PhosphorView: React.FC<PhosphorViewProps> = ({ onBackToMenu }) => {
  const {
    settings,
    updateSettings,
    aircraftMap,
    selectedHex,
    selectAircraft,
    networkStatus,
    sessionStats,
    conflicts,
  } = useRadar();

  const [cmdOpen, setCmdOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tableViewOpen, setTableViewOpen] = useState(false);
  const [clock, setClock] = useState('');

  // Sync the global uiTheme setting so that child components (SettingsPanel,
  // CmdPalette, etc.) can read which layout is active and adapt their styling.
  useEffect(() => {
    updateSettings({ uiTheme: 'phosphor' });
  }, []);

  // UTC clock ticker — updates every second, displayed in the header as HH:MM:SSZ.
  // Uses ISO string slicing to avoid locale-dependent formatting.
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setClock(d.toISOString().slice(11, 19) + 'Z');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Global keyboard shortcut: Cmd/Ctrl+K toggles the command palette search overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const selectedAircraft = selectedHex ? aircraftMap[selectedHex] : null;
  const aircraftList = useMemo(() => Object.values(aircraftMap), [aircraftMap]);

  // Scan for any aircraft broadcasting an emergency transponder flag (squawk 7500/7600/7700).
  // If found, the emergency banner renders at the top of the viewport.
  const emergencyAircraft = aircraftList.find((ac) => ac.emg);

  return (
    <div className="relative w-full h-full bg-[rgb(var(--ui-bg,_2_7_5))] text-[rgb(var(--ui-text,_217_255_230))] font-mono overflow-hidden select-none">
      {/* Scope canvas — fills entire viewport as the base layer */}
      <Scope conflicts={conflicts} />


      {/* Emergency takeover banner */}
      {emergencyAircraft && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#ff3355] animate-pulse z-40">
          <div className="absolute top-1 left-4 px-2 py-1 bg-[#ff3355] text-white text-[10px] font-bold tracking-widest uppercase rounded-b shadow-lg border border-red-400">
            ⚠ SQK {emergencyAircraft.sqk || 'EMG'} • {emergencyAircraft.flight || emergencyAircraft.cs || emergencyAircraft.hex} • EMERGENCY ALERT
          </div>
        </div>
      )}

      {/* Top Header Controls */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-20">
        {/* Left Side: Clock and Menu */}
        <div className="flex gap-4 items-center">
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-widest">ADSB RADARSCOPE V2</span>
            <span className="text-[9px] text-[rgb(var(--ui-accent,_80_220_120))]/70 tracking-wider">{settings.stationName || 'PHOSPHOR-A'} • {clock}</span>
          </div>
          <div className="h-6 w-[1px] bg-[rgb(var(--ui-muted,_120_255_160))]/20" />
          <button
            onClick={() => setTableViewOpen(true)}
            className="px-2.5 py-1 text-[10px] border border-[rgb(var(--ui-muted,_120_255_160))]/30 hover:bg-[rgb(var(--ui-muted,_120_255_160))]/10 rounded cursor-pointer"
          >
            TABLE VIEW
          </button>
          {onBackToMenu && (
            <button
              onClick={onBackToMenu}
              className="px-2.5 py-1 text-[10px] border border-[rgb(var(--ui-muted,_120_255_160))]/30 hover:bg-[rgb(var(--ui-muted,_120_255_160))]/10 rounded cursor-pointer"
            >
              LAYOUTS
            </button>
          )}
        </div>

        {/* Right Side: Layer toggle buttons and search/settings shortcuts.
            Each toggle maps a 3-letter abbreviation to a boolean settings key,
            letting the user show/hide map overlays (vectors, trails, airspaces, etc.). */}
        <div className="flex gap-1.5 items-center">
          {[
            ['VCT', 'showVectors', 'Vectors'],
            ['TRL', 'showTrails', 'Trails'],
            ['ASP', 'showAirspaces', 'Airspaces'],
            ['APT', 'showAirports', 'Airports'],
            ['NAV', 'showNavaids', 'Navaids'],
            ['RWY', 'showRunways', 'Runways'],
            ['CNF', 'showConflicts', 'Conflicts'],
          ].map(([label, key, tooltip]) => {
            const val = !!settings[key as keyof typeof settings];
            return (
              <button
                key={key}
                onClick={() => updateSettings({ [key]: !val })}
                title={tooltip}
                className={`px-2 py-1 text-[10px] border rounded transition-all duration-150 cursor-pointer ${
                  val
                    ? 'bg-[rgb(var(--ui-muted,_120_255_160))]/20 text-[rgb(var(--ui-text,_217_255_230))] border-[rgb(var(--ui-muted,_120_255_160))]/55'
                    : 'bg-transparent text-[rgb(var(--ui-accent,_80_220_120))]/70 border-[rgb(var(--ui-muted,_120_255_160))]/20 hover:bg-[rgb(var(--ui-muted,_120_255_160))]/10'
                }`}
              >
                {label}
              </button>
            );
          })}
          <button
            onClick={() => setCmdOpen(true)}
            className="px-2.5 py-1 text-[10px] border border-[rgb(var(--ui-muted,_120_255_160))]/30 hover:bg-[rgb(var(--ui-muted,_120_255_160))]/10 rounded cursor-pointer flex gap-1 items-center ml-2"
          >
            <span>SEARCH</span>
            <kbd className="bg-[rgb(var(--ui-muted,_120_255_160))]/15 px-1 py-0.5 rounded text-[8px] font-sans">⌘K</kbd>
          </button>
          <button
            onClick={() => setSettingsOpen((prev) => !prev)}
            className={`px-2.5 py-1 text-[10px] border rounded cursor-pointer transition-all duration-150 ${
              settingsOpen
                ? 'bg-[rgb(var(--ui-muted,_120_255_160))]/20 border-[rgb(var(--ui-muted,_120_255_160))]/55 text-[rgb(var(--ui-text,_217_255_230))]'
                : 'border-[rgb(var(--ui-muted,_120_255_160))]/30 text-[rgb(var(--ui-accent,_80_220_120))]/75 hover:bg-[rgb(var(--ui-muted,_120_255_160))]/10'
            }`}
          >
            SET
          </button>
        </div>
      </div>

      {/* Selected Aircraft Telemetry Panel (Left side floating box) */}
      {selectedAircraft && (
        <div className="absolute top-[60px] left-4 w-72 bg-[rgb(var(--ui-bg,_4_14_8))]/92 border border-[rgb(var(--ui-muted,_120_255_160))]/32 p-4 shadow-xl z-20 flex flex-col rounded">
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="text-base font-bold tracking-widest">{selectedAircraft.flight || selectedAircraft.cs || selectedAircraft.hex}</div>
              <div className="text-[10px] text-[rgb(var(--ui-accent,_80_220_120))]/70 uppercase tracking-wider">
                Mode-S: {selectedAircraft.hex.toUpperCase()} • Type: {selectedAircraft.type || 'UNK'}
              </div>
            </div>
            <button
              onClick={() => selectAircraft(null)}
              className="text-sm cursor-pointer opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-[9px] text-[rgb(var(--ui-accent,_80_220_120))]/60 uppercase tracking-widest">Altitude</div>
              <div className="font-bold text-[rgb(var(--ui-text,_217_255_230))]">
                {selectedAircraft.alt.toLocaleString()} ft (FL{String(Math.round(selectedAircraft.alt / 100)).padStart(3, '0')})
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[rgb(var(--ui-accent,_80_220_120))]/60 uppercase tracking-widest">Speed</div>
              <div className="font-bold text-[rgb(var(--ui-text,_217_255_230))]">{Math.round(selectedAircraft.gs)} kt</div>
            </div>
            <div>
              <div className="text-[9px] text-[rgb(var(--ui-accent,_80_220_120))]/60 uppercase tracking-widest">Heading</div>
              <div className="font-bold text-[rgb(var(--ui-text,_217_255_230))]">{String(Math.round(selectedAircraft.trk)).padStart(3, '0')}°</div>
            </div>
            <div>
              <div className="text-[9px] text-[rgb(var(--ui-accent,_80_220_120))]/60 uppercase tracking-widest">Squawk</div>
              <div className="font-bold text-[rgb(var(--ui-text,_217_255_230))]">{selectedAircraft.sqk || 'None'}</div>
            </div>
            {selectedAircraft.op && (
              <div className="col-span-2">
                <div className="text-[9px] text-[rgb(var(--ui-accent,_80_220_120))]/60 uppercase tracking-widest">Airline Operator</div>
                <div className="font-bold text-[rgb(var(--ui-text,_217_255_230))] truncate">{selectedAircraft.op}</div>
              </div>
            )}
            <div className="col-span-2">
              <div className="text-[9px] text-[rgb(var(--ui-accent,_80_220_120))]/60 uppercase tracking-widest">Coordinates</div>
              <div className="font-bold text-[rgb(var(--ui-text,_217_255_230))] tracking-tight">
                {selectedAircraft.lat.toFixed(4)}°N, {selectedAircraft.lon.toFixed(4)}°W
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conflicts separation ticker */}
      {conflicts.length > 0 && settings.showConflicts && (
        <div className="absolute top-[60px] right-4 w-72 bg-[rgb(var(--ui-bg,_4_14_8))]/92 border border-yellow-500/50 border-l-4 border-l-yellow-500 p-4 shadow-xl z-20 flex flex-col rounded">
          <div className="text-yellow-500 text-[10px] font-bold tracking-widest uppercase mb-2">
            ⚠ Separation Warning
          </div>
          <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto">
            {conflicts.map((c, idx) => (
              <div key={idx} className="text-[11px] leading-relaxed text-[rgb(var(--ui-text,_217_255_230))]/90 border-b border-[rgb(var(--ui-muted,_120_255_160))]/10 pb-1.5 last:border-none">
                <span className="font-bold text-[rgb(var(--ui-text,_217_255_230))]">{c.a}</span> × <span className="font-bold text-[rgb(var(--ui-text,_217_255_230))]">{c.b}</span>
                <div className="text-[rgb(var(--ui-accent,_80_220_120))]/75 mt-0.5">
                  Separation: <span className="font-semibold text-yellow-500">{c.sepNm} NM</span> / {c.sepFt} ft • T-{c.eta}s
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Session Stats HUD Panel */}
      <div className="absolute bottom-4 left-4 z-20 flex gap-6 text-[10px] tracking-wider text-[rgb(var(--ui-accent,_80_220_120))]/80">
        <div>
          <span className="text-[rgb(var(--ui-text,_217_255_230))] font-bold">{aircraftList.length}</span> AC TRACKED
        </div>
        <div>
          RNG <span className="text-[rgb(var(--ui-text,_217_255_230))] font-bold">{settings.range}nm</span>
        </div>
        <div>
          MSG <span className="text-[rgb(var(--ui-text,_217_255_230))] font-bold">{sessionStats.messagesCount.toLocaleString()}</span>
        </div>
        <div className="flex gap-1.5 items-center">
          SRC <span className="w-1.5 h-1.5 bg-[rgb(var(--ui-muted,_120_255_160))] rounded-sm animate-pulse" />
          <span className="text-[rgb(var(--ui-muted,_120_255_160))] font-bold uppercase">{networkStatus}</span>
        </div>
      </div>

      {/* Bottom Right: Quick range presets — common NM zoom levels for fast switching */}
      <div className="absolute bottom-4 right-4 flex gap-1 z-20">
        {[15, 25, 40, 75, 150].map((r) => (
          <button
            key={r}
            onClick={() => updateSettings({ range: r })}
            className={`px-2 py-0.5 text-[9px] font-bold border rounded transition-all duration-150 cursor-pointer ${
              settings.range === r
                ? 'bg-[rgb(var(--ui-muted,_120_255_160))]/20 border-[rgb(var(--ui-muted,_120_255_160))]/55 text-[rgb(var(--ui-text,_217_255_230))]'
                : 'border-[rgb(var(--ui-muted,_120_255_160))]/20 text-[rgb(var(--ui-accent,_80_220_120))]/70 hover:bg-[rgb(var(--ui-muted,_120_255_160))]/10'
            }`}
          >
            {r}NM
          </button>
        ))}
      </div>

      {/* Floating Modals */}
      <CmdPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {tableViewOpen && <DataTable onClose={() => setTableViewOpen(false)} />}
    </div>
  );
};
