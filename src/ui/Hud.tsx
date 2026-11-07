import { useEffect, useRef, useState } from 'react';
import { bus, type FxGain, type ToastKind } from '../game/events';
import { MINEABLE, RES, SHIPS, type ResId } from '../game/data';
import { cargoUsed, currentSystem, shipStats, canDock, powerInfo, upkeepPerSec, systemRates } from '../game/state';
import { currentDirective } from '../game/guide';
import { audio } from '../audio';
import { store, useGame, type Screen } from '../store';
import { AnimatedNumber, Bar, ResDot, fmt, fmtRate } from './common';
import { MAX_ACTIVE } from '../game/missions';

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: 'system', label: 'System', icon: '◉' },
  { id: 'galaxy', label: 'Galaxy', icon: '✺' },
  { id: 'hangar', label: 'Hangar', icon: '➤' },
  { id: 'stations', label: 'Stations', icon: '⬢' },
  { id: 'research', label: 'Research', icon: '⚗' },
  { id: 'missions', label: 'Missions', icon: '☰' },
  { id: 'cargo', label: 'Cargo', icon: '▣' },
  { id: 'achievements', label: 'Awards', icon: '★' },
  { id: 'saves', label: 'Saves', icon: '▤' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export function Nav() {
  const { s, ui } = useGame();
  const claimable = s.missions.active.filter((m) => m.progress >= m.target).length;
  const researchIdle = !s.research.current;
  return (
    <nav className="nav" aria-label="Main navigation">
      {NAV.map((n) => (
        <button key={n.id} className={`nav-btn ${ui.screen === n.id ? 'on' : ''}`} onClick={() => { store.go(n.id); }} title={n.label} aria-label={n.label}>
          <span className="nav-i">{n.icon}</span>
          <span className="nav-l">{n.label}</span>
          {n.id === 'missions' && claimable > 0 && <span className="dot-badge">{claimable}</span>}
          {n.id === 'research' && researchIdle && s.stats.researchDone === 0 && <span className="dot-badge">!</span>}
        </button>
      ))}
    </nav>
  );
}

export function TopBar() {
  const { s, ui } = useGame();
  const st = shipStats(s);
  const used = cargoUsed(s);
  const sys = currentSystem(s);
  const act = s.activity;
  let status = 'Idle';
  if (act.type === 'mining') status = act.overheated ? 'Laser recharging…' : 'Mining';
  else if (act.type === 'scanning') status = 'Scanning…';
  else if (act.type === 'investigating') status = 'Investigating…';
  else if (act.type === 'traveling') status = 'Jumping…';
  return (
    <header className="topbar">
      <div className="tb-left">
        <button className="logo-btn" onClick={() => store.go('settings')} title="Menu and settings" aria-label="Settings">
          <span className="logo-mark">◐</span>
        </button>
        <div className="loc">
          <b>{sys.name}</b>
          <small>{SECTOR_NAMES[sys.sector]} · {status}</small>
        </div>
      </div>
      <div className="tb-credits" title="Credits">
        <span className="coin">¤</span>
        <AnimatedNumber value={s.credits} className="credits-num" />
      </div>
      <div className="tb-bars">
        <div className="vital" title={`Energy ${Math.floor(s.ship.energy)} / ${st.energyMax}`}>
          <span className="vl">EN</span>
          <Bar value={s.ship.energy} max={st.energyMax} color="var(--amber)" height={7} />
          <span className="vn">{Math.floor(s.ship.energy)}</span>
        </div>
        <div className="vital" title={`Hull ${Math.floor(s.ship.hull)} / ${st.hullMax}`}>
          <span className="vl">HP</span>
          <Bar value={s.ship.hull} max={st.hullMax} color="var(--green)" height={7} warn />
          <span className="vn">{Math.floor(s.ship.hull)}</span>
        </div>
        <div className="vital" title={`Shield ${Math.floor(s.ship.shield)} / ${st.shieldMax}`}>
          <span className="vl">SH</span>
          <Bar value={s.ship.shield} max={st.shieldMax} color="var(--cyan)" height={7} />
          <span className="vn">{Math.floor(s.ship.shield)}</span>
        </div>
        <div className="vital" title={`Cargo ${Math.floor(used)} / ${st.cargoCap}`}>
          <span className="vl">CG</span>
          <Bar value={used} max={st.cargoCap} color={used >= st.cargoCap - 0.5 ? 'var(--red)' : 'var(--violet)'} height={7} />
          <span className="vn">{Math.floor(used)}/{st.cargoCap}</span>
        </div>
      </div>
      <button className="icon-btn" title={ui.paused ? 'Resume' : 'Pause'} aria-label={ui.paused ? 'Resume game' : 'Pause game'} onClick={() => store.setUi({ paused: !ui.paused })}>{ui.paused ? '▶' : '❚❚'}</button>
      <MuteButton />
    </header>
  );
}
const SECTOR_NAMES = ['Aurelian Frontier', 'Inner Reach', 'Nebula Belt', 'The Deep Void', 'Galactic Core'];

export function MuteButton() {
  const [muted, setMuted] = useState(audio.settings.muted);
  return (
    <button className="icon-btn" title={muted ? 'Unmute sound' : 'Mute sound'} aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => { audio.update({ muted: !muted }); setMuted(!muted); }}>
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

export function ResourceStrip() {
  const { s } = useGame();
  const dock = canDock(s);
  const pw = powerInfo(s);
  const flows = Object.keys(s.installs).reduce((a, id) => a + systemRates(s, id).total, 0);
  return (
    <div className="resstrip" aria-label="Warehouse">
      {MINEABLE.map((r) => (
        <div key={r} className="res-chip" title={`${RES[r].name}: ${Math.floor(s.res[r])} in warehouse${s.cargo[r] >= 1 ? `, ${Math.floor(s.cargo[r])} in cargo` : ''}`}>
          <ResDot res={r} />
          <span>{fmt(s.res[r])}</span>
          {s.cargo[r] >= 1 && <small className="cargo-n">+{fmt(s.cargo[r])}</small>}
        </div>
      ))}
      <div className="res-chip meta" title={dock ? 'You are docked: cargo unloads automatically with Autonomous Piloting, or press Unload.' : 'No dock in this system'}>
        {dock ? '⚓ Dock' : '— No dock'}
      </div>
      {flows > 0 && <div className="res-chip meta" title="Automated ore production per second">⬣ {fmtRate(flows)}/s</div>}
      {pw.eff < 1 && <div className="res-chip warn" title={`Power shortage: ${pw.demand.toFixed(0)} demand vs ${pw.supply.toFixed(0)} supply. Machines run at ${(pw.eff * 100).toFixed(0)}%. Build Solar Arrays or Reactors.`}>⚡ {(pw.eff * 100).toFixed(0)}%</div>}
      {upkeepPerSec(s) > 0 && <div className="res-chip meta" title="Operating costs per second">−¤{upkeepPerSec(s).toFixed(1)}/s</div>}
    </div>
  );
}

export function Objective() {
  const { s } = useGame();
  const d = currentDirective(s);
  if (!d) {
    if (s.mode === 'sandbox') return null;
    return null;
  }
  const prog = d.progress?.(s);
  return (
    <button className="objective" onClick={() => store.go(d.screen as Screen)} title={d.hint}>
      <span className="obj-tag">OBJECTIVE</span>
      <b>{d.title}</b>
      <span className="obj-hint">{d.hint}</span>
      {prog && <Bar value={prog[0]} max={prog[1]} color="var(--green)" height={4} />}
      <span className="obj-reward">Reward: ¤{fmt(d.reward.credits)}</span>
    </button>
  );
}

// ───────────── toasts and floating gains ─────────────
interface ToastItem { id: number; msg: string; kind: ToastKind }
export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    return bus.on('toast', (t: ToastItem) => {
      setItems((cur) => [...cur.filter((x) => x.msg !== t.msg).slice(-4), t]);
      window.setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), t.kind === 'bad' ? 5200 : 3800);
    });
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => setItems((c) => c.filter((x) => x.id !== t.id))}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

