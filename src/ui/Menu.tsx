import { useRef, useState } from 'react';
import { store, useUi } from '../store';
import { Modal, fmt, fmtTime } from './common';
import { toast } from '../game/events';
import { MuteButton } from './Hud';

export function Menu() {
  const ui = useUi();
  const [newOpen, setNewOpen] = useState(false);
  const [mode, setMode] = useState<'campaign' | 'sandbox'>('campaign');
  const [seed, setSeed] = useState('');
  const [about, setAbout] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const info = ui.saveInfo;
  const start = () => {
    const n = seed.trim() === '' ? undefined : Math.abs(Math.floor(Number(seed))) % 2147483647;
    if (n !== undefined && !isFinite(n)) return toast('Seed must be a number', 'bad');
    setNewOpen(false);
    store.newGame(mode, n);
  };
  return (
    <div className="menu">
      <div className="menu-top"><MuteButton /></div>
      <div className="menu-center">
        <div className="eyebrow">An interstellar mining empire</div>
        <h1 className="title">GALAXY<span>TYCOON</span></h1>
        <p className="tagline">Mine. Trade. Automate. Discover. Build the gate at the heart of the galaxy.</p>
        <div className="menu-buttons">
          <button className="btn primary big" disabled={!info} onClick={async () => { const ok = await store.continueGame(); if (!ok) toast('Could not load your save', 'bad'); }}>
            ▶ Continue {info && <small>{fmtTime(info.playTime)} · ¤{fmt(info.credits)}{info.mode === 'sandbox' ? ' · sandbox' : ''}</small>}
          </button>
          <button className="btn big" onClick={() => setNewOpen(true)}>✦ New Game</button>
          <button className="btn big" onClick={() => file.current?.click()}>⇧ Import Save</button>
          <button className="btn big" onClick={() => setAbout(true)}>? How to Play</button>
        </div>
        {ui.loadError && <div className="hint bad menu-err">Your saved game could not be read ({ui.loadError}). You can start a new game or import a backup file.</div>}
        {info?.backup && <div className="hint">Note: your main save was damaged; the previous backup will be loaded.</div>}
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const r = await store.importFile(f);
          toast(r.msg, r.ok ? 'good' : 'bad');
        }} />
      </div>
      <div className="menu-foot">Runs entirely in your browser · progress saved locally · no accounts, no servers</div>
      {newOpen && (
        <Modal title="New Game" onClose={() => setNewOpen(false)}>
          <div className="mode-pick">
            <button className={`card pick ${mode === 'campaign' ? 'on' : ''}`} onClick={() => setMode('campaign')}><b>Campaign</b><small>Guided objectives and tutorial. Finish the Stellar Gateway to win, then play on.</small></button>
            <button className={`card pick ${mode === 'sandbox' ? 'on' : ''}`} onClick={() => setMode('sandbox')}><b>Endless sandbox</b><small>No guided objectives, no tutorial. Same systems — set your own goals.</small></button>
          </div>
          <label className="field">Galaxy seed (optional)
            <input type="text" inputMode="numeric" placeholder="Random" value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ''))} />
          </label>
          {info && <div className="hint bad">Starting a new game replaces your current save once it autosaves.</div>}
          <div className="btn-row"><button className="btn" onClick={() => setNewOpen(false)}>Cancel</button><button className="btn primary" onClick={start}>Launch</button></div>
        </Modal>
      )}
      {about && (
        <Modal title="How to play" onClose={() => setAbout(false)} wide>
          <ol className="howto">
            <li><b>Scan and mine.</b> In the System screen scan, pick a body and mine. Pulse Burst gives fast bonus yield.</li>
            <li><b>Unload and sell.</b> Unload at a dock, then sell in Cargo & Market.</li>
            <li><b>Upgrade.</b> Hangar upgrades show their effect before purchase.</li>
            <li><b>Automate.</b> Drones, mining ships and stations produce while you are away.</li>
            <li><b>Research.</b> Five branches unlock real gameplay effects; some need labs or discoveries.</li>
            <li><b>Explore.</b> 128 systems across five sectors with hidden systems, anomalies, alien relics and pirates.</li>
            <li><b>Win.</b> Finish the three-stage Stellar Gateway, then keep playing forever.</li>
          </ol>
          <div className="btn-row"><button className="btn primary" onClick={() => setAbout(false)}>Got it</button></div>
        </Modal>
      )}
    </div>
  );
}
