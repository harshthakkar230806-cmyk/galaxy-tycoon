import {
  ALL_RES, BASE_POWER, BUILDINGS, MINEABLE, RES, SHIPS, TECHS, UPGRADES, ADD_KEYS, MAX_KEYS, baseMods, START_CREDITS,
  type BuildingId, type CraftRes, type EnemyId, type MineRes, type Mods, type ResBag, type ResId, type ShipId, type UpgradeId,
} from './data';
import { getGalaxy, dist, type StarSystem } from './galaxy';
import { clamp } from './rng';

export const SAVE_VERSION = 1;

// ───────────────────────────── Types ─────────────────────────────
export type Activity =
  | { type: 'idle' }
  | { type: 'mining'; bodyId: string; overheated: boolean; pulseCd: number }
  | { type: 'scanning'; t: number; dur: number }
  | { type: 'investigating'; poiId: string; t: number; dur: number }
  | { type: 'traveling'; from: string; to: string; t: number; dur: number };

export interface CombatEnemy {
  id: EnemyId; hull: number; hullMax: number; shield: number; shieldMax: number; dmg: number; acc: number; reward: number;
}
export interface CombatState {
  phase: 'alert' | 'fight' | 'won' | 'lost' | 'fled';
  forced: boolean;
  source: 'travel' | 'mining' | 'patrol' | 'poi';
  poiId: string | null;
  enemies: CombatEnemy[];
  evading: boolean;
  round: number;
  log: string[];
  loot: { credits: number; res: ResBag } | null;
  bribe: number;
}
export interface PendingEvent {
  kind: 'storm' | 'anomaly';
  severity: number;
  poiId: string | null;
  title: string;
  text: string;
}

export type ObjType = 'mine' | 'scanBodies' | 'visit' | 'build' | 'kills' | 'research' | 'sell' | 'craft' | 'investigate' | 'scan' | 'jump';
export interface Mission {
  id: number;
  tpl: string;
  title: string;
  desc: string;
  type: ObjType;
  key: string; // resource / building id / '' for any
  target: number;
  progress: number;
  tier: number;
  reward: { credits: number; res: ResBag };
}

export interface Stats {
  mined: Record<MineRes, number>;
  minedTotal: number;
  sold: number;
  creditsEarned: number;
  creditsFromSales: number;
  scans: number;
  bodiesRevealed: number;
  jumps: number;
  kills: number;
  discoveries: number;
  crafted: Record<CraftRes, number>;
  craftedTotal: number;
  unloads: number;
  upgradesBought: number;
  storms: number;
  missionsDone: number;
  built: Record<BuildingId, number>;
  shipsBought: number;
  researchDone: number;
  pulses: number;
  offlineSeconds: number;
  combatsWon: number;
  combatsLost: number;
}

export interface Installs { drone: number; minerShip: number; station: number; focus: string | null }
export interface Refinery { recipe: CraftRes | null; busy: boolean; progress: number }
export type AutoType = 'drone' | 'minerShip' | 'station' | 'refinery' | 'lab' | 'vessel';
export interface LogEntry { t: number; msg: string; kind: 'info' | 'good' | 'bad' | 'loot' }

export interface GameState {
  version: number;
  seed: number;
  mode: 'campaign' | 'sandbox';
  createdAt: number;
  savedAt: number;
  playTime: number;
  credits: number;
  res: Record<ResId, number>;
  cargo: Record<MineRes, number>;
  ship: { owned: ShipId[]; active: ShipId; hull: number; shield: number; energy: number };
  upgrades: Record<UpgradeId, number>;
  location: string;
  activity: Activity;
  detected: Record<string, true>;
  visited: Record<string, true>;
  scanPower: Record<string, number>;
  revealedBodies: Record<string, true>;
  poisDone: Record<string, true>;
  revealedSystems: Record<string, true>;
  installs: Record<string, Installs>;
  counts: { vessel: number; lab: number; solar: number; fusion: number; antimatter: number };
  refineries: Refinery[];
  autoLevels: Record<AutoType, number>;
  autoSell: Record<ResId, { on: boolean; keep: number }>;
  autoUnload: boolean;
  market: Record<ResId, { mult: number; target: number }>;
  marketTimer: number;
  research: { done: string[]; current: { id: string; progress: number } | null };
  missions: { board: Mission[]; active: Mission[]; nextId: number };
  codex: string[];
  achievements: Record<string, number>;
  stats: Stats;
  mega: number;
  victory: boolean;
  guide: number;
  tutorialSeen: boolean;
  combat: CombatState | null;
  event: PendingEvent | null;
  rng: number;
  hazardCd: number;
  log: LogEntry[];
}