interface Floater { id: number; res: string; amount: number }
export function GainFloaters() {
  const [items, setItems] = useState<Floater[]>([]);
  const acc = useRef<Record<string, number>>({});
  const idRef = useRef(1);
  useEffect(() => {
    const off = bus.on('gain', (g: FxGain) => {
      acc.current[g.res] = (acc.current[g.res] ?? 0) + g.amount;
    });
    const iv = window.setInterval(() => {
      const entries = Object.entries(acc.current).filter(([, v]) => v > 0);
      if (!entries.length) return;
      acc.current = {};
      const fresh = entries.map(([res, amount]) => ({ id: idRef.current++, res, amount }));
      setItems((cur) => [...cur.slice(-6), ...fresh]);
      for (const f of fresh) window.setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== f.id)), 1500);
    }, 450);
    return () => {
      off();
      window.clearInterval(iv);
    };
  }, []);
  return (
    <div className="floaters" aria-hidden="true">
      {items.map((f, i) => (
        <div key={f.id} className="floater" style={{ color: RES[f.res as ResId]?.color, left: `${(i % 4) * 34}px` }}>
          +{f.amount} {RES[f.res as ResId]?.name}
        </div>
      ))}
    </div>
  );
}

export function ShipBadge() {
  const { s } = useGame();
  return <span className="ship-badge">{SHIPS[s.ship.active].name}</span>;
}
export { MAX_ACTIVE };
