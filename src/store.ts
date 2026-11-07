import { useSyncExternalStore } from 'react';
import { bus, toast } from './game/events';
import { createState, shipStats, type GameState } from './game/state';
import { housekeeping, simulateOffline, tick, type OfflineReport } from './game/sim';
import { deleteSave, downloadSave, hasSave, loadSave, loadSettings, parseSave, writeSave, type SaveInfo } from './game/save';
import { refillBoard } from './game/missions';
import { checkAchievements } from './game/achievements';
import { advanceGuide } from './game/guide';
import { audio } from './audio';

export type Screen = 'menu' | 'system' | 'galaxy' | 'hangar' | 'stations' | 'research' | 'missions' | 'cargo' | 'achievements' | 'settings' | 'saves';

interface Ui {
  screen: Screen;
  playing: boolean;
  selectedBody: string | null;
  selectedSystem: string | null;
  offline: OfflineReport | null;
  loadError: string | null;
  saveInfo: SaveInfo | null;
  saveStatus: string;
  lastSaved: number;
  tutorial: number | null;
  paused: boolean;
}

class Store {
  state: GameState | null = null;
  ui: Ui = { screen: 'menu', playing: false, selectedBody: null, selectedSystem: null, offline: null, loadError: null, saveInfo: null, saveStatus: '', lastSaved: 0, tutorial: null, paused: false };
  version = 0;
  private listeners = new Set<() => void>();
  private raf = 0;
  private lastFrame = 0;
  private acc = 0;
  private notifyAcc = 0;
  private houseAcc = 0;
  private saveAcc = 0;
  private hiddenAt = 0;
  private saving = false;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  notify() {
    this.version++;
    for (const l of Array.from(this.listeners)) l();
  }
  setUi(patch: Partial<Ui>) {
    this.ui = { ...this.ui, ...patch };
    this.notify();
  }
  go(screen: Screen) {
    if (screen === this.ui.screen) return;
    this.setUi({ screen });
  }

  // ───────────── lifecycle ─────────────
  async init() {
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', () => void this.save(true));
    window.addEventListener('beforeunload', () => void this.save(true));
    try {
      const info = await hasSave();
      this.ui.saveInfo = info;
      const r = await loadSave();
      if (!r.state && r.error) this.ui.loadError = r.error;
    } catch {
      /* storage unavailable: menu still works for a fresh game */
    }
    this.notify();
  }

  newGame(mode: 'campaign' | 'sandbox', seed?: number) {
    const sd = seed ?? Math.floor(Math.random() * 2 ** 31);
    const s = createState(sd, mode);
    refillBoard(s);
    this.state = s;
    this.ui = { ...this.ui, playing: true, screen: 'system', selectedBody: null, selectedSystem: null, offline: null, tutorial: mode === 'campaign' ? 0 : null, loadError: null };
    this.startLoop();
    void this.save(false);
    this.notify();
  }

  async continueGame(): Promise<boolean> {
    const r = await loadSave();
    if (!r.state) {
      this.setUi({ loadError: r.error ?? 'No saved game found.' });
      return false;
    }
    this.adopt(r.state, r.recovered ? 'Your main save was damaged, so the previous backup was restored.' : null);
    return true;
  }

  private adopt(s: GameState, notice: string | null) {
    const gap = (Date.now() - s.savedAt) / 1000;
    this.state = s;
    if (s.missions.board.length < 5) refillBoard(s);
    let offline: OfflineReport | null = null;
    if (gap >= 60) {
      offline = simulateOffline(s, gap);
      checkAchievements(s);
    }
    advanceGuide(s);
    this.ui = { ...this.ui, playing: true, screen: 'system', selectedBody: null, selectedSystem: null, offline: offline && (offline.credits !== 0 || Object.keys(offline.res).length || offline.research.length) ? offline : null, tutorial: s.tutorialSeen || s.mode === 'sandbox' ? null : 0, loadError: null };
    if (notice) toast(notice, 'info');
    this.startLoop();
    this.notify();
  }

