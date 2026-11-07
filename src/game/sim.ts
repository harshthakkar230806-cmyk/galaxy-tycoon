import { ALL_RES, MINEABLE, RECIPES, RES, TECH_BY_ID, type MineRes, type ResId } from './data';
import { getGalaxy, type Body } from './galaxy';
import { fxGain, sfx, toast } from './events';
import { track } from './track';
import { checkAchievements } from './achievements';
import { advanceGuide } from './guide';
import { refillBoard } from './missions';
import { startEncounter } from './combat';
import { applyDamage, completePoi, handleDisabled, rewardMult } from './world';
import { addCodex } from './world';
import {
  addCredits, addRes, autoMult, canDock, cargoUsed, currentSystem, getMods, hasTech, ownedCount, powerInfo, quoteSale,
  rand, randRange, recomputeDetected, shipStats, systemRates, upkeepPerSec, pushLog, type GameState,
} from './state';
import { clamp } from './rng';

const fxAcc: Record<string, number> = {};

// ───────────────────────────── Mining ─────────────────────────────
export function miningRates(s: GameState, body: Body): Record<MineRes, number> {
  const st = shipStats(s);
  const flow = 1.4 * st.laser * body.richness;
  const out = {} as Record<MineRes, number>;
  for (const r of MINEABLE) {
    const eff = Math.pow(Math.min(1, st.laser / RES[r].hardness), 1.2);
    out[r] = flow * body.weights[r] * eff;
  }
  return out;
}

export function unloadCargo(s: GameState): { moved: number; left: number } {
  let moved = 0;
  let left = 0;
  for (const r of MINEABLE) {
    const amt = s.cargo[r];
    if (amt <= 0) continue;
    const added = addRes(s, r, amt);
    s.cargo[r] -= added;
    if (s.cargo[r] < 1e-9) s.cargo[r] = 0;
    moved += added;
    left += s.cargo[r];
  }
  if (moved > 0) s.stats.unloads++;
  return { moved, left };
}

function creditHazardStorm(s: GameState): void {
  const sys = currentSystem(s);
  const m = getMods(s);
  s.event = {
    kind: 'storm', severity: (14 + 9 * sys.danger) * m.hazard, poiId: null, title: 'Asteroid Storm!',
    text: 'A cloud of tumbling rock sweeps through the belt. Raise shields to ride it out, evacuate, or push on and take the hits.',
  };
  s.activity = s.activity.type === 'mining' ? { ...s.activity, pulseCd: 0 } : s.activity;
  sfx('alert');
}

function rollHazard(s: GameState): void {
  s.hazardCd = randRange(s, 150, 300);
  if (s.playTime < 240 || s.stats.jumps < 1) return;
  const sys = currentSystem(s);
  const a = s.activity;
  if (a.type !== 'mining') return;
  const body = getGalaxy(s.seed).bodies.get(a.bodyId);
  if (sys.storms && body && body.kind === 'belt' && rand(s) < 0.65) creditHazardStorm(s);
  else if (sys.danger >= 0.8 && rand(s) < 0.55) startEncounter(s, 'pirate', 'mining');
}

// ───────────────────────────── Ship tick ─────────────────────────────
function shipTick(s: GameState, dt: number): void {
  const st = shipStats(s);
  const m = getMods(s);
  const g = getGalaxy(s.seed);
  if (s.combat || s.event) return;
  s.ship.energy = Math.min(st.energyMax, s.ship.energy + st.energyRegen * dt);
  s.ship.shield = Math.min(st.shieldMax, s.ship.shield + st.shieldMax * 0.04 * dt);
  s.ship.hull = Math.min(st.hullMax, s.ship.hull + m.hullRegen * dt);
  const a = s.activity;
  switch (a.type) {
    case 'mining': {
      const body = g.bodies.get(a.bodyId);
      if (!body || body.sysId !== s.location) {
        s.activity = { type: 'idle' };
        break;
      }
      a.pulseCd = Math.max(0, a.pulseCd - dt);
      if (a.overheated) {
        if (s.ship.energy >= 15) a.overheated = false;
        else break;
      }
      const drain = st.mineDrain * dt;
      if (s.ship.energy < drain) {
        s.ship.energy = 0;
        a.overheated = true;
        toast('Laser overheated - recharging...', 'info');
        break;
      }
      const space = st.cargoCap - cargoUsed(s);
      if (space <= 1e-9) {
        onCargoFull(s);
        break;
      }
      s.ship.energy -= drain;
      const rates = miningRates(s, body);
      let total = 0;
      for (const r of MINEABLE) total += rates[r] * dt;
      const scale = total > space ? space / total : 1;
      for (const r of MINEABLE) {
        const v = rates[r] * dt * scale;
        if (v <= 0) continue;
        s.cargo[r] += v;
        s.stats.mined[r] += v;
        s.stats.minedTotal += v;
        track(s, { t: 'mine', res: r, n: v });
        fxAcc[r] = (fxAcc[r] ?? 0) + v;
        if (fxAcc[r] >= 1) {
          fxGain(r, Math.floor(fxAcc[r]));
          fxAcc[r] -= Math.floor(fxAcc[r]);
        }
      }
      if (st.cargoCap - cargoUsed(s) <= 1e-9) onCargoFull(s);
      s.hazardCd -= dt;
      if (s.hazardCd <= 0) rollHazard(s);
      break;
    }
    case 'scanning': {
      a.t += dt;
      if (a.t >= a.dur) completeScan(s);
      break;
    }
    case 'investigating': {
      a.t += dt;
      if (a.t >= a.dur) finishInvestigation(s, a.poiId);
      break;
    }
    case 'traveling': {
      a.t += dt;
      if (a.t >= a.dur) arrive(s, a.to);
      break;
    }
    default:
      break;
  }
}

