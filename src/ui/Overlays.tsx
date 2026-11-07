import { useEffect, useState } from 'react';
import { ENEMIES, RES, type ResId } from '../game/data';
import { combatAction, closeCombat, type CombatAction } from '../game/combat';
import { resolveEvent } from '../game/actions';
import { shipStats } from '../game/state';
import { store, useGame, useUi } from '../store';
import { Bar, Modal, fmt, fmtTime, setConfirmHandler, type ConfirmReq } from './common';
import { sfx, toast } from '../game/events';

export function CombatModal() {
  const { s } = useGame();
  const c = s.combat;
  const [target, setTarget] = useState(0);
  if (!c) return null;
  const st = shipStats(s);
  const act = (a: CombatAction) => {
    const r = combatAction(s, a, target);
    if (!r.ok) {
      toast(r.msg, 'bad');
      sfx('error');
    }
    store.notify();
  };
  const alive = c.enemies.filter((e) => e.hull > 0);
  const over = c.phase === 'won' || c.phase === 'lost' || c.phase === 'fled';
  const cost = (n: number) => Math.ceil(n * st.energyMult);
  const en = s.ship.energy;
  return (
    <div className="combat-wrap">
      <div className={`combat ${c.phase}`}>
        <div className="combat-head">
          <b>{c.phase === 'alert' ? '⚠ Hostile contact' : c.phase === 'won' ? '★ Victory' : c.phase === 'lost' ? '✖ Defeated' : c.phase === 'fled' ? 'Encounter ended' : `⚔ Combat · round ${c.round}`}</b>
        </div>
        <div className="foes">
          {c.enemies.map((e, i) => {
            const d = ENEMIES[e.id];
            const dead = e.hull <= 0;
            return (
              <button key={i} className={`foe ${dead ? 'dead' : ''} ${target === i && !dead ? 'targeted' : ''}`} onClick={() => !dead && setTarget(i)} aria-label={`Target ${d.name}`}>
                <b>{d.name}</b>
                <Bar value={e.hull} max={e.hullMax} color="var(--red)" height={6} />
                {e.shieldMax > 0 && <Bar value={e.shield} max={e.shieldMax} color="var(--cyan)" height={4} />}
                <small>{dead ? 'destroyed' : `${Math.ceil(e.hull)} hull${e.shieldMax ? ` · ${Math.ceil(e.shield)} sh` : ''}`}</small>
              </button>
            );
          })}
        </div>
        <div className="you">
          <span>You</span>
          <Bar value={s.ship.hull} max={st.hullMax} color="var(--green)" height={8} warn />
          <Bar value={s.ship.shield} max={st.shieldMax} color="var(--cyan)" height={6} />
          <Bar value={s.ship.energy} max={st.energyMax} color="var(--amber)" height={6} />
          <small>{Math.ceil(s.ship.hull)} hull · {Math.ceil(s.ship.shield)} shield · {Math.floor(s.ship.energy)} energy</small>
        </div>
        <div className="clog" aria-live="polite">
          {c.log.slice(-5).map((l, i) => <div key={i}>{l}</div>)}
        </div>
        {c.phase === 'alert' && (
          <div className="btn-row">
            <button className="btn primary" onClick={() => act('engage')}>⚔ Fight</button>
            {c.bribe > 0 && <button className="btn" onClick={() => act('bribe')} disabled={s.credits < c.bribe} title="Pay them to leave you alone">¤ Pay tribute {fmt(c.bribe)}</button>}
            <button className="btn" onClick={() => act('flee')} title={`${cost(6)} energy`}>➤ Flee</button>
          </div>
        )}
        {c.phase === 'fight' && (
          <div className="btn-row">
            <button className={`btn ${en >= cost(5) ? 'primary' : 'dim'}`} onClick={() => act('fire')} title={`Reliable shot${s.ship.active === 'combat' ? ' (twin batteries: two shots)' : ''}. ${cost(5)} energy`}>✦ Fire <small>{cost(5)}⚡</small></button>
            <button className={`btn ${en >= cost(20) ? '' : 'dim'}`} onClick={() => act('overcharge')} title={`2.5× damage, never misses. ${cost(20)} energy`}>⚡ Overcharge <small>{cost(20)}⚡</small></button>
            <button className={`btn ${en >= cost(12) ? '' : 'dim'}`} onClick={() => act('shield')} title={`Restore 40% of shields. ${cost(12)} energy`}>◈ Shields <small>{cost(12)}⚡</small></button>
            <button className={`btn ${en >= cost(4) ? '' : 'dim'}`} onClick={() => act('evade')} title={`Enemies hit far less often this round. ${cost(4)} energy`}>↯ Evade <small>{cost(4)}⚡</small></button>
            <button className={`btn ${en >= cost(6) ? '' : 'dim'}`} onClick={() => act('flee')} title={`Chance to escape depends on speed. ${cost(6)} energy`}>➤ Flee <small>{cost(6)}⚡</small></button>
          </div>
        )}
        {over && (
          <div className="btn-row">
            <button className="btn primary" onClick={() => { closeCombat(s); store.notify(); }}>{c.phase === 'lost' ? 'Be towed home' : 'Continue'}</button>
          </div>
        )}
        {c.phase === 'won' && c.loot && <div className="hint good">Loot: ¤{fmt(c.loot.credits)}{(Object.keys(c.loot.res) as ResId[]).map((k) => `, ${c.loot!.res[k]} ${RES[k].name}`)}</div>}
        {alive.length === 0 && c.phase === 'fight' && <div className="hint">…</div>}
      </div>
    </div>
  );
}

