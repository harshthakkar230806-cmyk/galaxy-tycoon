import {
  BUILDINGS, MINEABLE, RECIPES, RES, SHIPS, TECH_BY_ID, UPGRADES, MEGAPROJECT,
  type BuildingId, type CraftRes, type MineRes, type ResId, type ShipId, type UpgradeId,
} from './data';
import { dist, getGalaxy } from './galaxy';
import { sfx, toast } from './events';
import { track } from './track';
import {
  AUTO_MAX, addCredits, addRes, autoUpgradeCost, buildingCost, canAfford, canDock, cargoUsed, currentSystem, getMods, hasTech,
  missingFor, pushLog, quoteBuy, recomputeDetected, sectorUnlocked, shipStats, spend, storageCap, upgradeCost,
  type AutoType, type GameState,
} from './state';
import { sellResource, unloadCargo } from './sim';
import { startEncounter } from './combat';
import { completePoi } from './world';

export interface Result { ok: boolean; msg: string }
const fail = (msg: string): Result => {
  sfx('error');
  return { ok: false, msg };
};
const ok = (msg: string, sound: Parameters<typeof sfx>[0] = 'click'): Result => {
  sfx(sound);
  return { ok: true, msg };
};
const busy = (s: GameState) => !!s.combat || !!s.event;

// ───────────────────────────── Mining ─────────────────────────────
export function startMining(s: GameState, bodyId: string): Result {
  if (busy(s)) return fail('Resolve the current encounter first.');
  if (s.activity.type === 'traveling') return fail('You cannot mine while in transit.');
  const body = getGalaxy(s.seed).bodies.get(bodyId);
  if (!body || body.sysId !== s.location) return fail('That body is not in this system.');
  if (!s.revealedBodies[bodyId]) return fail('Scan the system to reveal this body first.');
  if (cargoUsed(s) >= shipStats(s).cargoCap - 1e-9) return fail('Cargo hold is full. Unload at a dock first.');
  if (s.ship.energy < 5) return fail('Not enough energy. Wait for the reactor to recharge.');
  s.activity = { type: 'mining', bodyId, overheated: false, pulseCd: 0 };
  return ok(`Mining ${body.name}.`, 'mine');
}
export function stopActivity(s: GameState): Result {
  if (s.activity.type === 'traveling') return fail('Cannot abort a jump in progress.');
  s.activity = { type: 'idle' };
  return ok('Stopped.');
}

/** Pulse Burst: instant bonus yield for energy, with a cooldown. */
export function pulseBurst(s: GameState): Result {
  const a = s.activity;
  if (busy(s)) return fail('Resolve the current encounter first.');
  if (a.type !== 'mining') return fail('Start mining first.');
  if (a.pulseCd > 0) return fail('Pulse Burst is recharging.');
  const st = shipStats(s);
  const cost = 12 * st.energyMult;
  if (s.ship.energy < cost) return fail(`Not enough energy (${Math.ceil(cost)} needed).`);
  const body = getGalaxy(s.seed).bodies.get(a.bodyId);
  if (!body) return fail('No target.');
  const space = st.cargoCap - cargoUsed(s);
  if (space < 1) return fail('Cargo hold is full.');
  s.ship.energy -= cost;
  a.pulseCd = 4;
  s.stats.pulses++;
  const mult = (s.ship.active === 'miner' ? 1.3 : 1) * 9;
  let total = 0;
  const gains: Partial<Record<MineRes, number>> = {};
  for (const r of MINEABLE) {
    const eff = Math.pow(Math.min(1, st.laser / RES[r].hardness), 1.2);
    const v = 1.4 * st.laser * body.richness * body.weights[r] * eff * mult;
    gains[r] = v;
    total += v;
  }
  const scale = total > space ? space / total : 1;
  for (const r of MINEABLE) {
    const v = (gains[r] ?? 0) * scale;
    if (v <= 0) continue;
    s.cargo[r] += v;
    s.stats.mined[r] += v;
    s.stats.minedTotal += v;
    track(s, { t: 'mine', res: r, n: v });
  }
  return ok('Pulse Burst!', 'pulse');
}

