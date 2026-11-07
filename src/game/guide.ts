import { getGalaxy } from './galaxy';
import { getMods, hasTech, ownedCount, totalUpgradeLevels, addCredits, type GameState } from './state';
import { grantResources } from './world';
import { sfx, toast } from './events';
import type { ResBag } from './data';

export interface Directive {
  title: string;
  hint: string;
  screen: string; // where to go
  reward: { credits: number; res?: ResBag };
  done: (s: GameState) => boolean;
  progress?: (s: GameState) => [number, number];
}

const visited = (s: GameState) => Object.keys(s.visited).length;

export const DIRECTIVES: Directive[] = [
  { title: 'Fire up the laser', hint: 'Open System, select the asteroid belt and press Start Mining. Mine 20 units.', screen: 'system', reward: { credits: 40 }, done: (s) => s.stats.minedTotal >= 20, progress: (s) => [Math.min(20, Math.floor(s.stats.minedTotal)), 20] },
  { title: 'Unload your cargo', hint: 'Press Unload in the System screen to move your cargo hold into the warehouse.', screen: 'system', reward: { credits: 40 }, done: (s) => s.stats.unloads >= 1 },
  { title: 'Sell your ore', hint: 'Open Cargo, then Market, and sell at least 10 units of ore.', screen: 'cargo', reward: { credits: 60 }, done: (s) => s.stats.sold >= 10, progress: (s) => [Math.min(10, Math.floor(s.stats.sold)), 10] },
  { title: 'Buy your first upgrade', hint: 'Open Hangar and upgrade your Mining Laser or Cargo Hold. Every upgrade shows its effect first.', screen: 'hangar', reward: { credits: 80 }, done: (s) => totalUpgradeLevels(s) >= 1 },
  { title: 'Scan the system', hint: 'Press Scan in the System screen. Scanning reveals planets, moons and hidden signals.', screen: 'system', reward: { credits: 80 }, done: (s) => s.stats.scans >= 1 },
  { title: 'Deploy a mining drone', hint: 'Open Stations and build a Mining Drone. Drones mine for you, even while you are away.', screen: 'stations', reward: { credits: 100 }, done: (s) => s.stats.built.drone >= 1 },
  { title: 'Accept a mission', hint: 'Open Missions and accept a contract. Missions pay credits and materials.', screen: 'missions', reward: { credits: 100 }, done: (s) => s.missions.active.length > 0 || s.stats.missionsDone > 0 },
  { title: 'Research a technology', hint: 'Open Research and start a Tier 1 technology. Research costs credits and materials.', screen: 'research', reward: { credits: 150 }, done: (s) => s.stats.researchDone >= 1 },
  { title: 'Jump to a new star system', hint: 'Open the Galaxy map, select a nearby system within jump range and press Jump.', screen: 'galaxy', reward: { credits: 200 }, done: (s) => visited(s) >= 2 },
  { title: 'Investigate a discovery', hint: 'Scan systems to find abandoned stations, artifacts and anomalies, then investigate them.', screen: 'system', reward: { credits: 250 }, done: (s) => s.stats.discoveries >= 1 },
  { title: 'Defeat a hostile ship', hint: 'Press Patrol in the System screen to find pirates. Upgrade weapons and shields first!', screen: 'system', reward: { credits: 300 }, done: (s) => s.stats.kills >= 1 },
  { title: 'Build a Research Laboratory', hint: 'Labs speed research and unlock higher technology tiers.', screen: 'stations', reward: { credits: 400 }, done: (s) => ownedCount(s, 'lab') >= 1 },
  { title: 'Fabricate Titanium Alloy', hint: 'Open Cargo, then Fabricator, and craft 5 Titanium Alloy.', screen: 'cargo', reward: { credits: 500 }, done: (s) => s.stats.crafted.alloy >= 5, progress: (s) => [Math.min(5, s.stats.crafted.alloy), 5] },
  { title: 'Unlock Mining Stations', hint: 'Research Autonomous Piloting, Logistics Network and Orbital Foundations (Automation branch).', screen: 'research', reward: { credits: 800 }, done: (s) => hasTech(s, 'A3') },
  { title: 'Build a Mining Station', hint: 'Mining Stations produce a huge amount of ore and give you a dock.', screen: 'stations', reward: { credits: 1500, res: { alloy: 10 } }, done: (s) => ownedCount(s, 'station') >= 1 },
  { title: 'Buy a second ship', hint: 'Open Hangar. The Mining Vessel is the first ship you can afford.', screen: 'hangar', reward: { credits: 1500 }, done: (s) => s.ship.owned.length >= 2 },
  { title: 'Open the Inner Reach', hint: 'Research Long-Range Sensors in the Exploration branch to unlock sector 1.', screen: 'research', reward: { credits: 1000 }, done: (s) => getMods(s).sectors >= 1 },
  { title: 'Build a Refinery', hint: 'Refineries craft materials automatically. Research Industrial Refining first.', screen: 'stations', reward: { credits: 2500 }, done: (s) => ownedCount(s, 'refinery') >= 1 },
  { title: 'Make five discoveries', hint: 'The Alien Technology tree needs discoveries. Explore, scan deeply and investigate.', screen: 'galaxy', reward: { credits: 4000 }, done: (s) => s.stats.discoveries >= 5, progress: (s) => [Math.min(5, s.stats.discoveries), 5] },
  { title: 'Reach the Nebula Belt', hint: 'Unlock sector 2 with Stellar Cartography, then jump toward the pink region.', screen: 'galaxy', reward: { credits: 6000 }, done: (s) => { const g = getGalaxy(s.seed); return Object.keys(s.visited).some((id) => (g.byId.get(id)?.sector ?? 0) >= 2); } },
  { title: 'Build industrial scale', hint: 'Own 3 mining stations and 3 refineries.', screen: 'stations', reward: { credits: 25000, res: { alloy: 40 } }, done: (s) => ownedCount(s, 'station') >= 3 && ownedCount(s, 'refinery') >= 3 },
  { title: 'Fabricate 10 nanites', hint: 'Research Nanofabrication and feed refineries with circuits, rare elements and alloy.', screen: 'cargo', reward: { credits: 40000 }, done: (s) => s.stats.crafted.nanites >= 10, progress: (s) => [Math.min(10, s.stats.crafted.nanites), 10] },
  { title: 'Learn the secret of the Gateway', hint: 'Research Stellar Gateway Theory in the Alien Technology branch.', screen: 'research', reward: { credits: 150000 }, done: (s) => hasTech(s, 'L5') },
];

export function currentDirective(s: GameState): Directive | null {
  if (s.mode === 'sandbox') return null;
  return DIRECTIVES[s.guide] ?? null;
}

export function advanceGuide(s: GameState): void {
  if (s.mode === 'sandbox') return;
  let guard = 0;
  while (s.guide < DIRECTIVES.length && DIRECTIVES[s.guide].done(s) && guard++ < 10) {
    const d = DIRECTIVES[s.guide];
    addCredits(s, d.reward.credits);
    if (d.reward.res) grantResources(s, d.reward.res);
    s.guide++;
    toast(`Objective complete: ${d.title} (+${d.reward.credits} credits)`, 'good');
    sfx('mission');
  }
}
