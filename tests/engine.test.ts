import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { generateGalaxy, dist, getGalaxy } from '../src/game/galaxy';
import { createState, shipStats, cargoUsed, type GameState, upgradeCost, buildingCost } from '../src/game/state';
import { tick, simulateOffline, housekeeping } from '../src/game/sim';
import * as A from '../src/game/actions';
import { sanitizeState, parseSave, serialize, writeSave, loadSave, deleteSave } from '../src/game/save';
import { ALL_RES, MINEABLE, TECHS, UPGRADES, BUILDINGS } from '../src/game/data';
import { combatAction, startEncounter } from '../src/game/combat';
import { closeCombat } from '../src/game/combat';
import { refillBoard, acceptMission, claimMission } from '../src/game/missions';
import { Rng } from '../src/game/rng';

const SEED = 20240611;
let s: GameState;

function revealHome(st: GameState) {
  const g = getGalaxy(st.seed);
  for (const b of g.byId.get(st.location)!.bodies) st.revealedBodies[b.id] = true;
}
const beltOf = (st: GameState) => getGalaxy(st.seed).byId.get(st.location)!.bodies.find((b) => b.kind === 'belt')!;
function run(st: GameState, seconds: number, dt = 0.25) {
  for (let t = 0; t < seconds; t += dt) {
    tick(st, dt);
    if (Math.floor(t) !== Math.floor(t - dt)) housekeeping(st);
  }
}
function assertSane(st: GameState) {
  expect(Number.isFinite(st.credits)).toBe(true);
  expect(st.credits).toBeGreaterThanOrEqual(0);
  for (const r of ALL_RES) {
    expect(Number.isFinite(st.res[r]), `res ${r}`).toBe(true);
    expect(st.res[r], `res ${r}`).toBeGreaterThanOrEqual(0);
  }
  for (const r of MINEABLE) {
    expect(Number.isFinite(st.cargo[r])).toBe(true);
    expect(st.cargo[r]).toBeGreaterThanOrEqual(0);
  }
  expect(st.ship.hull).toBeGreaterThanOrEqual(0);
  expect(st.ship.energy).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(st.ship.energy)).toBe(true);
}

beforeEach(() => {
  s = createState(SEED, 'campaign', 1_000_000);
  revealHome(s);
});

describe('galaxy generation', () => {
  it('creates at least 100 systems, deterministically', () => {
    const a = generateGalaxy(SEED);
    const b = generateGalaxy(SEED);
    expect(a.systems.length).toBeGreaterThanOrEqual(100);
    expect(JSON.stringify(a.systems)).toBe(JSON.stringify(b.systems));
    const c = generateGalaxy(SEED + 1);
    expect(JSON.stringify(c.systems)).not.toBe(JSON.stringify(a.systems));
  });
  it('has varied bodies, points of interest, hidden systems, and unique names', () => {
    const g = generateGalaxy(SEED);
    const types = new Set([...g.bodies.values()].map((b) => b.type));
    expect(types.size).toBeGreaterThanOrEqual(8);
    expect([...g.pois.values()].length).toBeGreaterThan(40);
    expect(g.systems.filter((x) => x.hidden).length).toBeGreaterThanOrEqual(4);
    const names = g.systems.map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
    for (const b of g.bodies.values()) {
      const total = MINEABLE.reduce((a, r) => a + b.weights[r], 0);
      expect(total).toBeCloseTo(1, 5);
    }
  });
  it('home system is well connected and every visible system is reachable', () => {
    for (const seed of [SEED, 1, 2, 3, 99999]) {
      const g = generateGalaxy(seed);
      const home = g.byId.get(g.homeId)!;
      expect(home.bodies.some((b) => b.kind === 'belt')).toBe(true);
      expect(g.systems.filter((o) => o.id !== home.id && dist(o, home) <= 22).length).toBeGreaterThanOrEqual(2);
      // reachability using a generous 38 ly hop (max early-game range with upgrades)
      const seen = new Set([home.id]);
      const q = [home];
      while (q.length) {
        const cur = q.pop()!;
        for (const o of g.systems) if (!seen.has(o.id) && !o.hidden && dist(cur, o) <= 38) { seen.add(o.id); q.push(o); }
      }
      expect(seen.size).toBeGreaterThanOrEqual(g.systems.filter((x) => !x.hidden).length - 2);
    }
  });
});

