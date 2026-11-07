import { Rng, hashString, clamp } from './rng';
import { BODY_DESC, BODY_WEIGHTS, SECTOR_RADII, MINEABLE, type BodyType, type MineRes, type ResBag } from './data';

export type PoiKind = 'station' | 'artifact' | 'anomaly' | 'derelict' | 'cache' | 'beacon';

export interface Body {
  id: string;
  sysId: string;
  name: string;
  kind: 'planet' | 'moon' | 'belt';
  type: BodyType;
  parent: string | null;
  orbit: number; // scene units from the star (or from parent for moons)
  period: number; // seconds per orbit
  phase: number;
  size: number;
  tilt: number;
  richness: number;
  weights: Record<MineRes, number>;
  difficulty: number;
  unusual: string | null; // special world kind
  codex: string | null;
  desc: string;
  colorA: number;
  colorB: number;
  atmo: number;
  ring: boolean;
  temp: number; // kelvin-ish, flavour
}

export interface Poi {
  id: string;
  sysId: string;
  kind: PoiKind;
  name: string;
  desc: string;
  difficulty: number;
  orbit: number;
  phase: number;
  reward: { credits: number; res: ResBag; codex: string | null; reveals: string | null; tech: boolean };
  risk: { kind: 'none' | 'guard' | 'hazard'; level: number };
}

export interface StarSystem {
  id: string;
  index: number;
  name: string;
  x: number;
  y: number;
  z: number;
  star: { cls: string; color: number; radius: number; lum: number };
  sector: number;
  hub: boolean;
  hidden: boolean;
  danger: number;
  storms: boolean;
  bodies: Body[];
  pois: Poi[];
  flavor: string;
}

export interface Galaxy {
  seed: number;
  systems: StarSystem[];
  byId: Map<string, StarSystem>;
  bodies: Map<string, Body>;
  pois: Map<string, Poi>;
  homeId: string;
}

