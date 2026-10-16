import { ScopeSettings } from './types';

interface RuntimeConfigFile {
  version: number;
  settings: Partial<ScopeSettings>;
}

let runtimeSettings: Partial<ScopeSettings> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Load release defaults before React initializes. Invalid or missing files are ignored. */
export async function loadRuntimeConfig(): Promise<void> {
  try {
    const configUrl = new URL('./runtime-config.json', window.location.href);
    const response = await fetch(configUrl, { cache: 'no-store' });
    if (!response.ok) return;

    const parsed: unknown = await response.json();
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.settings)) {
      console.warn('[Runtime Config] Ignoring an invalid runtime-config.json file.');
      return;
    }
    runtimeSettings = parsed.settings as Partial<ScopeSettings>;
  } catch (error) {
    console.warn('[Runtime Config] Could not load release defaults:', error);
  }
}

export function getRuntimeSettings(): Partial<ScopeSettings> {
  return { ...runtimeSettings };
}
