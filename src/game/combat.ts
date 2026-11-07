import { ENEMIES, type EnemyId, type ResBag } from './data';
import { getGalaxy } from './galaxy';
import { sfx, toast } from './events';
import { track } from './track';
import { addCredits, currentSystem, getMods, pushLog, rand, randRange, shipStats, threat, type CombatEnemy, type CombatState, type GameState } from './state';
import { applyDamage, completePoi, grantResources, handleDisabled, rewardMult } from './world';

export type EncounterKind = 'pirate' | 'drone' | 'guardian';

function mkEnemy(s: GameState, id: EnemyId, T: number): CombatEnemy {
  const d = ENEMIES[id];
  const hs = 1 + 0.45 * T;
  const ds = 1 + 0.35 * T;
  const v = randRange(s, 0.95, 1.05);
  return { id, hull: Math.round(d.hull * hs * v), hullMax: Math.round(d.hull * hs * v), shield: Math.round(d.shield * hs), shieldMax: Math.round(d.shield * hs), dmg: d.dmg * ds, acc: d.acc, reward: d.reward };
}

export function buildEnemies(s: GameState, kind: EncounterKind): CombatEnemy[] {
  const T = threat(s);
  const ids: EnemyId[] = [];
  const n = (a: number, b: number) => a + Math.floor(rand(s) * (b - a + 1));
  if (kind === 'drone') {
    for (let i = 0, c = n(2, 3 + Math.floor(T / 2)); i < c; i++) ids.push('drone');
  } else if (kind === 'guardian') {
    if (currentSystem(s).sector >= 2 && rand(s) < 0.35) ids.push('sentinel');
    else if (T < 1.5) for (let i = 0, c = n(2, 3); i < c; i++) ids.push('drone');
    else {
      ids.push('marauder');
      if (T >= 2.5) ids.push('raider');
    }
  } else if (T < 1) {
    for (let i = 0, c = n(1, 2); i < c; i++) ids.push('raider');
  } else if (T < 2) {
    ids.push('raider');
    ids.push(rand(s) < 0.5 ? 'raider' : 'marauder');
  } else if (T < 3) {
    for (let i = 0, c = n(1, 2); i < c; i++) ids.push('marauder');
    if (rand(s) < 0.4) ids.push('raider');
  } else if (T < 4.5) {
    ids.push('corvette');
    ids.push('marauder');
  } else {
    ids.push(rand(s) < 0.3 ? 'warlord' : 'corvette');
    ids.push('corvette');
  }
  return ids.slice(0, 4).map((id) => mkEnemy(s, id, T));
}

export function startEncounter(s: GameState, kind: EncounterKind, source: CombatState['source'], opts: { forced?: boolean; poiId?: string | null } = {}): void {
  if (s.combat || s.event) return;
  if (s.activity.type === 'mining' || s.activity.type === 'scanning') s.activity = { type: 'idle' };
  const enemies = buildEnemies(s, kind);
  const forced = !!opts.forced;
  s.combat = {
    phase: forced ? 'fight' : 'alert', forced, source, poiId: opts.poiId ?? null, enemies, evading: false, round: 1, log: [],
    loot: null, bribe: kind === 'pirate' ? Math.max(50, Math.round(s.credits * 0.12)) : 0,
  };
  const names = enemies.map((e) => ENEMIES[e.id].name).join(', ');
  s.combat.log.push(forced ? `Hostiles engage: ${names}.` : `Contact! ${names} detected.`);
  sfx('alert');
}

const ENERGY = { fire: 5, overcharge: 20, shield: 12, evade: 4, flee: 6 };
export type CombatAction = 'fire' | 'overcharge' | 'shield' | 'evade' | 'flee' | 'engage' | 'bribe';

function say(c: CombatState, msg: string) {
  c.log.push(msg);
  if (c.log.length > 14) c.log.shift();
}

function dealDamage(e: CombatEnemy, dmg: number): void {
  const sh = Math.min(e.shield, dmg);
  e.shield -= sh;
  e.hull = Math.max(0, e.hull - (dmg - sh));
}

function enemyTurn(s: GameState): void {
  const c = s.combat!;
  const st = shipStats(s);
  const m = getMods(s);
  for (const e of c.enemies) {
    if (e.hull <= 0) continue;
    const name = ENEMIES[e.id].name;
    const hit = rand(s) < e.acc * (c.evading ? 0.4 : 1);
    if (hit) {
      const dmg = Math.round(e.dmg * randRange(s, 0.8, 1.2) * (e.id === 'sentinel' ? 1 : 1));
      const hadShield = s.ship.shield > 0;
      const dead = applyDamage(s, dmg);
      say(c, `${name} hits you for ${dmg}${hadShield && s.ship.shield <= 0 ? ' (shields down!)' : ''}.`);
      sfx('hit');
      if (dead) break;
    } else {
      say(c, `${name} misses.`);
    }
    if (e.shieldMax > 0) e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * 0.05);
  }
  c.evading = false;
  s.ship.shield = Math.min(st.shieldMax, s.ship.shield + st.shieldMax * 0.04);
  s.ship.energy = Math.min(st.energyMax, s.ship.energy + 3 * m.energyRegen);
  c.round++;
}