describe('starting state', () => {
  it('matches the specification', () => {
    expect(s.credits).toBe(500);
    expect(s.ship.active).toBe('scout');
    expect(s.upgrades.laser).toBe(0);
    expect(shipStats(s).cargoCap).toBe(40);
    expect(Object.keys(s.visited)).toHaveLength(1);
  });
});

describe('mining', () => {
  it('requires a scanned body and gathers ore into cargo using energy', () => {
    const fresh = createState(SEED, 'campaign', 1);
    const belt = beltOf(fresh);
    expect(A.startMining(fresh, belt.id).ok).toBe(false);
    expect(A.startMining(s, beltOf(s).id).ok).toBe(true);
    const e0 = s.ship.energy;
    run(s, 10);
    expect(cargoUsed(s)).toBeGreaterThan(5);
    expect(s.ship.energy).toBeLessThan(e0 + 5);
    assertSane(s);
  });
  it('never exceeds cargo capacity and stops when full', () => {
    A.startMining(s, beltOf(s).id);
    s.ship.energy = 100000;
    run(s, 600);
    expect(cargoUsed(s)).toBeLessThanOrEqual(shipStats(s).cargoCap + 1e-6);
    expect(s.activity.type).toBe('idle');
  });
  it('unloads only at a dock and moves cargo to the warehouse', () => {
    s.cargo.iron = 20;
    const r = A.unload(s);
    expect(r.ok).toBe(true);
    expect(s.res.iron).toBeCloseTo(20);
    expect(cargoUsed(s)).toBe(0);
    expect(A.unload(s).ok).toBe(false);
  });
  it('harder ores need a stronger laser', () => {
    const g = getGalaxy(SEED);
    const body = [...g.bodies.values()].find((b) => b.type === 'crystal' || b.weights.rare > 0.1)!;
    const s2 = createState(SEED, 'campaign', 1);
    s2.upgrades.laser = 0;
    const lo = shipStats(s2).laser;
    s2.upgrades.laser = 8;
    const hi = shipStats(s2).laser;
    expect(hi).toBeGreaterThan(lo * 3);
    expect(body).toBeTruthy();
  });
});

describe('economy', () => {
  it('sells resources, lowers price, and never goes negative', () => {
    s.res.iron = 50;
    const r = A.sell(s, 'iron', 30);
    expect(r.ok).toBe(true);
    expect(s.res.iron).toBeCloseTo(20);
    expect(s.credits).toBeGreaterThan(500);
    expect(s.market.iron.mult).toBeLessThan(1);
    expect(A.sell(s, 'iron', 9999).ok).toBe(true);
    expect(s.res.iron).toBeLessThan(1);
    expect(A.sell(s, 'iron', 10).ok).toBe(false);
    assertSane(s);
  });
  it('rapid repeat clicks cannot create resources or credits from nothing', () => {
    s.res.iron = 10;
    let total = 0;
    for (let i = 0; i < 50; i++) { const c0 = s.credits; A.sell(s, 'iron', 10); total += s.credits - c0; }
    expect(s.res.iron).toBeGreaterThanOrEqual(0);
    expect(total).toBeLessThan(10 * 4 * 1.0 + 1e-6);
    // selling then immediately buying back is a loss
    const s2 = createState(SEED, 'campaign', 1);
    s2.res.iron = 100;
    const start = s2.credits;
    A.sell(s2, 'iron', 100);
    A.buy(s2, 'iron', 100);
    expect(s2.credits).toBeLessThan(start);
  });
  it('rejects invalid quantities', () => {
    expect(A.sell(s, 'iron', -5).ok).toBe(false);
    expect(A.sell(s, 'iron', NaN).ok).toBe(false);
    expect(A.buy(s, 'iron', 0).ok).toBe(false);
    expect(A.buy(s, 'rare', 1).ok).toBe(false);
    expect(A.buy(s, 'iron', 1e9).ok).toBe(false);
    assertSane(s);
  });
  it('crafting consumes inputs and respects requirements', () => {
    expect(A.craft(s, 'alloy').ok).toBe(false);
    s.res.iron = 6; s.res.titanium = 2;
    expect(A.craft(s, 'alloy', 5).ok).toBe(true);
    expect(s.res.alloy).toBe(2);
    expect(s.res.iron).toBe(0);
    expect(A.craft(s, 'nanites').ok).toBe(false);
  });
});

