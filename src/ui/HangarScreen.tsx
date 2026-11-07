import { SHIPS, SHIP_ORDER, UPGRADES, UPGRADE_ORDER, type ShipId, type UpgradeId } from '../game/data';
import { canDock, shipStats, upgradeCost, type GameState } from '../game/state';
import * as A from '../game/actions';
import { useGame } from '../store';
import { Bar, BuyButton, CostList, Pips, askConfirm, fmt, run } from './common';

function after(s: GameState, id: UpgradeId): GameState {
  return { ...s, upgrades: { ...s.upgrades, [id]: s.upgrades[id] + 1 } };
}

function effectLine(s: GameState, id: UpgradeId): { now: string; next: string } {
  const a = shipStats(s);
  const b = shipStats(after(s, id));
  switch (id) {
    case 'laser': return { now: `${a.laser.toFixed(2)} power`, next: `${b.laser.toFixed(2)} power` };
    case 'cargo': return { now: `${a.cargoCap} units`, next: `${b.cargoCap} units` };
    case 'engine': return { now: `${a.speed.toFixed(2)}× speed`, next: `${b.speed.toFixed(2)}× speed` };
    case 'scanner': return { now: `${a.scan.toFixed(1)} scan`, next: `${b.scan.toFixed(1)} scan` };
    case 'shield': return { now: `${a.shieldMax} shield`, next: `${b.shieldMax} shield` };
    case 'weapon': return { now: `${a.weapon.toFixed(1)} dmg`, next: `${b.weapon.toFixed(1)} dmg` };
    case 'jump': return { now: `${a.jumpRange.toFixed(0)} ly · ${a.jumpPerLy.toFixed(2)}⚡/ly`, next: `${b.jumpRange.toFixed(0)} ly · ${b.jumpPerLy.toFixed(2)}⚡/ly` };
    case 'reactor': return { now: `${a.energyMax} EN · ${a.energyRegen.toFixed(1)}/s`, next: `${b.energyMax} EN · ${b.energyRegen.toFixed(1)}/s` };
  }
}

export function HangarScreen() {
  const { s } = useGame();
  const st = shipStats(s);
  const cap = A.upgradeLevelCap(s);
  const dock = canDock(s);
  return (
    <div className="panel wide">
      <div className="panel-head">
        <div>
          <h1>Ship Hangar</h1>
          <div className="sub"><span className="tag">Flying: {SHIPS[s.ship.active].name}</span><span className="tag">Upgrade cap: level {cap}</span>{!dock && <span className="tag warn">Not docked: ship changes need a dock</span>}</div>
        </div>
        <button className="btn" onClick={() => run(() => A.repairShip(s), { say: true })} title="Restore hull and shields (dock required)">✚ Repair {A.repairCost(s) > 0 ? `¤${A.repairCost(s)}` : ''}</button>
      </div>

      <h3>Upgrades <small>apply to whichever ship you fly</small></h3>
      <div className="grid cols2">
        {UPGRADE_ORDER.map((id) => {
          const d = UPGRADES[id];
          const L = s.upgrades[id];
          const atCap = L >= cap;
          const cost = upgradeCost(s, id);
          const e = effectLine(s, id);
          return (
            <div key={id} className="card">
              <div className="card-head"><span className="ic">{d.icon}</span><b>{d.name}</b><span className="lv">Lv {L}</span></div>
              <Pips level={L} max={10} cap={cap} />
              <p className="flavor">{d.desc}</p>
              <div className="before-after">
                <span>{e.now}</span><span className="arrow">→</span><span className={atCap ? 'dimtxt' : 'good'}>{atCap ? 'max' : e.next}</span>
              </div>
              <small className="dimtxt">{d.effect}</small>
              {!atCap && <CostList s={s} cost={cost} />}
              <BuyButton s={s} cost={cost} label={atCap ? `Capped at ${cap}` : `Upgrade to Lv ${L + 1}`} disabledReason={atCap ? 'Research Precision Machining / Quantum Engineering to raise the cap' : undefined} onClick={() => run(() => A.buyUpgrade(s, id))} />
            </div>
          );
        })}
      </div>

      <h3>Ships</h3>
      <div className="grid cols3">
        {SHIP_ORDER.map((id) => (
          <ShipCard key={id} id={id} />
        ))}
      </div>
      <div className="hint">Current effective stats: cargo {st.cargoCap} · speed {st.speed.toFixed(2)} · laser {st.laser.toFixed(2)} · hull {st.hullMax} · shield {st.shieldMax} · weapon {st.weapon.toFixed(1)} · scan {st.scan.toFixed(1)} · jump {st.jumpRange.toFixed(0)} ly</div>
    </div>
  );
}

function StatRow({ label, v, max, color }: { label: string; v: number; max: number; color: string }) {
  return (
    <div className="statrow"><span>{label}</span><Bar value={v} max={max} color={color} height={5} /><b>{fmt(v, v < 10 ? 1 : 0)}</b></div>
  );
}

function ShipCard({ id }: { id: ShipId }) {
  const { s } = useGame();
  const d = SHIPS[id];
  const owned = s.ship.owned.includes(id);
  const active = s.ship.active === id;
  const req = A.shipRequirementMet(s, id);
  const col = '#' + d.color.toString(16).padStart(6, '0');
  return (
    <div className={`card ship ${active ? 'active' : ''} ${!owned && !req.ok ? 'locked' : ''}`} style={{ ['--accent' as string]: col }}>
      <div className="card-head"><span className="ic" style={{ color: col }}>➤</span><b>{d.name}</b>{active && <span className="tag good">Active</span>}{owned && !active && <span className="tag">Owned</span>}</div>
      <small className="dimtxt">{d.role}</small>
      <p className="flavor">{d.desc}</p>
      <StatRow label="Cargo" v={d.cargo} max={600} color="var(--violet)" />
      <StatRow label="Speed" v={d.speed} max={2.2} color="var(--cyan)" />
      <StatRow label="Mining" v={d.mining} max={3.2} color="var(--amber)" />
      <StatRow label="Hull" v={d.hull} max={800} color="var(--green)" />
      <StatRow label="Shield" v={d.shield} max={260} color="var(--cyan)" />
      <StatRow label="Weapons" v={d.weapon} max={80} color="var(--red)" />
      <StatRow label="Scanner" v={d.scan} max={7.5} color="var(--green)" />
      <StatRow label="Jump" v={d.jump} max={60} color="var(--violet)" />
      <div className="special">★ {d.special}</div>
      {!owned && <CostList s={s} cost={d.cost} />}
      {!owned && !req.ok && <div className="hint bad">🔒 {req.reason}</div>}
      {!owned && (
        <BuyButton s={s} cost={d.cost} label="Purchase" disabledReason={req.ok ? undefined : `Locked: ${req.reason}`} onClick={async () => {
          const ok = await askConfirm(`Buy ${d.name}?`, <CostList s={s} cost={d.cost} />, 'Buy');
          if (ok) run(() => A.buyShip(s, id));
        }} />
      )}
      {owned && !active && <button className="btn primary" onClick={() => run(() => A.switchShip(s, id), { say: true })}>Fly this ship</button>}
    </div>
  );
}
