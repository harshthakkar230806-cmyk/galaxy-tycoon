import { MEGAPROJECT } from '../game/data';
import { DIRECTIVES, currentDirective } from '../game/guide';
import { MAX_ACTIVE, OBJ_ICON, abandonMission, acceptMission, claimMission } from '../game/missions';
import type { Mission } from '../game/state';
import { hasTech } from '../game/state';
import * as A from '../game/actions';
import { store, useGame, type Screen } from '../store';
import { Bar, CostList, askConfirm, fmt, run } from './common';
import { RES, type ResId } from '../game/data';

export function MissionsScreen() {
  const { s } = useGame();
  const d = currentDirective(s);
  const prog = d?.progress?.(s);
  return (
    <div className="panel wide">
      <div className="panel-head">
        <div>
          <h1>Missions</h1>
          <div className="sub"><span className="tag">{s.stats.missionsDone} completed</span><span className="tag">{s.missions.active.length}/{MAX_ACTIVE} active</span></div>
        </div>
      </div>

      {d && (
        <div className="card objective-card">
          <div className="card-head"><span className="tag good">GUIDED OBJECTIVE {s.guide + 1}/{DIRECTIVES.length}</span><b>{d.title}</b></div>
          <p className="flavor">{d.hint}</p>
          {prog && <Bar value={prog[0]} max={prog[1]} color="var(--green)" height={6} />}
          <div className="btn-row"><span className="tag">Reward ¤{fmt(d.reward.credits)}</span><button className="btn primary sm" onClick={() => store.go(d.screen as Screen)}>Go there →</button></div>
        </div>
      )}
      {!d && s.mode === 'campaign' && <div className="hint good">All guided objectives complete. Contracts and the Stellar Gateway are your goals now.</div>}

      <h3>Active contracts</h3>
      {s.missions.active.length === 0 && <div className="empty">No active contracts. Accept some from the board below.</div>}
      <div className="grid cols2">
        {s.missions.active.map((m) => (
          <MissionCard key={m.id} m={m} active />
        ))}
      </div>
      <h3>Contract board</h3>
      <div className="grid cols2">
        {s.missions.board.map((m) => (
          <MissionCard key={m.id} m={m} />
        ))}
      </div>
      <Gateway />
    </div>
  );
}

function RewardList({ m }: { m: Mission }) {
  return (
    <div className="costs inline">
      <span className="cost"><b>¤</b> {fmt(m.reward.credits)}</span>
      {(Object.keys(m.reward.res) as ResId[]).map((k) => (
        <span key={k} className="cost">+{m.reward.res[k]} {RES[k]?.name}</span>
      ))}
    </div>
  );
}

function MissionCard({ m, active }: { m: Mission; active?: boolean }) {
  const { s } = useGame();
  const done = m.progress >= m.target;
  return (
    <div className={`card mission ${done ? 'ready' : ''}`}>
      <div className="card-head"><span className="ic">{OBJ_ICON[m.type]}</span><b>{m.title}</b><span className="tag">Tier {m.tier + 1}</span></div>
      <p className="flavor">{m.desc}</p>
      {active && (
        <>
          <Bar value={m.progress} max={m.target} color={done ? 'var(--green)' : 'var(--cyan)'} height={8} />
          <small>{fmt(m.progress)} / {fmt(m.target)}</small>
        </>
      )}
      <RewardList m={m} />
      <div className="btn-row">
        {active ? (
          <>
            <button className={`btn ${done ? 'primary' : 'dim'}`} onClick={() => run(() => claimMission(s, m.id))} title={done ? '' : 'Not complete yet'}>{done ? '★ Claim reward' : 'In progress'}</button>
            <button className="btn sm" onClick={async () => { if (await askConfirm('Abandon contract?', 'Progress on this contract will be lost.', 'Abandon', true)) run(() => abandonMission(s, m.id)); }}>Abandon</button>
          </>
        ) : (
          <button className="btn primary" onClick={() => run(() => acceptMission(s, m.id))}>Accept</button>
        )}
      </div>
    </div>
  );
}

function Gateway() {
  const { s } = useGame();
  const unlocked = hasTech(s, 'L5');
  const stage = MEGAPROJECT[s.mega];
  return (
    <>
      <h3>Endgame: The Stellar Gateway</h3>
      <div className={`card gateway ${unlocked ? '' : 'locked'}`}>
        <p className="flavor">An Architect structure the size of a moon, waiting for someone curious enough to finish it. Complete all three stages to win — then keep playing in endless sandbox.</p>
        <div className="stages">
          {MEGAPROJECT.map((st, i) => (
            <div key={st.name} className={`stage ${i < s.mega ? 'done' : i === s.mega ? 'now' : ''}`}>
              <b>{i < s.mega ? '✓ ' : `${i + 1}. `}{st.name}</b>
              <small>{st.desc}</small>
            </div>
          ))}
        </div>
        {s.victory && <div className="hint good">★ The Gateway is lit. You have won. The galaxy is yours — play on in sandbox.</div>}
        {!unlocked && <div className="hint bad">🔒 Research Stellar Gateway Theory (Alien Technology, needs 10 discoveries) to begin construction.</div>}
        {stage && unlocked && (
          <>
            <CostList s={s} cost={{ credits: stage.credits, res: stage.res }} />
            <button className="btn primary" onClick={async () => { if (await askConfirm(`Build: ${stage.name}?`, <CostList s={s} cost={{ credits: stage.credits, res: stage.res }} />, 'Build')) run(() => A.buildMegaStage(s)); }}>Build stage {s.mega + 1}</button>
          </>
        )}
      </div>
    </>
  );
}