export function unload(s: GameState): Result {
  if (!canDock(s)) return fail('No dock here. Return to Aurelia, a hub system, or build a Mining Station.');
  if (cargoUsed(s) <= 0) return fail('Your cargo hold is empty.');
  const r = unloadCargo(s);
  if (r.moved <= 0) return fail('Your warehouse is full for those resources. Sell or craft some stock.');
  return ok(r.left > 0 ? `Unloaded ${Math.floor(r.moved)} units. Some cargo did not fit in the warehouse.` : `Unloaded ${Math.floor(r.moved)} units to the warehouse.`, 'sell');
}

// ───────────────────────────── Scanning / exploring ─────────────────────────────
export function startScan(s: GameState): Result {
  if (busy(s)) return fail('Resolve the current encounter first.');
  if (s.activity.type !== 'idle' && s.activity.type !== 'mining') return fail('Your ship is busy.');
  const cost = 10 * shipStats(s).energyMult;
  if (s.ship.energy < cost) return fail(`Not enough energy (${Math.ceil(cost)} needed).`);
  s.ship.energy -= cost;
  s.activity = { type: 'scanning', t: 0, dur: 4 };
  return ok('Scanning...', 'scan');
}

export function investigate(s: GameState, poiId: string): Result {
  if (busy(s)) return fail('Resolve the current encounter first.');
  if (s.activity.type === 'traveling' || s.activity.type === 'scanning') return fail('Your ship is busy.');
  const poi = getGalaxy(s.seed).pois.get(poiId);
  if (!poi || poi.sysId !== s.location) return fail('That signal is not in this system.');
  if (s.poisDone[poiId]) return fail('Already investigated.');
  const m = getMods(s);
  const power = s.scanPower[s.location] ?? 0;
  if (poi.difficulty - m.poiScan > power) return fail('Signal too faint. Upgrade your scanner and scan again.');
  const cost = 15 * shipStats(s).energyMult;
  if (s.ship.energy < cost) return fail(`Not enough energy (${Math.ceil(cost)} needed).`);
  s.ship.energy -= cost;
  s.activity = { type: 'investigating', poiId, t: 0, dur: 5 };
  return ok(`Investigating ${poi.name}...`, 'scan');
}

export function patrol(s: GameState): Result {
  if (busy(s)) return fail('Resolve the current encounter first.');
  if (s.activity.type === 'traveling') return fail('Your ship is busy.');
  const cost = 12 * shipStats(s).energyMult;
  if (s.ship.energy < cost) return fail(`Not enough energy (${Math.ceil(cost)} needed).`);
  if (s.ship.hull < shipStats(s).hullMax * 0.25) return fail('Hull too damaged to patrol. Repair first.');
  s.ship.energy -= cost;
  startEncounter(s, 'pirate', 'patrol');
  return ok('Scanning for hostiles...', 'alert');
}

// ───────────────────────────── Travel ─────────────────────────────
export function jumpCost(s: GameState, toId: string): { distance: number; energy: number; time: number; ok: boolean; reason: string } {
  const g = getGalaxy(s.seed);
  const from = currentSystem(s);
  const to = g.byId.get(toId);
  const st = shipStats(s);
  if (!to) return { distance: 0, energy: 0, time: 0, ok: false, reason: 'Unknown system' };
  const d = dist(from, to);
  const energy = Math.ceil(Math.max(5, d * st.jumpPerLy));
  const time = Math.max(2, (3 + d * 0.35) / st.speed);
  let reason = '';
  if (to.id === from.id) reason = 'You are already here.';
  else if (!s.detected[to.id]) reason = 'System not detected yet.';
  else if (!sectorUnlocked(s, to.sector)) reason = `Sector locked: research the next Exploration technology to open ${['', 'the Inner Reach', 'the Nebula Belt', 'the Deep Void', 'the Galactic Core'][to.sector]}.`;
  else if (d > st.jumpRange + 1e-9) reason = `Out of range (${d.toFixed(0)} ly, max ${st.jumpRange.toFixed(0)}). Upgrade your Jump Drive.`;
  else if (s.ship.energy + 1e-9 < energy) reason = `Not enough energy (${energy} needed).`;
  return { distance: d, energy, time, ok: reason === '', reason };
}