// ───────────────────────────── Creation ─────────────────────────────
export function emptyStats(): Stats {
  const z = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  return {
    mined: z(MINEABLE), minedTotal: 0, sold: 0, creditsEarned: 0, creditsFromSales: 0, scans: 0, bodiesRevealed: 0, jumps: 0, kills: 0,
    discoveries: 0, crafted: z(['alloy', 'circuits', 'cells', 'exotic', 'nanites', 'warpcore'] as const), craftedTotal: 0, unloads: 0,
    upgradesBought: 0, storms: 0, missionsDone: 0,
    built: z(['drone', 'minerShip', 'vessel', 'station', 'refinery', 'lab', 'solar', 'fusion', 'antimatter'] as const),
    shipsBought: 0, researchDone: 0, pulses: 0, offlineSeconds: 0, combatsWon: 0, combatsLost: 0,
  };
}

export function createState(seed: number, mode: 'campaign' | 'sandbox', now = Date.now()): GameState {
  const g = getGalaxy(seed);
  const res = Object.fromEntries(ALL_RES.map((r) => [r, 0])) as Record<ResId, number>;
  const autoSell = Object.fromEntries(ALL_RES.map((r) => [r, { on: false, keep: 0 }])) as GameState['autoSell'];
  const market = Object.fromEntries(ALL_RES.map((r) => [r, { mult: 1, target: 1 }])) as GameState['market'];
  const s: GameState = {
    version: SAVE_VERSION, seed, mode, createdAt: now, savedAt: now, playTime: 0, credits: START_CREDITS, res,
    cargo: Object.fromEntries(MINEABLE.map((r) => [r, 0])) as Record<MineRes, number>,
    ship: { owned: ['scout'], active: 'scout', hull: SHIPS.scout.hull, shield: SHIPS.scout.shield, energy: 100 },
    upgrades: { engine: 0, laser: 0, cargo: 0, scanner: 0, shield: 0, weapon: 0, jump: 0, reactor: 0 },
    location: g.homeId, activity: { type: 'idle' }, detected: {}, visited: { [g.homeId]: true }, scanPower: {}, revealedBodies: {},
    poisDone: {}, revealedSystems: {}, installs: {}, counts: { vessel: 0, lab: 0, solar: 0, fusion: 0, antimatter: 0 }, refineries: [],
    autoLevels: { drone: 0, minerShip: 0, station: 0, refinery: 0, lab: 0, vessel: 0 }, autoSell, autoUnload: true, market, marketTimer: 20,
    research: { done: [], current: null }, missions: { board: [], active: [], nextId: 1 }, codex: [], achievements: {},
    stats: emptyStats(), mega: 0, victory: false, guide: 0, tutorialSeen: false, combat: null, event: null,
    rng: (seed ^ 0xa5a5a5a5) >>> 0, hazardCd: 180, log: [],
  };
  s.scanPower[g.homeId] = 1.2;
  recomputeDetected(s);
  return s;
}

// ───────────────────────────── Random ─────────────────────────────
/** Random number stored in state so combat/events are reproducible from a save. */
export function rand(state: GameState): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randRange = (s: GameState, a: number, b: number) => a + (b - a) * rand(s);

// ───────────────────────────── Derived values ─────────────────────────────
let modsKey = '';
let modsCache: Mods = baseMods();
export function getMods(state: Pick<GameState, 'research'>): Mods {
  const key = state.research.done.join(',');
  if (key === modsKey) return modsCache;
  const m = baseMods();
  for (const id of state.research.done) {
    const t = TECHS.find((x) => x.id === id);
    if (!t || !t.mods) continue;
    for (const k of Object.keys(t.mods) as (keyof Mods)[]) {
      const v = t.mods[k] as number;
      if (ADD_KEYS.includes(k)) m[k] += v;
      else if (MAX_KEYS.includes(k)) m[k] = Math.max(m[k], v);
      else m[k] *= v;
    }
  }
  modsKey = key;
  modsCache = m;
  return m;
}

