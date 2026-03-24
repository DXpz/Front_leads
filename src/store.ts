import type { AppState } from './types';
import { migrateAppStateFromUnknown } from './migrate';

const STORAGE_KEY_V2 = 'formulario-leads-v2';
const STORAGE_KEY_V1 = 'formulario-leads-v1';

const defaultState = (): AppState => ({
  draft: {},
  history: [],
  currentStageIndex: 0,
});

function parseStored(raw: string): AppState {
  const parsed: unknown = JSON.parse(raw);
  return migrateAppStateFromUnknown(parsed);
}

function loadStateLocal(): AppState {
  try {
    const v2 = localStorage.getItem(STORAGE_KEY_V2);
    if (v2) return parseStored(v2);
    const v1 = localStorage.getItem(STORAGE_KEY_V1);
    if (v1) {
      const migrated = migrateAppStateFromUnknown(JSON.parse(v1));
      saveStateLocal(migrated);
      localStorage.removeItem(STORAGE_KEY_V1);
      return migrated;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return defaultState();
}

function saveStateLocal(state: AppState): void {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(state));
}

async function putStateToServer(state: AppState): Promise<boolean> {
  try {
    const r = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function isMeaningfulState(s: AppState): boolean {
  if (s.history.length > 0) return true;
  if (s.currentStageIndex !== 0) return true;
  return Object.keys(s.draft).length > 0;
}

/** Carga: PostgreSQL vía /api si hay datos; si la BD está vacía pero el navegador no, sube el local. */
export async function loadState(): Promise<AppState> {
  const local = loadStateLocal();
  try {
    const r = await fetch('/api/state');
    if (!r.ok) throw new Error('bad');
    const server = migrateAppStateFromUnknown(await r.json());
    if (isMeaningfulState(server)) {
      saveStateLocal(server);
      return server;
    }
    if (isMeaningfulState(local)) {
      void putStateToServer(local);
      return local;
    }
    saveStateLocal(server);
    return server;
  } catch {
    return local;
  }
}

export function saveState(state: AppState): void {
  saveStateLocal(state);
  void putStateToServer(state);
}

export function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY_V2);
  localStorage.removeItem(STORAGE_KEY_V1);
}