export function jumpTo(s: GameState, toId: string): Result {
  if (busy(s)) return fail('Resolve the current encounter first.');
  if (s.activity.type === 'traveling') return fail('Already in transit.');
  if (s.activity.type === 'scanning' || s.activity.type === 'investigating') return fail('Your ship is busy.');
  const c = jumpCost(s, toId);
  if (!c.ok) return fail(c.reason);
  s.ship.energy -= c.energy;
  s.activity = { type: 'traveling', from: s.location, to: toId, t: 0, dur: c.time };
  return ok('Jump drive engaged.', 'jump');
}

// ───────────────────────────── Ship upgrades and ships ─────────────────────────────
export function upgradeLevelCap(s: GameState): number {
  return getMods(s).upgradeCap;
}
export function buyUpgrade(s: GameState, id: UpgradeId): Result {
  const L = s.upgrades[id];
  if (L >= upgradeLevelCap(s)) return fail('Maximum level for your current technology. Research Engineering to raise the cap.');
  const c = upgradeCost(s, id);
  if (!canAfford(s, c)) return fail(`Missing: ${missingFor(s, c).join(', ')}`);
  spend(s, c);
  s.upgrades[id]++;
  s.stats.upgradesBought++;
  const st = shipStats(s);
  // new capacity is granted immediately where it makes sense
  if (id === 'reactor') s.ship.energy = Math.min(st.energyMax, s.ship.energy + 20);
  if (id === 'shield') s.ship.shield = Math.min(st.shieldMax, s.ship.shield + st.shieldMax * 0.3);
  pushLog(s, `${UPGRADES[id].name} upgraded to level ${s.upgrades[id]}`, 'good');
  return ok(`${UPGRADES[id].name} is now level ${s.upgrades[id]}.`, 'upgrade');
}

export function shipRequirementMet(s: GameState, id: ShipId): { ok: boolean; reason: string } {
  const r = SHIPS[id].requires;
  if (!r) return { ok: true, reason: '' };
  if (r.tech && !hasTech(s, r.tech)) return { ok: false, reason: r.label };
  if (r.kills && s.stats.kills < r.kills) return { ok: false, reason: `Defeat ${r.kills} hostiles (${s.stats.kills}/${r.kills})` };
  return { ok: true, reason: '' };
}

export function buyShip(s: GameState, id: ShipId): Result {
  if (s.ship.owned.includes(id)) return fail('You already own this ship.');
  const req = shipRequirementMet(s, id);
  if (!req.ok) return fail(`Locked: ${req.reason}`);
  const c = SHIPS[id].cost;
  if (!canAfford(s, c)) return fail(`Missing: ${missingFor(s, c).join(', ')}`);
  spend(s, c);
  s.ship.owned.push(id);
  s.stats.shipsBought++;
  pushLog(s, `Purchased ${SHIPS[id].name}`, 'good');
  return ok(`${SHIPS[id].name} purchased!`, 'upgrade');
}

export function switchShip(s: GameState, id: ShipId): Result {
  if (!s.ship.owned.includes(id)) return fail('You do not own this ship.');
  if (s.ship.active === id) return fail('Already flying this ship.');
  if (busy(s) || s.activity.type !== 'idle') return fail('Finish what you are doing first.');
  if (!canDock(s)) return fail('You must be docked to change ships.');
  const wasFull = cargoUsed(s);
  if (wasFull > 0) unloadCargo(s);
  if (cargoUsed(s) > 0) return fail('Unload your cargo first - the warehouse is full.');
  s.ship.active = id;
  const st = shipStats(s);
  s.ship.hull = st.hullMax;
  s.ship.shield = st.shieldMax;
  s.ship.energy = Math.min(s.ship.energy, st.energyMax);
  recomputeDetected(s);
  return ok(`Now flying the ${SHIPS[id].name}.`, 'upgrade');
}