function win(s: GameState): void {
  const c = s.combat!;
  const sys = currentSystem(s);
  const T = threat(s);
  let credits = 0;
  const salvage: ResBag = {};
  for (const e of c.enemies) credits += e.reward * (1 + 0.3 * sys.sector);
  credits = Math.round(credits * randRange(s, 0.9, 1.2) * rewardMult(s));
  salvage.iron = Math.round(randRange(s, 8, 30) * (1 + T));
  if (T >= 1) salvage.titanium = Math.round(randRange(s, 4, 16) * (1 + T * 0.6));
  if (T >= 2 && rand(s) < 0.5) salvage.crystal = Math.round(randRange(s, 2, 8));
  if (T >= 2 && rand(s) < 0.18) salvage.rare = Math.round(randRange(s, 1, 4));
  if (c.enemies.some((e) => ENEMIES[e.id].boss) && rand(s) < 0.5) salvage.exotic = Math.round(randRange(s, 1, 3));
  addCredits(s, credits);
  const parts = grantResources(s, salvage);
  c.loot = { credits, res: salvage };
  c.phase = 'won';
  s.stats.kills += c.enemies.length;
  s.stats.combatsWon++;
  track(s, { t: 'kills', n: c.enemies.length });
  say(c, `Victory! Salvaged ${credits} credits${parts.length ? ', ' + parts.join(', ') : ''}.`);
  pushLog(s, `Defeated ${c.enemies.length} hostile${c.enemies.length > 1 ? 's' : ''}: +${credits} credits`, 'good');
  toast(`Victory! +${credits} credits`, 'good');
  sfx('mission');
  if (c.poiId) {
    const poi = getGalaxy(s.seed).pois.get(c.poiId);
    if (poi) {
      // a guarded POI may still carry a hazard on top of the guard
      completePoi(s, poi);
    }
  }
}

export function combatAction(s: GameState, action: CombatAction, target = 0): { ok: boolean; msg: string } {
  const c = s.combat;
  if (!c) return { ok: false, msg: 'No encounter.' };
  const st = shipStats(s);
  if (c.phase === 'won' || c.phase === 'lost' || c.phase === 'fled') return { ok: false, msg: 'The fight is over.' };

  if (c.phase === 'alert') {
    if (action === 'engage') {
      c.phase = 'fight';
      say(c, 'You turn to face them.');
      return { ok: true, msg: 'Engaged.' };
    }
    if (action === 'bribe') {
      if (c.bribe <= 0) return { ok: false, msg: 'They are not interested in credits.' };
      if (s.credits < c.bribe) return { ok: false, msg: 'You cannot afford the tribute.' };
      s.credits -= c.bribe;
      c.phase = 'fled';
      say(c, `You pay ${c.bribe} credits and they let you pass.`);
      return { ok: true, msg: 'Paid tribute.' };
    }
    if (action !== 'flee') return { ok: false, msg: 'Choose to fight, flee or pay.' };
  }

  if (action === 'bribe' || action === 'engage') return { ok: false, msg: 'Not available now.' };
  const alive = c.enemies.filter((e) => e.hull > 0);
  const cost = ENERGY[action as keyof typeof ENERGY] * st.energyMult;
  if (s.ship.energy + 1e-9 < cost) return { ok: false, msg: `Not enough energy (${Math.ceil(cost)} needed).` };

  if (action === 'flee') {
    s.ship.energy -= cost;
    const chance = Math.min(0.9, Math.max(0.15, 0.3 + 0.22 * st.speed - 0.06 * alive.length));
    if (rand(s) < chance) {
      c.phase = 'fled';
      say(c, 'You break away and escape!');
      sfx('jump');
      return { ok: true, msg: 'Escaped.' };
    }
    say(c, 'You fail to break away!');
    enemyTurn(s);
  } else if (action === 'shield') {
    s.ship.energy -= cost;
    s.ship.shield = Math.min(st.shieldMax, s.ship.shield + st.shieldMax * 0.4);
    say(c, 'Shields boosted.');
    sfx('shield');
    enemyTurn(s);
  } else if (action === 'evade') {
    s.ship.energy -= cost;
    c.evading = true;
    say(c, 'You throw the ship into evasive manoeuvres.');
    enemyTurn(s);
  } else {
    s.ship.energy -= cost;
    let t = c.enemies[target];
    if (!t || t.hull <= 0) t = alive[0];
    const shots = s.ship.active === 'combat' && action === 'fire' ? 2 : 1;
    for (let i = 0; i < shots; i++) {
      if (t.hull <= 0) t = c.enemies.find((e) => e.hull > 0) ?? t;
      if (t.hull <= 0) break;
      const over = action === 'overcharge';
      if (!over && rand(s) > 0.92) {
        say(c, 'Your shot goes wide.');
        continue;
      }
      const dmg = Math.round(st.weapon * randRange(s, 0.85, 1.15) * (over ? 2.5 : 1));
      dealDamage(t, dmg);
      say(c, `${over ? 'Overcharged shot' : 'You fire'} at ${ENEMIES[t.id].name}: ${dmg} damage${t.hull <= 0 ? ' - destroyed!' : ''}.`);
      sfx('laser');
      if (t.hull <= 0) sfx('explode');
    }
    if (c.enemies.every((e) => e.hull <= 0)) {
      win(s);
      return { ok: true, msg: 'Victory!' };
    }
    enemyTurn(s);
  }

  if (s.ship.hull <= 0) {
    c.phase = 'lost';
    say(c, 'Your hull is breached!');
    handleDisabledLater(s);
  } else if (c.phase === 'alert') {
    c.phase = 'fight';
  }
  return { ok: true, msg: 'Done.' };
}

/** After a defeat the modal still needs the log, so we keep the combat object and resolve the penalty when closed. */
function handleDisabledLater(_s: GameState): void {}

export function closeCombat(s: GameState): void {
  const c = s.combat;
  if (!c) return;
  if (c.phase === 'lost') {
    handleDisabled(s, 'Defeated in combat.');
    return;
  }
  if (c.phase === 'fight' || c.phase === 'alert') {
    // cannot close an active fight; treat as flee attempt refused
    return;
  }
  s.combat = null;
}