export const hasTech = (s: GameState, id: string | null | undefined) => !id || s.research.done.includes(id);

export interface ShipStats {
  cargoCap: number; speed: number; laser: number; hullMax: number; shieldMax: number; weapon: number; scan: number;
  jumpRange: number; energyMax: number; energyRegen: number; energyMult: number; jumpPerLy: number; mineDrain: number;
}
export function shipStats(s: GameState): ShipStats {
  const d = SHIPS[s.ship.active];
  const m = getMods(s);
  const u = s.upgrades;
  const energyMult = s.ship.active === 'interstellar' ? 0.75 : 1;
  const jumpMult = s.ship.active === 'scout' ? 0.85 : 1;
  return {
    cargoCap: Math.floor(d.cargo * (1 + 0.35 * u.cargo) * m.cargo),
    speed: d.speed * (1 + 0.15 * u.engine) * m.speed,
    laser: (1 + 0.45 * u.laser) * d.mining * m.mine,
    hullMax: Math.round(d.hull * m.hull),
    shieldMax: Math.round(d.shield * (1 + 0.3 * u.shield) * m.shield),
    weapon: d.weapon * (1 + 0.28 * u.weapon) * m.weapon,
    scan: d.scan + 0.9 * u.scanner + m.scan,
    jumpRange: d.jump * (1 + 0.2 * u.jump) * m.jump,
    energyMax: Math.round((100 + 20 * u.reactor) * m.energyMax),
    energyRegen: (1.5 + 0.3 * u.reactor) * m.energyRegen,
    energyMult,
    jumpPerLy: (1.1 * m.jumpEnergy * jumpMult * energyMult) / (1 + 0.06 * u.jump),
    mineDrain: 2.5 * m.mineEnergy * energyMult,
  };
}

export const cargoUsed = (s: GameState) => MINEABLE.reduce((a, r) => a + s.cargo[r], 0);

export function sectorUnlocked(s: GameState, sector: number): boolean {
  return sector <= getMods(s).sectors;
}

export function currentSystem(s: GameState): StarSystem {
  return getGalaxy(s.seed).byId.get(s.location)!;
}

export function ownedCount(s: GameState, id: BuildingId): number {
  switch (id) {
    case 'drone': return Object.values(s.installs).reduce((a, i) => a + i.drone, 0);
    case 'minerShip': return Object.values(s.installs).reduce((a, i) => a + i.minerShip, 0);
    case 'station': return Object.values(s.installs).reduce((a, i) => a + i.station, 0);
    case 'refinery': return s.refineries.length;
    default: return s.counts[id];
  }
}

export interface Cost { credits: number; res: ResBag }
export function buildingCost(s: GameState, id: BuildingId): Cost {
  const b = BUILDINGS[id];
  const n = ownedCount(s, id);
  const f = Math.pow(b.growth, n);
  const res: ResBag = {};
  for (const k of Object.keys(b.res) as ResId[]) res[k] = Math.ceil((b.res[k] as number) * (1 + n * 0.12));
  return { credits: Math.ceil(b.credits * f), res };
}

export function upgradeCost(s: GameState, id: UpgradeId): Cost {
  const d = UPGRADES[id];
  const L = s.upgrades[id];
  const res: ResBag = {};
  for (const r of d.res) if (L >= r.minLevel) res[r.res] = Math.ceil(r.base * Math.pow(r.growth, L - r.minLevel + 1));
  return { credits: Math.ceil(d.credits[0] * Math.pow(d.credits[1], L)), res };
}

