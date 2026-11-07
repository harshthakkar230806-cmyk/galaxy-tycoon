import { SECTORS } from '../game/data';
import { dist, getGalaxy } from '../game/galaxy';
import { currentSystem, getMods, shipStats } from '../game/state';
import * as A from '../game/actions';
import { store, useGame } from '../store';
import { fmtTime, run } from './common';

export function GalaxyScreen() {
  const { s, ui } = useGame();
  const g = getGalaxy(s.seed);
  const cur = currentSystem(s);
  const st = shipStats(s);
  const m = getMods(s);
  const sel = ui.selectedSystem ? g.byId.get(ui.selectedSystem) : null;
  const total = g.systems.filter((x) => !x.hidden).length;
  const visited = Object.keys(s.visited).length;
  const nearby = g.systems
    .filter((o) => o.id !== cur.id && s.detected[o.id] && dist(o, cur) <= st.jumpRange + 0.001)
    .sort((a, b) => dist(a, cur) - dist(b, cur))
    .slice(0, 14);

  return (
    <div className="panel side">
      <div className="panel-head">
        <div>
          <h1>Galaxy Map</h1>
          <div className="sub"><span className="tag">{visited} visited</span><span className="tag">{Object.keys(s.detected).length}/{total}+ detected</span><span className="tag">Range {st.jumpRange.toFixed(0)} ly</span></div>
        </div>
      </div>
      <p className="hint">Drag to rotate · scroll or pinch to zoom · right-drag to pan · tap a star to select. The green ring is your jump range.</p>

      {sel ? <SystemCard id={sel.id} /> : <div className="empty">Select a star on the map or from the list below.</div>}

      <h3>Reachable now <small>{nearby.length}</small></h3>
      <div className="list">
        {nearby.map((o) => {
          const jc = A.jumpCost(s, o.id);
          return (
            <div key={o.id} className={`row ${ui.selectedSystem === o.id ? 'sel' : ''}`} onClick={() => store.setUi({ selectedSystem: o.id })} role="button" tabIndex={0}>
              <span className="star-dot" style={{ background: '#' + o.star.color.toString(16).padStart(6, '0') }} />
              <div className="row-main">
                <b>{o.name}</b>
                <small>{SECTORS[o.sector].name} · {jc.distance.toFixed(0)} ly{s.visited[o.id] ? ' · visited' : ' · unexplored'}</small>
              </div>
              <small className={jc.ok ? 'good' : 'bad'}>{jc.ok ? `${jc.energy}⚡` : o.sector > m.sectors ? 'locked' : 'no energy'}</small>
            </div>
          );
        })}
        {nearby.length === 0 && <div className="empty">No detected systems within jump range. Upgrade your Jump Drive or Scanner.</div>}
      </div>

      <h3>Sectors</h3>
      <div className="list">
        {SECTORS.map((sec) => {
          const open = sec.id <= m.sectors;
          const hint = ['', 'Research Long-Range Sensors', 'Research Stellar Cartography', 'Research Anomaly Analysis', 'Research Deep Void Charts'][sec.id];
          return (
            <div key={sec.id} className={`row ${open ? '' : 'locked'}`}>
              <span className="star-dot" style={{ background: sec.color }} />
              <div className="row-main"><b style={{ color: open ? sec.color : undefined }}>{sec.name}</b><small>{open ? sec.desc : `Locked · ${hint}`}</small></div>
              <span className="tag">{open ? 'Open' : '🔒'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SystemCard({ id }: { id: string }) {
  const { s } = useGame();
  const g = getGalaxy(s.seed);
  const sys = g.byId.get(id)!;
  const cur = currentSystem(s);
  const jc = A.jumpCost(s, id);
  const visited = !!s.visited[id];
  const here = id === cur.id;
  const known = sys.bodies.filter((b) => s.revealedBodies[b.id]).length;
  const doneP = sys.pois.filter((p) => s.poisDone[p.id]).length;
  const sec = SECTORS[sys.sector];
  const inst = s.installs[id];
  return (
    <div className="detail sys-card">
      <h4>{visited ? sys.name : s.detected[id] ? sys.name : 'Unknown'} {here && <span className="tag good">You are here</span>}</h4>
      <div className="sub">
        <span className="tag" style={{ color: sec.color, borderColor: sec.color }}>{sec.name}</span>
        <span className="tag">Class {sys.star.cls}</span>
        {sys.hub && <span className="tag good">⚓ Hub</span>}
        {visited ? <span className="tag">Visited</span> : <span className="tag warn">Unexplored</span>}
      </div>
      <div className="mini-stats">
        <span>Distance {jc.distance.toFixed(0)} ly</span>
        {!here && <span>Energy {jc.energy}</span>}
        {!here && <span>Time {fmtTime(jc.time)}</span>}
        {visited && <span>{known}/{sys.bodies.length} bodies</span>}
        {visited && sys.pois.length > 0 && <span>{doneP}/{sys.pois.length} discoveries</span>}
        {inst && <span className="good">⬣ Automated</span>}
      </div>
      {visited && <p className="flavor">{sys.flavor}</p>}
      {!here && (
        <>
          <button className={`btn ${jc.ok ? 'primary' : 'dim'} wide`} onClick={() => { const r = run(() => A.jumpTo(s, id)); if (r.ok) store.go('system'); }} title={jc.ok ? '' : jc.reason}>
            ✺ Jump to {sys.name}
          </button>
          {!jc.ok && <div className="hint bad">{jc.reason}</div>}
        </>
      )}
      {here && <button className="btn wide" onClick={() => store.go('system')}>Open system view →</button>}
    </div>
  );
}