  async importFile(file: File): Promise<{ ok: boolean; msg: string }> {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('That file is too large to be a save.');
      const text = await file.text();
      const s = parseSave(text);
      s.savedAt = Date.now(); // an imported save does not get offline credit for the time it sat in a file
      this.adopt(s, null);
      await this.save(false);
      return { ok: true, msg: 'Save imported.' };
    } catch (e) {
      return { ok: false, msg: `Import failed: ${(e as Error).message}` };
    }
  }

  exportSave() {
    if (this.state) downloadSave(this.state);
  }

  async save(quiet: boolean): Promise<boolean> {
    const s = this.state;
    if (!s || this.saving) return false;
    this.saving = true;
    try {
      s.savedAt = Date.now();
      await writeSave(s);
      this.ui.lastSaved = Date.now();
      this.ui.saveStatus = 'Saved';
      if (!quiet) toast('Game saved', 'good');
      return true;
    } catch (e) {
      this.ui.saveStatus = (e as Error).message;
      if (!quiet) toast((e as Error).message, 'bad');
      return false;
    } finally {
      this.saving = false;
      this.notify();
    }
  }

  async resetGame() {
    this.stopLoop();
    await deleteSave();
    this.state = null;
    this.ui = { ...this.ui, playing: false, screen: 'menu', saveInfo: null, offline: null, tutorial: null, selectedBody: null, selectedSystem: null };
    this.notify();
  }

  async toMenu() {
    await this.save(true);
    this.stopLoop();
    this.ui.saveInfo = await hasSave().catch(() => null);
    this.setUi({ playing: false, screen: 'menu' });
  }

  // ───────────── loop ─────────────
  private startLoop() {
    cancelAnimationFrame(this.raf);
    this.lastFrame = performance.now();
    this.acc = 0;
    const frame = (t: number) => {
      this.raf = requestAnimationFrame(frame);
      const s = this.state;
      if (!s) return;
      let dt = (t - this.lastFrame) / 1000;
      this.lastFrame = t;
      if (dt > 0.5) dt = 0.5; // long frame: do not spiral
      if (!this.ui.paused) {
        this.acc += dt;
        let n = 0;
        while (this.acc >= 0.1 && n++ < 6) {
          tick(s, 0.1);
          this.acc -= 0.1;
        }
        this.houseAcc += dt;
        if (this.houseAcc >= 1) {
          this.houseAcc = 0;
          housekeeping(s);
        }
        this.saveAcc += dt;
        if (this.saveAcc >= 20 && audio.settings.autosave) {
          this.saveAcc = 0;
          void this.save(true);
        }
      }
      this.notifyAcc += dt;
      if (this.notifyAcc >= 0.1) {
        this.notifyAcc = 0;
        this.notify();
      }
    };
    this.raf = requestAnimationFrame(frame);
  }
  private stopLoop() {
    cancelAnimationFrame(this.raf);
  }

  private onVisibility = () => {
    const s = this.state;
    if (!s || !this.ui.playing) return;
    if (document.hidden) {
      this.hiddenAt = Date.now();
      void this.save(true);
    } else if (this.hiddenAt) {
      const gap = (Date.now() - this.hiddenAt) / 1000;
      this.hiddenAt = 0;
      this.lastFrame = performance.now();
      this.acc = 0;
      if (gap >= 30) {
        const rep = simulateOffline(s, gap);
        if (rep.credits !== 0 || Object.keys(rep.res).length || rep.research.length) this.ui.offline = rep;
        // ship activities pause while away; refill energy partially
        const st = shipStats(s);
        s.ship.energy = Math.min(st.energyMax, s.ship.energy + st.energyRegen * Math.min(gap, 600));
        this.notify();
      }
    }
  };
}

export const store = new Store();
export function useGame(): { s: GameState; ui: Ui } {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return { s: store.state as GameState, ui: store.ui };
}
export function useUi(): Ui {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store.ui;
}
export { bus, loadSettings };
