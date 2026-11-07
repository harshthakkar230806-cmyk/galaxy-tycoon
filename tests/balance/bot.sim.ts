import 'fake-indexeddb/auto';
import { it } from 'vitest';
import { createState, shipStats, cargoUsed, upgradeCost, canAfford, buildingCost, powerInfo, ownedCount, canDock, type GameState } from '../../src/game/state';
import { getGalaxy, dist } from '../../src/game/galaxy';
import { tick, housekeeping } from '../../src/game/sim';
import * as A from '../../src/game/actions';
import { combatAction, closeCombat } from '../../src/game/combat';
import { acceptMission, claimMission, refillBoard } from '../../src/game/missions';
import { UPGRADE_ORDER, ALL_RES, TECHS, BUILDINGS, RECIPES, SHIP_ORDER, type ResId, type BuildingId } from '../../src/game/data';

const HOURS = Number(process.env.BOT_HOURS ?? 30);
const seed = Number(process.env.BOT_SEED ?? 20240611);

it('bot plays the whole game', () => {
  const st: GameState = createState(seed, 'campaign', 1);
  const g = getGalaxy(seed);
  const home = g.homeId;
  for (const b of g.byId.get(home)!.bodies) st.revealedBodies[b.id] = true;
  const log: string[] = [];
  let T = 0;
  const step = (sec: number) => { for (let t = 0; t < sec; t += 0.5) { tick(st, 0.5); } housekeeping(st); T += sec; };
  const fmt = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
  const stamp = () => `${(T / 3600).toFixed(2)}h`;
  const milestones = new Set<string>();
  const mark = (k: string, cond: boolean) => { if (cond && !milestones.has(k)) { milestones.add(k); log.push(`${stamp()} ${k}`); } };
  let lastReport = 0, lastEarned = 0;
  const KEEP: Partial<Record<ResId, number>> = { iron: 600, copper: 400, ice: 400, titanium: 400, crystal: 400, rare: 1e9, exotic: 1e9, alloy: 1e9, circuits: 1e9, cells: 1e9, nanites: 1e9, warpcore: 1e9 };
  const visitedSystems = () => Object.keys(st.visited);
  let route: string | null = null;
  let guardFights = 0;

  const fightIfNeeded = () => {
    let guard = 0;
    while (st.combat && guard++ < 200) {
      const c = st.combat;
      if (c.phase === 'alert') { combatAction(st, 'engage'); continue; }
      if (c.phase === 'fight') {
        const sh = shipStats(st);
        if (st.ship.energy < 25) st.ship.energy = Math.min(sh.energyMax, st.ship.energy + 40); // bot waits to recharge between exchanges (time cost negligible here)
        const act = st.ship.shield < sh.shieldMax * 0.25 && st.ship.energy >= 12 ? 'shield' : st.ship.energy >= 20 ? 'overcharge' : 'fire';
        combatAction(st, act);
        continue;
      }
      if (c.phase === 'lost') { log.push(`${stamp()} LOST a fight at ${st.location}`); }
      if (c.phase === 'won') guardFights++;
      closeCombat(st);
      break;
    }
    if (st.event) A.resolveEvent(st, 'shield') .ok || A.resolveEvent(st, 'push');
  };

  const manageEconomy = () => {
    // missions
    if (st.missions.board.length < 5) refillBoard(st);
    for (const m of [...st.missions.active]) if (m.progress >= m.target) claimMission(st, m.id);
    while (st.missions.active.length < 3 && st.missions.board.length) { const m = st.missions.board.find((x) => ['mine', 'sell', 'research', 'build', 'scan', 'jump', 'visit', 'craft', 'scanBodies', 'investigate'].includes(x.type)); if (!m) break; if (!acceptMission(st, m.id).ok) break; }
    // ship
    const here = st.location;
    // sell surplus
    for (const r of ALL_RES) { const keep = KEEP[r] ?? 0; const q = Math.floor(st.res[r] - keep); if (q >= 5) A.sell(st, r, q); }
    // vessels flag
    if (st.counts.vessel > 0) for (const r of ['iron', 'copper', 'ice', 'titanium', 'crystal'] as ResId[]) A.setAutoSell(st, r, true, KEEP[r]);
    // upgrades (cheapest credit cost first), keep affordable
    for (let i = 0; i < 6; i++) {
      const opts = UPGRADE_ORDER.filter((u) => st.upgrades[u] < A.upgradeLevelCap(st)).map((u) => ({ u, c: upgradeCost(st, u) })).filter((x) => canAfford(st, x.c)).sort((a, b) => a.c.credits - b.c.credits);
      if (!opts.length) break;
      // do not let upgrades starve research: only spend up to 60% of credits
      if (opts[0].c.credits > st.credits * 0.6) break;
      A.buyUpgrade(st, opts[0].u);
    }
    // hand-craft intermediates in bulk when stock is low (players can do this too)
    for (const [r, target] of [['alloy', 150], ['circuits', 100], ['cells', 60]] as const) {
      if ((st.res as any)[r] < target) { const rec = RECIPES[r]; if (!rec.unlock || st.research.done.includes(rec.unlock)) { const maxN = Math.min(...(Object.keys(rec.inputs) as ResId[]).map((k) => Math.floor(st.res[k] / (rec.inputs[k] as number)))); if (maxN > 0) A.craft(st, r, Math.min(maxN, target)); } }
    }
    // research
    if (!st.research.current) {
      const av = TECHS.filter((t) => A.techStatus(st, t.id).state === 'available').sort((a, b) => a.credits - b.credits);
      for (const t of av) { if (A.startResearch(st, t.id).ok) break; }
    }
    // power first
    const p = powerInfo(st);
    if (p.eff < 1) { const id: BuildingId = st.research.done.includes('N4') ? 'antimatter' : st.research.done.includes('N2') ? 'fusion' : 'solar'; A.build(st, id); }
    // labs
    const wantLabs = Math.min(6, 1 + Math.floor(Math.log10(st.stats.creditsEarned + 10)));
    if (st.counts.lab < wantLabs) A.build(st, 'lab');
    // automation in the current system
    const sys = g.byId.get(here)!;
    if (sys.bodies.some((b) => st.revealedBodies[b.id])) {
      for (const id of ['station', 'minerShip', 'drone'] as BuildingId[]) { for (let k = 0; k < 4; k++) { if (buildingCostOK(id)) A.build(st, id, here); else break; } }
    }
    if (st.counts.vessel < 3 && st.research.done.includes('A2')) A.build(st, 'vessel');
    if (st.research.done.includes('A4') && st.refineries.length < 6) A.build(st, 'refinery');
    // refinery recipes: choose by largest deficit among recipes whose inputs are on hand; never assign a recipe it cannot feed
    const done = st.research.done;
    const targets: [string, number][] = [['exotic', done.includes('L2') ? 700 : 0], ['warpcore', done.includes('L3') ? 130 : 0], ['nanites', done.includes('E3') ? 800 : 0], ['cells', done.includes('N1') ? 300 : 0], ['circuits', 500], ['alloy', 900]];
    const feedable = (r: string) => (Object.keys(RECIPES[r as 'alloy'].inputs) as ResId[]).every((k) => st.res[k] >= (RECIPES[r as 'alloy'].inputs[k] as number) * 3);
    st.refineries.forEach((rf, i) => {
      const opts = targets.filter(([r, cap]) => cap > 0 && (st.res as any)[r] < cap && feedable(r)).map(([r, cap]) => ({ r, d: 1 - (st.res as any)[r] / cap })).sort((a, b) => b.d - a.d);
      const capOf = (r: string) => (targets.find(([x]) => x === r)?.[1] ?? 0);
      const full = rf.recipe ? (st.res as any)[rf.recipe] >= capOf(rf.recipe) : true;
      if (opts.length && (!rf.recipe || !feedable(rf.recipe) || full || i % 3 === 0)) A.setRefineryRecipe(st, i, opts[(i) % opts.length].r as any);
    });
    // automation upgrades
    for (const t of ['drone', 'minerShip', 'station', 'refinery', 'lab', 'vessel'] as const) { if (st.credits > 5000 && st.autoLevels[t] < 8) A.upgradeAuto(st, t); }
    // ships: buy best affordable when it's an upgrade over current (prefer miner->explorer->combat->dread)
    for (const id of ['miner', 'explorer', 'combat', 'interstellar'] as const) { if (!st.ship.owned.includes(id) && st.credits > 1.5 * (({ miner: 3500, explorer: 14000, combat: 22000, interstellar: 400000 } as any)[id])) A.buyShip(st, id); }
    if (st.ship.owned.includes('interstellar') && st.ship.active !== 'interstellar' && here === home) A.switchShip(st, 'interstellar');
    else if (st.ship.owned.includes('combat') && st.ship.active === 'scout' && here === home) A.switchShip(st, 'combat');
    // megaproject
    if (st.research.done.includes('L5')) A.buildMegaStage(st);
    // repair
    if (canDock(st)) A.repairShip(st);
  };
  const buildingCostOK = (id: BuildingId) => { const c = buildingCost(st, id); return canAfford(st, c) && A.buildingStatus(st, id, st.location).ok && c.credits < st.credits * 0.5; };

  // initial
  A.startScan(st); step(5);

  const explore = () => {
    const sys = g.byId.get(st.location)!;
    if (st.activity.type !== 'idle' && st.activity.type !== 'mining') return;
    // scan if scanner is stronger than what we last used here
    if ((st.scanPower[sys.id] ?? 0) + 0.01 < shipStats(st).scan) { if (A.startScan(st).ok) { step(5); } }
    for (const poi of sys.pois) {
      if (st.poisDone[poi.id]) continue;
      if (A.investigate(st, poi.id).ok) { step(6); fightIfNeeded(); }
    }
  };

  const pickTarget = (): string | null => {
    const cur = g.byId.get(st.location)!;
    const range = shipStats(st).jumpRange;
    const cand = g.systems.filter((o) => st.detected[o.id] && !st.visited[o.id]).filter((o) => A.jumpCost(st, o.id).reason === '' || /energy/.test(A.jumpCost(st, o.id).reason));
    // prefer unvisited systems within range, nearest first; else return toward unvisited
    cand.sort((a, b) => dist(a, cur) - dist(b, cur));
    if (cand.length) return cand[0].id;
    // visited systems with unfinished POIs that we can now detect (after scanner upgrades)
    const revisit = g.systems.filter((o) => st.visited[o.id] && o.id !== cur.id && o.pois.some((p) => !st.poisDone[p.id] && p.difficulty - 0 <= shipStats(st).scan) && dist(o, cur) <= range && A.jumpCost(st, o.id).ok).sort((a, b) => dist(a, cur) - dist(b, cur));
    return revisit[0]?.id ?? null;
  };

  let stuckCount = 0;
  while (T < HOURS * 3600) {
    // manual mining + unloading near a dock
    const atDock = canDock(st);
    if (atDock && cargoUsed(st) > 0) A.unload(st);
    if (st.activity.type === 'idle') {
      const sys = g.byId.get(st.location)!;
      const body = sys.bodies.filter((b) => st.revealedBodies[b.id]).sort((a, b) => b.richness - a.richness)[0];
      if (body && A.startMining(st, body.id).ok) { /* mining */ }
    }
    if (st.activity.type === 'mining') A.pulseBurst(st);
    step(6);
    fightIfNeeded();
    manageEconomy();
    // exploration: when idle and energy high, travel; stay home to mine when energy is low
    const sh = shipStats(st);
    if ((st.activity.type === 'idle' || st.activity.type === 'mining') && st.ship.energy > sh.energyMax * 0.7 && st.stats.minedTotal > 300) {
      explore();
      const tgt = pickTarget();
      if (tgt && st.ship.energy >= (A.jumpCost(st, tgt).energy)) { if (st.activity.type === 'mining') A.stopActivity(st); const r = A.jumpTo(st, tgt); if (r.ok) { step(A.jumpCost(st, tgt).time + 1); } }
      else if (!tgt) { stuckCount++; if (st.location !== home) { const back = A.jumpCost(st, home); if (back.ok) { A.jumpTo(st, home); step(back.time + 1); } else { /* hop toward home via any visited system */ const cur = g.byId.get(st.location)!; const hops = g.systems.filter((o) => st.visited[o.id] && dist(o, cur) <= sh.jumpRange && dist(o, g.byId.get(home)!) < dist(cur, g.byId.get(home)!)).sort((a, b) => dist(a, g.byId.get(home)!) - dist(b, g.byId.get(home)!)); if (hops[0] && A.jumpTo(st, hops[0].id).ok) step(A.jumpCost(st, hops[0].id).time + 1); } } }
    }
    mark('first upgrade', st.stats.upgradesBought >= 1);
    mark('first drone', st.stats.built.drone >= 1);
    mark('first lab', st.counts.lab >= 1);
    mark('A3 (stations) researched', st.research.done.includes('A3'));
    mark('first station', ownedCount(st, 'station') >= 1);
    mark('left home', Object.keys(st.visited).length >= 2);
    mark('10 systems', Object.keys(st.visited).length >= 10);
    mark('30 systems', Object.keys(st.visited).length >= 30);
    mark('5 discoveries', st.stats.discoveries >= 5);
    mark('10 discoveries', st.stats.discoveries >= 10);
    mark('X1 sector1', st.research.done.includes('X1'));
    mark('X3 sector3', st.research.done.includes('X3'));
    mark('X4 core', st.research.done.includes('X4'));
    mark('E4 quantum', st.research.done.includes('E4'));
    mark('L2 exotic synth', st.research.done.includes('L2'));
    mark('L5 gateway theory', st.research.done.includes('L5'));
    mark('1M earned', st.stats.creditsEarned >= 1e6);
    mark('10M earned', st.stats.creditsEarned >= 1e7);
    mark('100M earned', st.stats.creditsEarned >= 1e8);
    mark('all research', st.research.done.length === TECHS.length);
    mark('dreadnought owned', st.ship.owned.includes('interstellar'));
    mark('mega stage 1', st.mega >= 1); mark('mega stage 2', st.mega >= 2);
    mark('VICTORY', st.victory);
    if (T - lastReport >= 3600) {
      log.push(`  [${stamp()}] credits=${fmt(st.credits)} earned=${fmt(st.stats.creditsEarned)} (+${fmt(st.stats.creditsEarned - lastEarned)}/h) techs=${st.research.done.length}/${TECHS.length} sys=${Object.keys(st.visited).length} disc=${st.stats.discoveries} drones=${ownedCount(st, 'drone')} stn=${ownedCount(st, 'station')} ref=${st.refineries.length} labs=${st.counts.lab} exotic=${Math.floor(st.res.exotic)} rare=${Math.floor(st.res.rare)} nanites=${Math.floor(st.res.nanites)} wc=${Math.floor(st.res.warpcore)} ship=${st.ship.active} kills=${st.stats.kills} stuck=${stuckCount}`);
      log.push(`      sales=${fmt(st.stats.creditsFromSales)} other=${fmt(st.stats.creditsEarned - st.stats.creditsFromSales)} missions=${st.stats.missionsDone} ach=${Object.keys(st.achievements).length} mined=${fmt(st.stats.minedTotal)} blocked=${TECHS.filter((x) => !st.research.done.includes(x.id)).map((x) => x.id + ':' + (A.techStatus(st, x.id).reasons[0] ?? 'ok')).slice(0, 4).join(' | ')}`);
      lastReport = T; lastEarned = st.stats.creditsEarned;
    }
    if (st.victory) break;
  }
  console.log(log.join('\n'));
  console.log('RESULT: ', st.victory ? 'victory at ' + stamp() : 'NOT finished after ' + stamp());
}, 600000);