describe('upgrades', () => {
  it('rejects when unaffordable and changes nothing', () => {
    s.credits = 10;
    const before = JSON.stringify([s.credits, s.res, s.upgrades]);
    const r = A.buyUpgrade(s, 'laser');
    expect(r.ok).toBe(false);
    expect(JSON.stringify([s.credits, s.res, s.upgrades])).toBe(before);
  });
  it('first upgrade is affordable from the opening stockpile and has an effect', () => {
    const c = upgradeCost(s, 'laser');
    expect(c.credits).toBeLessThanOrEqual(500);
    s.res.iron = 100;
    const before = shipStats(s).laser;
    expect(A.buyUpgrade(s, 'laser').ok).toBe(true);
    expect(shipStats(s).laser).toBeGreaterThan(before);
    expect(s.credits).toBe(500 - c.credits);
  });
  it('every upgrade type measurably improves a stat, and costs rise monotonically', () => {
    for (const id of Object.keys(UPGRADES) as (keyof typeof UPGRADES)[]) {
      const a = createState(SEED, 'campaign', 1);
      const b = createState(SEED, 'campaign', 1);
      b.upgrades[id] = 2;
      expect(JSON.stringify(shipStats(a))).not.toBe(JSON.stringify(shipStats(b)));
      let prev = 0;
      for (let L = 0; L < 9; L++) { a.upgrades[id] = L; const c = upgradeCost(a, id).credits; expect(c).toBeGreaterThan(prev); prev = c; }
    }
  });
  it('respects the level cap until engineering research raises it', () => {
    s.credits = 1e9; for (const r of ALL_RES) s.res[r] = 1000;
    for (let i = 0; i < 5; i++) expect(A.buyUpgrade(s, 'cargo').ok).toBe(true);
    expect(A.buyUpgrade(s, 'cargo').ok).toBe(false);
    s.research.done.push('E1', 'E2');
    expect(A.buyUpgrade(s, 'cargo').ok).toBe(true);
  });
});

describe('ships', () => {
  it('locked ships cannot be bought; affordable unlocked ships can', () => {
    s.credits = 1e7; for (const r of ALL_RES) s.res[r] = 900;
    expect(A.buyShip(s, 'combat').ok).toBe(false);
    expect(A.buyShip(s, 'miner').ok).toBe(true);
    expect(A.buyShip(s, 'miner').ok).toBe(false);
    expect(A.switchShip(s, 'miner').ok).toBe(true);
    expect(shipStats(s).cargoCap).toBeGreaterThan(90);
    s.research.done.push('E1', 'E5'); s.stats.kills = 5;
    expect(A.buyShip(s, 'combat').ok).toBe(true);
  });
});

