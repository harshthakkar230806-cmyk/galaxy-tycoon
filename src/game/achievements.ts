import { TECHS } from './data';
import { getGalaxy } from './galaxy';
import { bus, sfx, toast } from './events';
import { addCredits, ownedCount, totalUpgradeLevels, type GameState } from './state';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  reward: number;
  target: number;
  value: (s: GameState) => number;
}

const A = (id: string, name: string, desc: string, icon: string, reward: number, target: number, value: (s: GameState) => number): Achievement => ({ id, name, desc, icon, reward, target, value });
const visitedCount = (s: GameState) => Object.keys(s.visited).length;
const maxLevel = (s: GameState) => Math.max(...Object.values(s.upgrades));
const bestSector = (s: GameState) => {
  const g = getGalaxy(s.seed);
  let m = 0;
  for (const id of Object.keys(s.visited)) m = Math.max(m, g.byId.get(id)?.sector ?? 0);
  return m;
};

export const ACHIEVEMENTS: Achievement[] = [
  A('ore100', 'Prospector', 'Mine 100 units of ore.', '⛏', 50, 100, (s) => s.stats.minedTotal),
  A('ore1k', 'Quarry Master', 'Mine 1,000 units of ore.', '⛏', 150, 1000, (s) => s.stats.minedTotal),
  A('ore10k', 'Strip Miner', 'Mine 10,000 units of ore.', '⛏', 600, 10000, (s) => s.stats.minedTotal),
  A('ore100k', 'Planet Cracker', 'Mine 100,000 units of ore.', '⛏', 5000, 100000, (s) => s.stats.minedTotal),
  A('sale1', 'Open for Business', 'Sell 10 units of resources.', '¤', 30, 10, (s) => s.stats.sold),
  A('cr1k', 'Pocket Change', 'Earn 1,000 credits in total.', '¤', 50, 1000, (s) => s.stats.creditsEarned),
  A('cr10k', 'Small Business', 'Earn 10,000 credits in total.', '¤', 200, 10000, (s) => s.stats.creditsEarned),
  A('cr100k', 'Trade Baron', 'Earn 100,000 credits in total.', '¤', 1500, 100000, (s) => s.stats.creditsEarned),
  A('cr1m', 'Millionaire', 'Earn 1,000,000 credits in total.', '¤', 10000, 1000000, (s) => s.stats.creditsEarned),
  A('cr10m', 'Tycoon', 'Earn 10,000,000 credits in total.', '¤', 60000, 10000000, (s) => s.stats.creditsEarned),
  A('upg1', 'Tinkerer', 'Buy your first ship upgrade.', '⚡', 40, 1, (s) => s.stats.upgradesBought),
  A('upg10', 'Mechanic', 'Buy 10 ship upgrades.', '⚡', 250, 10, (s) => s.stats.upgradesBought),
  A('upg40', 'Fully Loaded', 'Buy 40 ship upgrades.', '⚡', 5000, 40, (s) => s.stats.upgradesBought),
  A('upgmax', 'Pushing the Limit', 'Raise any ship upgrade to level 10.', '⚡', 20000, 10, maxLevel),
  A('ship1', 'New Wheels', 'Buy a new ship.', '➤', 500, 1, (s) => s.stats.shipsBought),
  A('ship6', 'Fleet Admiral', 'Own all six ship classes.', '➤', 80000, 6, (s) => s.ship.owned.length),
  A('sys5', 'Neighbourhood Watch', 'Visit 5 star systems.', '✺', 100, 5, visitedCount),
  A('sys25', 'Cartographer', 'Visit 25 star systems.', '✺', 1500, 25, visitedCount),
  A('sys60', 'Galactic Wanderer', 'Visit 60 star systems.', '✺', 25000, 60, visitedCount),
  A('sec2', 'Into the Nebula', 'Visit a system in the Nebula Belt.', '✺', 2500, 2, bestSector),
  A('sec4', 'Heart of the Galaxy', 'Visit a system in the Galactic Core.', '✺', 60000, 4, bestSector),
  A('scan10', 'Curious', 'Reveal 10 celestial bodies.', '◎', 80, 10, (s) => s.stats.bodiesRevealed),
  A('scan50', 'Surveyor', 'Reveal 50 celestial bodies.', '◎', 800, 50, (s) => s.stats.bodiesRevealed),
  A('scan150', 'Planetologist', 'Reveal 150 celestial bodies.', '◎', 8000, 150, (s) => s.stats.bodiesRevealed),
  A('disc1', 'First Contact', 'Make your first discovery.', '?', 150, 1, (s) => s.stats.discoveries),
  A('disc5', 'Relic Hunter', 'Make 5 discoveries.', '?', 1000, 5, (s) => s.stats.discoveries),
  A('disc15', 'Archaeologist', 'Make 15 discoveries.', '?', 12000, 15, (s) => s.stats.discoveries),
  A('disc30', 'Keeper of Secrets', 'Make 30 discoveries.', '?', 90000, 30, (s) => s.stats.discoveries),
  A('codex10', 'Storyteller', 'Collect 10 codex entries.', '☰', 1200, 10, (s) => s.codex.length),
  A('codex25', 'Lorekeeper', 'Collect 25 codex entries.', '☰', 20000, 25, (s) => s.codex.length),
  A('kill1', 'Self Defence', 'Defeat a hostile ship.', '✦', 100, 1, (s) => s.stats.kills),
  A('kill10', 'Pirate Hunter', 'Defeat 10 hostile ships.', '✦', 1200, 10, (s) => s.stats.kills),
  A('kill50', 'Scourge of the Void', 'Defeat 50 hostile ships.', '✦', 25000, 50, (s) => s.stats.kills),
  A('storm1', 'Weathered', 'Survive an asteroid storm.', '☄', 100, 1, (s) => s.stats.storms),
  A('drone10', 'Hive Mind', 'Own 10 mining drones.', '✧', 500, 10, (s) => ownedCount(s, 'drone')),
  A('station3', 'Orbital Magnate', 'Own 3 mining stations.', '⬢', 12000, 3, (s) => ownedCount(s, 'station')),
  A('ref1', 'Fabricator', 'Build a refinery.', '⚙', 1200, 1, (s) => ownedCount(s, 'refinery')),
  A('lab3', 'Think Tank', 'Own 3 research laboratories.', '⚗', 4000, 3, (s) => ownedCount(s, 'lab')),
  A('res1', 'Eureka', 'Complete your first research.', '⚗', 100, 1, (s) => s.stats.researchDone),
  A('res10', 'Scholar', 'Complete 10 researches.', '⚗', 5000, 10, (s) => s.stats.researchDone),
  A('resall', 'Omniscient', 'Complete the entire technology tree.', '⚗', 200000, TECHS.length, (s) => s.stats.researchDone),
  A('craft100', 'Assembly Line', 'Fabricate 100 materials.', '⚙', 2500, 100, (s) => s.stats.craftedTotal),
  A('nano', 'Grey Goo', 'Fabricate 10 nanites.', '⚙', 20000, 10, (s) => s.stats.crafted.nanites),
  A('warp', 'Fold Space', 'Fabricate a warp core.', '⚙', 60000, 1, (s) => s.stats.crafted.warpcore),
  A('mis1', 'Odd Jobs', 'Complete a mission.', '☰', 80, 1, (s) => s.stats.missionsDone),
  A('mis10', 'Contractor', 'Complete 10 missions.', '☰', 1500, 10, (s) => s.stats.missionsDone),
  A('mis50', 'Guild Legend', 'Complete 50 missions.', '☰', 40000, 50, (s) => s.stats.missionsDone),
  A('away', 'Welcome Back', 'Earn resources while away from the game.', '☾', 100, 1, (s) => Math.min(1, s.stats.offlineSeconds / 60)),
  A('mega1', 'Foundations', 'Complete stage 1 of the Stellar Gateway.', '◎', 100000, 1, (s) => s.mega),
  A('mega3', 'Gatekeeper', 'Ignite the Stellar Gateway.', '◎', 1000000, 3, (s) => s.mega),
];
export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export function checkAchievements(s: GameState): void {
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id]) continue;
    if (a.value(s) >= a.target) {
      s.achievements[a.id] = Date.now();
      addCredits(s, a.reward);
      toast(`Achievement: ${a.name} (+${a.reward.toLocaleString('en-US')} credits)`, 'good');
      sfx('achievement');
      bus.emit('achievement', a);
    }
  }
}
export { totalUpgradeLevels };