export function autoUpgradeCost(s: GameState, t: AutoType): Cost {
  const L = s.autoLevels[t];
  const f: Record<AutoType, number> = { drone: 1, minerShip: 2, station: 6, refinery: 3, lab: 2, vessel: 2 };
  const res: ResBag = L < 2 ? { iron: 40 * (L + 1) } : L < 5 ? { alloy: 10 * (L - 1) } : { circuits: 12 * (L - 3), nanites: L >= 6 ? 4 * (L - 5) : 0 };
  if (res.nanites === 0) delete res.nanites;
  return { credits: Math.ceil(500 * f[t] * Math.pow(2, L)), res };
}
export const AUTO_MAX = 8;

export function canAfford(s: GameState, c: Cost): boolean {
  if (s.credits + 1e-9 < c.credits) return false;
  for (const k of Object.keys(c.res) as ResId[]) if (Math.floor(s.res[k] + 1e-9) < (c.res[k] as number)) return false;
  return true;
}
export function missingFor(s: GameState, c: Cost): string[] {
  const out: string[] = [];
  if (s.credits < c.credits) out.push(`${Math.ceil(c.credits - s.credits)} credits`);
  for (const k of Object.keys(c.res) as ResId[]) {
    const need = (c.res[k] as number) - Math.floor(s.res[k]);
    if (need > 0) out.push(`${need} ${RES[k].name}`);
  }
  return out;
}
export function spend(s: GameState, c: Cost): void {
  s.credits = Math.max(0, s.credits - c.credits);
  for (const k of Object.keys(c.res) as ResId[]) s.res[k] = Math.max(0, s.res[k] - (c.res[k] as number));
}

export function storageCap(s: GameState, r: ResId): number {
  const m = getMods(s);
  const stations = ownedCount(s, 'station');
  const info = RES[r];
  const base = r === 'exotic' ? 500 + stations * 100 : info.crafted ? 400 + stations * 100 : 2000 + stations * 600;
  return Math.floor(base * m.storage);
}
export function addRes(s: GameState, r: ResId, amount: number): number {
  const room = Math.max(0, storageCap(s, r) - s.res[r]);
  const add = Math.min(room, Math.max(0, amount));
  s.res[r] += add;
  return add;
}
export function addCredits(s: GameState, amount: number, fromSales = false): void {
  if (amount <= 0) return;
  s.credits += amount;
  s.stats.creditsEarned += amount;
  if (fromSales) s.stats.creditsFromSales += amount;
}

// ───────────────────────────── Power / automation ─────────────────────────────
export function powerInfo(s: GameState): { supply: number; demand: number; eff: number } {
  const m = getMods(s);
  const supply = (BASE_POWER + s.counts.solar * 8 + s.counts.fusion * 40 + s.counts.antimatter * 180) * m.power;
  let demand = 0;
  for (const id of ['drone', 'minerShip', 'station', 'refinery', 'lab', 'vessel'] as BuildingId[]) demand += ownedCount(s, id) * BUILDINGS[id].power;
  return { supply, demand, eff: demand <= supply || demand === 0 ? 1 : supply / demand };
}
export function upkeepPerSec(s: GameState): number {
  const m = getMods(s);
  let u = 0;
  for (const id of ['minerShip', 'station', 'refinery', 'lab', 'vessel'] as BuildingId[]) u += ownedCount(s, id) * BUILDINGS[id].upkeep;
  return u * m.upkeep;
}
export const autoMult = (s: GameState, t: AutoType) => 1 + 0.2 * s.autoLevels[t];

/** Pick the body automation should work: explicit focus or the most valuable minable body. */
export function bestBody(sys: StarSystem, focus: string | null) {
  const mineable = sys.bodies.filter((b) => b.kind !== 'moon' || true);
  if (focus) {
    const f = mineable.find((b) => b.id === focus);
    if (f) return f;
  }
  let best = mineable[0];
  let bv = -1;
  for (const b of mineable) {
    const v = b.richness * MINEABLE.reduce((a, r) => a + b.weights[r] * RES[r].price, 0);
    if (v > bv) {
      bv = v;
      best = b;
    }
  }
  return best;
}

