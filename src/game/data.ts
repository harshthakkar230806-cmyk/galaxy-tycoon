/** Static, authored game content. No logic here beyond tiny helpers. */

// ───────────────────────────── Resources ─────────────────────────────
export const RAW = ['iron', 'copper', 'ice', 'titanium', 'crystal', 'rare'] as const;
export const MINEABLE = ['iron', 'copper', 'ice', 'titanium', 'crystal', 'rare'] as const;
export const CRAFTED = ['alloy', 'circuits', 'cells', 'exotic', 'nanites', 'warpcore'] as const;
export const ALL_RES = [...RAW, ...CRAFTED] as const;
export type RawRes = (typeof RAW)[number];
export type MineRes = (typeof MINEABLE)[number];
export type CraftRes = (typeof CRAFTED)[number];
export type ResId = (typeof ALL_RES)[number];
export type ResBag = Partial<Record<ResId, number>>;

export interface ResInfo {
  id: ResId;
  name: string;
  color: string;
  price: number;
  hardness: number;
  crafted: boolean;
  buyable: boolean;
  desc: string;
}

export const RES: Record<ResId, ResInfo> = {
  iron: { id: 'iron', name: 'Iron', color: '#b9c2cf', price: 4, hardness: 1, crafted: false, buyable: true, desc: 'The backbone of every hull and girder. Plentiful in asteroid belts.' },
  copper: { id: 'copper', name: 'Copper', color: '#ff9a62', price: 7, hardness: 1.2, crafted: false, buyable: true, desc: 'Conductive ore for wiring, circuits and power systems.' },
  ice: { id: 'ice', name: 'Ice', color: '#8fe3ff', price: 6, hardness: 1, crafted: false, buyable: true, desc: 'Frozen volatiles. Fuel, coolant and life support in one.' },
  titanium: { id: 'titanium', name: 'Titanium', color: '#c9a7ff', price: 14, hardness: 2.2, crafted: false, buyable: true, desc: 'Light, strong metal. Needs a stronger laser to mine efficiently.' },
  crystal: { id: 'crystal', name: 'Crystals', color: '#ff6bd6', price: 28, hardness: 3.5, crafted: false, buyable: true, desc: 'Resonant lattices used in sensors, lasers and computing.' },
  rare: { id: 'rare', name: 'Rare Elements', color: '#ffd45e', price: 85, hardness: 5.5, crafted: false, buyable: false, desc: 'Exotic isotopes that power advanced technology. Very hard to cut.' },
  exotic: { id: 'exotic', name: 'Exotic Matter', color: '#5effa8', price: 260, hardness: 8, crafted: true, buyable: false, desc: 'Impossible matter. Found in alien discoveries, and synthesised from rare elements once you decode Artifact Resonance.' },
  alloy: { id: 'alloy', name: 'Titanium Alloy', color: '#9fb4ff', price: 46, hardness: 0, crafted: true, buyable: false, desc: 'Fabricated structural plate for ships and stations.' },
  circuits: { id: 'circuits', name: 'Circuits', color: '#69ffd1', price: 70, hardness: 0, crafted: true, buyable: false, desc: 'Crystal-etched control boards.' },
  cells: { id: 'cells', name: 'Energy Cells', color: '#fff36b', price: 72, hardness: 0, crafted: true, buyable: false, desc: 'Dense power storage for reactors and shields.' },
  nanites: { id: 'nanites', name: 'Nanites', color: '#ff7a7a', price: 400, hardness: 0, crafted: true, buyable: false, desc: 'Self-assembling machinery. The foundation of advanced manufacturing.' },
  warpcore: { id: 'warpcore', name: 'Warp Core', color: '#7ad0ff', price: 2400, hardness: 0, crafted: true, buyable: false, desc: 'A contained fold in space. The pinnacle of manufacturing.' },
};

export interface Recipe {
  id: CraftRes;
  inputs: ResBag;
  time: number; // seconds per craft at a refinery
  unlock: string | null; // tech id
}

export const RECIPES: Record<CraftRes, Recipe> = {
  alloy: { id: 'alloy', inputs: { iron: 3, titanium: 1 }, time: 6, unlock: null },
  circuits: { id: 'circuits', inputs: { copper: 2, crystal: 1 }, time: 8, unlock: null },
  cells: { id: 'cells', inputs: { ice: 3, crystal: 1 }, time: 8, unlock: 'N1' },
  exotic: { id: 'exotic', inputs: { rare: 12, crystal: 15, cells: 5 }, time: 40, unlock: 'L2' },
  nanites: { id: 'nanites', inputs: { circuits: 2, rare: 1, alloy: 1 }, time: 20, unlock: 'E3' },
  warpcore: { id: 'warpcore', inputs: { nanites: 3, alloy: 2, cells: 2, exotic: 1 }, time: 45, unlock: 'L3' },
};

// ───────────────────────────── Bodies ─────────────────────────────
export type BodyType =
  | 'rocky' | 'desert' | 'lava' | 'ice' | 'ocean' | 'gas' | 'crystal'
  | 'moon_rock' | 'moon_ice' | 'belt_metal' | 'belt_ice' | 'belt_rich';