export function repairCost(s: GameState): number {
  const st = shipStats(s);
  return Math.ceil(Math.max(0, st.hullMax - s.ship.hull) * 0.6);
}
export function repairShip(s: GameState): Result {
  if (!canDock(s)) return fail('You must be docked to repair.');
  const cost = repairCost(s);
  const st = shipStats(s);
  if (cost <= 0 && s.ship.shield >= st.shieldMax) return fail('Your ship is in perfect condition.');
  if (s.credits < cost) return fail(`Repairs cost ${cost} credits.`);
  s.credits -= cost;
  s.ship.hull = st.hullMax;
  s.ship.shield = st.shieldMax;
  return ok(cost > 0 ? `Repaired for ${cost} credits.` : 'Shields restored.', 'upgrade');
}

// ───────────────────────────── Automation / buildings ─────────────────────────────
export function buildingStatus(s: GameState, id: BuildingId, sysId: string): { ok: boolean; reason: string } {
  const b = BUILDINGS[id];
  if (!hasTech(s, b.unlock)) return { ok: false, reason: `Requires ${TECH_BY_ID[b.unlock!]?.name ?? b.unlock}` };
  if (b.perSystem !== null) {
    const here = s.installs[sysId];
    const n = here ? (here as unknown as Record<string, number>)[id] : 0;
    if (n >= b.perSystem) return { ok: false, reason: `Max ${b.perSystem} per system` };
    if (id === 'station' || id === 'drone' || id === 'minerShip') {
      const sys = getGalaxy(s.seed).byId.get(sysId);
      if (!sys || !sys.bodies.some((x) => s.revealedBodies[x.id])) return { ok: false, reason: 'Scan this system to reveal a body first' };
    }
  }
  return { ok: true, reason: '' };
}

export function build(s: GameState, id: BuildingId, sysId?: string): Result {
  const sid = sysId ?? s.location;
  if (!getGalaxy(s.seed).byId.has(sid)) return fail('Unknown system.');
  const st = buildingStatus(s, id, sid);
  if (!st.ok) return fail(st.reason);
  const needsSystem = id === 'drone' || id === 'minerShip' || id === 'station';
  if (needsSystem && sid !== s.location) return fail('You must be in the system to build there.');
  const c = buildingCost(s, id);
  if (!canAfford(s, c)) return fail(`Missing: ${missingFor(s, c).join(', ')}`);
  spend(s, c);
  if (needsSystem) {
    const inst = (s.installs[sid] ??= { drone: 0, minerShip: 0, station: 0, focus: null });
    inst[id]++;
  } else if (id === 'refinery') {
    s.refineries.push({ recipe: null, busy: false, progress: 0 });
  } else {
    s.counts[id as 'vessel' | 'lab' | 'solar' | 'fusion' | 'antimatter']++;
  }
  s.stats.built[id]++;
  track(s, { t: 'build', id });
  pushLog(s, `Built ${BUILDINGS[id].name}`, 'good');
  return ok(`${BUILDINGS[id].name} built.`, 'upgrade');
}

export function setFocus(s: GameState, sysId: string, bodyId: string | null): Result {
  const inst = s.installs[sysId];
  if (!inst) return fail('No automation in that system.');
  inst.focus = bodyId;
  return ok('Focus updated.');
}

export function upgradeAuto(s: GameState, t: AutoType): Result {
  if (s.autoLevels[t] >= AUTO_MAX) return fail('Already at maximum efficiency.');
  const c = autoUpgradeCost(s, t);
  if (!canAfford(s, c)) return fail(`Missing: ${missingFor(s, c).join(', ')}`);
  spend(s, c);
  s.autoLevels[t]++;
  return ok('Efficiency upgraded.', 'upgrade');
}

