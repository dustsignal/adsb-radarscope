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
// SettingsPanel.tsx — Runtime settings UI
//
// Accessible modal settings surface for display, tuning, connection, and theme
// controls. Settings persist to localStorage through RadarContext.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: SettingsPanel @ r6 (2026-10-16)
// ---------------------------------------------------------------------------

import React, { useEffect, useId, useRef, useState } from 'react';
import { SoundManager } from '../audio/SoundManager';
import { getDefaultSettings, useRadar } from '../context/RadarContext';
import { ScopeSettings } from '../types';
import { THEMES } from './Scope';
import { EXTRA_PALETTES } from '../palettes';

export interface SettingsPanelProps {
  onClose?: () => void;
}

type SettingsTab = 'visuals' | 'tuning' | 'system' | 'themes';
type BooleanSettingKey = {
  [K in keyof ScopeSettings]-?: ScopeSettings[K] extends boolean | undefined ? K : never;
}[keyof ScopeSettings];
type NumericSettingKey = {
  [K in keyof ScopeSettings]-?: ScopeSettings[K] extends number | undefined ? K : never;
}[keyof ScopeSettings];
type AirspaceColorScheme = NonNullable<ScopeSettings['airspaceColorScheme']>;

const SETTINGS_TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: 'visuals', label: 'Display' },
  { key: 'tuning', label: 'Tuning' },
  { key: 'system', label: 'System' },
  { key: 'themes', label: 'Themes' },
];

const SCOPE_THEME_OPTIONS = [
  { label: 'Phosphor Green', value: 'phosphor', description: 'Classic green CRT radar' },
  { label: 'Console Cyan', value: 'console', description: 'Cool modern ATC display' },
  { label: 'Amber CRT', value: 'amber-crt', description: 'Warm amber terminal glow' },
  { label: 'Arctic Blue', value: 'arctic-blue', description: 'High-clarity ice blue' },
  { label: 'Cyberpunk', value: 'cyberpunk', description: 'Magenta and electric cyan' },
  { label: 'Parchment Map', value: 'parchment', description: 'Daylight paper chart' },
  { label: 'Deep Ocean', value: 'deep-ocean', description: 'Navy with aqua targets' },
  { label: 'Crimson Alert', value: 'crimson-alert', description: 'Red low-light operations' },
  { label: 'Night Vision', value: 'night-vision', description: 'Minimal tactical green' },
  { label: 'Aurora', value: 'aurora-borealis', description: 'Teal, green, and rose' },
  { label: 'Daylight', value: 'daylight', description: 'Bright outdoor contrast' },
  { label: 'Navy Strike', value: 'navy-strike', description: 'Naval blue and signal gold' },
  ...EXTRA_PALETTES,
] as const;