type W = Partial<Record<MineRes, number>>;
export const BODY_WEIGHTS: Record<BodyType, W> = {
  rocky: { iron: 0.4, copper: 0.3, titanium: 0.15, crystal: 0.1, rare: 0.05 },
  desert: { iron: 0.35, copper: 0.35, titanium: 0.2, crystal: 0.08, rare: 0.02 },
  lava: { iron: 0.3, titanium: 0.35, rare: 0.15, crystal: 0.2 },
  ice: { ice: 0.65, copper: 0.1, crystal: 0.15, iron: 0.05, titanium: 0.05 },
  ocean: { ice: 0.4, copper: 0.25, crystal: 0.2, rare: 0.05, iron: 0.1 },
  gas: { ice: 0.35, rare: 0.25, crystal: 0.3, titanium: 0.1 },
  crystal: { crystal: 0.55, rare: 0.2, titanium: 0.15, ice: 0.1 },
  moon_rock: { iron: 0.5, copper: 0.2, titanium: 0.2, crystal: 0.07, rare: 0.03 },
  moon_ice: { ice: 0.6, iron: 0.15, copper: 0.1, crystal: 0.1, titanium: 0.05 },
  belt_metal: { iron: 0.45, copper: 0.25, titanium: 0.2, ice: 0.04, crystal: 0.04, rare: 0.02 },
  belt_ice: { ice: 0.6, iron: 0.15, copper: 0.1, crystal: 0.1, titanium: 0.05 },
  belt_rich: { titanium: 0.3, rare: 0.12, crystal: 0.2, copper: 0.2, iron: 0.18 },
};

export const BODY_LABEL: Record<BodyType, string> = {
  rocky: 'Rocky World', desert: 'Desert World', lava: 'Volcanic World', ice: 'Frozen World', ocean: 'Ocean World',
  gas: 'Gas Giant', crystal: 'Crystal World', moon_rock: 'Rocky Moon', moon_ice: 'Icy Moon',
  belt_metal: 'Metallic Asteroid Belt', belt_ice: 'Icy Asteroid Belt', belt_rich: 'Rich Asteroid Field',
};

export const BODY_DESC: Record<BodyType, string[]> = {
  rocky: ['A cratered world of exposed ore veins.', 'Dust-grey plains scarred by ancient impacts.', 'Tectonically dead, and rich for it.'],
  desert: ['Wind-carved dunes hide dense metal seams.', 'A sun-baked world of red canyons.', 'Dry basins glitter with oxidised copper.'],
  lava: ['Rivers of magma cut across a blackened crust.', 'Intense heat concentrates rare metals near the surface.', 'A furnace world. Orbital mining only.'],
  ice: ['A frozen sphere of glittering ice sheets.', 'Blue glaciers hide deep crystal veins.', 'Frost-locked, silent and valuable.'],
  ocean: ['Global seas hide mineral-rich trenches.', 'Storms roll across an endless ocean.', 'Orbital skimmers harvest dissolved ores.'],
  gas: ['Banded storms the size of worlds.', 'Skimmers can scoop volatiles from the upper atmosphere.', 'A swirling giant with a halo of debris.'],
  crystal: ['The whole surface is a forest of resonant crystal.', 'Light refracts from every ridge and valley.', 'A geological impossibility, humming softly.'],
  moon_rock: ['A small airless moon with exposed bedrock.', 'Low gravity makes extraction easy.'],
  moon_ice: ['A bright little moon of water ice.', 'Cryo-geysers scatter ice into orbit.'],
  belt_metal: ['A dense ring of metallic rubble.', 'Shattered protoplanet fragments, ripe for cutting.'],
  belt_ice: ['Comet-like fragments drift in a frozen ring.', 'A glittering belt of ice shards.'],
  belt_rich: ['An unusually dense field of mixed minerals.', 'The remnants of a differentiated world.'],
};

// ───────────────────────────── Sectors ─────────────────────────────
export const SECTORS = [
  { id: 0, name: 'Aurelian Frontier', color: '#6fd6ff', desc: 'Calm, well-charted space near home.' },
  { id: 1, name: 'Inner Reach', color: '#8dff9c', desc: 'Richer worlds, scattered pirate patrols.' },
  { id: 2, name: 'Nebula Belt', color: '#ff8de8', desc: 'Gas clouds hide dense fields and dangerous raiders.' },
  { id: 3, name: 'The Deep Void', color: '#ffb15e', desc: 'Sparse, hostile and full of relics.' },
  { id: 4, name: 'Galactic Core', color: '#ff6a6a', desc: 'Brutal radiation, ancient guardians and unmatched riches.' },
] as const;
export const SECTOR_RADII = [36, 70, 105, 140];

// ───────────────────────────── Ships ─────────────────────────────
export type ShipId = 'scout' | 'miner' | 'freighter' | 'explorer' | 'combat' | 'interstellar';
export interface ShipDef {
  id: ShipId;
  name: string;
  role: string;
  desc: string;
  special: string;
  cargo: number;
  speed: number;
  mining: number;
  hull: number;
  shield: number;
  weapon: number;
  scan: number;
  jump: number;
  cost: { credits: number; res: ResBag };
  requires: { tech?: string; kills?: number; label: string } | null;
  color: number;
}