function onCargoFull(s: GameState): void {
  if (s.autoUnload && hasTech(s, 'A1') && canDock(s)) {
    const r = unloadCargo(s);
    if (r.moved > 0 && r.left <= 0.0001) {
      sfx('sell');
      return; // keep mining
    }
  }
  s.activity = { type: 'idle' };
  toast('Cargo hold full - unload at a dock or upgrade your hold.', 'info');
  sfx('error');
}

function completeScan(s: GameState): void {
  const g = getGalaxy(s.seed);
  const sys = currentSystem(s);
  const st = shipStats(s);
  const prev = s.scanPower[sys.id] ?? 0;
  s.scanPower[sys.id] = Math.max(prev, st.scan);
  s.stats.scans++;
  let newBodies = 0;
  let credits = 0;
  for (const b of sys.bodies) {
    if (b.difficulty <= s.scanPower[sys.id] && !s.revealedBodies[b.id]) {
      s.revealedBodies[b.id] = true;
      newBodies++;
      s.stats.bodiesRevealed++;
      credits += Math.round(25 * (1 + sys.sector) * rewardMult(s));
      if (b.unusual) {
        s.stats.discoveries++;
        credits += Math.round(200 * (1 + sys.sector) * rewardMult(s));
        addCodex(s, b.codex);
        toast(`Unusual world discovered: ${b.name}`, 'loot');
        sfx('discover');
      }
    }
  }
  if (credits > 0) addCredits(s, credits);
  s.activity = { type: 'idle' };
  if (newBodies > 0) track(s, { t: 'scanBodies', n: newBodies });
  track(s, { t: 'scan' });
  const m = getMods(s);
  const signals = sys.pois.filter((p) => !s.poisDone[p.id] && p.difficulty - m.poiScan <= s.scanPower[sys.id]).length;
  const msg = newBodies > 0 || signals > 0 ? `Scan complete: ${newBodies} new bod${newBodies === 1 ? 'y' : 'ies'}${credits ? `, +${credits} credits` : ''}${signals ? `, ${signals} point${signals === 1 ? '' : 's'} of interest` : ''}.` : 'Scan complete: nothing new. A stronger scanner may reveal more.';
  toast(msg, newBodies > 0 ? 'good' : 'info');
  pushLog(s, msg);
  sfx('scan');
  void g;
}

function finishInvestigation(s: GameState, poiId: string): void {
  const poi = getGalaxy(s.seed).pois.get(poiId);
  s.activity = { type: 'idle' };
  if (!poi || s.poisDone[poiId]) return;
  const m = getMods(s);
  if (poi.risk.kind === 'guard') {
    startEncounter(s, 'guardian', 'poi', { forced: true, poiId });
    return;
  }
  if (poi.risk.kind === 'hazard') {
    s.event = {
      kind: 'anomaly', severity: (22 + 12 * poi.risk.level) * m.hazard, poiId,
      title: poi.kind === 'anomaly' ? 'Unstable Anomaly' : 'Defensive Surge',
      text: `${poi.name} is releasing dangerous energy. Brace with shields, push through the surge, or back away.`,
    };
    sfx('alert');
    return;
  }
  completePoi(s, poi);
}