describe('research', () => {
  it('consumes resources, takes time, and applies real effects', () => {
    const tech = TECHS.find((t) => t.id === 'E1')!;
    s.res.iron = 100;
    expect(A.startResearch(s, 'E3').ok).toBe(false);
    const c0 = s.credits;
    expect(A.startResearch(s, 'E1').ok).toBe(true);
    expect(s.credits).toBe(c0 - tech.credits);
    expect(s.res.iron).toBe(100 - 30);
    expect(A.startResearch(s, 'X1').ok).toBe(false);
    const hull = shipStats(s).hullMax;
    run(s, tech.time + 2);
    expect(s.research.done).toContain('E1');
    expect(shipStats(s).hullMax).toBeGreaterThan(hull);
  });
  it('enforces prerequisites, labs and discoveries; rejects unaffordable', () => {
    expect(A.techStatus(s, 'E2').state).toBe('locked');
    expect(A.techStatus(s, 'E5').reasons.join()).toMatch(/E?ngineering|Reinforced/);
    s.research.done.push('E1');
    expect(A.techStatus(s, 'E5').reasons.join()).toMatch(/lab/);
    s.credits = 0;
    expect(A.startResearch(s, 'E2').ok).toBe(false);
  });
  it('every tech is reachable from the roots', () => {
    const done = new Set<string>();
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const t of TECHS) if (!done.has(t.id) && t.prereq.every((p) => done.has(p))) { done.add(t.id); progressed = true; }
    }
    expect(done.size).toBe(TECHS.length);
  });
  it('research can be cancelled for a partial refund without exploits', () => {
    s.res.iron = 100;
    A.startResearch(s, 'E1');
    const after = s.credits;
    A.cancelResearch(s);
    expect(s.credits).toBeLessThan(500);
    expect(s.credits).toBeGreaterThan(after);
  });
});

describe('regressions', () => {
  it('a tech granted by a cache while it is being researched is never recorded twice', async () => {
    const { grantTech } = await import('../src/game/world');
    s.res.iron = 100;
    A.startResearch(s, 'E1');
    s.research.done.push('X1');
    const granted = grantTech(s);
    expect(granted).not.toBe('Reinforced Plating');
    // even if the in-progress tech lands in the done list by some other route, finishing it must not duplicate it
    s.research.done.push('E1');
    run(s, 200);
    expect(s.research.done.filter((x) => x === 'E1')).toHaveLength(1);
    expect(s.research.current).toBeNull();
  });
  it('exotic matter is renewable: synthesis recipe is gated behind Artifact Resonance', () => {
    s.res.rare = 100; s.res.crystal = 100; s.res.cells = 100;
    expect(A.craft(s, 'exotic').ok).toBe(false);
    s.research.done.push('L2');
    expect(A.craft(s, 'exotic').ok).toBe(true);
    expect(s.res.exotic).toBe(1);
  });
});

describe('automation', () => {
  it('drones generate resources over time, with power and upkeep applied', () => {
    s.res.iron = 100; s.credits = 5000;
    A.build(s, 'drone');
    A.build(s, 'drone');
    const before = s.res.iron;
    run(s, 60);
    expect(s.res.iron + s.res.copper + s.res.ice).toBeGreaterThan(before - 100 + 5);
    assertSane(s);
  });
  it('build rejects unaffordable or locked buildings', () => {
    s.credits = 5;
    expect(A.build(s, 'drone').ok).toBe(false);
    s.credits = 1e6; for (const r of ALL_RES) s.res[r] = 500;
    expect(A.build(s, 'station').ok).toBe(false);
    expect(A.build(s, 'refinery').ok).toBe(false);
    expect(A.build(s, 'lab').ok).toBe(true);
    expect(buildingCost(s, 'lab').credits).toBeGreaterThan(BUILDINGS.lab.credits);
  });
  it('refineries craft from stock and cargo vessels auto-sell', () => {
    s.research.done.push('A1', 'A2', 'A4');
    s.credits = 1e6; for (const r of ALL_RES) s.res[r] = 300;
    expect(A.build(s, 'refinery').ok).toBe(true);
    A.setRefineryRecipe(s, 0, 'alloy');
    A.build(s, 'solar'); A.build(s, 'solar'); A.build(s, 'solar');
    run(s, 120);
    expect(s.res.alloy).toBeGreaterThan(300);
    A.build(s, 'vessel');
    A.setAutoSell(s, 'iron', true, 0);
    const c0 = s.credits; const i0 = s.res.iron;
    run(s, 30);
    expect(s.res.iron).toBeLessThan(i0);
    expect(s.credits).toBeGreaterThan(c0 - 100);
    assertSane(s);
  });
});