export const SHIPS: Record<ShipId, ShipDef> = {
  scout: {
    id: 'scout', name: 'Starter Scout', role: 'Balanced starter', color: 0x6fd6ff,
    desc: 'A reliable little prospector. Does a bit of everything and nothing particularly well.',
    special: 'Light frame: jumps cost 15% less energy.',
    cargo: 40, speed: 1, mining: 1, hull: 100, shield: 20, weapon: 10, scan: 2, jump: 22,
    cost: { credits: 0, res: {} }, requires: null,
  },
  miner: {
    id: 'miner', name: 'Mining Vessel', role: 'Extraction specialist', color: 0xffb34d,
    desc: 'Heavy cutters and a reinforced hold. Slow, but it chews through rock.',
    special: 'Ore cutters: Pulse Burst yields +30%.',
    cargo: 100, speed: 0.8, mining: 1.9, hull: 150, shield: 25, weapon: 8, scan: 2, jump: 20,
    cost: { credits: 3500, res: { alloy: 30, circuits: 10 } }, requires: null,
  },
  freighter: {
    id: 'freighter', name: 'Cargo Freighter', role: 'Bulk hauler', color: 0x9aa7ff,
    desc: 'A flying warehouse. Sluggish and weakly armed, but carries enormous loads.',
    special: 'Trade licence: sell fees are halved.',
    cargo: 420, speed: 0.7, mining: 1.1, hull: 260, shield: 40, weapon: 6, scan: 1.5, jump: 24,
    cost: { credits: 9000, res: { alloy: 80, circuits: 30 } }, requires: { tech: 'A2', label: 'Research Logistics Network' },
  },
  explorer: {
    id: 'explorer', name: 'Deep Explorer', role: 'Long-range survey', color: 0x7dffb2,
    desc: 'Fast, with superb sensors and a long-range jump drive.',
    special: 'Deep scanner: exploration rewards +25%.',
    cargo: 90, speed: 1.6, mining: 0.9, hull: 140, shield: 35, weapon: 12, scan: 5, jump: 38,
    cost: { credits: 14000, res: { alloy: 40, circuits: 60 } }, requires: { tech: 'X2', label: 'Research Stellar Cartography' },
  },
  combat: {
    id: 'combat', name: 'Combat Cruiser', role: 'Warship', color: 0xff6a6a,
    desc: 'Armoured, shielded and heavily armed. Built for hunting raiders and guardians.',
    special: 'Twin batteries: every volley fires two shots.',
    cargo: 140, speed: 1.2, mining: 1.2, hull: 420, shield: 110, weapon: 38, scan: 2.5, jump: 26,
    cost: { credits: 22000, res: { alloy: 120, circuits: 50, nanites: 10 } }, requires: { tech: 'E5', kills: 5, label: 'Research Adaptive Armor and defeat 5 hostiles' },
  },
  interstellar: {
    id: 'interstellar', name: 'Interstellar Dreadnought', role: 'Endgame flagship', color: 0xe6a8ff,
    desc: 'Alien-assisted engineering. Excellent at everything.',
    special: 'Quantum core: all energy costs reduced by 25%.',
    cargo: 600, speed: 2.2, mining: 3.2, hull: 800, shield: 260, weapon: 80, scan: 7.5, jump: 60,
    cost: { credits: 1500000, res: { alloy: 200, nanites: 60, warpcore: 8 } }, requires: { tech: 'E4', label: 'Research Quantum Engineering' },
  },
};
export const SHIP_ORDER: ShipId[] = ['scout', 'miner', 'freighter', 'explorer', 'combat', 'interstellar'];

// ───────────────────────────── Ship upgrades ─────────────────────────────
export type UpgradeId = 'engine' | 'laser' | 'cargo' | 'scanner' | 'shield' | 'weapon' | 'jump' | 'reactor';
export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  desc: string;
  credits: [number, number]; // base, growth
  res: { res: ResId; base: number; growth: number; minLevel: number }[];
  effect: string; // short template text for per-level effect
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  laser: {
    id: 'laser', name: 'Mining Laser', icon: '⚡', credits: [90, 1.68], effect: '+45% mining power per level',
    desc: 'Cuts faster and reaches harder ores such as titanium, crystal and rare elements.',
    res: [
      { res: 'iron', base: 10, growth: 1.35, minLevel: 0 },
      { res: 'titanium', base: 6, growth: 1.45, minLevel: 2 },
      { res: 'crystal', base: 4, growth: 1.5, minLevel: 5 },
      { res: 'rare', base: 3, growth: 1.5, minLevel: 8 },
    ],
  },
  cargo: {
    id: 'cargo', name: 'Cargo Hold', icon: '▣', credits: [70, 1.6], effect: '+35% cargo capacity per level',
    desc: 'Carry more ore per trip so you spend less time unloading.',
    res: [
      { res: 'iron', base: 14, growth: 1.35, minLevel: 0 },
      { res: 'alloy', base: 3, growth: 1.4, minLevel: 3 },
      { res: 'nanites', base: 2, growth: 1.4, minLevel: 7 },
    ],
  },
  engine: {
    id: 'engine', name: 'Ion Engines', icon: '➤', credits: [110, 1.7], effect: '+15% speed per level',
    desc: 'Faster jumps and better odds of escaping a fight.',
    res: [
      { res: 'copper', base: 8, growth: 1.35, minLevel: 0 },
      { res: 'titanium', base: 5, growth: 1.45, minLevel: 3 },
      { res: 'circuits', base: 3, growth: 1.4, minLevel: 6 },
    ],
  },
  scanner: {
    id: 'scanner', name: 'Scanner Array', icon: '◎', credits: [100, 1.72], effect: '+0.9 scan power per level',
    desc: 'Reveals more distant, hidden and deeper-buried discoveries.',
    res: [
      { res: 'copper', base: 6, growth: 1.35, minLevel: 0 },
      { res: 'crystal', base: 3, growth: 1.45, minLevel: 2 },
      { res: 'circuits', base: 3, growth: 1.4, minLevel: 5 },
    ],
  },
  shield: {
    id: 'shield', name: 'Shield Generator', icon: '◈', credits: [130, 1.7], effect: '+30% shield capacity per level',
    desc: 'Absorbs damage in combat and from hazards before the hull is hit.',
    res: [
      { res: 'ice', base: 10, growth: 1.35, minLevel: 0 },
      { res: 'crystal', base: 3, growth: 1.45, minLevel: 3 },
      { res: 'cells', base: 3, growth: 1.4, minLevel: 6 },
    ],
  },
  weapon: {
    id: 'weapon', name: 'Weapon Systems', icon: '✦', credits: [140, 1.72], effect: '+28% weapon damage per level',
    desc: 'More damage per shot against pirates, drones and guardians.',
    res: [
      { res: 'iron', base: 16, growth: 1.35, minLevel: 0 },
      { res: 'copper', base: 6, growth: 1.4, minLevel: 2 },
      { res: 'alloy', base: 3, growth: 1.4, minLevel: 4 },
    ],
  },
  jump: {
    id: 'jump', name: 'Jump Drive', icon: '✺', credits: [160, 1.75], effect: '+20% jump range, cheaper jumps',
    desc: 'Reach farther systems in a single hop and spend less energy doing it.',
    res: [
      { res: 'ice', base: 12, growth: 1.35, minLevel: 0 },
      { res: 'titanium', base: 6, growth: 1.45, minLevel: 3 },
      { res: 'cells', base: 3, growth: 1.4, minLevel: 6 },
    ],
  },
  reactor: {
    id: 'reactor', name: 'Reactor Core', icon: '☀', credits: [95, 1.65], effect: '+20 energy and +0.3/s recharge per level',
    desc: 'More energy means longer mining runs and more actions between recharges.',
    res: [
      { res: 'copper', base: 8, growth: 1.35, minLevel: 0 },
      { res: 'ice', base: 8, growth: 1.35, minLevel: 2 },
      { res: 'cells', base: 3, growth: 1.4, minLevel: 5 },
    ],
  },
};
export const UPGRADE_ORDER: UpgradeId[] = ['laser', 'cargo', 'reactor', 'scanner', 'engine', 'jump', 'shield', 'weapon'];

