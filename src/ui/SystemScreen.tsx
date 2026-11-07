import { BODY_LABEL, MINEABLE, RES, SECTORS, type MineRes } from '../game/data';
import { getGalaxy, type Body, type Poi } from '../game/galaxy';
import { canDock, cargoUsed, currentSystem, getMods, hasTech, ownedCount, shipStats, systemRates, threat } from '../game/state';
import * as A from '../game/actions';
import { miningRates } from '../game/sim';
import { store, useGame } from '../store';
import { Bar, ResDot, fmt, fmtRate, fmtTime, run, Tip } from './common';

const POI_LABEL: Record<string, string> = { station: 'Abandoned Station', artifact: 'Alien Artifact', anomaly: 'Anomaly', derelict: 'Derelict Ship', cache: 'Tech Cache', beacon: 'Beacon' };
const BODY_COLOR: Record<string, string> = { rocky: '#9a8f88', desert: '#d9a066', lava: '#ff6a2a', ice: '#bfe8ff', ocean: '#3f7fe6', gas: '#e0b07a', crystal: '#ff7ae0', moon_rock: '#9a9a9a', moon_ice: '#cfeaff', belt_metal: '#8c8580', belt_ice: '#bfe3f5', belt_rich: '#c7a96b' };

export function SystemScreen() {
  const { s, ui } = useGame();
  const g = getGalaxy(s.seed);
  const sys = currentSystem(s);
  const st = shipStats(s);
  const m = getMods(s);
  const act = s.activity;
  const busy = !!s.combat || !!s.event;
  const power = s.scanPower[sys.id] ?? 0;
  const revealed = sys.bodies.filter((b) => s.revealedBodies[b.id]);
  const hidden = sys.bodies.length - revealed.length;
  const pois = sys.pois.filter((p) => p.difficulty - m.poiScan <= power);
  const unseenPois = sys.pois.length - pois.length;
  const sel = ui.selectedBody;
  const selBody = sel && !sel.startsWith('poi:') ? g.bodies.get(sel) : null;
  const dock = canDock(s);
  const rates = systemRates(s, sys.id);
  const inst = s.installs[sys.id];
  const sector = SECTORS[sys.sector];

  return (
    <div className="panel side">
      <div className="panel-head">
        <div>
          <h1>{sys.name}</h1>
          <div className="sub">
            <span className="tag" style={{ color: sector.color, borderColor: sector.color }}>{sector.name}</span>
            <span className="tag">Class {sys.star.cls} star</span>
            {sys.hub && <span className="tag good">⚓ Trade hub</span>}
            {sys.storms && <span className="tag warn" title="Asteroid storms can strike while mining belts here">☄ Storms</span>}
          </div>
        </div>
      </div>
      <p className="flavor">{sys.flavor}</p>
      <div className="threat" title="Enemy strength grows with sector depth and your combat record.">
        <span>Danger</span>
        <Bar value={Math.min(6, sys.danger)} max={6} color={sys.danger < 1.5 ? 'var(--green)' : sys.danger < 3 ? 'var(--amber)' : 'var(--red)'} />
        <span>{threat(s).toFixed(1)}</span>
      </div>

      <div className="btn-row">
        <button className="btn primary" disabled={busy || (act.type !== 'idle' && act.type !== 'mining')} onClick={() => run(() => A.startScan(s))} title={`Reveals bodies and signals. Costs ${Math.ceil(10 * st.energyMult)} energy. Scan strength ${st.scan.toFixed(1)}.`}>
          ◎ Scan <small>{Math.ceil(10 * st.energyMult)}⚡</small>
        </button>
        <button className="btn" disabled={busy} onClick={() => run(() => A.unload(s), { say: true })} title={dock ? 'Move cargo into the warehouse' : 'You need a dock: Aurelia, a trade hub, or a Mining Station'}>
          ⇩ Unload {cargoUsed(s) >= 1 && <small>{Math.floor(cargoUsed(s))}</small>}
        </button>
        <button className="btn" disabled={busy} onClick={() => run(() => A.patrol(s))} title="Hunt for hostiles. Wins pay credits and salvage.">
          ✦ Patrol <small>{Math.ceil(12 * st.energyMult)}⚡</small>
        </button>
        {dock && (
          <button className="btn" disabled={busy} onClick={() => run(() => A.repairShip(s), { say: true })} title="Restore hull and shields at the dock">
            ✚ Repair {A.repairCost(s) > 0 && <small>¤{A.repairCost(s)}</small>}
          </button>
        )}
      </div>

      {act.type === 'scanning' && <Progress label="Scanning…" v={act.t} max={act.dur} />}
      {act.type === 'investigating' && <Progress label="Investigating…" v={act.t} max={act.dur} />}
      {act.type === 'traveling' && <Progress label="Jump in progress…" v={act.t} max={act.dur} />}

      {act.type === 'mining' && <MiningLive />}

      <h3>Bodies <small>{revealed.length}/{sys.bodies.length} known</small></h3>
      {revealed.length === 0 && <div className="empty">Nothing charted yet. Press <b>Scan</b> to reveal this system's worlds.</div>}
      <div className="list">
        {revealed.map((b) => (
          <BodyRow key={b.id} body={b} />
        ))}
      </div>
      {hidden > 0 && (
        <div className="hint">◌ {hidden} contact{hidden > 1 ? 's' : ''} too faint to resolve. Upgrade your scanner (now {st.scan.toFixed(1)}) and scan again.</div>
      )}

      {selBody && s.revealedBodies[selBody.id] && selBody.sysId === sys.id && <BodyDetail body={selBody} />}

      <h3>Points of interest <small>{pois.length} detected</small></h3>
      {pois.length === 0 && <div className="empty">No signals detected{unseenPois > 0 ? ' yet. Faint signals may be hidden — scan with a stronger scanner.' : '.'}</div>}
      <div className="list">
        {pois.map((p) => (
          <PoiRow key={p.id} poi={p} />
        ))}
      </div>
      {pois.length > 0 && unseenPois > 0 && <div className="hint">◌ Fainter signals remain. A better scanner or Xeno-Linguistics may reveal them.</div>}

      {inst && (
        <>
          <h3>Automation here</h3>
          <div className="mini-stats">
            {inst.drone > 0 && <span>✧ {inst.drone} drones</span>}
            {inst.minerShip > 0 && <span>⬣ {inst.minerShip} mining ships</span>}
            {inst.station > 0 && <span>⬢ Mining station</span>}
            <span className="good">⟳ {fmtRate(rates.total)} ore/s</span>
          </div>
        </>
      )}
      <div className="btn-row">
        <button className="btn" onClick={() => store.go('stations')}>Manage stations →</button>
        <button className="btn" onClick={() => store.go('galaxy')}>Galaxy map →</button>
      </div>
      {ownedCount(s, 'drone') === 0 && hasTech(s, null) && s.stats.minedTotal > 20 && <div className="hint tip-hint">Tip: Drones mine for you, even while you are away. Build one in Stations.</div>}
    </div>
  );
}

function Progress({ label, v, max }: { label: string; v: number; max: number }) {
  return (
    <div className="progress-card">
      <span>{label}</span>
      <Bar value={v} max={max} color="var(--cyan)" height={8} />
      <small>{fmtTime(max - v)}</small>
    </div>
  );
}

function MiningLive() {
  const { s } = useGame();
  const a = s.activity;
  if (a.type !== 'mining') return null;
  const g = getGalaxy(s.seed);
  const body = g.bodies.get(a.bodyId);
  if (!body) return null;
  const st = shipStats(s);
  const rates = miningRates(s, body);
  const total = MINEABLE.reduce((x, r) => x + rates[r], 0);
  const used = cargoUsed(s);
  const pulseReady = a.pulseCd <= 0;
  return (
    <div className="mining-live">
      <div className="ml-head">
        <b>⛏ Mining {body.name}</b>
        <span className={a.overheated ? 'bad' : 'good'}>{a.overheated ? 'Overheated: recharging' : `${fmtRate(total)} units/s`}</span>
      </div>
      <Bar value={used} max={st.cargoCap} color="var(--violet)" height={10} label="Cargo hold" />
      <div className="ml-sub"><span>Cargo {Math.floor(used)}/{st.cargoCap}</span><span>Energy −{st.mineDrain.toFixed(1)}/s</span></div>
      <div className="btn-row">
        <button className={`btn ${pulseReady ? 'primary' : 'dim'}`} onClick={() => run(() => A.pulseBurst(s))} title="Overcharge the laser for a huge instant yield (costs energy, 4s cooldown)">
          ⚡ Pulse Burst {pulseReady ? <small>{Math.ceil(12 * st.energyMult)}⚡</small> : <small>{a.pulseCd.toFixed(1)}s</small>}
        </button>
        <button className="btn" onClick={() => run(() => A.stopActivity(s))}>■ Stop</button>
      </div>
    </div>
  );
}

function BodyRow({ body }: { body: Body }) {
  const { s, ui } = useGame();
  const a = s.activity;
  const mining = a.type === 'mining' && a.bodyId === body.id;
  const selected = ui.selectedBody === body.id;
  return (
    <div className={`row ${selected ? 'sel' : ''} ${mining ? 'active' : ''}`} onClick={() => store.setUi({ selectedBody: selected ? null : body.id })} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && store.setUi({ selectedBody: selected ? null : body.id })}>
      <span className="body-dot" style={{ background: BODY_COLOR[body.type] }} />
      <div className="row-main">
        <b>{body.name}</b>
        <small>{BODY_LABEL[body.type]}{body.unusual ? ' · Unusual' : ''}</small>
      </div>
      <Composition body={body} />
      <button className={`btn sm ${mining ? 'danger' : 'primary'}`} onClick={(e) => { e.stopPropagation(); run(() => (mining ? A.stopActivity(s) : A.startMining(s, body.id))); }}>
        {mining ? 'Stop' : 'Mine'}
      </button>
    </div>
  );
}

