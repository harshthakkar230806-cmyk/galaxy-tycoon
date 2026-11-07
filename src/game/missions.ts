import { BUILDINGS, RES, TECHS, type BuildingId, type MineRes, type ResBag, type ResId } from './data';
import { addCredits, addRes, hasTech, rand, randRange, type GameState, type Mission, type ObjType } from './state';
import { bus, sfx, toast } from './events';

export const MAX_ACTIVE = 4;
export const BOARD_SIZE = 5;

export function missionTier(s: GameState): number {
  const e = s.stats.creditsEarned;
  return Math.max(0, Math.min(6, Math.floor(Math.log10(e / 200 + 1) * 1.6)));
}

const pick = <T,>(s: GameState, arr: readonly T[]): T => arr[Math.floor(rand(s) * arr.length) % arr.length];

function bonusRes(s: GameState, tier: number): ResBag {
  if (rand(s) < 0.45) return {};
  const pool: [ResId, number][] = tier < 1 ? [['iron', 40]] : tier < 2 ? [['titanium', 15], ['copper', 40]] : tier < 3 ? [['alloy', 6], ['crystal', 8]] : tier < 4 ? [['circuits', 8], ['alloy', 12]] : tier < 5 ? [['nanites', 4], ['rare', 6]] : [['nanites', 10], ['exotic', 2]];
  const [r, n] = pick(s, pool);
  return { [r]: Math.round(n * randRange(s, 0.8, 1.4)) };
}

type Make = (s: GameState, tier: number) => Omit<Mission, 'id' | 'progress'> | null;
const MINE_BASE: Record<MineRes, number> = { iron: 100, copper: 80, ice: 80, titanium: 50, crystal: 30, rare: 15 };

const TEMPLATES: Record<string, Make> = {
  mine_res: (s, tier) => {
    const pool: MineRes[] = ['iron', 'copper', 'ice'];
    if (tier >= 1) pool.push('titanium');
    if (tier >= 2) pool.push('crystal');
    if (tier >= 4) pool.push('rare');
    const r = pick(s, pool);
    const n = Math.round((MINE_BASE[r] * (1 + tier * 1.2)) / 5) * 5;
    return { tpl: 'mine_res', title: `Mine ${n} ${RES[r].name}`, desc: `Extract and keep ${n} units of ${RES[r].name.toLowerCase()} using your laser or automation.`, type: 'mine', key: r, target: n, tier, reward: { credits: Math.round(n * RES[r].price * 1.7 + 60), res: bonusRes(s, tier) } };
  },
  mine_any: (s, tier) => {
    const n = Math.round((150 * (1 + tier * 1.5)) / 10) * 10;
    return { tpl: 'mine_any', title: `Mine ${n} units of ore`, desc: 'Mine any combination of ore.', type: 'mine', key: '', target: n, tier, reward: { credits: Math.round(n * 7 + 40), res: bonusRes(s, tier) } };
  },
  scan_bodies: (s, tier) => {
    const n = Math.min(3 + tier, 8);
    return { tpl: 'scan_bodies', title: `Discover ${n} celestial bodies`, desc: 'Scan to reveal planets, moons and asteroid fields you have not yet found.', type: 'scanBodies', key: '', target: n, tier, reward: { credits: Math.round(180 * (1 + tier * 0.9)), res: bonusRes(s, tier) } };
  },
  visit: (s, tier) => {
    const n = Math.min(1 + Math.floor(tier / 2), 4);
    return { tpl: 'visit', title: n === 1 ? 'Explore a new star system' : `Explore ${n} new star systems`, desc: 'Jump to star systems you have never visited.', type: 'visit', key: '', target: n, tier, reward: { credits: Math.round(260 * (1 + tier * 1.0)), res: bonusRes(s, tier) } };
  },
  build: (s, tier) => {
    const ids = (Object.keys(BUILDINGS) as BuildingId[]).filter((id) => hasTech(s, BUILDINGS[id].unlock) && (id !== 'antimatter') && (tier >= 2 || ['drone', 'solar', 'lab'].includes(id)) && (tier >= 1 || id !== 'lab'));
    if (!ids.length) return null;
    const id = pick(s, ids);
    const n = id === 'drone' || id === 'solar' ? 2 : 1;
    const b = BUILDINGS[id];
    return { tpl: 'build', title: `Build ${n > 1 ? n + ' × ' : 'a '}${b.name}`, desc: `Construct ${n > 1 ? n + ' ' + b.name + 's' : 'a ' + b.name} anywhere in your empire.`, type: 'build', key: id, target: n, tier, reward: { credits: Math.round(b.credits * n * 0.9 + 120), res: bonusRes(s, tier) } };
  },
  kills: (s, tier) => {
    const n = Math.min(1 + Math.floor(tier / 1.5), 5);
    return { tpl: 'kills', title: n === 1 ? 'Defeat a pirate encounter' : `Defeat ${n} hostile ships`, desc: 'Engage pirates or hostile drones. Use Patrol in the System screen to find a fight.', type: 'kills', key: '', target: n, tier, reward: { credits: Math.round(280 * (1 + tier * 0.9)), res: bonusRes(s, tier) } };
  },
  research: (s, tier) => {
    if (TECHS.every((t) => s.research.done.includes(t.id))) return null;
    const n = tier >= 3 ? 2 : 1;
    return { tpl: 'research', title: n === 1 ? 'Research a new technology' : `Research ${n} technologies`, desc: 'Complete research projects in the Research Tree.', type: 'research', key: '', target: n, tier, reward: { credits: Math.round(300 * (1 + tier)), res: bonusRes(s, tier) } };
  },
  sell: (s, tier) => {
    const n = Math.round((500 * Math.pow(1 + tier * 2.2, 1.5)) / 100) * 100;
    return { tpl: 'sell', title: `Earn ${n.toLocaleString('en-US')} credits from sales`, desc: 'Sell resources on the market.', type: 'sell', key: '', target: n, tier, reward: { credits: Math.round(n * 0.25), res: bonusRes(s, tier) } };
  },
  craft: (s, tier) => {
    if (tier < 1) return null;
    const res = (tier >= 3 ? pick(s, ['alloy', 'circuits'] as const) : 'alloy') as 'alloy' | 'circuits';
    const n = 5 + tier * 4;
    return { tpl: 'craft', title: `Fabricate ${n} ${RES[res].name}`, desc: 'Craft materials by hand or with refineries.', type: 'craft', key: res, target: n, tier, reward: { credits: Math.round(n * RES[res].price * 1.3), res: bonusRes(s, tier) } };
  },
  investigate: (s, tier) => {
    const n = 1 + Math.floor(tier / 3);
    return { tpl: 'investigate', title: n === 1 ? 'Investigate a point of interest' : `Investigate ${n} points of interest`, desc: 'Find and investigate abandoned stations, artifacts, wrecks or anomalies.', type: 'investigate', key: '', target: n, tier, reward: { credits: Math.round(420 * (1 + tier * 0.9)), res: bonusRes(s, tier) } };
  },
  jump: (s, tier) => {
    const n = 2 + tier;
    return { tpl: 'jump', title: `Make ${n} jumps`, desc: 'Travel between star systems.', type: 'jump', key: '', target: n, tier, reward: { credits: Math.round(160 * (1 + tier * 0.8)), res: bonusRes(s, tier) } };
  },
  scan: (s, tier) => {
    const n = 2 + Math.floor(tier / 2);
    return { tpl: 'scan', title: `Perform ${n} system scans`, desc: 'Use the Scan button in the System screen.', type: 'scan', key: '', target: n, tier, reward: { credits: Math.round(120 * (1 + tier)), res: bonusRes(s, tier) } };
  },
};

