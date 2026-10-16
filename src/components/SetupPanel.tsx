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
// Compact first-run station and display configuration.

import React, { useState } from 'react';
import { useRadar } from '../context/RadarContext';
import { EXTRA_PALETTES } from '../palettes';
import { ScopeSettings } from '../types';

import { normalizeFeeder } from '../utils/feederUrl';

export const SetupPanel: React.FC = () => {
  const { settings, updateSettings } = useRadar();
  const [draft, setDraft] = useState<ScopeSettings>({ ...settings });
  const [lat, setLat] = useState(String(settings.homeLat));
  const [lon, setLon] = useState(String(settings.homeLon));
  const [feed, setFeed] = useState(settings.dataUrl);
  const [error, setError] = useState('');
  const set = <K extends keyof ScopeSettings>(key: K, value: ScopeSettings[K]) => setDraft(prev => ({ ...prev, [key]: value }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const latitude = Number(lat.trim());
      const longitude = Number(lon.trim());
      if (!lat.trim() || !Number.isFinite(latitude) || Math.abs(latitude) > 90) throw new Error('Latitude must be between -90 and 90.');
      if (!lon.trim() || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error('Longitude must be between -180 and 180.');
      const dataUrl = normalizeFeeder(feed);
      updateSettings({ ...draft, stationName: draft.stationName?.trim(), homeLat: latitude, homeLon: longitude, dataUrl, setupCompleted: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check the station details.');
    }
  };
  const toggles: Array<[string, 'fillViewport' | 'keepScopeInView' | 'compactSettings' | 'crtEffect' | 'vfdEffect']> = [
    ['Fill radar viewport', 'fillViewport'], ['Keep compass in view', 'keepScopeInView'],
    ['Compact settings', 'compactSettings'], ['CRT simulation', 'crtEffect'], ['VFD text', 'vfdEffect'],
  ];
  return (
    <main className="setup-screen">
      <form className="setup-card" onSubmit={submit}>
        <header><span className="setup-eyebrow">ADSB RADARSCOPE / STATION SETUP</span><h1>Make this scope yours</h1><p>Set your station and display. Everything can be changed in Settings.</p></header>
        <div className="setup-fields">
          <label className="setup-wide">Station name<input autoFocus maxLength={48} placeholder="Home radar" value={draft.stationName || ''} onChange={e => set('stationName', e.target.value)} /></label>
          <label>Latitude<input required type="number" step="any" min="-90" max="90" value={lat} onChange={e => setLat(e.target.value)} /></label>
          <label>Longitude<input required type="number" step="any" min="-180" max="180" value={lon} onChange={e => setLon(e.target.value)} /></label>
          <label className="setup-wide">Feeder IP / hostname / JSON URL<input required value={feed} onChange={e => setFeed(e.target.value)} placeholder="192.168.1.100 or http://receiver/data/aircraft.json" /><small>A bare IP uses /tar1090/data/aircraft.json. Enter a full URL for another path.</small></label>
          <label>Layout<select value={draft.uiTheme} onChange={e => set('uiTheme',e.target.value)}><option value="phosphor">Retro CRT</option><option value="console">ATC Ops Console</option></select></label>
          <label>Sweep<select value={draft.sweepStyle} onChange={e => set('sweepStyle', e.target.value as ScopeSettings['sweepStyle'])}><option value="rotate">Rotate</option><option value="pulse">Pulse</option><option value="none">None</option></select></label>
          <label>Starting palette<select value={draft.scopeTheme} onChange={e => { set('scopeTheme',e.target.value); set('uiPalette', EXTRA_PALETTES.some(p => p.value === e.target.value) ? e.target.value as ScopeSettings['uiPalette'] : 'layout'); set('airspaceColorScheme','theme'); }}><option value="phosphor">Phosphor Green</option><option value="console">Console Cyan</option>{!['phosphor','console',...EXTRA_PALETTES.map(p=>p.value)].includes(draft.scopeTheme) && <option value={draft.scopeTheme}>Current palette</option>}{EXTRA_PALETTES.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
          <label>Range (nautical miles)<input required type="number" min="1" max="1000" value={draft.range} onChange={e => set('range', Number(e.target.value))} /></label>
        </div>
        <div className="setup-toggles">{toggles.map(([label,key]) => <label key={key}><input type="checkbox" checked={!!draft[key]} onChange={e => set(key,e.target.checked)} />{label}</label>)}</div>
        {error && <p role="alert" className="setup-error">{error}</p>}
        <footer><button type="button" onClick={() => updateSettings({ setupCompleted: true })}>Use current settings</button><button type="submit" className="setup-primary">Save & open radar</button></footer>
      </form>
    </main>
  );
};
