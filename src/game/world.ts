import { CODEX_BY_ID, RES, TECHS, type ResBag, type ResId } from './data';
import { getGalaxy, type Poi } from './galaxy';
import { bus, sfx, toast } from './events';
import { track } from './track';
import { addCredits, addRes, getMods, pushLog, recomputeDetected, shipStats, type GameState } from './state';
import { MINEABLE } from './data';

export const rewardMult = (s: GameState) => getMods(s).rewards * (s.ship.active === 'explorer' ? 1.25 : 1);

export function addCodex(s: GameState, id: string | null): boolean {
  if (!id || s.codex.includes(id)) return false;
  s.codex.push(id);
  const e = CODEX_BY_ID[id];
  if (e) {
    toast(`Codex updated: ${e.title}`, 'loot');
    pushLog(s, `Codex: ${e.title}`, 'loot');
  }
  return true;
}

export function grantResources(s: GameState, bag: ResBag, scale = 1): string[] {
  const parts: string[] = [];
  for (const k of Object.keys(bag) as ResId[]) {
    const n = Math.round((bag[k] as number) * scale);
    if (n <= 0) continue;
    const added = addRes(s, k, n);
    if (added > 0) parts.push(`${Math.floor(added)} ${RES[k].name}`);
  }
  return parts;
}

/** Returns true if the ship was disabled by the damage. */
export function applyDamage(s: GameState, amount: number): boolean {
  let dmg = Math.max(0, amount);
  const absorbed = Math.min(s.ship.shield, dmg);
  s.ship.shield -= absorbed;
  dmg -= absorbed;
  s.ship.hull = Math.max(0, s.ship.hull - dmg);
  return s.ship.hull <= 0;
}

export function handleDisabled(s: GameState, cause: string): void {
  const g = getGalaxy(s.seed);
  const st = shipStats(s);
  for (const r of MINEABLE) s.cargo[r] = 0;
  const fee = Math.min(s.credits, Math.round(s.credits * 0.08) + 50);
  s.credits -= fee;
  s.location = g.homeId;
  s.activity = { type: 'idle' };
  s.ship.hull = Math.max(1, Math.round(st.hullMax * 0.4));
  s.ship.shield = 0;
  s.ship.energy = Math.min(s.ship.energy, 40);
  s.combat = null;
  s.event = null;
  s.stats.combatsLost++;
  recomputeDetected(s);
  const msg = `${cause} Your ship was disabled and towed home. Cargo lost, ${fee} credits paid in recovery fees.`;
  toast(msg, 'bad');
  pushLog(s, msg, 'bad');
  sfx('explode');
}

export function grantTech(s: GameState): string | null {
  const cand = TECHS.filter((t) => !s.research.done.includes(t.id) && s.research.current?.id !== t.id && t.prereq.every((p) => s.research.done.includes(p)))
    .sort((a, b) => a.credits - b.credits);
  const t = cand[0];
  if (!t) return null;
  s.research.done.push(t.id);
  s.stats.researchDone++;
  track(s, { t: 'research' });
  recomputeDetected(s);
  return t.name;
}

export function revealSystem(s: GameState, id: string | null): string | null {
  if (!id || s.revealedSystems[id]) return null;
  const sys = getGalaxy(s.seed).byId.get(id);
  if (!sys) return null;
  s.revealedSystems[id] = true;
  s.detected[id] = true;
  return sys.name;
}

export function completePoi(s: GameState, poi: Poi): void {
  if (s.poisDone[poi.id]) return;
  s.poisDone[poi.id] = true;
  s.stats.discoveries++;
  const mult = rewardMult(s);
  const credits = Math.round(poi.reward.credits * mult);
  addCredits(s, credits);
  const parts = grantResources(s, poi.reward.res);
  addCodex(s, poi.reward.codex);
  const extra: string[] = [];
  if (poi.reward.reveals) {
    const n = revealSystem(s, poi.reward.reveals);
    if (n) extra.push(`Hidden system revealed: ${n}`);
  }
  if (poi.reward.tech) {
    const t = grantTech(s);
    extra.push(t ? `Technology unlocked: ${t}` : 'The vault contained only credits.');
    if (!t) addCredits(s, 1000);
  }
  const msg = `${poi.name}: +${credits} credits${parts.length ? ', ' + parts.join(', ') : ''}${extra.length ? '. ' + extra.join('. ') : ''}`;
  toast(msg, 'loot');
  pushLog(s, msg, 'loot');
  track(s, { t: 'investigate' });
  sfx('discover');
  bus.emit('discovery', poi);
}
