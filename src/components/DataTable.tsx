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
// DataTable.tsx — Sortable aircraft data table
//
// Spreadsheet-style overlay listing all tracked aircraft with search, per-column
// sort, emergency-squawk highlighting, and row-to-select. Edit to change the
// displayed columns or filtering behavior.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: DataTable @ r3 (2026-10-16)
// ---------------------------------------------------------------------------

import React, { useMemo, useState } from 'react';
import { useRadar } from '../context/RadarContext';
import { Aircraft } from '../types';

export interface DataTableProps {
  onClose: () => void;
}

/** Sortable column keys matching Aircraft field names or derived values */
type SortKey = 'cs' | 'type' | 'op' | 'alt' | 'gs' | 'trk' | 'sqk' | 'hex';
/** Sort direction: 1 = ascending, -1 = descending */
type SortDir = 1 | -1;

export const DataTable: React.FC<DataTableProps> = ({ onClose }) => {
  const { aircraftMap, settings, selectAircraft, selectedHex } = useRadar();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'alt', dir: -1 });

  // Flatten the aircraft record map into an array for filtering/sorting
  const aircraftList = useMemo(() => Object.values(aircraftMap), [aircraftMap]);

  // Filter aircraft by search query — matches against callsign, operator, or hex address.
  // Memoized so re-renders from sort changes or selection changes skip the filter pass.
  const qLower = q.toLowerCase().trim();
  const filteredList = useMemo(() => {
    return aircraftList.filter((ac) => {
      if (!qLower) return true;
      const csStr = (ac.flight || ac.cs || '').toLowerCase();
      const opStr = (ac.op || '').toLowerCase();
      const hexStr = ac.hex.toLowerCase();
      return csStr.includes(qLower) || opStr.includes(qLower) || hexStr.includes(qLower);
    });
  }, [aircraftList, qLower]);

  // Sort the filtered list by the active column key and direction.
  // String columns use lexicographic comparison; numeric columns (alt, gs, trk) use numeric.
  const sortedList = useMemo(() => {
    return [...filteredList].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      const k = sort.key;
      if (k === 'cs') {
        valA = a.flight || a.cs || '';
        valB = b.flight || b.cs || '';
      } else if (k === 'hex' || k === 'type' || k === 'op' || k === 'sqk') {
        valA = a[k] ?? ''; // FIX: use nullish coalescing to preserve falsy values like 0 in numeric sorts
        valB = b[k] ?? ''; // FIX: use nullish coalescing to preserve falsy values like 0 in numeric sorts
      } else if (k === 'alt' || k === 'gs' || k === 'trk') {
        valA = a[k] ?? 0; // FIX: use nullish coalescing to preserve falsy values like 0 in numeric sorts
        valB = b[k] ?? 0; // FIX: use nullish coalescing to preserve falsy values like 0 in numeric sorts
      }

      if (valA < valB) return -1 * sort.dir;
      if (valA > valB) return 1 * sort.dir;
      return 0;
    });
  }, [filteredList, sort.key, sort.dir]);

  // Toggle sort direction if clicking the same column, otherwise default to descending
  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      const isSameKey = prev.key === key;
      const nextDir = isSameKey ? (prev.dir === 1 ? -1 : 1) : -1;
      return { key, dir: nextDir };
    });
  };

  // Select the aircraft in RadarContext and dismiss the table overlay
  const handleRowClick = (hex: string) => {
    selectAircraft(hex);
    onClose();
  };

  // Returns Tailwind class maps for each theme variant, controlling background,
  // text, border, hover, and selection colors across the entire table chrome
  const getThemeStyles = () => {
    switch (settings.uiTheme) {
      case 'console':
        return {
          bg: 'bg-[rgb(var(--ui-surface,_10_14_20))] text-[rgb(var(--ui-text,_230_238_247))] font-mono',
          barBg: 'bg-[rgb(var(--ui-surface,_15_22_32))]/90 border-[rgb(var(--ui-accent,_100_160_210))]/40',
          input: 'bg-transparent text-[rgb(var(--ui-text,_230_238_247))] placeholder-[rgb(var(--ui-accent,_100_160_210))]/50 border border-[rgb(var(--ui-accent,_100_160_210))]/30 focus:border-[rgb(var(--ui-accent,_100_160_210))]/70',
          btn: 'border border-[rgb(var(--ui-accent,_100_160_210))]/30 hover:bg-[rgb(var(--ui-accent,_100_160_210))]/12 text-[rgb(var(--ui-accent,_100_160_210))]/85',
          th: 'border-b border-[rgb(var(--ui-accent,_100_160_210))]/30 text-[rgb(var(--ui-accent,_100_160_210))]/75 hover:bg-[rgb(var(--ui-accent,_100_160_210))]/5',
          td: 'border-b border-[rgb(var(--ui-accent,_100_160_210))]/10 text-[rgb(var(--ui-text,_230_238_247))]',
          tdMuted: 'text-[rgb(var(--ui-accent,_100_160_210))]/65',
          rowHover: 'hover:bg-[rgb(var(--ui-accent,_100_160_210))]/10',
          rowSelected: 'bg-[rgb(var(--ui-accent,_100_160_210))]/18 border-l-4 border-l-[rgb(var(--ui-accent,_100_160_210))]',
          emgText: 'text-[#ff4d5a]',
          headerBg: 'bg-[rgb(var(--ui-surface,_10_14_20))]',
        };
      case 'phosphor':
      default:
        return {
          bg: 'bg-[rgb(var(--ui-bg,_2_7_5))] text-[rgb(var(--ui-text,_217_255_230))] font-mono',
          barBg: 'bg-[rgb(var(--ui-bg,_4_14_8))]/92 border-[rgb(var(--ui-muted,_120_255_160))]/32',
          input: 'bg-transparent text-[rgb(var(--ui-text,_217_255_230))] placeholder-[rgb(var(--ui-accent,_80_220_120))]/40 border border-[rgb(var(--ui-muted,_120_255_160))]/20 focus:border-[rgb(var(--ui-muted,_120_255_160))]/55',
          btn: 'border border-[rgb(var(--ui-muted,_120_255_160))]/32 hover:bg-[rgb(var(--ui-muted,_120_255_160))]/15 text-[rgb(var(--ui-accent,_80_220_120))]',
          th: 'border-b border-[rgb(var(--ui-muted,_120_255_160))]/20 text-[rgb(var(--ui-accent,_80_220_120))]/70 hover:bg-[rgb(var(--ui-muted,_120_255_160))]/5',
          td: 'border-b border-[rgb(var(--ui-muted,_120_255_160))]/10 text-[rgb(var(--ui-text,_217_255_230))]',
          tdMuted: 'text-[rgb(var(--ui-accent,_80_220_120))]/65',
          rowHover: 'hover:bg-[rgb(var(--ui-muted,_120_255_160))]/10',
          rowSelected: 'bg-[rgb(var(--ui-muted,_120_255_160))]/15 border-l-4 border-l-[rgb(var(--ui-muted,_120_255_160))]',
          emgText: 'text-[#ff3355]',
          headerBg: 'bg-[rgb(var(--ui-bg,_2_7_5))]',
        };
    }
  };

  const theme = getThemeStyles();

  // Render a sortable column header cell with sort direction indicator arrow
  const renderHeader = (key: SortKey, label: string) => {
    const isSorted = sort.key === key;
    return (
      <th
        onClick={() => handleSort(key)}
        className={`px-4 py-3 text-left text-[10px] uppercase tracking-wider font-semibold cursor-pointer select-none transition-colors duration-150 ${theme.th}`}
      >
        <span className="flex items-center gap-1">
          {label}
          {isSorted && (sort.dir === 1 ? '↑' : '↓')}
        </span>
      </th>
    );
  };

  return (
    <div className={`absolute inset-0 flex flex-col overflow-hidden z-40 ${theme.bg}`}>
      {/* Search and Navigation Bar */}
      <div className={`p-4 border-b flex justify-between items-center ${theme.barBg}`}>
        <div className="flex gap-4 items-center flex-1">
          <span className="text-sm uppercase tracking-wider font-bold">Traffic Database</span>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter callsign, operator, or hex..."
            className={`px-3 py-1.5 text-xs outline-none rounded w-64 ${theme.input}`}
          />
          <span className="text-xs opacity-75">
            Showing {sortedList.length} of {aircraftList.length} aircraft
          </span>
        </div>
        <button
          onClick={onClose}
          className={`px-4 py-1.5 text-xs font-semibold rounded cursor-pointer transition-colors duration-150 ${theme.btn}`}
        >
          Back to Scope
        </button>
      </div>

      {/* Spreadsheet List */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className={`sticky top-0 z-10 ${theme.headerBg || 'bg-[rgb(var(--ui-bg,_2_7_5))]'}`}>
            <tr>
              {renderHeader('cs', 'Callsign')}
              {renderHeader('type', 'Type')}
              {renderHeader('op', 'Operator')}
              {renderHeader('alt', 'Altitude')}
              {renderHeader('gs', 'Speed (kt)')}
              {renderHeader('trk', 'Heading')}
              {renderHeader('sqk', 'Squawk')}
              {renderHeader('hex', 'Mode-S')}
            </tr>
          </thead>
          <tbody>
            {sortedList.map((ac) => {
              const isSelected = ac.hex === selectedHex;
              // Emergency flag is truthy for squawk codes like 7500/7600/7700
              const hasEmergency = !!ac.emg;
              const flightCode = ac.flight || ac.cs || ac.hex;
              // Format altitude as flight level (FL350 = 35,000 ft) or GND if on ground
              const altText = ac.alt ? `FL${String(Math.round(ac.alt / 100)).padStart(3, '0')}` : 'GND';

              return (
                <tr
                  key={ac.hex}
                  onClick={() => handleRowClick(ac.hex)}
                  className={`cursor-pointer transition-colors duration-100 ${
                    isSelected ? theme.rowSelected : theme.rowHover
                  }`}
                >
                  <td className={`px-4 py-3 text-xs font-semibold ${theme.td}`}>
                    <span className="flex items-center gap-1.5">
                      {flightCode}
                      {hasEmergency && <span className={`${theme.emgText} animate-pulse`}>⚠</span>}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-xs ${theme.td} ${theme.tdMuted}`}>{ac.type || '—'}</td>
                  <td className={`px-4 py-3 text-xs ${theme.td} ${theme.tdMuted}`}>{ac.op || '—'}</td>
                  <td className={`px-4 py-3 text-xs font-semibold ${theme.td}`}>
                    {ac.alt.toLocaleString()} ft ({altText})
                  </td>
                  <td className={`px-4 py-3 text-xs ${theme.td}`}>{Math.round(ac.gs)}</td>
                  <td className={`px-4 py-3 text-xs ${theme.td}`}>
                    {String(Math.round(ac.trk)).padStart(3, '0')}°
                  </td>
                  <td className={`px-4 py-3 text-xs ${theme.td}`}>
                    <span className={hasEmergency ? `${theme.emgText} font-bold` : ''}>
                      {ac.sqk || '—'}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-xs ${theme.td} ${theme.tdMuted}`}>{ac.hex.toUpperCase()}</td>
                </tr>
              );
            })}

            {sortedList.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-xs opacity-60">
                  No active traffic found matching criteria
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
