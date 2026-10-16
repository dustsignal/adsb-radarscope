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
// ConsoleView.tsx — 'Console' theme layout
//
// One of four interchangeable theme layouts wrapping the shared <Scope> canvas.
// Provides the Console-style chrome (panels, readouts, styling) around the radar.
// Edit to restyle this theme; rendering logic stays in Scope.tsx.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: ConsoleView @ r3 (2026-10-16)
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useMemo } from 'react';
import { useRadar } from '../context/RadarContext';
import { Scope } from './Scope';
import { CmdPalette } from './CmdPalette';
import { SettingsPanel } from './SettingsPanel';
import { DataTable } from './DataTable';

export interface ConsoleViewProps {
  onBackToMenu?: () => void;
}

export const ConsoleView: React.FC<ConsoleViewProps> = ({ onBackToMenu }) => {
  const {
    settings,
    updateSettings,
    aircraftMap,
    selectedHex,
    selectAircraft,
    networkStatus,
    conflicts,
  } = useRadar();

  const [cmdOpen, setCmdOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tableViewOpen, setTableViewOpen] = useState(false);
  const [clock, setClock] = useState('');

  // Sync the global uiTheme so child components adapt their styling to console palette
  useEffect(() => {
    updateSettings({ uiTheme: 'console' });
  }, []);

  // UTC clock ticker — updates every second, displayed in the top rail header
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setClock(d.toISOString().slice(11, 19) + 'Z');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Global keyboard shortcut: Cmd/Ctrl+K toggles command palette
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

  // Sort aircraft by altitude descending so highest-altitude traffic appears first
  // in the sidebar strip list. Memoized on aircraftMap to avoid re-sorting on
  // every render (only recalculates when the map reference changes).
  const sortedAircraftList = useMemo(() => {
    return [...aircraftList].sort((a, b) => b.alt - a.alt);
  }, [aircraftMap]);

  // Scan for any aircraft broadcasting an emergency transponder flag
  const emergencyAircraft = aircraftList.find((ac) => ac.emg);

  return (
    <div className="absolute inset-0 flex flex-col bg-[rgb(var(--ui-surface,_10_14_20))] text-[rgb(var(--ui-text,_230_238_247))] font-mono overflow-hidden select-none">
      {/* Top rail */}
      <div className="h-11 flex-shrink-0 border-b border-[rgb(var(--ui-accent,_100_160_210))]/40 flex items-center px-4 gap-5 bg-[rgb(var(--ui-surface,_10_14_20))]/90 z-20">
        <div className="flex items-baseline gap-2.5">
          <span className="text-sm font-semibold tracking-wider text-[rgb(var(--ui-text,_230_238_247))]">ADSB RADARSCOPE V2</span>
          <span className="text-[9px] text-[rgb(var(--ui-accent,_100_160_210))]/70 tracking-widest uppercase">{settings.stationName || 'OPS CONSOLE'}</span>
        </div>
        <div className="w-[1px] h-4 bg-[rgb(var(--ui-accent,_100_160_210))]/30" />

        <div className="flex gap-2">
          <button
            onClick={() => setTableViewOpen(true)}
            className="px-2 py-0.5 text-[10px] border border-[rgb(var(--ui-accent,_100_160_210))]/30 hover:bg-[rgb(var(--ui-accent,_100_160_210))]/10 rounded cursor-pointer"
          >
            TABLE VIEW
          </button>
          {onBackToMenu && (
            <button
              onClick={onBackToMenu}
              className="px-2 py-0.5 text-[10px] border border-[rgb(var(--ui-accent,_100_160_210))]/30 hover:bg-[rgb(var(--ui-accent,_100_160_210))]/10 rounded cursor-pointer"
            >
              LAYOUTS
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* Console Stats bar */}
        <div className="flex gap-4 text-[10px] text-[rgb(var(--ui-accent,_100_160_210))]/80 font-semibold tracking-wider">
          <div>{clock}</div>
          <div>
            RNG <span className="text-[rgb(var(--ui-text,_230_238_247))]">{settings.range}nm</span>
          </div>
          <div>
            AC <span className="text-[rgb(var(--ui-text,_230_238_247))]">{aircraftList.length}</span>
          </div>
          <div className="flex gap-1.5 items-center">
            <span className="w-1.5 h-1.5 bg-[rgb(var(--ui-muted,_138_215_255))] rounded-sm animate-pulse" />
            <span className="text-[rgb(var(--ui-muted,_138_215_255))] uppercase">{networkStatus}</span>
          </div>
        </div>

        <div className="w-[1px] h-4 bg-[rgb(var(--ui-accent,_100_160_210))]/30" />

        {/* Shortcuts */}
        <button
          onClick={() => setCmdOpen(true)}
          className="px-2.5 py-1 text-[10px] border border-[rgb(var(--ui-accent,_100_160_210))]/40 bg-transparent text-[rgb(var(--ui-accent,_100_160_210))] hover:bg-[rgb(var(--ui-accent,_100_160_210))]/10 rounded cursor-pointer flex gap-1 items-center"
        >
          <span>SEARCH</span>
          <kbd className="bg-[rgb(var(--ui-accent,_100_160_210))]/20 px-1 py-0.5 rounded text-[8px]">⌘K</kbd>
        </button>
        <button
          onClick={() => setSettingsOpen((prev) => !prev)}
          className={`px-2.5 py-1 text-[10px] border rounded cursor-pointer transition-all duration-150 ${
            settingsOpen
              ? 'bg-[rgb(var(--ui-accent,_100_160_210))]/22 border-[rgb(var(--ui-accent,_100_160_210))]/60 text-[rgb(var(--ui-text,_230_238_247))]'
              : 'border-[rgb(var(--ui-accent,_100_160_210))]/40 text-[rgb(var(--ui-accent,_100_160_210))] hover:bg-[rgb(var(--ui-accent,_100_160_210))]/10'
          }`}
        >
          SETTINGS
        </button>
      </div>

      {/* Main split viewport */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left: Scope display */}
        <div className="flex-1 relative min-w-0">
          <Scope conflicts={conflicts} />

          {/* Emergency overlay takeover */}
          {emergencyAircraft && (
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#ff4d5a] animate-pulse z-20">
              <div className="absolute top-1 left-4 px-2 py-0.5 bg-[#ff4d5a] text-white text-[9px] font-bold tracking-widest uppercase">
                ⚠ SQK {emergencyAircraft.sqk} • {emergencyAircraft.flight || emergencyAircraft.cs || emergencyAircraft.hex} • EMERGENCY
              </div>
            </div>
          )}

          {/* Floating layer switches bottom-left */}
          <div className="absolute bottom-3 left-3 flex gap-1 p-1 bg-[rgb(var(--ui-surface,_10_14_20))]/90 border border-[rgb(var(--ui-accent,_100_160_210))]/30 rounded z-20">
            {[
              ['VCT', 'showVectors'],
              ['TRL', 'showTrails'],
              ['ASP', 'showAirspaces'],
              ['APT', 'showAirports'],
              ['NAV', 'showNavaids'],
              ['RWY', 'showRunways'],
              ['CNF', 'showConflicts'],
            ].map(([lbl, key]) => {
              const val = !!settings[key as keyof typeof settings];
              return (
                <button
                  key={key}
                  onClick={() => updateSettings({ [key]: !val })}
                  className={`px-2 py-0.5 text-[9px] border-none font-semibold cursor-pointer rounded transition-colors duration-150 ${
                    val
                      ? 'bg-[rgb(var(--ui-accent,_100_160_210))]/22 text-[rgb(var(--ui-text,_230_238_247))]'
                      : 'bg-transparent text-[rgb(var(--ui-accent,_100_160_210))]/70 hover:bg-[rgb(var(--ui-accent,_100_160_210))]/10'
                  }`}
                >
                  {lbl}
                </button>
              );
            })}
          </div>

          {/* Zoom index bottom-right */}
          <div className="absolute bottom-3 right-3 flex p-1 bg-[rgb(var(--ui-surface,_10_14_20))]/90 border border-[rgb(var(--ui-accent,_100_160_210))]/30 rounded z-20 items-center">
            {[15, 25, 40, 75, 150].map((r) => (
              <button
                key={r}
                onClick={() => updateSettings({ range: r })}
                className={`px-2 py-0.5 text-[9px] border-none font-semibold cursor-pointer rounded transition-colors duration-150 ${
                  settings.range === r
                    ? 'bg-[rgb(var(--ui-accent,_100_160_210))]/22 text-[rgb(var(--ui-text,_230_238_247))]'
                    : 'bg-transparent text-[rgb(var(--ui-accent,_100_160_210))]/70 hover:bg-[rgb(var(--ui-accent,_100_160_210))]/10'
                }`}
              >
                {r}
              </button>
            ))}
            <div className="px-2 py-0.5 text-[9px] text-[rgb(var(--ui-accent,_100_160_210))]/75 border-l border-[rgb(var(--ui-accent,_100_160_210))]/30 ml-1 font-bold">
              NM
            </div>
          </div>
        </div>

        {/* Right Sidebar: Active flight telemetry pane */}
        <div className="w-80 flex-shrink-0 border-l border-[rgb(var(--ui-accent,_100_160_210))]/40 bg-[rgb(var(--ui-surface,_10_14_20))]/90 flex flex-col min-h-0 z-20">
          <div className="px-3 py-2 border-b border-[rgb(var(--ui-accent,_100_160_210))]/40 flex justify-between items-center text-[10px] text-[rgb(var(--ui-accent,_100_160_210))]/85 tracking-widest font-semibold uppercase">
            <span>Active Traffic</span>
            <span>{aircraftList.length}</span>
          </div>

          {/* Sidebar conflicts warnings */}
          {conflicts.length > 0 && settings.showConflicts && (
            <div className="p-3 bg-[#ffb84d]/10 border-b border-[#ffb84d]/30 flex flex-col gap-1.5 flex-shrink-0">
              <div className="text-[9px] font-bold tracking-widest text-[#ffb84d] uppercase">
                ⚠ Separation Alerts ({conflicts.length})
              </div>
              {conflicts.slice(0, 3).map((c, idx) => (
                <div key={idx} className="text-[10px] text-[rgb(var(--ui-text,_230_238_247))] leading-relaxed">
                  <b>{c.a}</b> × <b>{c.b}</b>
                  <div className="text-[rgb(var(--ui-accent,_100_160_210))]/70">
                    {c.sepNm}nm / {c.sepFt}ft • ETA: {c.eta}s
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Scrollable aircraft strip list — each row shows callsign, type, squawk,
              altitude (as flight level), ground speed, and track heading. A colored
              left border indicates status: red = emergency, amber = in conflict. */}
          <div className="flex-1 overflow-y-auto divide-y divide-[rgb(var(--ui-accent,_100_160_210))]/10 min-h-0">
            {sortedAircraftList.map((ac) => {
              const isSelected = ac.hex === selectedHex;
              const hasEmergency = !!ac.emg;

              // FIX: use aircraft hex for conflict matching instead of callsign which can be null or ambiguous
              // ConflictDetector sets c.a/c.b to (flight || cs || hex), so we must match against all three
              // PERF TODO: O(n*m) conflict matching per render; consider pre-building Set<hex> from conflicts for O(1) lookup
              const acIdent = ac.flight || ac.cs || ac.hex;
              const inConflict = conflicts.some(
                (c) => c.a === acIdent || c.b === acIdent || c.a === ac.hex || c.b === ac.hex
              );

              // Priority coloring: emergency (red) > conflict (amber) > normal (transparent)
              let statusBorder = 'border-l-4 border-l-transparent';
              if (hasEmergency) statusBorder = 'border-l-4 border-l-[#ff4d5a]';
              else if (inConflict) statusBorder = 'border-l-4 border-l-[#ffb84d]';

              return (
                <div
                  key={ac.hex}
                  onClick={() => selectAircraft(isSelected ? null : ac.hex)}
                  className={`p-3 cursor-pointer flex justify-between items-center transition-colors duration-150 ${statusBorder} ${
                    isSelected ? 'bg-[rgb(var(--ui-accent,_100_160_210))]/22' : 'hover:bg-[rgb(var(--ui-accent,_100_160_210))]/10'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-bold tracking-wide text-[rgb(var(--ui-text,_230_238_247))]">
                      {ac.flight || ac.cs || ac.hex}
                    </span>
                    <span className="text-[9px] text-[rgb(var(--ui-accent,_100_160_210))]/70 uppercase">
                      {ac.type || 'UNK'} • SQK {ac.sqk || 'None'}
                    </span>
                  </div>

                  <div className="text-right">
                    <div className="text-xs font-semibold text-[rgb(var(--ui-text,_230_238_247))]">
                      FL{String(Math.round(ac.alt / 100)).padStart(3, '0')}
                    </div>
                    <div className="text-[9px] text-[rgb(var(--ui-accent,_100_160_210))]/70">
                      {Math.round(ac.gs)}kt • {String(Math.round(ac.trk)).padStart(3, '0')}°
                    </div>
                  </div>
                </div>
              );
            })}

            {sortedAircraftList.length === 0 && (
              <div className="p-8 text-center text-xs text-[rgb(var(--ui-accent,_100_160_210))]/60 font-semibold italic">
                Scanning radar feed...
              </div>
            )}
          </div>

          {/* Detail telemetry container */}
          {selectedAircraft && (
            <div className="border-t border-[rgb(var(--ui-accent,_100_160_210))]/40 p-4 bg-[rgb(var(--ui-surface,_15_22_32))]/80 flex-shrink-0">
              <div className="flex justify-between items-baseline mb-3">
                <div className="flex flex-col">
                  <span className="text-lg font-bold tracking-widest text-[rgb(var(--ui-text,_230_238_247))]">
                    {selectedAircraft.flight || selectedAircraft.cs || selectedAircraft.hex}
                  </span>
                  <span className="text-[9px] text-[rgb(var(--ui-accent,_100_160_210))]/70 uppercase font-semibold">
                    ICAO: {selectedAircraft.hex.toUpperCase()} • TYPE: {selectedAircraft.type || 'UNK'}
                  </span>
                </div>
                <button
                  onClick={() => selectAircraft(null)}
                  className="text-base cursor-pointer opacity-70 hover:opacity-100"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                <DetailCell label="Altitude" value={`${selectedAircraft.alt.toLocaleString()} ft (FL${String(Math.round(selectedAircraft.alt / 100)).padStart(3, '0')})`} />
                <DetailCell label="Ground Spd" value={`${Math.round(selectedAircraft.gs)} kt`} />
                <DetailCell label="Track" value={`${String(Math.round(selectedAircraft.trk)).padStart(3, '0')}°`} />
                <DetailCell label="Squawk" value={selectedAircraft.sqk || 'None'} />
                <DetailCell label="Operator" value={selectedAircraft.op || '—'} isFull />
                <DetailCell
                  label="Coordinates"
                  value={`${selectedAircraft.lat.toFixed(4)}°N, ${selectedAircraft.lon.toFixed(4)}°W`}
                  isFull
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating panels */}
      <CmdPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {tableViewOpen && <DataTable onClose={() => setTableViewOpen(false)} />}
    </div>
  );
};

/**
 * DetailCell — small helper component for the selected aircraft telemetry panel.
 * Renders a label/value pair in a grid cell. When isFull is true, the cell spans
 * both columns (used for long values like coordinates or operator name).
 */
interface DetailCellProps {
  label: string;
  value: string;
  isFull?: boolean;
}

const DetailCell: React.FC<DetailCellProps> = ({ label, value, isFull }) => {
  return (
    <div className={isFull ? 'col-span-2' : ''}>
      <div className="text-[9px] text-[rgb(var(--ui-accent,_100_160_210))]/60 uppercase tracking-wider font-semibold mb-0.5">
        {label}
      </div>
      <div className="text-xs font-bold text-[rgb(var(--ui-text,_230_238_247))] truncate">{value}</div>
    </div>
  );
};