// ───────────────────────────── Automation / buildings ─────────────────────────────
export type BuildingId = 'drone' | 'minerShip' | 'vessel' | 'station' | 'refinery' | 'lab' | 'solar' | 'fusion' | 'antimatter';
export interface BuildingDef {
  id: BuildingId;
  name: string;
  icon: string;
  desc: string;
  credits: number;
  growth: number;
  res: ResBag;
  power: number; // consumption (+) or production (-)
  upkeep: number; // credits / second
  unlock: string | null; // tech id
  perSystem: number | null; // max per system (null = global)
  rate?: number; // base units/s for miners
  miningPower?: number;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  drone: {
    id: 'drone', name: 'Mining Drone', icon: '✧', credits: 120, growth: 1.14, res: { iron: 10 }, power: 0.6, upkeep: 0, unlock: null,
    perSystem: 20, rate: 0.35, miningPower: 1.2,
    desc: 'A small autonomous cutter. Cheap, tireless and unpaid.',
  },
  minerShip: {
    id: 'minerShip', name: 'Automated Mining Ship', icon: '⬣', credits: 1400, growth: 1.17, res: { titanium: 25, copper: 30 }, power: 3, upkeep: 0.3, unlock: 'A1',
    perSystem: 12, rate: 1.6, miningPower: 2.8,
    desc: 'A crewless miner with a real laser. Cuts titanium and crystal efficiently.',
  },
  vessel: {
    id: 'vessel', name: 'Cargo Vessel', icon: '▤', credits: 1800, growth: 1.2, res: { alloy: 8 }, power: 2, upkeep: 0.5, unlock: 'A2',
    perSystem: null,
    desc: 'Hauls your stockpile to market. Each vessel auto-sells 2 units/s of resources you flag for auto-sell.',
  },
  station: {
    id: 'station', name: 'Mining Station', icon: '⬢', credits: 7500, growth: 1.35, res: { alloy: 25, circuits: 10 }, power: 10, upkeep: 1.0, unlock: 'A3',
    perSystem: 1, rate: 6, miningPower: 5.5,
    desc: 'An orbital extraction complex. Huge output, provides a dock and +600 storage.',
  },
  refinery: {
    id: 'refinery', name: 'Refinery', icon: '⚙', credits: 3000, growth: 1.3, res: { alloy: 15, circuits: 8 }, power: 12, upkeep: 0.8, unlock: 'A4',
    perSystem: null,
    desc: 'Automatically fabricates a chosen material from your warehouse stock.',
  },
  lab: {
    id: 'lab', name: 'Research Laboratory', icon: '⚗', credits: 900, growth: 1.4, res: { titanium: 20, copper: 30 }, power: 8, upkeep: 0.6, unlock: null,
    perSystem: null,
    desc: 'Each lab speeds up research by 25% and unlocks higher technology tiers.',
  },
  solar: {
    id: 'solar', name: 'Solar Array', icon: '☼', credits: 250, growth: 1.12, res: { copper: 15 }, power: -8, upkeep: 0, unlock: null,
    perSystem: null,
    desc: 'Cheap clean power. Machines slow down if demand exceeds supply.',
  },
  fusion: {
    id: 'fusion', name: 'Fusion Reactor', icon: '✹', credits: 6000, growth: 1.25, res: { alloy: 20, crystal: 15 }, power: -40, upkeep: 0, unlock: 'N2',
    perSystem: null,
    desc: 'Compact fusion plant producing 40 power.',
  },
  antimatter: {
    id: 'antimatter', name: 'Antimatter Core', icon: '✺', credits: 90000, growth: 1.3, res: { nanites: 15, exotic: 4 }, power: -180, upkeep: 0, unlock: 'N4',
    perSystem: null,
    desc: 'Enormous power from contained annihilation: 180 power.',
  },
};
export const BUILDING_ORDER: BuildingId[] = ['drone', 'minerShip', 'station', 'vessel', 'refinery', 'lab', 'solar', 'fusion', 'antimatter'];
export const BASE_POWER = 12;

// ───────────────────────────── Technologies ─────────────────────────────
export type Branch = 'engineering' | 'automation' | 'exploration' | 'energy' | 'alien';
export const BRANCHES: { id: Branch; name: string; color: string; icon: string }[] = [
  { id: 'engineering', name: 'Engineering', color: '#ffb34d', icon: '⚒' },
  { id: 'automation', name: 'Automation', color: '#6fd6ff', icon: '⚙' },
  { id: 'exploration', name: 'Exploration', color: '#8dff9c', icon: '◎' },
  { id: 'energy', name: 'Energy', color: '#fff36b', icon: '☀' },
  { id: 'alien', name: 'Alien Technology', color: '#e6a8ff', icon: '✺' },
];

