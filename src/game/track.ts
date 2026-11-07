import type { BuildingId, CraftRes, MineRes } from './data';
import type { GameState, ObjType } from './state';

export type TrackEvent =
  | { t: 'mine'; res: MineRes; n: number }
  | { t: 'craft'; res: CraftRes; n: number }
  | { t: 'build'; id: BuildingId }
  | { t: 'sell'; credits: number }
  | { t: 'kills'; n: number }
  | { t: 'scanBodies'; n: number }
  | { t: Exclude<ObjType, 'mine' | 'craft' | 'build' | 'sell' | 'kills' | 'scanBodies'>; n?: number };

/** Advance progress on any active missions that match the event. */
export function track(state: GameState, ev: TrackEvent): void {
  for (const m of state.missions.active) {
    if (m.type !== ev.t) continue;
    if (m.progress >= m.target) continue;
    let amount = 1;
    switch (ev.t) {
      case 'mine':
        if (m.key && m.key !== ev.res) continue;
        amount = ev.n;
        break;
      case 'craft':
        if (m.key && m.key !== ev.res) continue;
        amount = ev.n;
        break;
      case 'build':
        if (m.key && m.key !== ev.id) continue;
        break;
      case 'sell':
        amount = ev.credits;
        break;
      case 'kills':
      case 'scanBodies':
        amount = ev.n;
        break;
      default:
        amount = ev.n ?? 1;
    }
    m.progress = Math.min(m.target, m.progress + amount);
  }
}
