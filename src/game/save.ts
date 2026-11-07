import { ALL_RES, MINEABLE, TECH_BY_ID, SHIPS, type ResId } from './data';
import { SAVE_VERSION, createState, emptyStats, recomputeDetected, type GameState } from './state';
import { getGalaxy } from './galaxy';

const DB_NAME = 'galaxy-tycoon';
const STORE = 'saves';
const MAIN_KEY = 'main';
const BACKUP_KEY = 'backup';
const LS_KEY = 'galaxy-tycoon:save';
const SETTINGS_KEY = 'galaxy-tycoon:settings';

export interface SaveEnvelope {
  game: 'galaxy-tycoon';
  version: number;
  savedAt: number;
  state: GameState;
}

// ───────────────────────────── IndexedDB wrapper (with localStorage fallback) ─────────────────────────────
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB error'));
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

async function idbGet(key: string): Promise<string | undefined> {
  const db = await openDb();
  try {
    return await new Promise<string | undefined>((resolve, reject) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result as string | undefined);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
  } finally {
    db.close();
  }
}
async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// ───────────────────────────── Validation / migration ─────────────────────────────
const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number, min = -Infinity, max = Infinity) => (typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : d);

/** Take arbitrary parsed JSON and return a safe, complete GameState, or throw with a human readable reason. */
export function sanitizeState(raw: unknown): GameState {
  if (!isObj(raw)) throw new Error('Save data is not an object.');
  const v = num(raw.version, 0);
  if (v > SAVE_VERSION) throw new Error(`This save is from a newer version of the game (v${v}).`);
  if (typeof raw.seed !== 'number' || !isFinite(raw.seed)) throw new Error('Save data is missing its galaxy seed.');
  const mode = raw.mode === 'sandbox' ? 'sandbox' : 'campaign';
  const base = createState(raw.seed >>> 0, mode, num(raw.createdAt, Date.now()));
  const g = getGalaxy(base.seed);
  const s = base;

  s.version = SAVE_VERSION;
  s.savedAt = num(raw.savedAt, Date.now());
  s.playTime = num(raw.playTime, 0, 0);
  s.credits = num(raw.credits, s.credits, 0);
  if (isObj(raw.res)) for (const r of ALL_RES) s.res[r] = num(raw.res[r], 0, 0);
  if (isObj(raw.cargo)) for (const r of MINEABLE) s.cargo[r] = num(raw.cargo[r], 0, 0);
  if (isObj(raw.ship)) {
    const owned = Array.isArray(raw.ship.owned) ? raw.ship.owned.filter((x: unknown): x is keyof typeof SHIPS => typeof x === 'string' && x in SHIPS) : [];
    if (!owned.includes('scout')) owned.unshift('scout');
    s.ship.owned = Array.from(new Set(owned));
    s.ship.active = s.ship.owned.includes(raw.ship.active) ? raw.ship.active : 'scout';
    s.ship.hull = num(raw.ship.hull, SHIPS[s.ship.active].hull, 0);
    s.ship.shield = num(raw.ship.shield, 0, 0);
    s.ship.energy = num(raw.ship.energy, 100, 0);
  }
  if (isObj(raw.upgrades)) for (const k of Object.keys(s.upgrades) as (keyof typeof s.upgrades)[]) s.upgrades[k] = Math.floor(num(raw.upgrades[k], 0, 0, 20));
  s.location = typeof raw.location === 'string' && g.byId.has(raw.location) ? raw.location : g.homeId;
  const copyFlags = (src: unknown, valid: (k: string) => boolean): Record<string, true> => {
    const out: Record<string, true> = {};
    if (isObj(src)) for (const k of Object.keys(src)) if (src[k] && valid(k)) out[k] = true;
    return out;
  };
  s.visited = copyFlags(raw.visited, (k) => g.byId.has(k));
  s.visited[s.location] = true;
  s.detected = {};
  s.revealedBodies = copyFlags(raw.revealedBodies, (k) => g.bodies.has(k));
  s.poisDone = copyFlags(raw.poisDone, (k) => g.pois.has(k));
  s.revealedSystems = copyFlags(raw.revealedSystems, (k) => g.byId.has(k));
  s.scanPower = {};
  if (isObj(raw.scanPower)) for (const k of Object.keys(raw.scanPower)) if (g.byId.has(k)) s.scanPower[k] = num(raw.scanPower[k], 0, 0, 100);
  s.installs = {};
  if (isObj(raw.installs)) {
    for (const k of Object.keys(raw.installs)) {
      const i = raw.installs[k];
      if (!g.byId.has(k) || !isObj(i)) continue;
      s.installs[k] = {
        drone: Math.floor(num(i.drone, 0, 0, 500)), minerShip: Math.floor(num(i.minerShip, 0, 0, 500)), station: Math.floor(num(i.station, 0, 0, 50)),
        focus: typeof i.focus === 'string' && g.bodies.has(i.focus) ? i.focus : null,
      };
    }
  }
  if (isObj(raw.counts)) for (const k of Object.keys(s.counts) as (keyof typeof s.counts)[]) s.counts[k] = Math.floor(num(raw.counts[k], 0, 0, 5000));
  s.refineries = [];
  if (Array.isArray(raw.refineries)) {
    for (const r of raw.refineries.slice(0, 200)) {
      if (!isObj(r)) continue;
      s.refineries.push({ recipe: typeof r.recipe === 'string' && ['alloy', 'circuits', 'cells', 'exotic', 'nanites', 'warpcore'].includes(r.recipe) ? (r.recipe as any) : null, busy: !!r.busy, progress: num(r.progress, 0, 0) });
    }
  }
  if (isObj(raw.autoLevels)) for (const k of Object.keys(s.autoLevels) as (keyof typeof s.autoLevels)[]) s.autoLevels[k] = Math.floor(num(raw.autoLevels[k], 0, 0, 8));
  if (isObj(raw.autoSell)) for (const r of ALL_RES) if (isObj(raw.autoSell[r])) s.autoSell[r] = { on: !!raw.autoSell[r].on, keep: Math.floor(num(raw.autoSell[r].keep, 0, 0)) };
  s.autoUnload = raw.autoUnload !== false;
  if (isObj(raw.market)) for (const r of ALL_RES) if (isObj(raw.market[r])) s.market[r] = { mult: num(raw.market[r].mult, 1, 0.3, 2.5), target: num(raw.market[r].target, 1, 0.5, 1.5) };
  s.marketTimer = num(raw.marketTimer, 20, 0, 100);
  if (isObj(raw.research)) {
    const done: string[] = Array.isArray(raw.research.done) ? raw.research.done.filter((x: unknown): x is string => typeof x === 'string' && x in TECH_BY_ID) : [];
    s.research.done = Array.from(new Set(done));
    const cur = raw.research.current;
    s.research.current = isObj(cur) && typeof cur.id === 'string' && cur.id in TECH_BY_ID && !s.research.done.includes(cur.id) ? { id: cur.id, progress: num(cur.progress, 0, 0) } : null;
  }
  if (isObj(raw.missions)) {
    const clean = (arr: unknown): GameState['missions']['board'] =>
      Array.isArray(arr) ? arr.filter((m: any) => isObj(m) && typeof m.id === 'number' && typeof m.title === 'string' && typeof m.type === 'string' && typeof m.target === 'number' && isObj(m.reward))
        .slice(0, 12).map((m: any) => ({ ...m, progress: num(m.progress, 0, 0, m.target), reward: { credits: num(m.reward.credits, 0, 0), res: isObj(m.reward.res) ? m.reward.res : {} } })) : [];
    s.missions.board = clean(raw.missions.board);
    s.missions.active = clean(raw.missions.active).slice(0, 8);
    s.missions.nextId = Math.floor(num(raw.missions.nextId, 1000, 1));
  }
  s.codex = Array.isArray(raw.codex) ? raw.codex.filter((x: unknown): x is string => typeof x === 'string') : [];
  s.achievements = {};
  if (isObj(raw.achievements)) for (const k of Object.keys(raw.achievements)) s.achievements[k] = num(raw.achievements[k], 0);
  s.stats = emptyStats();
  if (isObj(raw.stats)) {
    const st = raw.stats as Record<string, any>;
    for (const k of Object.keys(s.stats) as (keyof typeof s.stats)[]) {
      const dv = s.stats[k];
      if (typeof dv === 'number') (s.stats as any)[k] = num(st[k], 0, 0);
      else if (isObj(dv) && isObj(st[k])) for (const kk of Object.keys(dv)) (dv as any)[kk] = num(st[k][kk], 0, 0);
    }
  }
  s.mega = Math.floor(num(raw.mega, 0, 0, 3));
  s.victory = !!raw.victory;
  s.guide = Math.floor(num(raw.guide, 0, 0, 999));
  s.tutorialSeen = !!raw.tutorialSeen;
  s.rng = num(raw.rng, s.rng) >>> 0;
  s.hazardCd = num(raw.hazardCd, 180, 0, 1000);
  s.log = Array.isArray(raw.log) ? raw.log.filter((l: any) => isObj(l) && typeof l.msg === 'string').slice(-40).map((l: any) => ({ t: num(l.t, 0), msg: String(l.msg), kind: ['info', 'good', 'bad', 'loot'].includes(l.kind) ? l.kind : 'info' })) : [];
  // transient state is dropped on load: no half-finished combat, events or travel
  s.combat = null;
  s.event = null;
  const act = raw.activity;
  if (isObj(act) && act.type === 'traveling' && typeof act.to === 'string' && g.byId.has(act.to)) {
    s.activity = { type: 'traveling', from: s.location, to: act.to, t: num(act.t, 0, 0), dur: Math.max(1, num(act.dur, 5, 1)) };
  } else if (isObj(act) && act.type === 'mining' && typeof act.bodyId === 'string' && g.bodies.get(act.bodyId)?.sysId === s.location) {
    s.activity = { type: 'mining', bodyId: act.bodyId, overheated: false, pulseCd: 0 };
  } else s.activity = { type: 'idle' };
  recomputeDetected(s);
  return s;
}

