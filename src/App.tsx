import { useEffect, useRef, useState } from 'react';
import { Stage } from './three/stage';
import { audio } from './audio';
import { store, useGame, useUi } from './store';
import { getGalaxy } from './game/galaxy';
import { SECTORS } from './game/data';
import { Menu } from './ui/Menu';
import { GainFloaters, Nav, Objective, ResourceStrip, Toasts, TopBar } from './ui/Hud';
import { SystemScreen } from './ui/SystemScreen';
import { GalaxyScreen } from './ui/GalaxyScreen';
import { HangarScreen } from './ui/HangarScreen';
import { StationsScreen } from './ui/StationsScreen';
import { ResearchScreen } from './ui/ResearchScreen';
import { MissionsScreen } from './ui/MissionsScreen';
import { CargoScreen } from './ui/CargoScreen';
import { AchievementsScreen } from './ui/AchievementsScreen';
import { SavesScreen, SettingsScreen } from './ui/SettingsScreen';
import { CombatModal, ConfirmHost, EventModal, OfflineModal, Tutorial } from './ui/Overlays';

function Game() {
  const { ui, s } = useGame();
  const screens = {
    system: <SystemScreen />, galaxy: <GalaxyScreen />, hangar: <HangarScreen />, stations: <StationsScreen />, research: <ResearchScreen />,
    missions: <MissionsScreen />, cargo: <CargoScreen />, achievements: <AchievementsScreen />, settings: <SettingsScreen />, saves: <SavesScreen />, menu: null,
  } as const;
  return (
    <>
      <TopBar />
      <ResourceStrip />
      {(ui.screen === 'system' || ui.screen === 'galaxy') && <Objective />}
      <Nav />
      <main key={ui.screen} className="screen">{screens[ui.screen]}</main>
      <GainFloaters />
      {s.combat && <CombatModal />}
      <EventModal />
      <OfflineModal />
      <Tutorial />
      {ui.paused && <div className="paused-banner">PAUSED</div>}
    </>
  );
}

function HoverTip({ info }: { info: { id: string; x: number; y: number } | null }) {
  const { s } = useGame();
  if (!info || !s) return null;
  const g = getGalaxy(s.seed);
  const sys = g.byId.get(info.id);
  if (!sys) return null;
  const visited = !!s.visited[sys.id];
  return (
    <div className="hovertip" style={{ left: info.x + 14, top: info.y + 14 }}>
      <b>{sys.name}</b>
      <span style={{ color: SECTORS[sys.sector].color }}>{SECTORS[sys.sector].name}</span>
      <small>Class {sys.star.cls} · {visited ? 'visited' : 'unexplored'}{sys.hub ? ' · hub' : ''}</small>
    </div>
  );
}

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  const ui = useUi();
  const [webgl, setWebgl] = useState(true);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [motion, setMotion] = useState(audio.settings.reduceMotion);
  const [tips, setTips] = useState(audio.settings.tooltips);

  useEffect(() => {
    void store.init();
    if (location.search.includes('debug')) (window as unknown as Record<string, unknown>).__gt = { store };
    try {
      if (canvas.current) {
        stage.current = new Stage(canvas.current);
        stage.current.onHover = setHover;
      }
    } catch (e) {
      console.warn('WebGL unavailable, running without 3D', e);
      setWebgl(false);
    }
    const onSettings = () => {
      stage.current?.setQuality(audio.settings.quality);
      setMotion(audio.settings.reduceMotion);
      setTips(audio.settings.tooltips);
    };
    window.addEventListener('gt-settings', onSettings);
    return () => {
      window.removeEventListener('gt-settings', onSettings);
      stage.current?.dispose();
      stage.current = null;
    };
  }, []);

  useEffect(() => {
    if (ui.screen !== 'galaxy') setHover(null);
  }, [ui.screen]);

  return (
    <div className={`app ${motion ? 'reduce' : ''} ${tips ? '' : 'no-tips'} screen-${ui.screen} ${webgl ? '' : 'no-webgl'}`}>
      <div className="stage">
        <canvas ref={canvas} aria-label="Space view" />
      </div>
      {!webgl && <div className="nowebgl-note">3D graphics are unavailable in this browser, so a static backdrop is shown. The game is fully playable.</div>}
      {ui.playing ? <Game /> : <Menu />}
      {ui.screen === 'galaxy' && <HoverTip info={hover} />}
      <Toasts />
      <ConfirmHost />
    </div>
  );
}