export interface SysRates { rates: Record<MineRes, number>; total: number; body: string | null }
export function systemRates(s: GameState, sysId: string): SysRates {
  const out = Object.fromEntries(MINEABLE.map((r) => [r, 0])) as Record<MineRes, number>;
  const inst = s.installs[sysId];
  const g = getGalaxy(s.seed);
  const sys = g.byId.get(sysId);
  if (!inst || !sys || sys.bodies.length === 0) return { rates: out, total: 0, body: null };
  const m = getMods(s);
  const p = powerInfo(s);
  const body = bestBody(sys, inst.focus);
  const classes: { n: number; id: 'drone' | 'minerShip' | 'station' }[] = [
    { n: inst.drone, id: 'drone' }, { n: inst.minerShip, id: 'minerShip' }, { n: inst.station, id: 'station' },
  ];
  let total = 0;
  for (const c of classes) {
    if (c.n <= 0) continue;
    const d = BUILDINGS[c.id];
    const power = (d.miningPower ?? 1) + m.autoPower;
    const flow = c.n * (d.rate ?? 0) * autoMult(s, c.id) * m.autoOut * (c.id === 'drone' ? m.droneOut : 1) * p.eff * body.richness;
    for (const r of MINEABLE) {
      const w = body.weights[r];
      if (!w) continue;
      const eff = Math.pow(Math.min(1, power / RES[r].hardness), 1.2);
      const v = flow * w * eff;
      out[r] += v;
      total += v;
    }
  }
  return { rates: out, total, body: body.id };
}

// ───────────────────────────── Market ─────────────────────────────
const impact = (r: ResId) => (RES[r].crafted ? 0.003 : 0.0015);
export function sellFeeRate(s: GameState): number {
  const base = clamp(0.06 + getMods(s).sellFee, 0.01, 0.2);
  return s.ship.active === 'freighter' ? base / 2 : base;
}
export const BUY_MARKUP = 1.8;
export function quoteSale(s: GameState, r: ResId, qty: number) {
  const q = Math.max(0, qty);
  const m = s.market[r].mult;
  const k = 1 - impact(r);
  const gross = q === 0 ? 0 : RES[r].price * m * ((1 - Math.pow(k, q)) / (1 - k));
  const fee = gross * sellFeeRate(s);
  return { gross, fee, net: gross - fee, newMult: m * Math.pow(k, q), unit: RES[r].price * m };
}
export function quoteBuy(s: GameState, r: ResId, qty: number) {
  const q = Math.max(0, qty);
  const m = s.market[r].mult;
  const k = 1 - impact(r);
  const cost = q === 0 ? 0 : RES[r].price * BUY_MARKUP * m * ((Math.pow(1 / k, q) - 1) / (1 / k - 1));
  return { cost: Math.ceil(cost), newMult: Math.min(2, m * Math.pow(1 / k, q)), unit: RES[r].price * BUY_MARKUP * m };
}

// ───────────────────────────── Exploration helpers ─────────────────────────────
export function recomputeDetected(s: GameState): void {
  const g = getGalaxy(s.seed);
  const range = 18 + 7 * shipStatsScan(s);
  for (const id of Object.keys(s.visited)) {
    const v = g.byId.get(id);
    if (!v) continue;
    s.detected[id] = true;
    for (const o of g.systems) {
      if (o.hidden && !s.revealedSystems[o.id]) continue;
      if (dist(o, v) <= range) s.detected[o.id] = true;
    }
  }
  for (const id of Object.keys(s.revealedSystems)) s.detected[id] = true;
}
function shipStatsScan(s: GameState): number {
  return shipStats(s).scan;
}

export function canDock(s: GameState): boolean {
  const sys = currentSystem(s);
  return sys.id === getGalaxy(s.seed).homeId || sys.hub || (s.installs[sys.id]?.station ?? 0) > 0;
}

export function bodyRevealed(s: GameState, bodyId: string): boolean {
  return !!s.revealedBodies[bodyId];
}

export function totalUpgradeLevels(s: GameState): number {
  return Object.values(s.upgrades).reduce((a, b) => a + b, 0);
}

export function pushLog(s: GameState, msg: string, kind: LogEntry['kind'] = 'info'): void {
  s.log.push({ t: s.playTime, msg, kind });
  if (s.log.length > 40) s.log.splice(0, s.log.length - 40);
}

export function threat(s: GameState): number {
  const sys = currentSystem(s);
  return sys.sector + s.stats.kills / 14;
}