function arrive(s: GameState, to: string): void {
  const g = getGalaxy(s.seed);
  const sys = g.byId.get(to);
  s.activity = { type: 'idle' };
  if (!sys) return;
  s.location = to;
  const first = !s.visited[to];
  s.visited[to] = true;
  s.stats.jumps++;
  const st = shipStats(s);
  s.scanPower[to] = Math.max(s.scanPower[to] ?? 0, st.scan * 0.55);
  // passive scan reveals the easiest bodies
  for (const b of sys.bodies) {
    if (b.difficulty <= s.scanPower[to] && !s.revealedBodies[b.id]) {
      s.revealedBodies[b.id] = true;
      s.stats.bodiesRevealed++;
    }
  }
  recomputeDetected(s);
  track(s, { t: 'jump' });
  sfx('jump');
  if (first) {
    const credits = Math.round(60 * (1 + sys.sector) * rewardMult(s));
    addCredits(s, credits);
    track(s, { t: 'visit' });
    toast(`Arrived at ${sys.name}: first visit bonus +${credits} credits`, 'good');
  } else {
    toast(`Arrived at ${sys.name}`, 'info');
  }
  if (s.stats.jumps >= 3 && rand(s) < 0.02 + sys.danger * 0.06) startEncounter(s, rand(s) < 0.4 ? 'drone' : 'pirate', 'travel');
}

// ───────────────────────────── Economy / automation ─────────────────────────────
export function sellResource(s: GameState, r: ResId, qty: number): { gross: number; net: number } {
  const have = s.res[r];
  const q = Math.max(0, Math.min(qty, have));
  if (q <= 0) return { gross: 0, net: 0 };
  const quote = quoteSale(s, r, q);
  s.res[r] = Math.max(0, have - q);
  s.market[r].mult = Math.max(0.35, quote.newMult);
  addCredits(s, quote.net, true);
  s.stats.sold += q;
  track(s, { t: 'sell', credits: quote.net });
  return { gross: quote.gross, net: quote.net };
}

export function economyTick(s: GameState, dt: number): void {
  const m = getMods(s);
  const pw = powerInfo(s);
  let paid = 1;
  const upkeep = upkeepPerSec(s) * dt;
  if (upkeep > 0) {
    if (s.credits >= upkeep) s.credits -= upkeep;
    else {
      s.credits = 0;
      paid = 0.35;
    }
  }
  // automated mining
  for (const sysId of Object.keys(s.installs)) {
    const { rates } = systemRates(s, sysId);
    for (const r of MINEABLE) {
      const v = rates[r] * dt * paid;
      if (v <= 0) continue;
      const added = addRes(s, r, v);
      if (added > 0) {
        s.stats.mined[r] += added;
        s.stats.minedTotal += added;
        track(s, { t: 'mine', res: r, n: added });
      }
    }
  }
  // research
  const cur = s.research.current;
  if (cur) {
    const t = TECH_BY_ID[cur.id];
    if (!t) s.research.current = null;
    else {
      const speed = (1 + 0.25 * s.counts.lab * (1 + 0.2 * s.autoLevels.lab)) * m.research * pw.eff * (s.counts.lab > 0 ? paid : 1);
      cur.progress += dt * speed;
      if (cur.progress >= t.time) {
        s.research.current = null;
        if (!s.research.done.includes(t.id)) {
          s.research.done.push(t.id);
          s.stats.researchDone++;
        }
        track(s, { t: 'research' });
        recomputeDetected(s);
        toast(`Research complete: ${t.name}`, 'good');
        pushLog(s, `Research complete: ${t.name}`, 'good');
        sfx('research');
      }
    }
  }
  // refineries
  const speed = m.refine * pw.eff * paid * autoMult(s, 'refinery');
  for (const rf of s.refineries) {
    if (!rf.recipe) {
      rf.busy = false;
      rf.progress = 0;
      continue;
    }
    const rec = RECIPES[rf.recipe];
    if (rec.unlock && !hasTech(s, rec.unlock)) {
      rf.recipe = null;
      continue;
    }
    let budget = dt * speed;
    let guard = 0;
    while (budget > 0 && guard++ < 500) {
      if (!rf.busy) {
        const room = s.res[rec.id] < Math.floor(400 * m.storage) - 0.5 + 0 || true;
        const ok = (Object.keys(rec.inputs) as ResId[]).every((k) => s.res[k] + 1e-9 >= (rec.inputs[k] as number));
        if (!ok || !room || s.res[rec.id] >= storageRoomFor(s, rec.id)) break;
        for (const k of Object.keys(rec.inputs) as ResId[]) s.res[k] = Math.max(0, s.res[k] - (rec.inputs[k] as number));
        rf.busy = true;
        rf.progress = 0;
      }
      const need = rec.time - rf.progress;
      if (budget >= need) {
        budget -= need;
        rf.progress = 0;
        rf.busy = false;
        const added = addRes(s, rec.id, 1);
        if (added > 0) {
          s.stats.crafted[rec.id] += 1;
          s.stats.craftedTotal += 1;
          track(s, { t: 'craft', res: rec.id, n: 1 });
        }
      } else {
        rf.progress += budget;
        budget = 0;
      }
    }
  }
  // cargo vessels auto-sell
  if (s.counts.vessel > 0) {
    let cap = s.counts.vessel * 2 * m.haul * autoMult(s, 'vessel') * pw.eff * paid * dt;
    const order = ALL_RES.filter((r) => s.autoSell[r].on).sort((a, b) => RES[b].price - RES[a].price);
    for (const r of order) {
      if (cap <= 1e-9) break;
      const avail = Math.max(0, s.res[r] - s.autoSell[r].keep);
      const q = Math.min(avail, cap);
      if (q > 1e-6) {
        sellResource(s, r, q);
        cap -= q;
      }
    }
  }
  // market drift
  s.marketTimer -= dt;
  let guard = 0;
  while (s.marketTimer <= 0 && guard++ < 2000) {
    s.marketTimer += 25;
    for (const r of ALL_RES) {
      const mk = s.market[r];
      mk.target = clamp(mk.target + (rand(s) - 0.5) * 0.12 + (1 - mk.target) * 0.1, 0.8, 1.3);
    }
  }
  const k = 1 - Math.exp(-0.012 * dt);
  for (const r of ALL_RES) {
    const mk = s.market[r];
    mk.mult += (mk.target - mk.mult) * k;
  }
}