export interface Mods {
  mine: number; cargo: number; speed: number; hull: number; shield: number; weapon: number;
  scan: number; poiScan: number; jump: number; jumpEnergy: number; energyMax: number; energyRegen: number; mineEnergy: number;
  autoOut: number; droneOut: number; autoPower: number; haul: number; refine: number; upkeep: number; power: number; storage: number;
  research: number; sellFee: number; rewards: number; hazard: number; hullRegen: number; offlineHours: number;
  upgradeCap: number; sectors: number;
}
export const ADD_KEYS: (keyof Mods)[] = ['scan', 'poiScan', 'autoPower', 'sellFee', 'offlineHours', 'hullRegen'];
export const MAX_KEYS: (keyof Mods)[] = ['upgradeCap', 'sectors'];
export function baseMods(): Mods {
  return {
    mine: 1, cargo: 1, speed: 1, hull: 1, shield: 1, weapon: 1, scan: 0, poiScan: 0, jump: 1, jumpEnergy: 1, energyMax: 1,
    energyRegen: 1, mineEnergy: 1, autoOut: 1, droneOut: 1, autoPower: 0, haul: 1, refine: 1, upkeep: 1, power: 1, storage: 1,
    research: 1, sellFee: 0, rewards: 1, hazard: 1, hullRegen: 0, offlineHours: 8, upgradeCap: 5, sectors: 0,
  };
}

export interface TechDef {
  id: string;
  branch: Branch;
  tier: number;
  name: string;
  desc: string;
  credits: number;
  res: ResBag;
  time: number;
  prereq: string[];
  labs?: number;
  discoveries?: number;
  mods?: Partial<Mods>;
  effects: string[];
}

