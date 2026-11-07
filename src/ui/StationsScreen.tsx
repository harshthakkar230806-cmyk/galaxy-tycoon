import { useState } from 'react';
import { ALL_RES, BUILDINGS, BUILDING_ORDER, MINEABLE, RECIPES, RES, type BuildingId, type CraftRes, type ResId } from '../game/data';
import { getGalaxy } from '../game/galaxy';
import { AUTO_MAX, autoMult, autoUpgradeCost, buildingCost, currentSystem, getMods, hasTech, ownedCount, powerInfo, storageCap, systemRates, upkeepPerSec, type AutoType } from '../game/state';
import * as A from '../game/actions';
import { store, useGame } from '../store';
import { Bar, BuyButton, CostList, ResDot, Tabs, fmt, fmtRate, run, Tip } from './common';

type Tab = 'build' | 'systems' | 'refineries' | 'logistics' | 'efficiency';

export function StationsScreen() {
  const { s } = useGame();
  const [tab, setTab] = useState<Tab>('build');
  const p = powerInfo(s);
  const upkeep = upkeepPerSec(s);
  const income = Object.keys(s.installs).reduce((a, id) => {
    const r = systemRates(s, id).rates;
    return a + MINEABLE.reduce((x, k) => x + r[k] * RES[k].price, 0);
  }, 0);
  const sys = currentSystem(s);
  return (
    <div className="panel wide">
      <div className="panel-head">
        <div>
          <h1>Stations & Automation</h1>
          <div className="sub">
            <Tip text="Power supply vs demand. If demand exceeds supply, every machine slows down proportionally."><span className={`tag ${p.eff < 1 ? 'bad' : 'good'}`}>⚡ {p.demand.toFixed(0)} / {p.supply.toFixed(0)} power</span></Tip>
            <Tip text="Credits per second paid for automated ships, stations, labs, refineries and vessels."><span className="tag">Upkeep −¤{upkeep.toFixed(1)}/s</span></Tip>
            <Tip text="Estimated sell value of automated mining output per second, before fees."><span className="tag good">Output ≈ ¤{fmt(income, 1)}/s</span></Tip>
          </div>
        </div>
      </div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'build', label: 'Build' }, { id: 'systems', label: 'Systems', badge: Object.keys(s.installs).length || undefined }, { id: 'refineries', label: 'Refineries', badge: s.refineries.length || undefined }, { id: 'logistics', label: 'Logistics' }, { id: 'efficiency', label: 'Efficiency' }]} />
      {tab === 'build' && (
        <>
          <div className="hint">Mining machines (drones, ships, stations) are built in the system you are in — currently <b>{sys.name}</b>. Warehouse buildings (labs, power, refineries, vessels) serve your whole empire.</div>
          <div className="grid cols3">
            {BUILDING_ORDER.map((id) => (
              <BuildCard key={id} id={id} />
            ))}
          </div>
        </>
      )}
      {tab === 'systems' && <SystemsTab />}
      {tab === 'refineries' && <RefineriesTab />}
      {tab === 'logistics' && <LogisticsTab />}
      {tab === 'efficiency' && <EfficiencyTab />}
    </div>
  );
}

function BuildCard({ id }: { id: BuildingId }) {
  const { s } = useGame();
  const b = BUILDINGS[id];
  const cost = buildingCost(s, id);
  const locked = !hasTech(s, b.unlock);
  const status = A.buildingStatus(s, id, s.location);
  const n = ownedCount(s, id);
  const here = s.installs[s.location];
  const nHere = here && (id === 'drone' || id === 'minerShip' || id === 'station') ? here[id] : null;
  const m = getMods(s);
  const power = b.power > 0 ? `uses ${b.power} power` : `makes ${(-b.power * m.power).toFixed(0)} power`;
  const effect = b.rate ? `${b.rate}/s base · mining power ${b.miningPower}` : null;
  return (
    <div className={`card ${locked ? 'locked' : ''}`}>
      <div className="card-head"><span className="ic">{b.icon}</span><b>{b.name}</b><span className="lv">×{n}</span></div>
      <p className="flavor">{b.desc}</p>
      <div className="mini-stats">
        <span>⚡ {power}</span>
        {b.upkeep > 0 && <span>¤ −{b.upkeep}/s upkeep</span>}
        {effect && <span>{effect}</span>}
        {b.perSystem !== null && <span>max {b.perSystem}/system{nHere !== null ? ` (${nHere} here)` : ''}</span>}
      </div>
      {locked ? <div className="hint bad">🔒 Research {b.unlock} to unlock</div> : <CostList s={s} cost={cost} />}
      <BuyButton s={s} cost={cost} label={`Build${nHere !== null ? ' here' : ''}`} disabledReason={locked ? 'Locked by research' : status.ok ? undefined : status.reason} onClick={() => run(() => A.build(s, id))} />
      {!locked && !status.ok && <div className="hint">{status.reason}</div>}
    </div>
  );
}