const SYL_A = ['Ar', 'Be', 'Cal', 'Dra', 'El', 'Fen', 'Gal', 'Hy', 'Ix', 'Jor', 'Kal', 'Lyr', 'Mor', 'Nov', 'Or', 'Pyr', 'Qua', 'Rho', 'Sol', 'Tau', 'Ul', 'Vel', 'Wyr', 'Xan', 'Yor', 'Zen', 'Ach', 'Bor', 'Cyr', 'Dev'];
const SYL_B = ['a', 'e', 'i', 'o', 'u', 'ae', 'io', 'ou', 'ia', 'ei'];
const SYL_C = ['ra', 'ris', 'nus', 'don', 'lis', 'tor', 'mar', 'vex', 'thus', 'dor', 'phi', 'gon', 'lon', 'ria', 'xis', 'kar', 'zon', 'mir', 'tis', 'ron'];
const HIDDEN_NAMES = ['Lacuna', 'Elysium Null', 'The Orchard', 'Vesper Gate', 'Halcyon Drift', 'Ninefold', 'Last Lantern', 'Mnemosyne'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

const STAR_TABLE: Record<string, number> = { M: 0.34, K: 0.2, G: 0.15, F: 0.1, A: 0.08, B: 0.05, O: 0.02, N: 0.03, W: 0.03 };
const STAR_COLOR: Record<string, number> = { M: 0xff7a4d, K: 0xffb36b, G: 0xfff1b0, F: 0xfff8e6, A: 0xcfe0ff, B: 0x9dbdff, O: 0x7aa0ff, N: 0xbfe9ff, W: 0xff9de0 };
const STAR_RADIUS: Record<string, number> = { M: 3.2, K: 3.8, G: 4.4, F: 4.8, A: 5.4, B: 6.2, O: 7, N: 1.8, W: 2.6 };
const STAR_LUM: Record<string, number> = { M: 0.6, K: 0.9, G: 1.1, F: 1.3, A: 1.6, B: 2.0, O: 2.6, N: 1.4, W: 1.6 };
const FLAVORS = [
  'A quiet system with little to recommend it but its ore.',
  'Old trade lanes cross here, long since abandoned.',
  'Radio static drifts through the system like distant surf.',
  'Survey drones logged this system and moved on without comment.',
  'A once-popular waypoint, now mostly drifting wreckage.',
  'The star flickers every few minutes, as if clearing its throat.',
  'Debris from an ancient collision glitters across the ecliptic.',
  'Mining claims here changed hands a dozen times. Nobody stayed.',
  'A peaceful system, which is always suspicious.',
  'Navigation beacons here were decommissioned and sold for scrap.',
];

const round1 = (v: number) => Math.round(v * 10) / 10;

function systemName(rng: Rng, used: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const n = rng.pick(SYL_A) + rng.pick(SYL_B) + rng.pick(SYL_C);
    const name = n.charAt(0).toUpperCase() + n.slice(1);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `Sys-${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

function normaliseWeights(type: BodyType, rng: Rng): Record<MineRes, number> {
  const base = BODY_WEIGHTS[type];
  const out = {} as Record<MineRes, number>;
  let total = 0;
  for (const r of MINEABLE) {
    const w = (base[r] ?? 0) * (base[r] ? rng.range(0.7, 1.3) : 0);
    out[r] = w;
    total += w;
  }
  for (const r of MINEABLE) out[r] = total > 0 ? out[r] / total : 0;
  return out;
}

const PLANET_PALETTE: Record<BodyType, [number, number, number]> = {
  rocky: [0x8a7f78, 0x5b524d, 0x9aa0a8],
  desert: [0xd9a066, 0x9c5a35, 0xffc98a],
  lava: [0x2a1a18, 0xff5a1a, 0xff8c3a],
  ice: [0xdcf3ff, 0x8fb8d8, 0xbfe8ff],
  ocean: [0x2f6fd6, 0x1b3f8a, 0x8fd0ff],
  gas: [0xe0b07a, 0x9c6a4a, 0xffe2b0],
  crystal: [0xff7ae0, 0x7a4aff, 0xffd0ff],
  moon_rock: [0x9a9a9a, 0x6a6a6a, 0xb0b0b0],
  moon_ice: [0xe6f6ff, 0xa8cde0, 0xcfeaff],
  belt_metal: [0x8c8580, 0x5d5853, 0x000000],
  belt_ice: [0xbfe3f5, 0x8ab4c9, 0x000000],
  belt_rich: [0xc7a96b, 0x7a6a8c, 0x000000],
};

function pickPlanetType(rng: Rng, zone: number, starCls: string): BodyType {
  // zone 0 (hot, inner) .. 1 (cold, outer)
  const hotStar = starCls === 'O' || starCls === 'B' || starCls === 'A' ? 0.15 : starCls === 'M' ? -0.1 : 0;
  const z = clamp(zone + hotStar, 0, 1);
  const table: Record<string, number> =
    z < 0.3 ? { lava: 3, rocky: 3, desert: 3, crystal: 0.4 }
      : z < 0.6 ? { rocky: 3, desert: 2, ocean: 2.5, crystal: 0.5, gas: 0.7 }
        : { ice: 3, gas: 3, rocky: 1, ocean: 0.6, crystal: 0.5 };
  return rng.weighted(table) as BodyType;
}

const UNUSUAL: { key: string; codex: string; name: string; type: BodyType }[] = [
  { key: 'living', codex: 'world1', name: 'Living World', type: 'ocean' },
  { key: 'glass', codex: 'world2', name: 'Glass Planet', type: 'crystal' },
  { key: 'whispering', codex: 'world3', name: 'Whispering Dunes', type: 'desert' },
  { key: 'orchard', codex: 'world4', name: 'Tidal Orchard', type: 'gas' },
  { key: 'cathedral', codex: 'world5', name: 'Ringed Cathedral', type: 'rocky' },
  { key: 'sea', codex: 'world6', name: 'The Patient Sea', type: 'ocean' },
];

function makeBody(rng: Rng, sys: { id: string; name: string; sector: number; star: { cls: string } }, idx: number, type: BodyType, kind: Body['kind'], orbit: number, parent: Body | null, label: string, opts: { home?: boolean } = {}): Body {
  const id = `${sys.id}.b${idx}`;
  const pal = PLANET_PALETTE[type];
  const sectorBoost = 1 + 0.28 * sys.sector;
  const beltEase = kind === 'belt' ? -0.5 : kind === 'moon' ? 0.3 : 0;
  let difficulty = round1(Math.max(0.5, 1 + sys.sector * 1.0 + rng.range(0, 2.4) + beltEase));
  let richness = round1(rng.range(0.8, 1.6) * sectorBoost);
  if (opts.home) {
    difficulty = round1(Math.min(difficulty, 1.6));
    richness = round1(Math.max(richness, 1.2));
  }
  const size = kind === 'planet' ? (type === 'gas' ? rng.range(2.6, 4.2) : rng.range(0.9, 2) ) : kind === 'moon' ? rng.range(0.3, 0.6) : 0;
  const body: Body = {
    id, sysId: sys.id, name: label, kind, type, parent: parent ? parent.id : null,
    orbit, period: kind === 'moon' ? rng.range(10, 24) : 50 + orbit * 3.2 + rng.range(0, 20),
    phase: rng.range(0, Math.PI * 2), size, tilt: rng.range(-0.4, 0.4), richness,
    weights: normaliseWeights(type, rng), difficulty, unusual: null, codex: null,
    desc: rng.pick(BODY_DESC[type]), colorA: pal[0], colorB: pal[1], atmo: pal[2],
    ring: type === 'gas' ? rng.chance(0.55) : type === 'ice' ? rng.chance(0.12) : false,
    temp: Math.round(rng.range(60, 900) * (type === 'lava' ? 2.2 : type === 'ice' || type === 'moon_ice' ? 0.3 : 1)),
  };
  return body;
}

const POI_NAMES: Record<PoiKind, string[]> = {
  station: ['Abandoned Station', 'Derelict Outpost', 'Silent Platform', 'Dead Relay Station', 'Cold Refinery Hulk'],
  artifact: ['Alien Artifact', 'Humming Obelisk', 'Black-Glass Monolith', 'Resonant Spire', 'Buried Vault'],
  anomaly: ['Spatial Rift', 'Gravity Well', 'Ion Storm Core', 'Temporal Echo', 'Mirror Field'],
  derelict: ['Derelict Freighter', 'Wrecked Gunship', 'Drifting Hulk', 'Crashed Survey Ship', 'Ghost Tug'],
  cache: ['Rare Technology Cache', 'Sealed Data Vault', 'Precursor Workshop', 'Hidden Blueprint Archive'],
  beacon: ['Ancient Beacon', 'Star-Chart Relay', 'Lighthouse Node'],
};
const POI_DESC: Record<PoiKind, string> = {
  station: 'A dark structure drifting in a stable orbit. Faint power signatures remain.',
  artifact: 'A structure of impossible geometry, older than any known civilisation.',
  anomaly: 'Spacetime is behaving badly here. Sensors disagree with each other.',
  derelict: 'A broken ship, still carrying whatever its crew could not sell.',
  cache: 'A sealed vault of alien engineering. Whatever is inside is not documented.',
  beacon: 'A navigation node, still transmitting a coordinate that is on no known chart.',
};
const CODEX_POOL: Record<PoiKind, string[]> = {
  station: ['log1', 'log2', 'log3', 'log4', 'log5', 'log6', 'log7', 'log8'],
  artifact: ['arch1', 'arch2', 'arch3', 'arch4', 'arch5', 'arch6', 'arch7', 'arch8'],
  anomaly: ['anom1', 'anom2', 'anom3', 'anom4', 'anom5', 'anom6', 'anom7'],
  derelict: ['wreck1', 'wreck2', 'wreck3', 'wreck4', 'wreck5', 'wreck6', 'wreck7'],
  cache: ['arch3', 'arch5', 'arch7', 'log8'],
  beacon: ['bea1', 'bea2', 'bea3'],
};

function makePoi(rng: Rng, sys: StarSystem, n: number, kind: PoiKind, opts: { reveals?: string; home?: boolean } = {}): Poi {
  const s = sys.sector;
  const mult = 1 + s * 0.9;
  const res: ResBag = {};
  let credits = Math.round(rng.range(200, 480) * mult);
  let risk: Poi['risk'] = { kind: 'none', level: 0 };
  const lvl = round1(1 + s * 0.8 + rng.range(0, 1));
  switch (kind) {
    case 'station':
      res[rng.chance(0.5) ? 'alloy' : 'circuits'] = Math.round(rng.range(3, 9) * mult);
      if (rng.chance(0.25 + s * 0.05)) risk = { kind: 'guard', level: lvl };
      break;
    case 'artifact':
      credits = Math.round(rng.range(300, 700) * mult);
      res.exotic = 1 + Math.floor(rng.range(0, 2) + s * 0.6);
      if (rng.chance(0.35)) risk = { kind: 'hazard', level: lvl };
      else if (s >= 2 && rng.chance(0.4)) risk = { kind: 'guard', level: lvl };
      break;
    case 'anomaly':
      credits = Math.round(rng.range(400, 900) * mult);
      res.exotic = Math.round(rng.range(1, 3));
      res.rare = Math.round(rng.range(3, 10) * (1 + s * 0.5));
      risk = { kind: 'hazard', level: lvl + 0.5 };
      break;
    case 'derelict':
      credits = Math.round(rng.range(150, 400) * mult);
      res[rng.pick(['iron', 'titanium', 'copper'] as const)] = Math.round(rng.range(40, 140) * mult);
      if (rng.chance(0.3)) risk = { kind: 'guard', level: lvl };
      break;
    case 'cache':
      credits = Math.round(rng.range(500, 1000) * mult);
      if (rng.chance(0.35)) risk = { kind: 'guard', level: lvl + 0.5 };
      break;
    case 'beacon':
      credits = Math.round(rng.range(200, 400) * mult);
      if (rng.chance(0.2)) risk = { kind: 'hazard', level: lvl };
      break;
  }
  let difficulty = round1(3 + s * 1.35 + rng.range(0, 3.5) + (kind === 'artifact' || kind === 'cache' ? 1 : 0));
  if (opts.home) {
    difficulty = 3;
    risk = { kind: 'none', level: 0 };
    credits = 260;
    res.iron = 40;
    res.copper = 20;
  }
  return {
    id: `${sys.id}.p${n}`, sysId: sys.id, kind, name: rng.pick(POI_NAMES[kind]), desc: POI_DESC[kind], difficulty,
    orbit: rng.range(14, 54), phase: rng.range(0, Math.PI * 2),
    reward: { credits, res, codex: rng.pick(CODEX_POOL[kind]), reveals: opts.reveals ?? null, tech: kind === 'cache' },
    risk,
  };
}

function buildSystemContents(rng: Rng, sys: StarSystem, isHome: boolean): void {
  const planetCount = isHome ? 4 : rng.int(2, 6);
  const beltCount = isHome ? 1 : rng.chance(0.65) ? (rng.chance(0.3) ? 2 : 1) : 0;
  const bodies: Body[] = [];
  let idx = 0;
  const starR = sys.star.radius;
  let orbit = starR + 9 + rng.range(0, 3);
  const beltSlots = new Set<number>();
  while (beltSlots.size < beltCount) beltSlots.add(rng.int(0, Math.max(0, planetCount - 1)));
  const homeTypes: BodyType[] = ['rocky', 'ocean', 'gas', 'ice'];
  for (let i = 0; i < planetCount; i++) {
    const zone = planetCount > 1 ? i / (planetCount - 1) : 0.5;
    let type = isHome ? homeTypes[i] : pickPlanetType(rng, zone, sys.star.cls);
    let unusual: (typeof UNUSUAL)[number] | null = null;
    if (!isHome && sys.sector >= 1 && rng.chance(0.07)) {
      unusual = rng.pick(UNUSUAL);
      type = unusual.type;
    }
    const roman = ROMAN[bodies.filter((b) => b.kind === 'planet').length] ?? String(i + 1);
    const planet = makeBody(rng, sys, idx++, type, 'planet', orbit, null, `${sys.name} ${roman}`, { home: isHome });
    if (unusual) {
      planet.unusual = unusual.key;
      planet.codex = unusual.codex;
      planet.name = `${sys.name} ${roman} - ${unusual.name}`;
      planet.richness = round1(planet.richness * 1.8);
      planet.difficulty = round1(planet.difficulty + 2);
      planet.desc = `An unusual world. ${planet.desc}`;
    }
    bodies.push(planet);
    const moonCount = isHome ? (type === 'gas' ? 1 : 0) : type === 'gas' ? rng.int(1, 3) : rng.chance(0.35) ? rng.int(1, 2) : 0;
    for (let m = 0; m < moonCount; m++) {
      const mt: BodyType = rng.chance(0.5) || type === 'gas' && rng.chance(0.5) ? 'moon_ice' : 'moon_rock';
      const moon = makeBody(rng, sys, idx++, mt, 'moon', planet.size + 1.6 + m * 1.1, planet, `${planet.name}${String.fromCharCode(97 + m)}`, { home: isHome });
      bodies.push(moon);
    }
    orbit += 8 + planet.size * 1.2 + rng.range(0, 3);
    if (beltSlots.has(i)) {
      const bt: BodyType = isHome ? 'belt_metal' : rng.weighted({ belt_metal: 3, belt_ice: 2, belt_rich: sys.sector >= 1 ? 1.4 : 0.3 });
      const nth = bodies.filter((b) => b.kind === 'belt').length + 1;
      const belt = makeBody(rng, sys, idx++, bt, 'belt', orbit + 2, null, `${sys.name} Belt ${nth}`, { home: isHome });
      if (isHome) belt.richness = Math.max(belt.richness, 1.5);
      bodies.push(belt);
      orbit += 7;
    }
  }
  sys.bodies = bodies;
  sys.storms = bodies.some((b) => b.kind === 'belt') && (isHome || rng.chance(0.5 + sys.sector * 0.1));

  const pois: Poi[] = [];
  if (isHome) {
    pois.push(makePoi(rng, sys, 0, 'derelict', { home: true }));
  } else if (!sys.hidden) {
    const count = rng.weighted({ '0': 0.35, '1': 0.45, '2': sys.sector >= 2 ? 0.3 : 0.2 });
    const kinds: Record<PoiKind, number> = { station: 3, artifact: 2 + sys.sector * 0.4, anomaly: 1 + sys.sector * 0.5, derelict: 3, cache: 0.6 + sys.sector * 0.2, beacon: 0 };
    for (let i = 0; i < Number(count); i++) pois.push(makePoi(rng, sys, i, rng.weighted(kinds)));
  } else {
    // hidden systems are guaranteed to be valuable
    pois.push(makePoi(rng, sys, 0, 'artifact'));
    pois.push(makePoi(rng, sys, 1, 'cache'));
  }
  sys.pois = pois;
}

const cache = new Map<number, Galaxy>();

export function getGalaxy(seed: number): Galaxy {
  let g = cache.get(seed);
  if (!g) {
    g = generateGalaxy(seed);
    cache.set(seed, g);
  }
  return g;
}

export function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function generateGalaxy(seed: number, count = 128): Galaxy {
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const R = 120;
  let minDist = 9.5;
  const pts: { x: number; y: number; z: number }[] = [];
  let attempts = 0;
  while (pts.length < count) {
    attempts++;
    if (attempts % 6000 === 0) minDist -= 0.5;
    const arm = rng.int(0, 2);
    const r = 5 + Math.sqrt(rng.next()) * (R - 5);
    const th = arm * ((Math.PI * 2) / 3) + r * 0.042 + rng.gauss() * 0.42;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    let ok = true;
    for (const p of pts) {
      if (Math.hypot(p.x - x, p.z - z) < minDist) {
        ok = false;
        break;
      }
    }
    if (ok) pts.push({ x, z, y: rng.gauss() * 2.6 * (1 - (r / R) * 0.5) });
  }

  // choose home: well connected, around 60% out along an arm
  const target = { x: Math.cos(0.9) * R * 0.58, z: Math.sin(0.9) * R * 0.58 };
  let homeIdx = -1;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const near20 = pts.filter((p, j) => j !== i && Math.hypot(p.x - pts[i].x, p.z - pts[i].z) <= 20).length;
    const near16 = pts.filter((p, j) => j !== i && Math.hypot(p.x - pts[i].x, p.z - pts[i].z) <= 16).length;
    if (near20 < 3 || near16 < 2) continue;
    const d = Math.hypot(pts[i].x - target.x, pts[i].z - target.z);
    if (d < best) {
      best = d;
      homeIdx = i;
    }
  }
  if (homeIdx < 0) {
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - target.x, pts[i].z - target.z);
      if (d < best) {
        best = d;
        homeIdx = i;
      }
    }
  }
  const home = pts[homeIdx];

  const used = new Set<string>(['Aurelia']);
  const systems: StarSystem[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const d = Math.hypot(p.x - home.x, p.z - home.z);
    let sector = 0;
    while (sector < SECTOR_RADII.length && d >= SECTOR_RADII[sector]) sector++;
    const isHome = i === homeIdx;
    const srng = new Rng(hashString(`${seed}:sys:${i}`));
    const cls = isHome ? 'G' : srng.weighted(STAR_TABLE);
    const sys: StarSystem = {
      id: `S${i}`, index: i, name: isHome ? 'Aurelia' : systemName(srng, used), x: p.x, y: p.y, z: p.z,
      star: { cls, color: STAR_COLOR[cls], radius: STAR_RADIUS[cls], lum: STAR_LUM[cls] },
      sector, hub: isHome || srng.chance(0.2), hidden: false,
      danger: isHome ? 0 : round1(Math.max(0.2, sector + srng.range(-0.4, 0.9))),
      storms: false, bodies: [], pois: [], flavor: isHome ? 'Home. A modest G-class star, a tidy belt, and a lot of potential.' : srng.pick(FLAVORS),
    };
    systems.push(sys);
  }

  // hidden systems: eight far-flung systems, revealed by beacons
  const hiddenCandidates = systems.filter((s) => s.sector >= 2).sort((a, b) => hashString(`${seed}:h:${a.id}`) - hashString(`${seed}:h:${b.id}`));
  const hiddenSys: StarSystem[] = [];
  for (const s of hiddenCandidates) {
    if (hiddenSys.length >= 8) break;
    if (hiddenSys.every((h) => dist(h, s) > 25)) hiddenSys.push(s);
  }
  hiddenSys.forEach((h, i) => {
    h.hidden = true;
    h.name = HIDDEN_NAMES[i % HIDDEN_NAMES.length];
    h.hub = false;
  });

  // build contents (after hidden flags are known)
  const beaconHosts = new Map<string, string>(); // host systemId -> hidden systemId
  for (const h of hiddenSys) {
    const host = systems
      .filter((s) => !s.hidden && s.id !== `S${homeIdx}` && !beaconHosts.has(s.id) && s.sector >= 1)
      .sort((a, b) => dist(a, h) - dist(b, h))[0];
    if (host) beaconHosts.set(host.id, h.id);
  }
  for (const sys of systems) {
    const crng = new Rng(hashString(`${seed}:contents:${sys.index}`));
    buildSystemContents(crng, sys, sys.index === homeIdx);
    const reveals = beaconHosts.get(sys.id);
    if (reveals) {
      const prng = new Rng(hashString(`${seed}:beacon:${sys.id}`));
      sys.pois.push(makePoi(prng, sys, sys.pois.length, 'beacon', { reveals }));
    }
  }

  const byId = new Map<string, StarSystem>();
  const bodies = new Map<string, Body>();
  const pois = new Map<string, Poi>();
  for (const s of systems) {
    byId.set(s.id, s);
    for (const b of s.bodies) bodies.set(b.id, b);
    for (const p of s.pois) pois.set(p.id, p);
  }
  return { seed, systems, byId, bodies, pois, homeId: `S${homeIdx}` };
}

export function neighborsWithin(g: Galaxy, sys: StarSystem, range: number): StarSystem[] {
  return g.systems.filter((s) => s.id !== sys.id && dist(s, sys) <= range);
}