const T = (t: TechDef): TechDef => t;
export const TECHS: TechDef[] = [
  // Engineering
  T({ id: 'E1', branch: 'engineering', tier: 1, name: 'Reinforced Plating', desc: 'Layered hull plating salvaged from freighter designs.', credits: 200, res: { iron: 30 }, time: 20, prereq: [], mods: { hull: 1.25 }, effects: ['Hull integrity +25%'] }),
  T({ id: 'E2', branch: 'engineering', tier: 2, name: 'Precision Machining', desc: 'Tighter tolerances let every ship system be pushed further.', credits: 900, res: { iron: 100, titanium: 40 }, time: 60, prereq: ['E1'], mods: { upgradeCap: 7 }, effects: ['Ship upgrade level cap: 7'] }),
  T({ id: 'E5', branch: 'engineering', tier: 3, name: 'Adaptive Armor', desc: 'Reactive composites that harden under fire.', credits: 5000, res: { alloy: 40, titanium: 20 }, time: 120, prereq: ['E1'], labs: 1, mods: { hull: 1.5, shield: 1.25 }, effects: ['Hull +50%', 'Shields +25%', 'Unlocks Combat Cruiser'] }),
  T({ id: 'E3', branch: 'engineering', tier: 3, name: 'Nanofabrication', desc: 'Assemble machinery atom by atom.', credits: 6000, res: { circuits: 40, alloy: 20 }, time: 150, prereq: ['E2'], labs: 1, mods: { refine: 1.25 }, effects: ['Unlocks Nanites recipe', 'Refinery speed +25%'] }),
  T({ id: 'E4', branch: 'engineering', tier: 4, name: 'Quantum Engineering', desc: 'Engineering at the edge of physics.', credits: 96000, res: { nanites: 40, rare: 10 }, time: 420, prereq: ['E3'], labs: 2, mods: { upgradeCap: 10 }, effects: ['Ship upgrade level cap: 10', 'Unlocks Interstellar Dreadnought'] }),
  // Automation
  T({ id: 'A1', branch: 'automation', tier: 1, name: 'Autonomous Piloting', desc: 'Drone-grade autopilots for crewless ships and docking.', credits: 300, res: { copper: 20, iron: 40 }, time: 25, prereq: [], mods: { autoOut: 1.1 }, effects: ['Unlocks Automated Mining Ships', 'Auto-unload cargo at docks', 'Automation output +10%'] }),
  T({ id: 'A2', branch: 'automation', tier: 2, name: 'Logistics Network', desc: 'Scheduled haulage between every outpost.', credits: 1500, res: { copper: 80, titanium: 30 }, time: 60, prereq: ['A1'], mods: { haul: 1, sellFee: -0.02 }, effects: ['Unlocks Cargo Vessels', 'Unlocks Cargo Freighter', 'Sell fee -2%'] }),
  T({ id: 'A3', branch: 'automation', tier: 3, name: 'Orbital Foundations', desc: 'Prefabricated station modules for deep extraction.', credits: 5000, res: { alloy: 40, circuits: 10 }, time: 120, prereq: ['A2'], labs: 1, mods: { storage: 1.25 }, effects: ['Unlocks Mining Stations', 'Warehouse capacity +25%'] }),
  T({ id: 'A4', branch: 'automation', tier: 3, name: 'Industrial Refining', desc: 'Automated fabrication lines.', credits: 4000, res: { alloy: 30, titanium: 20 }, time: 100, prereq: ['A2'], labs: 1, mods: { refine: 1.25 }, effects: ['Unlocks Refineries', 'Refinery speed +25%'] }),
  T({ id: 'A5', branch: 'automation', tier: 4, name: 'Swarm Intelligence', desc: 'Drones coordinate as a hive.', credits: 53000, res: { circuits: 40, nanites: 10 }, time: 280, prereq: ['A3'], labs: 2, mods: { droneOut: 2, autoPower: 1 }, effects: ['Drone output x2', 'Automation mining power +1'] }),
  T({ id: 'A6', branch: 'automation', tier: 5, name: 'Self-Replicating Factories', desc: 'Industry that maintains and expands itself.', credits: 360000, res: { nanites: 60, rare: 20 }, time: 560, prereq: ['A5', 'A4'], labs: 3, mods: { autoOut: 1.3, upkeep: 0.75 }, effects: ['All automation output +30%', 'Upkeep -25%'] }),
  // Exploration
  T({ id: 'X1', branch: 'exploration', tier: 1, name: 'Long-Range Sensors', desc: 'Extend your sensors past the frontier and open the Inner Reach.', credits: 250, res: { copper: 20, ice: 10 }, time: 25, prereq: [], mods: { scan: 1, sectors: 1 }, effects: ['Scan power +1', 'Unlocks sector: Inner Reach'] }),
  T({ id: 'X2', branch: 'exploration', tier: 2, name: 'Stellar Cartography', desc: 'Charts for the nebula-shrouded systems beyond.', credits: 1800, res: { titanium: 40, crystal: 10 }, time: 70, prereq: ['X1'], mods: { scan: 0.5, sectors: 2 }, effects: ['Scan power +0.5', 'Unlocks sector: Nebula Belt', 'Unlocks Deep Explorer'] }),
  T({ id: 'X3', branch: 'exploration', tier: 3, name: 'Anomaly Analysis', desc: 'Understand dangerous phenomena before they hurt you.', credits: 8000, res: { circuits: 20, crystal: 10 }, time: 130, prereq: ['X2'], labs: 1, mods: { scan: 1.5, sectors: 3, hazard: 0.7 }, effects: ['Scan power +1.5', 'Hazard damage -30%', 'Unlocks sector: The Deep Void'] }),
  T({ id: 'X4', branch: 'exploration', tier: 4, name: 'Deep Void Charts', desc: 'A map of the Galactic Core.', credits: 72000, res: { circuits: 30, rare: 5 }, time: 310, prereq: ['X3'], labs: 2, mods: { jump: 1.2, sectors: 4 }, effects: ['Jump range +20%', 'Unlocks sector: Galactic Core'] }),
  T({ id: 'X5', branch: 'exploration', tier: 5, name: 'Hyperspace Beacons', desc: 'Pre-laid beacons cut the cost of every journey.', credits: 216000, res: { nanites: 20, exotic: 6 }, time: 460, prereq: ['X4'], labs: 3, mods: { jumpEnergy: 0.7, speed: 1.2 }, effects: ['Jump energy -30%', 'Speed +20%'] }),
  // Energy
  T({ id: 'N1', branch: 'energy', tier: 1, name: 'Solar Efficiency', desc: 'Better panels and capacitors.', credits: 300, res: { copper: 30 }, time: 30, prereq: [], mods: { energyRegen: 1.3, power: 1.25 }, effects: ['Recharge +30%', 'All power output +25%', 'Unlocks Energy Cells recipe'] }),
  T({ id: 'N2', branch: 'energy', tier: 2, name: 'Fusion Reactors', desc: 'Miniaturised fusion plants.', credits: 2500, res: { titanium: 40, crystal: 8 }, time: 80, prereq: ['N1'], mods: { energyMax: 1.2 }, effects: ['Energy capacity +20%', 'Unlocks Fusion Reactors'] }),
  T({ id: 'N3', branch: 'energy', tier: 3, name: 'Capacitor Banks', desc: 'Store and release energy on demand.', credits: 7000, res: { circuits: 20, cells: 20 }, time: 120, prereq: ['N2'], labs: 1, mods: { energyMax: 1.4, shield: 1.2, mineEnergy: 0.85 }, effects: ['Energy capacity +40%', 'Shields +20%', 'Mining energy use -15%'] }),
  T({ id: 'N4', branch: 'energy', tier: 4, name: 'Antimatter Containment', desc: 'Magnetic bottles for pure annihilation.', credits: 91000, res: { nanites: 20, rare: 8, cells: 20 }, time: 340, prereq: ['N3'], labs: 2, mods: { weapon: 1.15 }, effects: ['Weapon damage +15%', 'Unlocks Antimatter Cores'] }),
  T({ id: 'N5', branch: 'energy', tier: 5, name: 'Zero-Point Extraction', desc: 'Tap the vacuum itself.', credits: 288000, res: { exotic: 10, nanites: 30 }, time: 500, prereq: ['N4'], labs: 3, mods: { power: 1.5, mineEnergy: 0.7, energyRegen: 1.5 }, effects: ['All power output +50%', 'Mining energy use -30%', 'Recharge +50%'] }),
  // Alien
  T({ id: 'L1', branch: 'alien', tier: 2, name: 'Xeno-Linguistics', desc: 'Decode the grammar of the vanished builders.', credits: 1200, res: { crystal: 20 }, time: 90, prereq: [], discoveries: 1, mods: { rewards: 1.25, poiScan: 1.5 }, effects: ['Discovery & exploration rewards +25%', 'Alien signals easier to detect (+1.5)'] }),
  T({ id: 'L2', branch: 'alien', tier: 3, name: 'Artifact Resonance', desc: 'Tune your laser to the frequency of alien crystal.', credits: 9000, res: { exotic: 3, rare: 10 }, time: 160, prereq: ['L1'], labs: 1, discoveries: 3, mods: { mine: 1.25 }, effects: ['Mining power +25%', 'Unlocks Exotic Matter synthesis'] }),
  T({ id: 'L3', branch: 'alien', tier: 4, name: 'Warp Core Fabrication', desc: 'Craft contained folds of space.', credits: 96000, res: { exotic: 8, nanites: 20, rare: 20 }, time: 390, prereq: ['L2'], labs: 2, discoveries: 5, mods: { jump: 1.15 }, effects: ['Unlocks Warp Core recipe', 'Jump range +15%'] }),
  T({ id: 'L4', branch: 'alien', tier: 4, name: 'Living Metal', desc: 'Alloy that heals itself.', credits: 108000, res: { exotic: 10, nanites: 20 }, time: 390, prereq: ['L2'], labs: 2, discoveries: 7, mods: { hull: 1.5, hullRegen: 0.5 }, effects: ['Hull +50%', 'Hull regenerates 0.5 / s'] }),
  T({ id: 'L5', branch: 'alien', tier: 5, name: 'Stellar Gateway Theory', desc: 'The blueprint for a gate that links the galaxy.', credits: 600000, res: { exotic: 25, warpcore: 5 }, time: 670, prereq: ['L3', 'L4'], labs: 3, discoveries: 10, mods: {}, effects: ['Unlocks the Stellar Gateway megaproject'] }),
];
export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