const AIRSPACE_THEME_OPTIONS: Array<{ label: string; value: AirspaceColorScheme }> = [
  { label: 'Radar Theme', value: 'theme' },
  { label: 'FAA Sectional', value: 'classic' },
  { label: 'Neon', value: 'neon' },
  { label: 'Monochrome', value: 'monochrome' },
  { label: 'High Contrast', value: 'high-contrast' },
  { label: 'Pastel Chart', value: 'pastel' },
  ...EXTRA_PALETTES,
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const { settings, updateSettings, networkStatus, sessionStats, clearAircraft } = useRadar();
  const [activeTab, setActiveTab] = useState<SettingsTab>('visuals');
  const [homeLat, setHomeLat] = useState(String(settings.homeLat));
  const [homeLon, setHomeLon] = useState(String(settings.homeLon));
  const [wsUrl, setWsUrl] = useState(settings.wsUrl || '');
  const [wsEnabled, setWsEnabled] = useState(!!settings.wsEnabled);
  const [dataUrl, setDataUrl] = useState(settings.dataUrl || '');
  const [fetchIntervalMs, setFetchIntervalMs] = useState(String(settings.fetchIntervalMs));
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeHandlerRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    closeHandlerRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeHandlerRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (document.activeElement === dialogRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    setHomeLat(String(settings.homeLat));
    setHomeLon(String(settings.homeLon));
    setWsUrl(settings.wsUrl || '');
    setWsEnabled(!!settings.wsEnabled);
    setDataUrl(settings.dataUrl || '');
    setFetchIntervalMs(String(settings.fetchIntervalMs));
  }, [
    settings.homeLat,
    settings.homeLon,
    settings.wsUrl,
    settings.wsEnabled,
    settings.dataUrl,
    settings.fetchIntervalMs,
  ]);

  const setSetting = <K extends keyof ScopeSettings>(key: K, value: ScopeSettings[K]) => {
    updateSettings({ [key]: value });
  };

  const handleSaveSystemSettings = () => {
    const lat = parseFloat(homeLat);
    const lon = parseFloat(homeLon);
    const interval = parseInt(fetchIntervalMs, 10);

    if (Number.isNaN(lat) || Math.abs(lat) > 90) {
      alert('Invalid Latitude (must be between -90 and 90)');
      return;
    }
    if (Number.isNaN(lon) || Math.abs(lon) > 180) {
      alert('Invalid Longitude (must be between -180 and 180)');
      return;
    }
    if (Number.isNaN(interval) || interval < 100 || interval > 60000) {
      alert('Invalid Polling Interval (must be between 100ms and 60000ms)');
      return;
    }

    updateSettings({
      homeLat: lat,
      homeLon: lon,
      wsUrl: wsUrl.trim(),
      wsEnabled,
      dataUrl: dataUrl.trim(),
      fetchIntervalMs: interval,
    });
  };

  const handleResetDefaults = () => {
    if (confirm('Reset all settings to default values?')) {
      updateSettings({
        ...getDefaultSettings(),
        uiTheme: settings.uiTheme,
      });
    }
  };

  const theme = settings.uiTheme === 'console'
    ? {
        bg: 'bg-[rgb(var(--ui-surface,_11_17_25))] border-[rgb(var(--ui-muted,_130_185_230))]/60 text-[rgb(var(--ui-text,_245_249_253))]',
        surface: 'bg-[rgb(var(--ui-surface,_17_28_40))] border-[rgb(var(--ui-muted,_130_185_230))]/30',
        inset: 'bg-[rgb(var(--ui-surface,_10_18_27))] border-[rgb(var(--ui-muted,_130_185_230))]/25',
        tabActive: 'bg-[rgb(var(--ui-raised,_23_43_61))] border-[rgb(var(--ui-muted,_138_215_255))] text-white shadow-sm',
        tabInactive: 'border-transparent text-[rgb(var(--ui-muted,_183_206_226))] hover:bg-[rgb(var(--ui-raised,_19_34_48))] hover:text-white',
        buttonActive: 'bg-[rgb(var(--ui-raised,_28_64_88))] text-white border-[rgb(var(--ui-muted,_138_215_255))]',
        buttonInactive: 'bg-[rgb(var(--ui-surface,_13_23_33))] text-[rgb(var(--ui-muted,_196_216_233))] border-[rgb(var(--ui-accent,_99_138_170))]/55 hover:bg-[rgb(var(--ui-raised,_22_40_56))] hover:text-white',
        border: 'border-[rgb(var(--ui-muted,_130_185_230))]/30',
        label: 'text-[rgb(var(--ui-muted,_168_217_255))]',
        muted: 'text-[rgb(var(--ui-muted,_183_206_226))]',
        input: 'bg-[rgb(var(--ui-bg,_7_12_18))] border-[rgb(var(--ui-accent,_113_152_184))]/70 text-white placeholder:text-[rgb(var(--ui-accent,_128_151_170))] focus:border-[rgb(var(--ui-muted,_138_215_255))]',
        toggleBgActive: 'bg-[rgb(var(--ui-accent,_35_117_155))] border-[rgb(var(--ui-muted,_138_215_255))]',
        toggleKnobActive: 'bg-white',
        toggleKnobInactive: 'bg-[rgb(var(--ui-accent,_142_171_194))]',
        actionBtn: 'bg-[rgb(var(--ui-raised,_29_82_110))] hover:bg-[rgb(var(--ui-accent,_39_107_142))] text-white border-[rgb(var(--ui-muted,_138_215_255))]/70',
        actionBtnDanger: 'bg-[#251216] border-red-400/65 hover:bg-[#3a181e] text-red-200',
        focus: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ui-muted,_138_215_255))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--ui-surface,_11_17_25))]',
      }
    : {
        bg: 'bg-[rgb(var(--ui-bg,_3_10_6))] border-[rgb(var(--ui-muted,_120_255_160))]/55 text-[rgb(var(--ui-text,_239_255_243))]',
        surface: 'bg-[rgb(var(--ui-surface,_8_22_14))] border-[rgb(var(--ui-muted,_120_255_160))]/28',
        inset: 'bg-[rgb(var(--ui-bg,_4_13_8))] border-[rgb(var(--ui-muted,_120_255_160))]/22',
        tabActive: 'bg-[rgb(var(--ui-surface,_13_39_23))] border-[rgb(var(--ui-muted,_120_255_160))] text-white shadow-sm',
        tabInactive: 'border-transparent text-[rgb(var(--ui-muted,_169_221_183))] hover:bg-[rgb(var(--ui-surface,_11_29_18))] hover:text-white',
        buttonActive: 'bg-[rgb(var(--ui-raised,_18_76_40))] text-white border-[rgb(var(--ui-muted,_120_255_160))]',
        buttonInactive: 'bg-[rgb(var(--ui-bg,_6_16_9))] text-[rgb(var(--ui-muted,_188_232_200))] border-[rgb(var(--ui-accent,_85_185_112))]/55 hover:bg-[rgb(var(--ui-surface,_13_33_20))] hover:text-white',
        border: 'border-[rgb(var(--ui-muted,_120_255_160))]/28',
        label: 'text-[rgb(var(--ui-muted,_143_255_174))]',
        muted: 'text-[rgb(var(--ui-muted,_169_221_183))]',
        input: 'bg-[rgb(var(--ui-bg,_1_5_3))] border-[rgb(var(--ui-accent,_85_185_112))]/65 text-white placeholder:text-[rgb(var(--ui-accent,_115_149_124))] focus:border-[rgb(var(--ui-muted,_120_255_160))]',
        toggleBgActive: 'bg-[rgb(var(--ui-raised,_25_122_59))] border-[rgb(var(--ui-muted,_120_255_160))]',
        toggleKnobActive: 'bg-white',
        toggleKnobInactive: 'bg-[rgb(var(--ui-accent,_131_179_143))]',
        actionBtn: 'bg-[rgb(var(--ui-raised,_20_95_49))] hover:bg-[rgb(var(--ui-accent,_26_122_62))] text-white border-[rgb(var(--ui-muted,_120_255_160))]/65',
        actionBtnDanger: 'bg-[#240b11] border-[#ff6b83]/60 hover:bg-[#3b101a] text-[#ff9aad]',
        focus: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ui-muted,_120_255_160))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--ui-bg,_3_10_6))]',
      };

  const sectionClass = `rounded-sm border p-3 md:p-4 ${theme.surface}`;
  const controlMotion = 'transition-colors duration-150 active:scale-[0.98] motion-reduce:transform-none';

  const renderSectionHeading = (title: string, description?: string) => (
    <div className="settings-section-heading mb-3">
      <h3 className={`text-xs font-bold uppercase tracking-[0.12em] ${theme.label}`}>{title}</h3>
      {description && <p className={`settings-description mt-1 text-xs leading-4 text-pretty ${theme.muted}`}>{description}</p>}
    </div>
  );

  const renderSelector = <K extends keyof ScopeSettings>(
    label: string,
    key: K,
    options: Array<{ label: string; value: ScopeSettings[K] }>,
  ) => {
    const labelId = `settings-${String(key)}-label`;
    return (
      <fieldset className="mb-4 last:mb-0" aria-labelledby={labelId}>
        <legend id={labelId} className={`mb-2 text-[11px] font-bold uppercase tracking-[0.12em] ${theme.label}`}>
          {label}
        </legend>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const isActive = settings[key] === option.value;
            return (
              <button
                key={String(option.value)}
                type="button"
                aria-pressed={isActive}
                onClick={() => setSetting(key, option.value)}
                className={`min-h-9 rounded-sm border px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${controlMotion} ${theme.focus} ${
                  isActive ? theme.buttonActive : theme.buttonInactive
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  };

  const renderToggle = (label: string, key: BooleanSettingKey) => {
    const isChecked = Boolean(settings[key]);
    return (
      <div className={`flex min-h-9 items-center justify-between gap-3 border-b py-1.5 last:border-b-0 ${theme.border}`}>
        <span className="text-[13px] font-medium leading-4">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={isChecked}
          aria-label={label}
          onClick={() => setSetting(key, !isChecked as ScopeSettings[typeof key])}
          className={`relative h-6 w-10 shrink-0 rounded-sm border cursor-pointer transition-colors duration-150 before:absolute before:-inset-x-1 before:-inset-y-2 ${theme.focus} ${
            isChecked ? theme.toggleBgActive : `${theme.inset} ${theme.border}`
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute left-0 top-[3px] h-4 w-4 rounded-[2px] transition-transform duration-150 ${
              isChecked
                ? `translate-x-[21px] ${theme.toggleKnobActive}`
                : `translate-x-[3px] ${theme.toggleKnobInactive}`
            }`}
          />
        </button>
      </div>
    );
  };

  const renderNumberInput = <K extends NumericSettingKey>(
    label: string,
    key: K,
    min: number,
    max: number,
    step = 1,
  ) => {
    const rangeId = `settings-${String(key)}-range`;
    const currentValue = Number(settings[key] ?? min);
    return (
      <div className="settings-number mb-4 last:mb-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor={rangeId} className={`text-[11px] font-bold uppercase tracking-[0.12em] ${theme.label}`}>
            {label}
          </label>
          <span className={`rounded-sm border px-1.5 py-0.5 text-xs font-bold tabular-nums ${theme.inset}`}>
            {currentValue}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            id={rangeId}
            type="range"
            min={min}
            max={max}
            step={step}
            value={currentValue}
            onChange={(event) => setSetting(key, parseFloat(event.target.value) as ScopeSettings[K])}
            className={`h-2 min-h-8 flex-1 cursor-pointer accent-current ${theme.focus}`}
          />
          <input
            type="number"
            aria-label={`${label} numeric value`}
            min={min}
            max={max}
            step={step}
            value={currentValue}
            onChange={(event) => {
              const value = parseFloat(event.target.value);
              if (!Number.isNaN(value)) setSetting(key, value as ScopeSettings[K]);
            }}
            className={`min-h-9 w-16 rounded-sm border px-2 py-1.5 text-right text-xs font-semibold tabular-nums ${theme.input} ${theme.focus}`}
          />
        </div>
      </div>
    );
  };

  const renderScopeThemeGrid = () => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {SCOPE_THEME_OPTIONS.map((option) => {
        const palette = THEMES[option.value];
        const isActive = settings.scopeTheme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => setSetting('scopeTheme', option.value)}
            className={`scope-theme-card min-h-[72px] rounded-sm border p-2.5 text-left cursor-pointer ${controlMotion} ${theme.focus} ${
              isActive ? theme.buttonActive : theme.buttonInactive
            }`}
          >
            <span className="mb-2 flex h-4 overflow-hidden rounded-[2px] border border-white/20" aria-hidden="true">
              {[palette.bg, palette.ringMajor, palette.symbolStroke, palette.airport].map((color, index) => (
                <span key={`${option.value}-${index}`} className="flex-1" style={{ backgroundColor: color }} />
              ))}
            </span>
            <span className="block text-xs font-bold">{option.label}</span>
            <span className={`theme-description mt-0.5 block text-[11px] leading-4 ${isActive ? 'text-current/80' : theme.muted}`}>
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) onClose?.();
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % SETTINGS_TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = SETTINGS_TABS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = SETTINGS_TABS[nextIndex].key;
    setActiveTab(nextTab);
    requestAnimationFrame(() => document.getElementById(`settings-tab-${nextTab}`)?.focus());
  };

  const activeTabId = `settings-tab-${activeTab}`;
  const activePanelId = `settings-panel-${activeTab}`;

  return (
    <div
      onMouseDown={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2 backdrop-blur-sm md:p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`settings-dialog ${settings.compactSettings !== false ? 'settings-compact' : ''} flex max-h-[calc(100vh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-md border font-sans shadow-2xl md:max-h-[calc(100vh-2rem)] ${theme.bg}`}
      >
        <header className={`flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 md:px-5 ${theme.border}`}>
          <div>
            <h2 id={titleId} className="text-base font-bold uppercase tracking-[0.12em] md:text-lg">System Settings</h2>
            <p className={`mt-1 text-xs leading-4 ${theme.muted}`}>
              Configure the radar display, data feed, alerts, and visual themes.
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              aria-label="Close settings"
              onClick={onClose}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border text-xl leading-none cursor-pointer ${controlMotion} ${theme.buttonInactive} ${theme.focus}`}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </header>

        <div role="tablist" aria-label="Settings categories" className={`flex shrink-0 gap-1 overflow-x-auto border-b px-2 pt-1.5 md:px-3 ${theme.border}`}>
          {SETTINGS_TABS.map((tab, index) => (
            <button
              key={tab.key}
              id={`settings-tab-${tab.key}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={`settings-panel-${tab.key}`}
              tabIndex={activeTab === tab.key ? 0 : -1}
              onClick={() => setActiveTab(tab.key)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`min-h-9 min-w-[82px] flex-1 rounded-t-sm border border-b-0 px-2 py-2 text-[11px] font-bold uppercase tracking-[0.08em] cursor-pointer transition-colors duration-150 sm:min-w-[108px] sm:px-3 sm:text-xs sm:tracking-[0.1em] ${theme.focus} ${
                activeTab === tab.key ? theme.tabActive : theme.tabInactive
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          id={activePanelId}
          role="tabpanel"
          aria-labelledby={activeTabId}
          className={`settings-scrollbar min-h-0 flex-1 overflow-y-auto p-3 md:p-4 ${theme.focus}`}
        >
          {activeTab === 'visuals' && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="display-primary">
                <section className={sectionClass}>
                  {renderSectionHeading('Display Behavior', 'Control sweep motion, aircraft label detail, and range guides.')}
                  {settings.sweepStyle !== 'none' ? <>
                    {renderToggle('Fill radar viewport', 'fillViewport')}
                    {renderToggle('Keep scope circle & headings in view', 'keepScopeInView')}
                  </> : <p className={`mb-3 text-xs ${theme.muted}`}>None fills the viewport without range rings or compass markings.</p>}
                  {renderSelector('Sweep Style', 'sweepStyle', [
                    { label: 'Rotate', value: 'rotate' },
                    { label: 'Pulse', value: 'pulse' },
                    { label: 'None', value: 'none' },
                  ])}
                  {renderSelector('Label Density', 'labelDensity', [
                    { label: 'Mini', value: 'mini' },
                    { label: 'Compact', value: 'compact' },
                    { label: 'Full', value: 'full' },
                  ])}
                  {renderSelector('Range Rings', 'ringCount', [
                    { label: '2', value: 2 },
                    { label: '3', value: 3 },
                    { label: '4', value: 4 },
                    { label: '5', value: 5 },
                  ])}
                </section>

                <section className={sectionClass}>
                  {renderSectionHeading('Map Feature Layers', 'Choose the operational overlays shown on the radar canvas.')}
                  <div className="map-layer-options">
                  {renderToggle('Separation indicator', 'showConflicts')}
                  {renderToggle('Altitude gradient', 'altColor')}
                  {renderToggle('Drag to pan scope', 'enableDragPan')}
                  {renderToggle('Vector predictor', 'showVectors')}
                  {renderToggle('Aircraft trails', 'showTrails')}
                  {renderToggle('Airspace boundaries', 'showAirspaces')}
                  {renderNumberInput('Airspace opacity (%)', 'airspaceOpacity', 0, 100)}
                  {settings.showAirspaces && (
                    <div className={`airspace-class-options my-2 ml-2 rounded-sm border p-3 ${theme.inset}`}>
                      <div className={`mb-1 text-[11px] font-bold uppercase tracking-[0.12em] ${theme.label}`}>Airspace Classes</div>
                      {renderToggle('Class B', 'showClassB')}
                      {renderToggle('Class C', 'showClassC')}
                      {renderToggle('Class D', 'showClassD')}
                      {renderToggle('Class E', 'showClassE')}
                      {renderToggle('Special use / other', 'showClassOther')}
                    </div>
                  )}
                  {renderToggle('Airports', 'showAirports')}
                  {renderToggle('Navaids', 'showNavaids')}
                  {renderToggle('Runways', 'showRunways')}
                  </div>
                </section>
              </div>

              <section className={`${sectionClass} self-start`}>
                {renderSectionHeading('Display Effects')}
                {renderToggle('CRT simulation', 'crtEffect')}
                {renderToggle('VFD dot-matrix text', 'vfdEffect')}
                {renderToggle('Compact settings', 'compactSettings')}
                <div className="my-3 border-t border-current/20" />
                {renderSectionHeading('Canvas Metrics', 'Tune target scale, prediction length, and sweep timing.')}
                {renderNumberInput('Aircraft Symbol Size', 'aircraftSymbolSize', 2, 12)}
                {renderNumberInput('Predictor Vector (minutes)', 'vectorMinutes', 1, 10)}
                {renderNumberInput('Sweep Duration (seconds)', 'sweepDurationS', 1, 10, 0.1)}
              </section>
            </div>
          )}

          {activeTab === 'tuning' && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <section className={sectionClass}>
                {renderSectionHeading('Trail History', 'Set how long aircraft paths remain visible and how quickly they fade.')}
                {renderNumberInput('Max Trail Length', 'maxTrailLength', 10, 300, 5)}
                {renderNumberInput('Trail Fade Time (minutes)', 'trailFadeTimeMinutes', 1, 60)}
              </section>

              <div className="space-y-3">
                <section className={sectionClass}>
                  {renderSectionHeading('Aviation Filters', 'Limit airport density and hide runways below the selected length.')}
                  {renderNumberInput('Max Airports Displayed', 'maxAirportsDisplay', 5, 200, 5)}
                  {renderNumberInput('Min Runway Length (feet)', 'minRunwayLengthFt', 1000, 12000, 500)}
                </section>

                <section className={sectionClass}>
                  {renderSectionHeading('Audio Alerts', 'Select and preview the sound used for emergency and conflict alerts.')}
                  {renderToggle('Enable audio alerts', 'soundEnabled')}
                  {settings.soundEnabled && (
                    <div className={`mt-3 rounded-sm border p-3 ${theme.inset}`}>
                      {renderSelector('Alert Sound', 'alertSound', [
                        { label: 'Classic Siren', value: 'classic-siren' },
                        { label: 'Fast Siren', value: 'fast-siren' },
                        { label: 'Wobble Siren', value: 'wobble-siren' },
                        { label: 'Hi-Lo Alert', value: 'hi-lo-alert' },
                        { label: 'Tri-Tone Alarm', value: 'tri-tone-alarm' },
                        { label: 'Double Beep', value: 'beep' },
                        { label: 'Ascending Chime', value: 'chime' },
                        { label: 'Double Bell', value: 'bell' },
                        { label: 'Radar Sonar', value: 'pulsar' },
                        { label: 'Radio Static', value: 'radio' },
                      ])}
                      <button
                        type="button"
                        onClick={() => SoundManager.playEmergencyAlert(settings.alertSound || 'classic-siren', true)}
                        className={`min-h-9 w-full rounded-sm border px-3 py-1.5 text-xs font-bold cursor-pointer ${controlMotion} ${theme.actionBtn} ${theme.focus}`}
                      >
                        Test Selected Sound
                      </button>
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <section className={sectionClass}>
                {renderSectionHeading('Station & Feed', 'Set the radar center point and primary aircraft JSON endpoint.')}
                <label htmlFor="settings-station-name" className="block text-xs mb-2">Station name</label>
                <input id="settings-station-name" maxLength={48} value={settings.stationName || ''} onChange={e => setSetting('stationName', e.target.value)} className={`mb-3 min-h-9 w-full rounded-sm border px-3 text-xs ${theme.input} ${theme.focus}`} />
                {renderToggle('Enable first-run setup', 'setupEnabled')}
                <button type="button" onClick={() => updateSettings({ setupEnabled: true, setupCompleted: false })} className={`my-2 min-h-9 rounded-sm border px-3 text-xs ${theme.buttonInactive} ${theme.focus}`}>Open station setup</button>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="settings-home-lat" className={`mb-1 block text-xs font-semibold ${theme.muted}`}>Latitude</label>
                    <input
                      id="settings-home-lat"
                      type="text"
                      inputMode="decimal"
                      value={homeLat}
                      onChange={(event) => setHomeLat(event.target.value)}
                      className={`min-h-10 w-full rounded-sm border px-3 py-1.5 text-[13px] ${theme.input} ${theme.focus}`}
                    />
                  </div>
                  <div>
                    <label htmlFor="settings-home-lon" className={`mb-1 block text-xs font-semibold ${theme.muted}`}>Longitude</label>
                    <input
                      id="settings-home-lon"
                      type="text"
                      inputMode="decimal"
                      value={homeLon}
                      onChange={(event) => setHomeLon(event.target.value)}
                      className={`min-h-10 w-full rounded-sm border px-3 py-1.5 text-[13px] ${theme.input} ${theme.focus}`}
                    />
                  </div>
                </div>

                <div className="mt-5">
                  <label htmlFor="settings-data-url" className={`mb-1 block text-xs font-semibold ${theme.muted}`}>Primary JSON data feed</label>
                  <input
                    id="settings-data-url"
                    type="url"
                    placeholder="http://host/tar1090/data/aircraft.json"
                    value={dataUrl}
                    onChange={(event) => setDataUrl(event.target.value)}
                    className={`min-h-10 w-full rounded-sm border px-3 py-1.5 text-[13px] ${theme.input} ${theme.focus}`}
                  />
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label htmlFor="settings-polling-rate" className={`text-xs font-semibold ${theme.muted}`}>Polling refresh rate</label>
                    <span className="text-xs font-bold tabular-nums">{fetchIntervalMs} ms</span>
                  </div>
                  <input
                    id="settings-polling-rate"
                    type="range"
                    min={500}
                    max={10000}
                    step={500}
                    value={parseInt(fetchIntervalMs, 10) || 1000}
                    onChange={(event) => setFetchIntervalMs(event.target.value)}
                    className={`h-2 min-h-8 w-full cursor-pointer accent-current ${theme.focus}`}
                  />
                </div>
              </section>

              <div className="space-y-3">
                <section className={sectionClass}>
                  {renderSectionHeading('WebSocket Bridge', 'Use a WebSocket source when a compatible local bridge is available.')}
                  <label htmlFor="settings-ws-url" className={`mb-1 block text-xs font-semibold ${theme.muted}`}>Bridge address</label>
                  <input
                    id="settings-ws-url"
                    type="url"
                    placeholder="ws://localhost:8765"
                    value={wsUrl}
                    onChange={(event) => setWsUrl(event.target.value)}
                    className={`min-h-10 w-full rounded-sm border px-3 py-1.5 text-[13px] ${theme.input} ${theme.focus}`}
                  />
                  <div className={`mt-3 flex min-h-9 items-center justify-between border-t pt-2 ${theme.border}`}>
                    <span className="text-[13px] font-medium">Enable connection</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={wsEnabled}
                      aria-label="Enable WebSocket connection"
                      onClick={() => setWsEnabled((enabled) => !enabled)}
                      className={`relative h-6 w-10 shrink-0 rounded-sm border cursor-pointer transition-colors duration-150 before:absolute before:-inset-x-1 before:-inset-y-2 ${theme.focus} ${
                        wsEnabled ? theme.toggleBgActive : `${theme.inset} ${theme.border}`
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute left-0 top-[3px] h-4 w-4 rounded-[2px] transition-transform duration-150 ${
                          wsEnabled
                            ? `translate-x-[21px] ${theme.toggleKnobActive}`
                            : `translate-x-[3px] ${theme.toggleKnobInactive}`
                        }`}
                      />
                    </button>
                  </div>
                </section>

                <section className={sectionClass}>
                  {renderSectionHeading('Connection Status')}
                  <dl className="space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-4">
                      <dt className={theme.muted}>Feed status</dt>
                      <dd role="status" aria-live="polite" className={`rounded-sm border px-2 py-1 font-bold uppercase ${theme.inset}`}>{networkStatus}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className={theme.muted}>Unique traffic</dt>
                      <dd className="font-bold tabular-nums">{sessionStats.uniqueAircraftCount.toLocaleString()}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className={theme.muted}>Total messages</dt>
                      <dd className="font-bold tabular-nums">{sessionStats.messagesCount.toLocaleString()}</dd>
                    </div>
                  </dl>
                </section>

                <section className={sectionClass}>
                  <div className="space-y-2">
                    <button type="button" onClick={handleSaveSystemSettings} className={`min-h-10 w-full rounded-sm border px-3 py-1.5 text-xs font-bold uppercase tracking-wide cursor-pointer ${controlMotion} ${theme.actionBtn} ${theme.focus}`}>Apply & Save Settings</button>
                    <button type="button" onClick={clearAircraft} className={`min-h-10 w-full rounded-sm border border-amber-400/60 bg-amber-950/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-200 hover:bg-amber-900/40 cursor-pointer ${controlMotion} ${theme.focus}`}>Reset Session Traffic</button>
                    <button type="button" onClick={handleResetDefaults} className={`min-h-10 w-full rounded-sm border px-3 py-1.5 text-xs font-bold uppercase tracking-wide cursor-pointer ${controlMotion} ${theme.actionBtnDanger} ${theme.focus}`}>Restore Factory Defaults</button>
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeTab === 'themes' && (
            <div className="space-y-3">
              <section className={sectionClass}>
                {renderSectionHeading('Application Layout', 'Choose the surrounding controls and information layout. Radar colors can be selected independently below.')}
                {renderSelector('Layout', 'uiTheme', [
                  { label: 'Retro CRT', value: 'phosphor' },
                  { label: 'ATC Ops Console', value: 'console' },
                ])}
              </section>

              <section className={sectionClass}>
                {renderSectionHeading('Interface Palette', 'Color the controls, panels, table, and search independently of the radar.')}
                {renderSelector('Interface Colors', 'uiPalette', [{ label: 'Layout Default', value: 'layout' }, ...EXTRA_PALETTES])}
              </section>

              <section className={sectionClass}>
                {renderSectionHeading('Radar Palette', 'Select a canvas palette for the sweep, range rings, targets, labels, and map symbols.')}
                {renderScopeThemeGrid()}
              </section>

              <section className={sectionClass}>
                {renderSectionHeading('Airspace Palette', 'Set the Class B, C, D, E, and special-use boundary colors independently from the radar palette.')}
                {renderSelector('Airspace Color Scheme', 'airspaceColorScheme', AIRSPACE_THEME_OPTIONS)}
              </section>
            </div>
          )}
        </div>

        <footer className={`flex shrink-0 flex-col justify-between gap-1 border-t px-4 py-3 text-[10px] font-medium tracking-wide sm:flex-row md:px-6 ${theme.border} ${theme.muted}`}>
          <span>ADSB RADARSCOPE v2.5.0 beta 67</span>
          <span>ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067</span>
        </footer>
      </div>
    </div>
  );
};