describe('exploration and combat', () => {
  it('scan reveals bodies and grants rewards; jump moves between systems', () => {
    const fresh = createState(SEED, 'campaign', 1);
    const g = getGalaxy(SEED);
    expect(A.startScan(fresh).ok).toBe(true);
    run(fresh, 6);
    expect(Object.keys(fresh.revealedBodies).length).toBeGreaterThan(0);
    const home = g.byId.get(fresh.location)!;
    const near = g.systems.filter((o) => o.id !== home.id && !o.hidden && dist(o, home) <= shipStats(fresh).jumpRange && fresh.detected[o.id])[0];
    expect(near).toBeTruthy();
    fresh.ship.energy = 100;
    expect(A.jumpTo(fresh, near.id).ok).toBe(true);
    run(fresh, 30);
    expect(fresh.location).toBe(near.id);
    expect(fresh.visited[near.id]).toBe(true);
    const far = g.systems.filter((o) => dist(o, near) > 60)[0];
    expect(A.jumpTo(fresh, far.id).ok).toBe(false);
  });
  it('locked sectors reject jumps', () => {
    const g = getGalaxy(SEED);
    const home = g.byId.get(s.location)!;
    const t = g.systems.filter((o) => o.sector >= 1 && dist(o, home) < 60).sort((a, b) => dist(a, home) - dist(b, home))[0];
    s.detected[t.id] = true; s.upgrades.jump = 10;
    expect(A.jumpCost(s, t.id).reason).toMatch(/Sector locked/);
  });
  it('combat is playable: fights resolve with a winner and loot', () => {
    s.upgrades.weapon = 4; s.upgrades.shield = 3;
    s.ship.shield = shipStats(s).shieldMax;
    startEncounter(s, 'drone', 'patrol');
    expect(s.combat).toBeTruthy();
    combatAction(s, 'engage');
    let guard = 0;
    while (s.combat && (s.combat.phase === 'fight') && guard++ < 80) {
      s.ship.energy = shipStats(s).energyMax;
      combatAction(s, s.ship.shield < 5 ? 'shield' : 'fire');
    }
    expect(['won', 'lost']).toContain(s.combat!.phase);
    if (s.combat!.phase === 'won') { expect(s.stats.kills).toBeGreaterThan(0); expect(s.combat!.loot!.credits).toBeGreaterThan(0); }
    closeCombat(s);
    assertSane(s);
  });
  it('losing a fight tows you home and never makes credits negative', () => {
    s.credits = 30;
    s.cargo.iron = 10;
    startEncounter(s, 'pirate', 'patrol', { forced: true });
    s.ship.hull = 1; s.ship.shield = 0;
    for (const e of s.combat!.enemies) { e.hull = 9999; e.dmg = 500; e.acc = 1; }
    combatAction(s, 'evade');
    expect(s.combat!.phase).toBe('lost');
    closeCombat(s);
    expect(s.combat).toBeNull();
    expect(cargoUsed(s)).toBe(0);
    assertSane(s);
  });
  it('encounters can be fled or bought off', () => {
    startEncounter(s, 'pirate', 'patrol');
    s.credits = 1000;
    expect(combatAction(s, 'bribe').ok).toBe(true);
    expect(s.combat!.phase).toBe('fled');
    expect(s.credits).toBeLessThan(1000);
  });
});

describe('missions and achievements', () => {
  it('generates, accepts, progresses and pays out missions', () => {
    refillBoard(s);
    expect(s.missions.board.length).toBe(5);
    const m = s.missions.board.find((x) => x.type === 'mine') ?? s.missions.board[0];
    expect(acceptMission(s, m.id).ok).toBe(true);
    expect(claimMission(s, m.id).ok).toBe(false);
    m.progress = m.target;
    const c0 = s.credits;
    expect(claimMission(s, m.id).ok).toBe(true);
    expect(s.credits).toBe(c0 + m.reward.credits);
    expect(s.missions.board.length).toBe(5);
  });
  it('limits active missions', () => {
    refillBoard(s);
    for (let i = 0; i < 4; i++) acceptMission(s, s.missions.board[0].id);
    expect(acceptMission(s, s.missions.board[0].id).ok).toBe(false);
  });
  it('achievements unlock and pay rewards', () => {
    s.stats.minedTotal = 150;
    housekeeping(s);
    expect(s.achievements.ore100).toBeTruthy();
  });
});

