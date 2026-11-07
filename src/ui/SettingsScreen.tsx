import { useRef, useState } from 'react';
import { audio } from '../audio';
import { store, useGame } from '../store';
import { askConfirm, fmtTime, run } from './common';
import { toast } from '../game/events';

export function SettingsScreen() {
  const { s } = useGame();
  const [set, setSet] = useState(audio.settings);
  const upd = (p: Partial<typeof set>) => {
    setSet(audio.update(p));
    window.dispatchEvent(new CustomEvent('gt-settings'));
  };
  return (
    <div className="panel wide narrow">
      <div className="panel-head"><div><h1>Settings</h1><div className="sub"><span className="tag">{s.mode === 'sandbox' ? 'Endless sandbox' : 'Campaign'}</span><span className="tag">Played {fmtTime(s.playTime)}</span></div></div></div>
      <div className="form">
        <label className="check"><input type="checkbox" checked={!set.muted} onChange={(e) => upd({ muted: !e.target.checked })} /> Sound effects</label>
        <label className="field">Volume <input type="range" min={0} max={1} step={0.05} value={set.volume} onChange={(e) => { upd({ volume: Number(e.target.value) }); audio.play('click'); }} /></label>
        <label className="field">Graphics quality
          <select value={set.quality} onChange={(e) => upd({ quality: e.target.value as typeof set.quality })}>
            <option value="low">Low (no glow, fastest)</option>
            <option value="medium">Medium</option>
            <option value="high">High (glow, sharp)</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={set.autosave} onChange={(e) => upd({ autosave: e.target.checked })} /> Autosave every 20 seconds</label>
        <label className="check"><input type="checkbox" checked={set.tooltips} onChange={(e) => upd({ tooltips: e.target.checked })} /> Show help tooltips</label>
        <label className="check"><input type="checkbox" checked={set.reduceMotion} onChange={(e) => upd({ reduceMotion: e.target.checked })} /> Reduce UI motion</label>
      </div>
      <div className="btn-row">
        <button className="btn" onClick={() => store.setUi({ tutorial: 0 })}>? Replay tutorial</button>
        <button className="btn" onClick={() => store.go('saves')}>Save management →</button>
        <button className="btn" onClick={async () => { if (await askConfirm('Return to main menu?', 'Your game is saved automatically.', 'Main menu')) await store.toMenu(); }}>Main menu</button>
      </div>
      <div className="hint">All data stays on this device. Galaxy Tycoon has no accounts, no server and never transmits your save.</div>
    </div>
  );
}

export function SavesScreen() {
  const { s, ui } = useGame();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  return (
    <div className="panel wide narrow">
      <div className="panel-head"><div><h1>Save Management</h1><div className="sub"><span className="tag">Stored in your browser (IndexedDB)</span><span className="tag">Save v{s.version}</span></div></div></div>
      <div className="grid cols2">
        <div className="card">
          <h4>Save now</h4>
          <p className="flavor">The game saves automatically every 20 seconds and whenever you leave the page.</p>
          <div className="mini-stats"><span>Last saved: {ui.lastSaved ? new Date(ui.lastSaved).toLocaleTimeString() : 'not yet this session'}</span>{ui.saveStatus && <span className={ui.saveStatus === 'Saved' ? 'good' : 'bad'}>{ui.saveStatus}</span>}</div>
          <button className="btn primary" onClick={() => void store.save(false)}>▤ Save game</button>
        </div>
        <div className="card">
          <h4>Export save</h4>
          <p className="flavor">Download your save as a JSON file. Keep it as a backup or move it to another browser.</p>
          <button className="btn" onClick={() => { store.exportSave(); toast('Save exported', 'good'); }}>⇩ Export JSON</button>
        </div>
        <div className="card">
          <h4>Import save</h4>
          <p className="flavor">Load a previously exported JSON file. This replaces your current game.</p>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (!(await askConfirm('Import this save?', `"${f.name}" will replace your current game.`, 'Import', true))) return;
            const r = await store.importFile(f);
            setMsg(r.msg);
            toast(r.msg, r.ok ? 'good' : 'bad');
          }} />
          <button className="btn" onClick={() => file.current?.click()}>⇧ Import JSON…</button>
          {msg && <div className={`hint ${msg.startsWith('Import failed') ? 'bad' : 'good'}`}>{msg}</div>}
        </div>
        <div className="card danger-zone">
          <h4>Reset game</h4>
          <p className="flavor">Permanently delete this save and return to the main menu.</p>
          <button className="btn danger" onClick={async () => { if (await askConfirm('Reset everything?', 'This permanently deletes your save, including its backup. This cannot be undone.', 'Delete my save', true)) { await store.resetGame(); toast('Save deleted', 'info'); } }}>✖ Reset game…</button>
        </div>
      </div>
      <div className="hint">Galaxy seed <b>{s.seed}</b> — the same seed always generates the same galaxy.</div>
    </div>
  );
}
void run;