// ───────────────────────────── Enemies ─────────────────────────────
export type EnemyId = 'drone' | 'raider' | 'marauder' | 'corvette' | 'warlord' | 'sentinel';
export interface EnemyDef {
  id: EnemyId; name: string; hull: number; shield: number; dmg: number; acc: number; reward: number; color: number; boss?: boolean;
}
export const ENEMIES: Record<EnemyId, EnemyDef> = {
  drone: { id: 'drone', name: 'Hostile Drone', hull: 35, shield: 0, dmg: 6, acc: 0.9, reward: 40, color: 0xff5555 },
  raider: { id: 'raider', name: 'Pirate Raider', hull: 55, shield: 10, dmg: 8, acc: 0.75, reward: 60, color: 0xff9a4d },
  marauder: { id: 'marauder', name: 'Pirate Marauder', hull: 130, shield: 40, dmg: 15, acc: 0.8, reward: 160, color: 0xff6b3d },
  corvette: { id: 'corvette', name: 'Pirate Corvette', hull: 260, shield: 90, dmg: 28, acc: 0.8, reward: 380, color: 0xff3d6b },
  warlord: { id: 'warlord', name: 'Pirate Warlord', hull: 700, shield: 220, dmg: 55, acc: 0.85, reward: 1500, color: 0xff2b2b, boss: true },
  sentinel: { id: 'sentinel', name: 'Alien Sentinel', hull: 520, shield: 400, dmg: 45, acc: 0.8, reward: 1100, color: 0x7dffd0, boss: true },
};