describe('save / load', () => {
  it('round-trips state through IndexedDB', async () => {
    s.credits = 1234; s.res.titanium = 77; s.upgrades.laser = 3; s.research.done.push('E1'); s.codex.push('arch1');
    s.visited['S3'] = true; s.stats.minedTotal = 999;
    await writeSave(s);
    const r = await loadSave();
    expect(r.state).toBeTruthy();
    expect(r.state!.credits).toBe(1234);
    expect(r.state!.res.titanium).toBe(77);
    expect(r.state!.upgrades.laser).toBe(3);
    expect(r.state!.research.done).toContain('E1');
    expect(r.state!.visited['S3']).toBe(true);
    expect(r.state!.stats.minedTotal).toBe(999);
    expect(r.state!.seed).toBe(SEED);
    await deleteSave();
    expect((await loadSave()).state).toBeNull();
  });
  it('exports and imports JSON, rejecting garbage safely', () => {
    s.credits = 4321;
    const text = serialize(s);
    expect(parseSave(text).credits).toBe(4321);
    expect(() => parseSave('not json')).toThrow();
    expect(() => parseSave('{}')).toThrow();
    expect(() => parseSave('[1,2,3]')).toThrow();
    expect(() => parseSave(JSON.stringify({ game: 'other', state: {} }))).toThrow();
    expect(() => parseSave(JSON.stringify({ game: 'galaxy-tycoon', version: 999, state: { seed: 1, version: 999 } }))).toThrow(/newer/);
  });
  it('sanitises hostile or corrupted fields instead of crashing', () => {
    const env = JSON.parse(serialize(s));
    env.state.credits = -500; env.state.res.iron = 'lots'; env.state.res.copper = NaN; env.state.cargo.ice = -3;
    env.state.upgrades.laser = 9999; env.state.location = 'nowhere'; env.state.research.done = ['bogus', 'E1'];
    env.state.installs = { S1: 'x', nope: { drone: 5 } }; env.state.ship.active = 'dreadnought9000'; env.state.missions.active = [null, 5, { id: 1 }];
    const out = parseSave(JSON.stringify(env));
    assertSane(out);
    expect(out.credits).toBe(0);
    expect(out.upgrades.laser).toBeLessThanOrEqual(20);
    expect(out.research.done).toEqual(['E1']);
    expect(out.ship.active).toBe('scout');
    expect(out.location).toBe(getGalaxy(SEED).homeId);
    expect(out.missions.active).toEqual([]);
  });
  it('falls back to the backup save when the main one is corrupted', async () => {
    s.credits = 111;
    await writeSave(s);
    s.credits = 222;
    await writeSave(s);
    const { openDB } = await import('./idb-helper');
    await openDB('main', '{"broken');
    const r = await loadSave();
    expect(r.state?.credits).toBe(111);
    expect(r.recovered).toBe(true);
    await deleteSave();
  });
  it('reports corrupted saves when nothing is recoverable', async () => {
    const { openDB } = await import('./idb-helper');
    await openDB('main', '{"broken');
    await openDB('backup', 'also broken');
    const r = await loadSave();
    expect(r.state).toBeNull();
    expect(r.error).toBeTruthy();
    await deleteSave();
  });
});

describe('offline progression', () => {
  it('accrues automation income, finishes research, and caps the reward period', () => {
    s.credits = 1e5; for (const r of ALL_RES) s.res[r] = 500;
    A.build(s, 'drone'); A.build(s, 'drone'); A.build(s, 'drone'); A.build(s, 'lab'); A.build(s, 'solar');
    A.startResearch(s, 'E1');
    const before = s.res.iron + s.res.copper + s.res.ice;
    const rep = simulateOffline(s, 3600);
    expect(rep.seconds).toBe(3600);
    expect(s.res.iron + s.res.copper + s.res.ice).toBeGreaterThan(before);
    expect(rep.research).toContain('E1');
    const rep2 = simulateOffline(s, 86400 * 30);
    expect(rep2.capped).toBe(true);
    expect(rep2.seconds).toBe(8 * 3600);
    assertSane(s);
  });
  it('ignores trivially short or negative absences', () => {
    const rep = simulateOffline(s, -100);
    expect(rep.seconds).toBe(0);
    expect(simulateOffline(s, 5).credits).toBe(0);
  });
  it('does not mine with the player ship while offline', () => {
    A.startMining(s, beltOf(s).id);
    const c = cargoUsed(s);
    simulateOffline(s, 3600);
    expect(cargoUsed(s)).toBe(c);
  });
});