export function EventModal() {
  const { s } = useGame();
  const ev = s.event;
  if (!ev || s.combat) return null;
  const st = shipStats(s);
  const take = (c: 'shield' | 'push' | 'retreat') => {
    const r = resolveEvent(s, c);
    if (!r.ok) {
      toast(r.msg, 'bad');
      sfx('error');
    }
    store.notify();
  };
  const sev = ev.severity;
  const absorb = s.ship.shield + s.ship.hull;
  return (
    <Modal title={`⚠ ${ev.title}`} danger>
      <p>{ev.text}</p>
      <div className="mini-stats">
        <span>Incoming ≈ {Math.round(sev)} damage</span>
        <span>Your shield + hull: {Math.floor(absorb)}</span>
      </div>
      <div className="btn-col">
        <button className="btn primary" onClick={() => take('shield')} title={`${Math.ceil(15 * st.energyMult)} energy`}>◈ Raise shields — ~{Math.round(sev * 0.35)} damage <small>{Math.ceil(15 * st.energyMult)}⚡</small></button>
        <button className="btn" onClick={() => take('retreat')}>➤ Retreat — ~{Math.round(sev * 0.6)} damage{ev.poiId ? ' (no reward)' : ' (stops mining)'}</button>
        <button className="btn danger" onClick={() => take('push')}>✖ Push through — ~{Math.round(sev)} damage</button>
      </div>
      {sev >= absorb && <div className="hint bad">Warning: unmitigated damage could disable your ship. If your ship is disabled you lose your cargo and pay a recovery fee.</div>}
    </Modal>
  );
}

export function OfflineModal() {
  const ui = useUi();
  const r = ui.offline;
  if (!r) return null;
  const resKeys = Object.keys(r.res) as ResId[];
  return (
    <Modal title="Welcome back, Commander" onClose={() => store.setUi({ offline: null })}>
      <p>You were away for <b>{fmtTime(r.seconds)}</b>{r.capped ? ' (the maximum offline period was applied)' : ''}. Your empire kept working.</p>
      <table className="tbl">
        <tbody>
          <tr><td>Credits</td><td className={r.credits >= 0 ? 'good' : 'bad'}><b>{r.credits >= 0 ? '+' : ''}{fmt(r.credits)}</b></td></tr>
          {resKeys.filter((k) => r.res[k]).map((k) => (
            <tr key={k}><td>{RES[k].name}</td><td className={(r.res[k] as number) >= 0 ? 'good' : 'bad'}><b>{(r.res[k] as number) >= 0 ? '+' : ''}{fmt(r.res[k] as number)}</b></td></tr>
          ))}
          {r.crafted > 0 && <tr><td>Materials fabricated</td><td><b>{fmt(r.crafted)}</b></td></tr>}
          {r.research.length > 0 && <tr><td>Research completed</td><td><b>{r.research.length}</b></td></tr>}
        </tbody>
      </table>
      <div className="hint">Offline progress covers drones, ships, stations, refineries, labs and cargo vessels. Your own ship does not mine while you are away.</div>
      <button className="btn primary wide" onClick={() => store.setUi({ offline: null })}>Collect</button>
    </Modal>
  );
}