function SystemsTab() {
  const { s } = useGame();
  const g = getGalaxy(s.seed);
  const ids = Object.keys(s.installs);
  if (!ids.length) return <div className="empty">No automated systems yet. Build a Mining Drone in the Build tab to start.</div>;
  return (
    <div className="list">
      {ids.map((id) => {
        const sys = g.byId.get(id)!;
        const inst = s.installs[id];
        const r = systemRates(s, id);
        const body = r.body ? g.bodies.get(r.body) : null;
        return (
          <div key={id} className="card">
            <div className="card-head">
              <b>{sys.name}</b>
              <span className="tag">{inst.drone} ✧ · {inst.minerShip} ⬣ · {inst.station} ⬢</span>
              <span className="tag good">{fmtRate(r.total)}/s</span>
              {s.location !== id && <button className="btn sm" onClick={() => { store.setUi({ selectedSystem: id }); store.go('galaxy'); }}>Map</button>}
            </div>
            <label className="field">
              Focus target
              <select value={inst.focus ?? ''} onChange={(e) => run(() => A.setFocus(s, id, e.target.value || null))}>
                <option value="">Auto (most valuable)</option>
                {sys.bodies.filter((b) => s.revealedBodies[b.id]).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            {body && <small className="dimtxt">Working: {body.name} (richness ×{body.richness.toFixed(1)})</small>}
            <div className="rates">
              {MINEABLE.filter((k) => r.rates[k] > 0.0001).map((k) => (
                <span key={k} className="res-chip"><ResDot res={k} /> {fmtRate(r.rates[k])}/s</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RefineriesTab() {
  const { s } = useGame();
  if (!s.refineries.length) return <div className="empty">{hasTech(s, 'A4') ? 'Build a Refinery in the Build tab.' : 'Research Industrial Refining (Automation) to unlock refineries.'}</div>;
  const recipes = Object.keys(RECIPES) as CraftRes[];
  return (
    <div className="grid cols2">
      {s.refineries.map((rf, i) => {
        const rec = rf.recipe ? RECIPES[rf.recipe] : null;
        let status = 'Idle: choose a recipe';
        let cls = 'dimtxt';
        if (rec) {
          const missing = (Object.keys(rec.inputs) as ResId[]).filter((k) => s.res[k] + 1e-9 < (rec.inputs[k] as number));
          const full = s.res[rec.id] >= storageCap(s, rec.id) - 0.5;
          if (rf.busy) { status = 'Producing…'; cls = 'good'; }
          else if (full) { status = 'Output full: warehouse at capacity'; cls = 'warn'; }
          else if (missing.length) { status = `Waiting for ${missing.map((k) => RES[k].name).join(', ')}`; cls = 'bad'; }
          else { status = 'Starting…'; cls = 'good'; }
        }
        return (
          <div key={i} className="card">
            <div className="card-head"><span className="ic">⚙</span><b>Refinery {i + 1}</b></div>
            <label className="field">
              Recipe
              <select value={rf.recipe ?? ''} onChange={(e) => run(() => A.setRefineryRecipe(s, i, (e.target.value || null) as CraftRes | null))}>
                <option value="">— idle —</option>
                {recipes.map((r) => {
                  const lock = RECIPES[r].unlock && !hasTech(s, RECIPES[r].unlock);
                  return <option key={r} value={r} disabled={!!lock}>{RES[r].name}{lock ? ' (locked)' : ''}</option>;
                })}
              </select>
            </label>
            {rec && (
              <>
                <div className="mini-stats">
                  {(Object.keys(rec.inputs) as ResId[]).map((k) => (
                    <span key={k} className={s.res[k] >= (rec.inputs[k] as number) ? '' : 'bad'}><ResDot res={k} size={8} /> {rec.inputs[k]} {RES[k].name} <small>({fmt(s.res[k])})</small></span>
                  ))}
                  <span>→ 1 {RES[rec.id].name} / {(rec.time / (getMods(s).refine * autoMult(s, 'refinery'))).toFixed(1)}s</span>
                </div>
                <Bar value={rf.busy ? rf.progress : 0} max={rec.time} color="var(--green)" height={6} />
              </>
            )}
            <small className={cls}>{status}</small>
          </div>
        );
      })}
    </div>
  );
}

function LogisticsTab() {
  const { s } = useGame();
  const vessels = s.counts.vessel;
  const m = getMods(s);
  return (
    <div>
      <div className="hint">
        {vessels > 0 ? <>Your {vessels} cargo vessel{vessels > 1 ? 's' : ''} sell up to <b>{(vessels * 2 * m.haul * autoMult(s, 'vessel')).toFixed(1)}</b> units/s of flagged resources (above the amount you keep), at market prices.</> : 'Build Cargo Vessels (needs Logistics Network research) to auto-sell flagged resources.'}
      </div>
      <label className="check"><input type="checkbox" checked={s.autoUnload} onChange={(e) => { s.autoUnload = e.target.checked; store.notify(); }} /> Auto-unload cargo at docks while mining (requires Autonomous Piloting)</label>
      <table className="tbl">
        <thead><tr><th>Resource</th><th>Auto-sell</th><th>Keep at least</th><th>In stock</th></tr></thead>
        <tbody>
          {ALL_RES.map((r) => (
            <tr key={r}>
              <td><ResDot res={r} /> {RES[r].name}</td>
              <td><input type="checkbox" disabled={vessels === 0} checked={s.autoSell[r].on} onChange={(e) => run(() => A.setAutoSell(s, r, e.target.checked))} aria-label={`Auto-sell ${RES[r].name}`} /></td>
              <td><input type="number" min={0} className="num" value={s.autoSell[r].keep} onChange={(e) => run(() => A.setAutoSell(s, r, s.autoSell[r].on, Number(e.target.value)))} /></td>
              <td>{fmt(s.res[r])}/{fmt(storageCap(s, r))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const AUTO_LABEL: Record<AutoType, string> = { drone: 'Mining Drones', minerShip: 'Automated Mining Ships', station: 'Mining Stations', refinery: 'Refineries', lab: 'Research Labs', vessel: 'Cargo Vessels' };
const AUTO_EFFECT: Record<AutoType, string> = { drone: '+20% drone output per level', minerShip: '+20% mining ship output per level', station: '+20% station output per level', refinery: '+20% refinery speed per level', lab: '+20% lab research speed per level', vessel: '+20% vessel haul speed per level' };

function EfficiencyTab() {
  const { s } = useGame();
  return (
    <div className="grid cols2">
      {(Object.keys(AUTO_LABEL) as AutoType[]).map((t) => {
        const L = s.autoLevels[t];
        const cost = autoUpgradeCost(s, t);
        const max = L >= AUTO_MAX;
        return (
          <div key={t} className="card">
            <div className="card-head"><b>{AUTO_LABEL[t]}</b><span className="lv">Lv {L}/{AUTO_MAX}</span></div>
            <div className="before-after"><span>×{autoMult(s, t).toFixed(1)}</span><span className="arrow">→</span><span className={max ? 'dimtxt' : 'good'}>{max ? 'max' : `×${(1 + 0.2 * (L + 1)).toFixed(1)}`}</span></div>
            <small className="dimtxt">{AUTO_EFFECT[t]}</small>
            {!max && <CostList s={s} cost={cost} />}
            <BuyButton s={s} cost={cost} label={max ? 'Maxed' : `Upgrade to Lv ${L + 1}`} disabledReason={max ? 'Already at maximum efficiency' : undefined} onClick={() => run(() => A.upgradeAuto(s, t))} />
          </div>
        );
      })}
    </div>
  );
}