export function setRefineryRecipe(s: GameState, i: number, r: CraftRes | null): Result {
  const rf = s.refineries[i];
  if (!rf) return fail('No such refinery.');
  if (r) {
    const rec = RECIPES[r];
    if (rec.unlock && !hasTech(s, rec.unlock)) return fail(`Requires ${TECH_BY_ID[rec.unlock].name}`);
  }
  if (rf.recipe !== r) {
    rf.recipe = r;
    rf.busy = false;
    rf.progress = 0;
  }
  return ok(r ? `Refinery set to ${RES[r].name}.` : 'Refinery idle.');
}

export function setAutoSell(s: GameState, r: ResId, on: boolean, keep?: number): Result {
  s.autoSell[r].on = on;
  if (keep !== undefined && isFinite(keep)) s.autoSell[r].keep = Math.max(0, Math.floor(keep));
  return ok('Auto-sell updated.');
}

// ───────────────────────────── Market / crafting ─────────────────────────────
export function sell(s: GameState, r: ResId, qty: number): Result {
  const q = Math.floor(qty);
  if (!(q > 0)) return fail('Enter a positive quantity.');
  if (s.res[r] < 1) return fail(`You have no ${RES[r].name} to sell.`);
  const n = Math.min(q, Math.floor(s.res[r]));
  const out = sellResource(s, r, n);
  return ok(`Sold ${n} ${RES[r].name} for ${Math.round(out.net)} credits.`, 'sell');
}

export function buy(s: GameState, r: ResId, qty: number): Result {
  if (!RES[r].buyable) return fail(`${RES[r].name} is not sold on the market.`);
  const q = Math.floor(qty);
  if (!(q > 0)) return fail('Enter a positive quantity.');
  const room = Math.floor(storageCap(s, r) - s.res[r]);
  if (room < 1) return fail('Your warehouse is full for that resource.');
  const n = Math.min(q, room);
  const quote = quoteBuy(s, r, n);
  if (s.credits < quote.cost) return fail(`That costs ${quote.cost} credits.`);
  s.credits -= quote.cost;
  s.res[r] += n;
  s.market[r].mult = quote.newMult;
  return ok(`Bought ${n} ${RES[r].name} for ${quote.cost} credits.`, 'buy');
}

export function craft(s: GameState, r: CraftRes, count = 1): Result {
  const rec = RECIPES[r];
  if (rec.unlock && !hasTech(s, rec.unlock)) return fail(`Requires ${TECH_BY_ID[rec.unlock].name}`);
  const n = Math.max(1, Math.floor(count));
  let made = 0;
  for (let i = 0; i < n; i++) {
    if (!(Object.keys(rec.inputs) as ResId[]).every((k) => s.res[k] + 1e-9 >= (rec.inputs[k] as number))) break;
    if (storageCap(s, r) - s.res[r] < 1) break;
    for (const k of Object.keys(rec.inputs) as ResId[]) s.res[k] = Math.max(0, s.res[k] - (rec.inputs[k] as number));
    addRes(s, r, 1);
    s.stats.crafted[r]++;
    s.stats.craftedTotal++;
    made++;
  }
  if (made === 0) return fail('Missing ingredients or no warehouse space.');
  track(s, { t: 'craft', res: r, n: made });
  return ok(`Fabricated ${made} ${RES[r].name}.`, 'upgrade');
}

// ───────────────────────────── Research ─────────────────────────────
export function techStatus(s: GameState, id: string): { state: 'done' | 'active' | 'available' | 'locked'; reasons: string[] } {
  const t = TECH_BY_ID[id];
  if (s.research.done.includes(id)) return { state: 'done', reasons: [] };
  if (s.research.current?.id === id) return { state: 'active', reasons: [] };
  const reasons: string[] = [];
  for (const p of t.prereq) if (!s.research.done.includes(p)) reasons.push(`Requires ${TECH_BY_ID[p].name}`);
  if (t.labs && s.counts.lab < t.labs) reasons.push(`Requires ${t.labs} research lab${t.labs > 1 ? 's' : ''} (have ${s.counts.lab})`);
  if (t.discoveries && s.stats.discoveries < t.discoveries) reasons.push(`Requires ${t.discoveries} discoveries (have ${s.stats.discoveries})`);
  return { state: reasons.length ? 'locked' : 'available', reasons };
}