describe('robustness fuzz', () => {
  it('thousands of random actions never produce negative or NaN values', () => {
    const rng = new Rng(7);
    const g = getGalaxy(SEED);
    const st = createState(SEED, 'campaign', 1);
    revealHome(st);
    st.credits = 20000;
    for (const r of ALL_RES) st.res[r] = 200;
    for (let i = 0; i < 6000; i++) {
      const k = rng.int(0, 24);
      const sys = g.byId.get(st.location)!;
      try {
        switch (k) {
          case 0: A.startMining(st, rng.pick(sys.bodies).id); break;
          case 1: A.sell(st, rng.pick(ALL_RES), rng.int(-5, 400)); break;
          case 2: A.buy(st, rng.pick(ALL_RES), rng.int(-5, 400)); break;
          case 3: A.buyUpgrade(st, rng.pick(Object.keys(UPGRADES) as any)); break;
          case 4: A.build(st, rng.pick(Object.keys(BUILDINGS) as any)); break;
          case 5: A.startResearch(st, rng.pick(TECHS).id); break;
          case 6: A.unload(st); break;
          case 7: A.startScan(st); break;
          case 8: A.jumpTo(st, rng.pick(g.systems).id); break;
          case 9: A.craft(st, rng.pick(['alloy', 'circuits', 'cells', 'exotic', 'nanites', 'warpcore'] as const), rng.int(1, 9)); break;
          case 10: A.patrol(st); break;
          case 11: if (st.combat) { combatAction(st, rng.pick(['engage', 'fire', 'overcharge', 'shield', 'evade', 'flee', 'bribe'] as const)); if (st.combat && ['won', 'lost', 'fled'].includes(st.combat.phase)) closeCombat(st); } break;
          case 12: if (st.event) A.resolveEvent(st, rng.pick(['shield', 'push', 'retreat'] as const)); break;
          case 13: A.pulseBurst(st); break;
          case 14: A.repairShip(st); break;
          case 15: A.upgradeAuto(st, rng.pick(['drone', 'minerShip', 'station', 'refinery', 'lab', 'vessel'] as const)); break;
          case 16: refillBoard(st); if (st.missions.board[0]) acceptMission(st, st.missions.board[0].id); break;
          case 17: { const m = st.missions.active[0]; if (m) { m.progress = m.target; claimMission(st, m.id); } break; }
          case 18: A.cancelResearch(st); break;
          case 19: A.setRefineryRecipe(st, 0, rng.pick(['alloy', 'circuits', 'cells', 'nanites', 'warpcore', null] as any)); break;
          case 20: A.setAutoSell(st, rng.pick(ALL_RES), rng.chance(0.5), rng.int(0, 100)); break;
          case 21: A.buyShip(st, rng.pick(['miner', 'freighter', 'explorer', 'combat', 'interstellar'] as const)); break;
          case 22: A.switchShip(st, rng.pick(['scout', 'miner', 'freighter', 'explorer', 'combat', 'interstellar'] as const)); break;
          case 23: A.investigate(st, rng.pick([...g.pois.keys()])); break;
          default: if (rng.chance(0.2)) st.credits += 5000; break;
        }
        if (st.event) A.resolveEvent(st, 'retreat');
        run(st, rng.range(0.25, 4));
      } catch (e) {
        throw new Error(`action ${k} at step ${i}: ${(e as Error).message}\n${(e as Error).stack}`);
      }
      if (i % 50 === 0) assertSane(st);
    }
    assertSane(st);
  });
});