export function refillBoard(s: GameState): void {
  const tier = missionTier(s);
  const used = new Set([...s.missions.board, ...s.missions.active].map((m) => m.tpl));
  const ids = Object.keys(TEMPLATES);
  let guard = 0;
  while (s.missions.board.length < BOARD_SIZE && guard++ < 60) {
    const id = pick(s, ids);
    if (used.has(id)) continue;
    const mk = TEMPLATES[id](s, tier);
    if (!mk) {
      used.add(id);
      continue;
    }
    used.add(id);
    s.missions.board.push({ ...mk, id: s.missions.nextId++, progress: 0 });
  }
}

export function acceptMission(s: GameState, id: number): { ok: boolean; msg: string } {
  if (s.missions.active.length >= MAX_ACTIVE) return { ok: false, msg: `You can only run ${MAX_ACTIVE} missions at once.` };
  const i = s.missions.board.findIndex((m) => m.id === id);
  if (i < 0) return { ok: false, msg: 'That mission is no longer available.' };
  const [m] = s.missions.board.splice(i, 1);
  m.progress = 0;
  s.missions.active.push(m);
  sfx('click');
  return { ok: true, msg: `Accepted: ${m.title}` };
}

export function claimMission(s: GameState, id: number): { ok: boolean; msg: string } {
  const i = s.missions.active.findIndex((m) => m.id === id);
  if (i < 0) return { ok: false, msg: 'Mission not found.' };
  const m = s.missions.active[i];
  if (m.progress < m.target) return { ok: false, msg: 'Mission is not complete yet.' };
  s.missions.active.splice(i, 1);
  addCredits(s, m.reward.credits);
  for (const k of Object.keys(m.reward.res) as ResId[]) addRes(s, k, m.reward.res[k] as number);
  s.stats.missionsDone++;
  refillBoard(s);
  sfx('mission');
  toast(`Mission complete: ${m.title}`, 'good');
  bus.emit('missionDone', m);
  return { ok: true, msg: `Mission complete! +${m.reward.credits} credits` };
}

export function abandonMission(s: GameState, id: number): { ok: boolean; msg: string } {
  const i = s.missions.active.findIndex((m) => m.id === id);
  if (i < 0) return { ok: false, msg: 'Mission not found.' };
  s.missions.active.splice(i, 1);
  refillBoard(s);
  return { ok: true, msg: 'Mission abandoned.' };
}

export const OBJ_ICON: Record<ObjType, string> = { mine: '⛏', scanBodies: '◎', visit: '✺', build: '⬢', kills: '✦', research: '⚗', sell: '¤', craft: '⚙', investigate: '?', scan: '◎', jump: '➤' };