function Composition({ body }: { body: Body }) {
  const top = MINEABLE.filter((r) => body.weights[r] > 0.05).sort((a, b) => body.weights[b] - body.weights[a]).slice(0, 4);
  return (
    <div className="comp" aria-label="Composition">
      {top.map((r) => (
        <span key={r} title={`${RES[r].name} ${(body.weights[r] * 100).toFixed(0)}%`} className="comp-seg" style={{ background: RES[r].color, width: `${Math.max(8, body.weights[r] * 60)}px` }} />
      ))}
    </div>
  );
}

function BodyDetail({ body }: { body: Body }) {
  const { s } = useGame();
  const st = shipStats(s);
  const rates = miningRates(s, body);
  const total = MINEABLE.reduce((a, r) => a + rates[r], 0);
  return (
    <div className="detail">
      <h4>{body.name}</h4>
      <p className="flavor">{body.desc}</p>
      <div className="mini-stats">
        <Tip text="How much ore this body yields per unit of mining effort"><span>Richness ×{body.richness.toFixed(1)}</span></Tip>
        <Tip text="Scanner strength needed to find this body"><span>Scan difficulty {body.difficulty.toFixed(1)}</span></Tip>
        <span>{body.temp} K</span>
      </div>
      <table className="tbl">
        <thead><tr><th>Resource</th><th>Share</th><th>Your yield</th><th>Laser</th></tr></thead>
        <tbody>
          {(MINEABLE as readonly MineRes[]).filter((r) => body.weights[r] > 0).map((r) => {
            const eff = Math.min(1, st.laser / RES[r].hardness);
            return (
              <tr key={r}>
                <td><ResDot res={r} /> {RES[r].name}</td>
                <td>{(body.weights[r] * 100).toFixed(0)}%</td>
                <td>{fmtRate(rates[r])}/s</td>
                <td className={eff >= 1 ? 'good' : eff > 0.5 ? 'warn' : 'bad'} title={`Hardness ${RES[r].hardness}. Your laser power is ${st.laser.toFixed(1)}.`}>{(Math.pow(eff, 1.2) * 100).toFixed(0)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="hint">Total {fmtRate(total)} units/s with your current laser. Harder ores need a stronger laser to cut efficiently.</div>
      <div className="mini-stats"><span>Sell value ≈ ¤{fmt(MINEABLE.reduce((a, r) => a + rates[r] * RES[r].price, 0), 1)}/s</span></div>
    </div>
  );
}

function PoiRow({ poi }: { poi: Poi }) {
  const { s, ui } = useGame();
  const done = !!s.poisDone[poi.id];
  const a = s.activity;
  const doing = a.type === 'investigating' && a.poiId === poi.id;
  const selected = ui.selectedBody === `poi:${poi.id}`;
  const risk = poi.risk.kind;
  return (
    <div className={`row ${selected ? 'sel' : ''} ${done ? 'done' : ''}`} onClick={() => store.setUi({ selectedBody: selected ? null : `poi:${poi.id}` })} role="button" tabIndex={0}>
      <span className="poi-dot" style={{ color: done ? '#666' : undefined }}>{done ? '✓' : '◆'}</span>
      <div className="row-main">
        <b>{POI_LABEL[poi.kind]}</b>
        <small>{done ? 'Investigated' : poi.desc}</small>
      </div>
      {!done && risk !== 'none' && <span className={`tag ${risk === 'guard' ? 'bad' : 'warn'}`} title={risk === 'guard' ? 'Guarded: expect a fight' : 'Hazardous: expect damage'}>{risk === 'guard' ? 'Guarded' : 'Hazard'}</span>}
      {!done && (
        <button className="btn sm primary" disabled={doing} onClick={(e) => { e.stopPropagation(); run(() => A.investigate(s, poi.id)); }} title={`Costs ${Math.ceil(15 * shipStats(s).energyMult)} energy`}>
          {doing ? '…' : 'Investigate'}
        </button>
      )}
    </div>
  );
}
