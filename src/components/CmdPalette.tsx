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
// CmdPalette.tsx — Cmd+K command / entity palette
//
// Spotlight-style overlay for finding aircraft or airports by callsign, squawk,
// ICAO hex, or airport code. Aircraft match in-memory; airports query the
// aviation worker (debounced). Receives an `open` prop — the keybinding lives in
// each *View component.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: CmdPalette @ r3 (2026-10-16)
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useRef } from 'react';
import { useRadar } from '../context/RadarContext';
import { aviationDb } from '../services/aviationDb';
import { Airport } from '../workers/aviation.worker';
import { Aircraft } from '../types';

export interface CmdPaletteProps {
  open: boolean;
  onClose: () => void;
}

export const CmdPalette: React.FC<CmdPaletteProps> = ({ open, onClose }) => {
  const { aircraftMap, selectAircraft, settings } = useRadar();
  const [query, setQuery] = useState('');
  const [matchingAirports, setMatchingAirports] = useState<Airport[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input when the palette opens, and reset all state
  // so the user starts with a clean slate each time. The 50ms delay ensures
  // the DOM element is mounted before we try to focus it.
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setMatchingAirports([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Global Escape key listener to dismiss the palette from anywhere
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Debounced airport search — waits 200ms after the user stops typing before
  // sending the query to the Web Worker. The cleanup function cancels pending
  // searches if the query changes again before the timeout fires, preventing
  // stale results from overwriting newer ones.
  useEffect(() => {
    if (!query.trim()) {
      setMatchingAirports([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        const results = await aviationDb.searchAirports(query);
        setMatchingAirports(results);
      } catch (err) {
        console.error('Failed to search airports in worker:', err);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  if (!open) return null;

  // Synchronous in-memory filter over live aircraft — matches callsign, squawk,
  // or ICAO hex against the query. Capped at 8 to keep the dropdown compact.
  const qLower = query.toLowerCase().trim();
  const matchingAircraft = Object.values(aircraftMap)
    .filter((ac) => {
      if (!qLower) return false;
      const flightCode = (ac.flight || ac.cs || '').toLowerCase();
      const squawk = (ac.sqk || ac.squawk || '');
      const hexCode = ac.hex.toLowerCase();
      return (
        flightCode.includes(qLower) ||
        squawk.includes(qLower) ||
        hexCode.includes(qLower)
      );
    })
    .slice(0, 8);

  // Combined count across both result groups for unified keyboard navigation
  const totalResults = matchingAircraft.length + matchingAirports.length;

  // Dispatch selection: aircraft items call selectAircraft, airport items
  // currently just log (map-center functionality is a future feature).
  const handleSelectItem = (index: number) => {
    if (index < matchingAircraft.length) {
      const ac = matchingAircraft[index];
      selectAircraft(ac.hex);
    } else {
      const apIndex = index - matchingAircraft.length;
      const ap = matchingAirports[apIndex];
      // Focus map coordinates on airport (implemented in outer views)
      console.log('Selected airport:', ap);
    }
    onClose();
  };

  // Arrow keys cycle through the unified result list (wraps around);
  // Enter confirms the currently highlighted item.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % totalResults);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + totalResults) % totalResults);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (totalResults > 0) {
        handleSelectItem(selectedIndex);
      }
    }
  };

  // Theme-adaptive styling — returns Tailwind class tokens matching the active
  // uiTheme so the palette visually integrates with the hosting view layout
  const getThemeStyles = () => {
    switch (settings.uiTheme) {
      case 'console':
        return {
          bg: 'bg-[rgb(var(--ui-surface,_15_22_32))] border-[rgb(var(--ui-accent,_100_160_210))]/40 text-[rgb(var(--ui-text,_230_238_247))]',
          input: 'bg-transparent text-[rgb(var(--ui-text,_230_238_247))] placeholder-[#aa5c00]/50 border-b border-[rgb(var(--ui-accent,_100_160_210))]/30',
          hoverBg: 'bg-[rgb(var(--ui-accent,_100_160_210))]/20',
          selectedBg: 'bg-[rgb(var(--ui-accent,_100_160_210))]/30',
          mutedText: 'text-[rgb(var(--ui-accent,_100_160_210))]/70',
          kbd: 'bg-[rgb(var(--ui-accent,_100_160_210))]/15 text-[rgb(var(--ui-accent,_100_160_210))]',
          font: 'font-mono',
        };
      case 'phosphor':
      default:
        return {
          bg: 'bg-[rgb(var(--ui-bg,_4_14_8))]/95 border-[rgb(var(--ui-muted,_120_255_160))]/30 text-[rgb(var(--ui-text,_217_255_230))]',
          input: 'bg-transparent text-[rgb(var(--ui-text,_217_255_230))] placeholder-[rgb(var(--ui-accent,_80_220_120))]/40 border-b border-[rgb(var(--ui-muted,_120_255_160))]/20',
          hoverBg: 'bg-[rgb(var(--ui-muted,_120_255_160))]/10',
          selectedBg: 'bg-[rgb(var(--ui-muted,_120_255_160))]/15',
          mutedText: 'text-[rgb(var(--ui-accent,_80_220_120))]/70',
          kbd: 'bg-[rgb(var(--ui-muted,_120_255_160))]/15 text-[rgb(var(--ui-text,_217_255_230))]',
          font: 'font-mono',
        };
    }
  };

  const theme = getThemeStyles();

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-start justify-center pt-[15%] transition-all duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-[480px] border shadow-2xl rounded overflow-hidden flex flex-col ${theme.bg} ${theme.font}`}
      >
        {/* Input area */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search callsign, squawk, airport code..."
            className={`w-full p-4 text-sm outline-none border-none ${theme.input}`}
          />
        </div>

        {/* Results body */}
        <div className="max-h-[320px] overflow-y-auto divide-y divide-current/10">
          {/* Aircraft section */}
          {matchingAircraft.length > 0 && (
            <div>
              <div className={`px-4 py-2 text-[10px] uppercase tracking-wider font-semibold ${theme.mutedText}`}>
                Aircraft
              </div>
              {matchingAircraft.map((ac, idx) => {
                const globalIndex = idx;
                const isSelected = globalIndex === selectedIndex;
                const altText = ac.alt ? `FL${String(Math.round(ac.alt / 100)).padStart(3, '0')}` : 'GND';

                return (
                  <div
                    key={ac.hex}
                    onClick={() => handleSelectItem(globalIndex)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={`px-4 py-2.5 text-xs flex justify-between items-center cursor-pointer transition-colors duration-150 ${
                      isSelected ? theme.selectedBg : 'hover:' + theme.hoverBg
                    }`}
                  >
                    <div className="font-semibold">{ac.flight || ac.cs || ac.hex}</div>
                    <div className={`text-[10px] ${theme.mutedText}`}>
                      {ac.hex.toUpperCase()} • {ac.type || 'UNK'} • {altText} • SQK {ac.sqk || 'None'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Airports section */}
          {matchingAirports.length > 0 && (
            <div>
              <div className={`px-4 py-2 text-[10px] uppercase tracking-wider font-semibold ${theme.mutedText}`}>
                Airports
              </div>
              {matchingAirports.map((ap, idx) => {
                const globalIndex = matchingAircraft.length + idx;
                const isSelected = globalIndex === selectedIndex;

                return (
                  <div
                    key={ap.icao}
                    onClick={() => handleSelectItem(globalIndex)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={`px-4 py-2.5 text-xs flex justify-between items-center cursor-pointer transition-colors duration-150 ${
                      isSelected ? theme.selectedBg : 'hover:' + theme.hoverBg
                    }`}
                  >
                    <div className="font-semibold">{ap.icao}</div>
                    <div className={`text-[10px] truncate max-w-[280px] ${theme.mutedText}`}>
                      {ap.name} • {ap.municipality || 'Unknown'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {totalResults === 0 && (
            <div className={`p-8 text-center text-xs ${theme.mutedText}`}>
              {query.trim() ? 'No matches found' : 'Type to search callsign, squawk, or ICAO code'}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className={`p-3 text-[10px] border-t border-current/10 flex justify-between items-center ${theme.mutedText}`}>
          <div className="flex gap-4">
            <span>
              <kbd className={`px-1.5 py-0.5 rounded text-[8px] ${theme.kbd}`}>↑↓</kbd> navigate
            </span>
            <span>
              <kbd className={`px-1.5 py-0.5 rounded text-[8px] ${theme.kbd}`}>↵</kbd> select
            </span>
            <span>
              <kbd className={`px-1.5 py-0.5 rounded text-[8px] ${theme.kbd}`}>esc</kbd> close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