// ───────────────────────────── Public API ─────────────────────────────
export function serialize(state: GameState): string {
  const env: SaveEnvelope = { game: 'galaxy-tycoon', version: SAVE_VERSION, savedAt: Date.now(), state: { ...state, savedAt: Date.now() } };
  return JSON.stringify(env);
}

export function parseSave(text: string): GameState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  if (!isObj(data)) throw new Error('The file is not a Galaxy Tycoon save.');
  if (data.game !== 'galaxy-tycoon' || !isObj(data.state)) throw new Error('The file is not a Galaxy Tycoon save.');
  const state = data.state as Record<string, unknown>;
  state.version = num(data.version, num(state.version, 0));
  return sanitizeState(state);
}

export interface SaveInfo { savedAt: number; playTime: number; credits: number; mode: string; backup: boolean }

export async function writeSave(state: GameState): Promise<void> {
  const text = serialize(state);
  try {
    const prev = await idbGet(MAIN_KEY).catch(() => undefined);
    if (prev) await idbSet(BACKUP_KEY, prev).catch(() => undefined);
    await idbSet(MAIN_KEY, text);
    return;
  } catch {
    /* fall through to localStorage */
  }
  try {
    localStorage.setItem(LS_KEY, text);
  } catch {
    throw new Error('Could not write the save: storage is unavailable or full.');
  }
}

