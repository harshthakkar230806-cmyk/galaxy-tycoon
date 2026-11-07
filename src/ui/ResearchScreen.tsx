import { BRANCHES, TECHS, type TechDef } from '../game/data';
import { getMods } from '../game/state';
import * as A from '../game/actions';
import { useGame } from '../store';
import { Bar, BuyButton, CostList, fmtTime, run } from './common';

export function ResearchScreen() {
  const { s } = useGame();
  const labs = s.counts.lab;
  const m = getMods(s);
  const speed = (1 + 0.25 * labs * (1 + 0.2 * s.autoLevels.lab)) * m.research;
  const cur = s.research.current ? TECHS.find((t) => t.id === s.research.current!.id) : null;
  return (
    <div className="panel wide">
      <div className="panel-head">
        <div>
          <h1>Research Tree</h1>
          <div className="sub">
            <span className="tag">{s.research.done.length}/{TECHS.length} researched</span>
            <span className="tag" title="Each lab adds 25% research speed. Higher tiers need more labs.">⚗ {labs} lab{labs === 1 ? '' : 's'} · ×{speed.toFixed(2)} speed</span>
            <span className="tag">{s.stats.discoveries} discoveries</span>
          </div>
        </div>
      </div>
      {cur && s.research.current && (
        <div className="progress-card big">
          <div><b>Researching: {cur.name}</b><br /><small>{cur.effects.join(' · ')}</small></div>
          <Bar value={s.research.current.progress} max={cur.time} color="var(--violet)" height={10} />
          <small>{fmtTime((cur.time - s.research.current.progress) / speed)} left</small>
          <button className="btn sm danger" onClick={() => run(() => A.cancelResearch(s), { say: true })} title="Cancel and recover 50% of the cost">Cancel (50% refund)</button>
        </div>
      )}
      {!cur && <div className="hint">No research in progress. Pick an available technology below — research consumes credits and materials up front.</div>}
      {BRANCHES.map((b) => {
        const techs = TECHS.filter((t) => t.branch === b.id).sort((a, c) => a.tier - c.tier);
        return (
          <section key={b.id} className="branch" style={{ ['--accent' as string]: b.color }}>
            <h3 style={{ color: b.color }}>{b.icon} {b.name}</h3>
            <div className="tech-row">
              {techs.map((t) => (
                <TechCard key={t.id} t={t} speed={speed} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TechCard({ t, speed }: { t: TechDef; speed: number }) {
  const { s } = useGame();
  const st = A.techStatus(s, t.id);
  const cost = { credits: t.credits, res: t.res };
  return (
    <div className={`tech ${st.state}`}>
      <div className="card-head"><span className="tier">T{t.tier}</span><b>{t.name}</b>{st.state === 'done' && <span className="tag good">✓</span>}{st.state === 'active' && <span className="tag">…</span>}</div>
      <p className="flavor">{t.desc}</p>
      <ul className="effects">{t.effects.map((e) => <li key={e}>{e}</li>)}</ul>
      {st.state !== 'done' && (
        <>
          <CostList s={s} cost={cost} />
          <small className="dimtxt">⏱ {fmtTime(t.time / speed)}</small>
        </>
      )}
      {st.state === 'locked' && <div className="locks">{st.reasons.map((r) => <div key={r} className="hint bad">🔒 {r}</div>)}</div>}
      {st.state === 'available' && <BuyButton s={s} cost={cost} label="Research" disabledReason={s.research.current ? 'Another project is in progress' : undefined} onClick={() => run(() => A.startResearch(s, t.id))} />}
    </div>
  );
}
