import { useState } from 'react';
import { CODEX } from '../game/data';
import { ACHIEVEMENTS } from '../game/achievements';
import { useGame } from '../store';
import { Bar, Tabs, fmt, fmtTime } from './common';

type Tab = 'ach' | 'codex' | 'stats';

export function AchievementsScreen() {
  const { s } = useGame();
  const [tab, setTab] = useState<Tab>('ach');
  const done = ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
  return (
    <div className="panel wide">
      <div className="panel-head">
        <div>
          <h1>Achievements & Codex</h1>
          <div className="sub"><span className="tag">{done}/{ACHIEVEMENTS.length} achievements</span><span className="tag">{s.codex.length}/{CODEX.length} codex entries</span></div>
        </div>
      </div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'ach', label: 'Achievements' }, { id: 'codex', label: 'Codex' }, { id: 'stats', label: 'Statistics' }]} />
      {tab === 'ach' && (
        <div className="grid cols3">
          {ACHIEVEMENTS.map((a) => {
            const got = !!s.achievements[a.id];
            const v = Math.min(a.target, a.value(s));
            return (
              <div key={a.id} className={`card ach ${got ? 'got' : ''}`}>
                <div className="card-head"><span className="ic">{a.icon}</span><b>{a.name}</b>{got && <span className="tag good">✓</span>}</div>
                <small className="dimtxt">{a.desc}</small>
                {!got && <Bar value={v} max={a.target} height={5} color="var(--cyan)" />}
                <small className={got ? 'good' : 'dimtxt'}>{got ? 'Unlocked' : `${fmt(v)} / ${fmt(a.target)}`} · reward ¤{fmt(a.reward)}</small>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'codex' && <Codex />}
      {tab === 'stats' && <Stats />}
    </div>
  );
}

function Codex() {
  const { s } = useGame();
  const threads = Array.from(new Set(CODEX.map((c) => c.thread)));
  return (
    <div>
      {threads.map((t) => {
        const entries = CODEX.filter((c) => c.thread === t);
        const got = entries.filter((c) => s.codex.includes(c.id)).length;
        return (
          <section key={t} className="branch">
            <h3>{t} <small>{got}/{entries.length}</small></h3>
            <div className="grid cols2">
              {entries.map((c) => {
                const has = s.codex.includes(c.id);
                return (
                  <div key={c.id} className={`card codex ${has ? '' : 'locked'}`}>
                    <b>{has ? c.title : '???'}</b>
                    <p className="flavor">{has ? c.text.replace(/\*/g, '') : 'Undiscovered. Explore and investigate points of interest to find it.'}</p>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Stats() {
  const { s } = useGame();
  const st = s.stats;
  const rows: [string, string][] = [
    ['Play time', fmtTime(s.playTime)],
    ['Mode', s.mode === 'sandbox' ? 'Endless sandbox' : 'Campaign'],
    ['Galaxy seed', String(s.seed)],
    ['Credits earned', '¤' + fmt(st.creditsEarned)],
    ['Credits from sales', '¤' + fmt(st.creditsFromSales)],
    ['Ore mined', fmt(st.minedTotal)],
    ['Units sold', fmt(st.sold)],
    ['Materials fabricated', fmt(st.craftedTotal)],
    ['Systems visited', String(Object.keys(s.visited).length)],
    ['Jumps made', fmt(st.jumps)],
    ['Bodies revealed', fmt(st.bodiesRevealed)],
    ['Discoveries', fmt(st.discoveries)],
    ['Hostiles defeated', fmt(st.kills)],
    ['Fights lost', fmt(st.combatsLost)],
    ['Storms survived', fmt(st.storms)],
    ['Upgrades bought', fmt(st.upgradesBought)],
    ['Technologies researched', fmt(st.researchDone)],
    ['Missions completed', fmt(st.missionsDone)],
    ['Time earned offline', fmtTime(st.offlineSeconds)],
  ];
  return (
    <table className="tbl"><tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td><b>{v}</b></td></tr>)}</tbody></table>
  );
}