export interface LoadResult { state: GameState | null; recovered: boolean; error: string | null }
export async function loadSave(): Promise<LoadResult> {
  const sources: { name: string; get: () => Promise<string | undefined | null> }[] = [
    { name: 'main', get: () => idbGet(MAIN_KEY) },
    { name: 'backup', get: () => idbGet(BACKUP_KEY) },
    { name: 'local', get: async () => localStorage.getItem(LS_KEY) },
  ];
  let error: string | null = null;
  let anyFound = false;
  for (const src of sources) {
    let text: string | undefined | null;
    try {
      text = await src.get();
    } catch {
      continue;
    }
    if (!text) continue;
    anyFound = true;
    try {
      return { state: parseSave(text), recovered: src.name === 'backup', error: null };
    } catch (e) {
      error = (e as Error).message;
    }
  }
  return { state: null, recovered: false, error: anyFound ? error ?? 'The save data is damaged.' : null };
}

export async function hasSave(): Promise<SaveInfo | null> {
  const r = await loadSave();
  if (!r.state) return null;
  return { savedAt: r.state.savedAt, playTime: r.state.playTime, credits: r.state.credits, mode: r.state.mode, backup: r.recovered };
}

export async function deleteSave(): Promise<void> {
  await idbDelete(MAIN_KEY).catch(() => undefined);
  await idbDelete(BACKUP_KEY).catch(() => undefined);
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

export function downloadSave(state: GameState): void {
  const blob = new Blob([serialize(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `galaxy-tycoon-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ───────────────────────────── Settings (localStorage, tiny) ─────────────────────────────
export interface Settings { muted: boolean; volume: number; quality: 'low' | 'medium' | 'high'; autosave: boolean; reduceMotion: boolean; tooltips: boolean }
export const DEFAULT_SETTINGS: Settings = { muted: false, volume: 0.5, quality: 'high', autosave: true, reduceMotion: false, tooltips: true };
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const o = JSON.parse(raw);
    return {
      muted: !!o.muted, volume: num(o.volume, 0.5, 0, 1), quality: ['low', 'medium', 'high'].includes(o.quality) ? o.quality : 'high',
      autosave: o.autosave !== false, reduceMotion: !!o.reduceMotion, tooltips: o.tooltips !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
export type { ResId };