function storageRoomFor(s: GameState, r: ResId): number {
  // identical to storageCap but kept local to avoid a circular helper import in hot path
  const m = getMods(s);
  const stations = ownedCount(s, 'station');
  const info = RES[r];
  const base = r === 'exotic' ? 500 + stations * 100 : info.crafted ? 400 + stations * 100 : 2000 + stations * 600;
  return Math.floor(base * m.storage);
}

// ───────────────────────────── Master tick ─────────────────────────────
export function tick(s: GameState, dt: number): void {
  s.playTime += dt;
  economyTick(s, dt);
  shipTick(s, dt);
}

/** Cheap, once-per-second housekeeping. */
export function housekeeping(s: GameState): void {
  advanceGuide(s);
  checkAchievements(s);
  advanceGuide(s);
  if (s.missions.board.length < 5) refillBoard(s);
  const st = shipStats(s);
  s.ship.hull = clamp(s.ship.hull, 0, st.hullMax);
  s.ship.shield = clamp(s.ship.shield, 0, st.shieldMax);
  s.ship.energy = clamp(s.ship.energy, 0, st.energyMax);
}

// ───────────────────────────── Offline ─────────────────────────────
export interface OfflineReport {
  seconds: number;
  capped: boolean;
  credits: number;
  res: Partial<Record<ResId, number>>;
  research: string[];
  crafted: number;
}

export function simulateOffline(s: GameState, seconds: number): OfflineReport {
  const m = getMods(s);
  const maxSec = m.offlineHours * 3600;
  const eff = Math.max(0, Math.min(seconds, maxSec));
  const report: OfflineReport = { seconds: eff, capped: seconds > maxSec, credits: 0, res: {}, research: [], crafted: 0 };
  if (eff < 30) return report;
  const beforeRes = { ...s.res };
  const beforeCredits = s.credits;
  const beforeDone = new Set(s.research.done);
  const beforeCrafted = s.stats.craftedTotal;
  const steps = Math.min(2000, Math.max(1, Math.ceil(eff / 10)));
  const dt = eff / steps;
  for (let i = 0; i < steps; i++) economyTick(s, dt);
  s.stats.offlineSeconds += eff;
  report.credits = Math.round(s.credits - beforeCredits);
  for (const r of ALL_RES) {
    const d = Math.floor(s.res[r] - beforeRes[r]);
    if (d !== 0) report.res[r] = d;
  }
  report.research = s.research.done.filter((id) => !beforeDone.has(id));
  report.crafted = s.stats.craftedTotal - beforeCrafted;
  return report;
}

export { applyDamage, handleDisabled };
export { currentSystem };