const TUTORIAL: { title: string; body: string }[] = [
  { title: 'Welcome to Galaxy Tycoon', body: 'You command a small prospecting ship with 500 credits. Mine ore, sell it, upgrade, automate, research and push into the unknown until you can finish the Stellar Gateway.' },
  { title: '1 · Scan, then mine', body: 'In the System screen press Scan to reveal worlds. Pick the asteroid belt and press Mine. Use Pulse Burst for fast extra yield. Mining uses energy, which recharges over time.' },
  { title: '2 · Unload and sell', body: 'Cargo is limited. Press Unload at a dock (home Aurelia is one) to move ore to your warehouse, then open Cargo and Sell it. Selling a lot at once lowers the price, which recovers over time.' },
  { title: '3 · Upgrade', body: 'Open Hangar. Every upgrade shows its cost and the before → after effect. A better laser and larger hold are the fastest first steps. Unaffordable purchases are refused.' },
  { title: '4 · Automate', body: 'Open Stations and build Mining Drones. They mine for you continuously, even while the game is closed (with a cap on offline time). Watch power: machines slow down if demand exceeds supply.' },
  { title: '5 · Research and explore', body: 'Research unlocks stations, refineries, new sectors and alien technology. Use the Galaxy map to jump to new systems; investigate abandoned stations, artifacts and anomalies for rewards and lore. Some are guarded: upgrade weapons and shields first.' },
  { title: 'Always something to do', body: 'The Objective card guides your first steps. Missions pay credits and materials, achievements pay bonuses, and the Stellar Gateway is the endgame. Afterwards, sandbox continues forever. Your game saves automatically.' },
];
export function Tutorial() {
  const { s, ui } = useGame();
  const step = ui.tutorial;
  if (step === null) return null;
  const t = TUTORIAL[step];
  const close = () => {
    s.tutorialSeen = true;
    store.setUi({ tutorial: null });
  };
  return (
    <Modal title={t.title} onClose={close}>
      <p>{t.body}</p>
      <div className="dots">{TUTORIAL.map((_, i) => <span key={i} className={`dot ${i === step ? 'on' : ''}`} />)}</div>
      <div className="btn-row">
        <button className="btn" onClick={close}>Skip</button>
        {step > 0 && <button className="btn" onClick={() => store.setUi({ tutorial: step - 1 })}>Back</button>}
        {step < TUTORIAL.length - 1 ? <button className="btn primary" onClick={() => store.setUi({ tutorial: step + 1 })}>Next</button> : <button className="btn primary" onClick={close}>Start playing</button>}
      </div>
    </Modal>
  );
}

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmReq | null>(null);
  useEffect(() => {
    setConfirmHandler((r) => setReq(r));
    return () => setConfirmHandler(null);
  }, []);
  if (!req) return null;
  const done = (v: boolean) => {
    req.resolve(v);
    setReq(null);
  };
  return (
    <Modal title={req.title} onClose={() => done(false)} danger={req.danger}>
      <div className="confirm-body">{req.body}</div>
      <div className="btn-row">
        <button className="btn" onClick={() => done(false)}>Cancel</button>
        <button className={`btn ${req.danger ? 'danger' : 'primary'}`} onClick={() => done(true)} autoFocus>{req.confirm}</button>
      </div>
    </Modal>
  );
}