// ───────────────────────────── Lore ─────────────────────────────
export interface LoreEntry { id: string; title: string; text: string; thread: string }
export const CODEX: LoreEntry[] = [
  // The Architects (artifacts)
  { id: 'arch1', thread: 'The Architects', title: 'Architect Fragment I', text: 'A shard of black glass that hums when you speak. The readout is not a language, but it feels like one that remembers being spoken.' },
  { id: 'arch2', thread: 'The Architects', title: 'Architect Fragment II', text: 'The Architects did not build ships. They built *places for ships to be*, and then left the doors open.' },
  { id: 'arch3', thread: 'The Architects', title: 'Architect Fragment III', text: 'Every artifact points to the same coordinates: the dead centre of the galaxy, where the light bends too kindly.' },
  { id: 'arch4', thread: 'The Architects', title: 'Architect Fragment IV', text: 'We found a sealed chamber with a single seat facing the stars. The dust on it was exactly one person deep.' },
  { id: 'arch5', thread: 'The Architects', title: 'Architect Fragment V', text: 'Their mathematics treats distance as a courtesy, not a law. Your jump drive is a crude imitation of a thing they did by sneezing.' },
  { id: 'arch6', thread: 'The Architects', title: 'Architect Fragment VI', text: 'The artifact is warm. It has been warm for four hundred million years, and it is getting warmer as you approach.' },
  { id: 'arch7', thread: 'The Architects', title: 'Architect Fragment VII', text: 'A star-chart etched in crystal. Nine systems are circled. Eight of them have no names yet, and are not on any map.' },
  { id: 'arch8', thread: 'The Architects', title: 'Architect Fragment VIII', text: 'The Gateway was never meant to be finished by one species. It was meant to be finished by whoever was curious enough to try.' },
  // Station logs
  { id: 'log1', thread: 'Station Logs', title: 'Log: Kessler Outpost', text: 'Day 212. Supply run is overdue again. The drones keep saying the belt is empty, but my scanner says otherwise. I think they are lying to me.' },
  { id: 'log2', thread: 'Station Logs', title: 'Log: Haldane Deep Relay', text: 'If anyone finds this: we did not abandon the station. The station abandoned us. Ask the airlocks.' },
  { id: 'log3', thread: 'Station Logs', title: 'Log: Voss Refinery', text: 'Management cut our crew in half and doubled the quota. The refinery runs fine. It is the crew that is breaking.' },
  { id: 'log4', thread: 'Station Logs', title: 'Log: Marrow Station', text: 'We named the station after the cook, because the cook was the only reason anyone stayed. He left last week. Now we are leaving too.' },
  { id: 'log5', thread: 'Station Logs', title: 'Log: Tantalus Platform', text: 'Pirates hit us twice, then stopped. Not because they were driven off. Because something else started hunting them.' },
  { id: 'log6', thread: 'Station Logs', title: 'Log: Orchard-9', text: 'Hydroponics are thriving. Nobody is left to eat. The tomatoes are enormous and we are almost sorry.' },
  { id: 'log7', thread: 'Station Logs', title: 'Log: Iridescent Dock', text: 'Final entry: the beacon is still broadcasting. It has been broadcasting since before the colony was founded.' },
  { id: 'log8', thread: 'Station Logs', title: 'Log: Brightwater Hub', text: 'Our contract said "recover and refine". It did not say what we would be recovering. The crates are still sealed. They are not quiet.' },
  // Wrecks
  { id: 'wreck1', thread: 'Wrecks & Salvage', title: 'The Gilded Mule', text: 'A freighter cut cleanly in half. No scorch marks. The cargo bay is full of perfectly preserved fruit.' },
  { id: 'wreck2', thread: 'Wrecks & Salvage', title: 'The Long Patience', text: 'A prospector\'s tug, hull full of ore, drive cold. The captain left a note: "Back in five minutes." The date is 80 years old.' },
  { id: 'wreck3', thread: 'Wrecks & Salvage', title: 'Raider Hulk "Sweetheart"', text: 'A pirate gunship, its guns welded shut from the inside. Someone really did not want to fight anymore.' },
  { id: 'wreck4', thread: 'Wrecks & Salvage', title: 'Survey Ship Indigo', text: 'The Indigo mapped four thousand stars before going silent. Its last survey is still running, quietly, in the dark.' },
  { id: 'wreck5', thread: 'Wrecks & Salvage', title: 'The Hollow Crown', text: 'A noble yacht with a vault. The vault is open and empty. The crew quarters are full of confetti.' },
  { id: 'wreck6', thread: 'Wrecks & Salvage', title: 'Mining Barge Ferrous Dream', text: 'Its autopilot is still mining a single asteroid. It has been cutting the same groove for two centuries.' },
  { id: 'wreck7', thread: 'Wrecks & Salvage', title: 'Medical Frigate Mercy', text: 'Beds made, instruments laid out, power on. Not a single patient file exists. The ship was never used. It was waiting.' },
  // Anomalies
  { id: 'anom1', thread: 'Anomalies', title: 'The Singing Rift', text: 'A tear in space that produces a perfect fifth. Your instruments disagree about whether it is getting closer.' },
  { id: 'anom2', thread: 'Anomalies', title: 'Echo of a Star', text: 'A star that died long ago, still visible. The light is real. The star is not. Neither is the planet it warms.' },
  { id: 'anom3', thread: 'Anomalies', title: 'Gravity Lantern', text: 'A pocket of folded gravity bright enough to read by. The shadows lean toward it. So do you.' },
  { id: 'anom4', thread: 'Anomalies', title: 'The Slow Storm', text: 'A tempest of ions one light-second wide, moving at a walking pace. It is, in its way, patient.' },
  { id: 'anom5', thread: 'Anomalies', title: 'Mirror Field', text: 'Your own ship, ahead of you, scanning back. It waves first.' },
  { id: 'anom6', thread: 'Anomalies', title: 'Temporal Eddy', text: 'Inside the eddy the clocks run backwards. You come out two minutes younger and a great deal more nervous.' },
  { id: 'anom7', thread: 'Anomalies', title: 'The Quiet Place', text: 'A volume of space where nothing is transmitted. Your comms go silent. For a moment it is the nicest thing that has happened to you all week.' },
  // Beacons / world
  { id: 'bea1', thread: 'Beacons', title: 'Star Chart Fragment', text: 'A navigational beacon, still listening. It sends you a map to somewhere that was not on any chart yesterday.' },
  { id: 'bea2', thread: 'Beacons', title: 'Lighthouse Protocol', text: 'This beacon has been shouting "come here" for ten thousand years. You have finally come. It seems relieved.' },
  { id: 'bea3', thread: 'Beacons', title: 'Cartographer\'s Ghost', text: 'An old survey AI wakes, offers you a hidden route, then asks quietly whether the war is over yet.' },
  { id: 'world1', thread: 'Unusual Worlds', title: 'The Living World', text: 'The planet has a pulse. Slow, deep, and in time with your own.' },
  { id: 'world2', thread: 'Unusual Worlds', title: 'Glass Planet', text: 'A world that cooled into a single perfect crystal. Light goes in and takes its time coming back out.' },
  { id: 'world3', thread: 'Unusual Worlds', title: 'The Whispering Dunes', text: 'The wind here forms words in the sand. They are always the name of the last person to land.' },
  { id: 'world4', thread: 'Unusual Worlds', title: 'Tidal Orchard', text: 'Gas-bag trees drift through the upper atmosphere in migrating groves. They are very slightly aware of you.' },
  { id: 'world5', thread: 'Unusual Worlds', title: 'Ringed Cathedral', text: 'A planet whose rings are arranged in exact, deliberate arcs. Someone tuned them. Someone is still tuning them.' },
  { id: 'world6', thread: 'Unusual Worlds', title: 'The Patient Sea', text: 'An ocean that is perfectly still. Drop a probe in and the ripples spell out a polite greeting.' },
];
export const CODEX_BY_ID: Record<string, LoreEntry> = Object.fromEntries(CODEX.map((c) => [c.id, c]));

// ───────────────────────────── Megaproject ─────────────────────────────
export interface MegaStage { name: string; desc: string; credits: number; res: ResBag }
export const MEGAPROJECT: MegaStage[] = [
  { name: 'Gate Foundation', desc: 'Lay the structural foundation ring of the Stellar Gateway.', credits: 2000000, res: { alloy: 800, circuits: 400 } },
  { name: 'Containment Ring', desc: 'Build the nanite-woven containment ring that will hold the fold open.', credits: 12000000, res: { nanites: 500, exotic: 200 } },
  { name: 'Ignite the Gateway', desc: 'Install the warp cores and ignite the Gateway.', credits: 60000000, res: { warpcore: 100, exotic: 400 } },
];

export const START_CREDITS = 500;
export const MAX_LOG = 40;