export function startResearch(s: GameState, id: string): Result {
  const t = TECH_BY_ID[id];
  if (!t) return fail('Unknown technology.');
  if (s.research.current) return fail('Another project is already in progress.');
  const st = techStatus(s, id);
  if (st.state === 'done') return fail('Already researched.');
  if (st.state === 'locked') return fail(st.reasons[0]);
  const c = { credits: t.credits, res: t.res };
  if (!canAfford(s, c)) return fail(`Missing: ${missingFor(s, c).join(', ')}`);
  spend(s, c);
  s.research.current = { id, progress: 0 };
  return ok(`Researching ${t.name}.`, 'research');
}

export function cancelResearch(s: GameState): Result {
  if (!s.research.current) return fail('Nothing to cancel.');
  const t = TECH_BY_ID[s.research.current.id];
  // 50% refund
  addCredits(s, Math.floor(t.credits * 0.5));
  for (const k of Object.keys(t.res) as ResId[]) addRes(s, k, Math.floor((t.res[k] as number) * 0.5));
  s.research.current = null;
  return ok('Research cancelled. 50% of the cost was refunded.');
}

// ───────────────────────────── Events ─────────────────────────────
import { applyDamage, handleDisabled } from './world';

export function resolveEvent(s: GameState, choice: 'shield' | 'push' | 'retreat'): Result {
  const ev = s.event;
  if (!ev) return fail('No event.');
  const st = shipStats(s);
  let dmg = ev.severity;
  let msg = '';
  if (choice === 'shield') {
    const cost = 15 * st.energyMult;
    if (s.ship.energy < cost) return fail(`Not enough energy (${Math.ceil(cost)} needed).`);
    s.ship.energy -= cost;
    dmg *= 0.35;
    msg = 'Shields held against the worst of it.';
  } else if (choice === 'retreat') {
    dmg *= 0.6;
    msg = 'You retreat, taking glancing hits.';
  } else {
    msg = 'You push through!';
  }
  const poiId = ev.poiId;
  const kind = ev.kind;
  s.event = null;
  const dead = applyDamage(s, dmg);
  if (kind === 'storm') {
    s.stats.storms++;
    if (choice === 'retreat') s.activity = { type: 'idle' };
  }
  if (dead) {
    handleDisabled(s, kind === 'storm' ? 'The storm tore your ship apart.' : 'The surge overwhelmed your ship.');
    return { ok: true, msg: 'Disabled.' };
  }
  if (poiId && choice !== 'retreat') {
    const poi = getGalaxy(s.seed).pois.get(poiId);
    if (poi) completePoi(s, poi);
  }
  toast(`${msg} Took ${Math.round(dmg)} damage.`, choice === 'push' ? 'bad' : 'info');
  sfx('hit');
  return { ok: true, msg };
}

// ───────────────────────────── Megaproject ─────────────────────────────
export function megaCost(s: GameState) {
  const st = MEGAPROJECT[s.mega];
  return st ? { credits: st.credits, res: st.res } : null;
}
export function buildMegaStage(s: GameState): Result {
  if (!hasTech(s, 'L5')) return fail('Research Stellar Gateway Theory first.');
  const c = megaCost(s);
  if (!c) return fail('The Gateway is complete.');
  if (!canAfford(s, c)) return fail(`Missing: ${missingFor(s, c).join(', ')}`);
  spend(s, c);
  s.mega++;
  if (s.mega >= MEGAPROJECT.length) {
    s.victory = true;
    toast('The Stellar Gateway ignites! You have won - the galaxy is yours. Keep playing in sandbox.', 'good');
  }
  return ok('Stage complete!', 'achievement');
}

