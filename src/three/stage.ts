import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SECTORS, SECTOR_RADII, RES, SHIPS, ENEMIES, type ResId } from '../game/data';
import { dist, getGalaxy, type Body, type StarSystem } from '../game/galaxy';
import { createState, getMods, shipStats, type GameState } from '../game/state';
import { hashString } from '../game/rng';
import { bus } from '../game/events';
import { store } from '../store';
import { audio } from '../audio';
import { glowTexture, makeEnemy, makePlanet, makeShip, makeStarfield, nebulaTexture, textSprite, type PlanetParts } from './procedural';

type Mode = 'menu' | 'system' | 'galaxy';
interface Entry {
  body: Body;
  group: THREE.Object3D;
  planet?: PlanetParts;
  parent?: Entry;
  hit: THREE.Object3D;
  belt?: THREE.Group;
  orbitLine?: THREE.LineLoop;
  pos: THREE.Vector3;
  size: number;
}
interface PoiEntry { id: string; mesh: THREE.Object3D; pos: THREE.Vector3; hit: THREE.Mesh }
interface Particle { sprite: THREE.Sprite; vel: THREE.Vector3; life: number; max: number; target?: THREE.Object3D; grow: number }
interface Beam { mesh: THREE.Mesh; life: number; max: number; from: THREE.Vector3; to: THREE.Vector3; color: number }

const POI_COLOR: Record<string, number> = { station: 0x7ad0ff, artifact: 0xe6a8ff, anomaly: 0xff7ad0, derelict: 0xffc26b, cache: 0x7dffb2, beacon: 0xfff36b };
const MENU_SEED = 20240611;
const tmpV = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  private raf = 0;
  private last = performance.now();
  private time = 0;
  private mode: Mode = 'menu';
  private quality: 'low' | 'medium' | 'high' = 'high';
  private width = 1;
  private height = 1;
  private px = 1;
  private ro: ResizeObserver;

  // background
  private bg = new THREE.Group();
  private starsA: THREE.Points;
  private starsB: THREE.Points;
  private nebulae = new THREE.Group();
  private nebKey = '';
  private warpLines: THREE.LineSegments;

  // system view
  private sysGroup = new THREE.Group();
  private sysKey = '';
  private entries: Entry[] = [];
  private pois: PoiEntry[] = [];
  private starObj: THREE.Object3D | null = null;
  private starLight = new THREE.PointLight(0xfff1c0, 2.2, 0, 0);
  private ambient = new THREE.AmbientLight(0x334466, 0.9);
  private lightPos = new THREE.Vector3(0, 0, 0);
  private sysRadius = 60;
  private drones: { mesh: THREE.Object3D; ang: number; rad: number; speed: number; yoff: number; ent: string; kind: string }[] = [];
  private stationObj: { mesh: THREE.Object3D; ent: string }[] = [];
  private scanRing: THREE.Mesh;
  private demoState: GameState | null = null;

  // ship + fx
  private ship: THREE.Group | null = null;
  private shipId = '';
  private shipPos = new THREE.Vector3(0, 0, 14);
  private shipQuat = new THREE.Quaternion();
  private fx = new THREE.Group();
  private particles: Particle[] = [];
  private beams: Beam[] = [];
  private mineBeam: THREE.Mesh;
  private enemies: THREE.Group[] = [];
  private enemyKey = '';
  private shake = 0;
  private sparkAcc = 0;
  private pulseFlash = 0;

  // galaxy view
  private galGroup = new THREE.Group();
  private galKey = '';
  private galPoints: { id: string; pos: THREE.Vector3 }[] = [];
  private galMarker: THREE.Sprite;
  private galSelected: THREE.Sprite;
  private galHover: THREE.Sprite;
  private galLabels = new THREE.Group();
  private galRange: THREE.LineLoop;
  private galPath: THREE.Line;
  private galLabelCache = new Map<string, THREE.Sprite>();
  private hoverId: string | null = null;

  // camera goals
  private desiredDist: number | null = null;
  private followId: string | null = 'star';
  private lastSelBody: string | null = null;
  private lastMode: Mode | null = null;
  private fovGoal = 55;
  private raycaster = new THREE.Raycaster();
  private ptrDown = { x: 0, y: 0, t: 0 };
  private unsubs: (() => void)[] = [];
  onHover: (info: { id: string; x: number; y: number } | null) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.setClearColor(0x03030a, 1);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
    this.camera.position.set(0, 46, 78);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.8;
    this.controls.maxPolarAngle = Math.PI * 0.92;
    this.controls.addEventListener('start', () => {
      this.desiredDist = null;
    });

    this.scene.add(this.bg, this.sysGroup, this.galGroup, this.fx, this.starLight, this.ambient);
    this.starsA = makeStarfield(2600, 1800, 11, 1);
    this.starsB = makeStarfield(900, 1500, 29, 1);
    this.bg.add(this.starsA, this.starsB, this.nebulae);

    // warp streaks
    const lp: number[] = [];
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 60;
      const z = -Math.random() * 420;
      lp.push(Math.cos(a) * r, Math.sin(a) * r, z, Math.cos(a) * r, Math.sin(a) * r, z - 20 - Math.random() * 60);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.warpLines = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.warpLines.frustumCulled = false;
    this.scene.add(this.warpLines);

    // scan ring
    this.scanRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), new THREE.MeshBasicMaterial({ color: 0x7ad8ff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scanRing.rotation.x = Math.PI / 2;
    this.fx.add(this.scanRing);

    // mining beam
    this.mineBeam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x66f0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.mineBeam.visible = false;
    this.fx.add(this.mineBeam);

    // galaxy helpers
    const ringTex = this.ringSpriteTexture();
    const mkSprite = (color: number, scale: number) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.set(scale, scale, 1);
      s.renderOrder = 15;
      s.visible = false;
      return s;
    };
    this.galMarker = mkSprite(0x7dffb2, 7);
    this.galSelected = mkSprite(0xffd45e, 8);
    this.galHover = mkSprite(0xffffff, 6);
    this.galGroup.add(this.galMarker, this.galSelected, this.galHover, this.galLabels);
    this.galRange = new THREE.LineLoop(this.circleGeo(1, 128), new THREE.LineBasicMaterial({ color: 0x5dffb0, transparent: true, opacity: 0.35, depthWrite: false }));
    this.galRange.rotation.x = Math.PI / 2;
    this.galGroup.add(this.galRange);
    this.galPath = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x5dffb0, transparent: true, opacity: 0.9, depthTest: false }));
    this.galPath.renderOrder = 14;
    this.galGroup.add(this.galPath);

    // events -> visuals
    this.unsubs.push(
      bus.on('gain', (g: { res: string; amount: number }) => this.spawnChip(g.res)),
      bus.on('sfx', (n: string) => this.onSfx(n)),
    );
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerleave', () => this.setHover(null, 0, 0));
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement ?? canvas);
    this.setQuality(audio.settings.quality);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ───────────── setup helpers ─────────────
  private ringSpriteTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.strokeStyle = '#fff';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52);
      g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  private circleGeo(r: number, seg: number): THREE.BufferGeometry {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }

  setQuality(q: 'low' | 'medium' | 'high') {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.px = q === 'low' ? 1 : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this.renderer.setPixelRatio(this.px);
    if (q === 'low') {
      this.composer?.dispose();
      this.composer = null;
      this.bloom = null;
    } else if (!this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), q === 'high' ? 0.75 : 0.55, 0.7, 0.18);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
    for (const p of [this.starsA, this.starsB]) (p.material as THREE.ShaderMaterial).uniforms.uPx.value = this.px;
  }

  resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setPixelRatio(this.px);
    this.composer?.setSize(w, h);
    this.bloom?.resolution.set(w, h);
  }

  // ───────────── input ─────────────
  private onDown = (e: PointerEvent) => {
    this.ptrDown = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  private onUp = (e: PointerEvent) => {
    const d = Math.hypot(e.clientX - this.ptrDown.x, e.clientY - this.ptrDown.y);
    if (d > 6 || performance.now() - this.ptrDown.t > 600) return;
    this.pick(e.clientX, e.clientY);
  };
  private onMove = (e: PointerEvent) => {
    if (this.mode !== 'galaxy' || e.pointerType === 'touch') return;
    const id = this.pickSystem(e.clientX, e.clientY, 16);
    this.setHover(id, e.clientX, e.clientY);
  };
  private setHover(id: string | null, x: number, y: number) {
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.canvas.style.cursor = id ? 'pointer' : 'default';
    }
    this.onHover(id ? { id, x, y } : null);
  }

  private ndc(cx: number, cy: number): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  }
  private pickSystem(cx: number, cy: number, radius: number): string | null {
    const r = this.canvas.getBoundingClientRect();
    let best: string | null = null;
    let bd = radius;
    for (const p of this.galPoints) {
      tmpV.copy(p.pos).project(this.camera);
      if (tmpV.z > 1) continue;
      const sx = ((tmpV.x + 1) / 2) * r.width + r.left;
      const sy = ((1 - tmpV.y) / 2) * r.height + r.top;
      const d = Math.hypot(sx - cx, sy - cy);
      if (d < bd) {
        bd = d;
        best = p.id;
      }
    }
    return best;
  }
  private pick(cx: number, cy: number) {
    if (this.mode === 'galaxy') {
      const id = this.pickSystem(cx, cy, 26);
      store.setUi({ selectedSystem: id });
      return;
    }
    this.raycaster.setFromCamera(this.ndc(cx, cy), this.camera);
    const hits: THREE.Object3D[] = [...this.entries.map((e) => e.hit), ...this.pois.map((p) => p.hit)];
    const res = this.raycaster.intersectObjects(hits, false);
    if (!res.length) {
      if (this.mode === 'system') store.setUi({ selectedBody: null });
      return;
    }
    const o = res[0].object;
    if (o.userData.poiId) store.setUi({ selectedBody: `poi:${o.userData.poiId}` });
    else if (o.userData.bodyId) {
      store.setUi({ selectedBody: o.userData.bodyId });
      audio.play('click');
    }
  }

  // ───────────── effects ─────────────
  private spawnChip(res: string) {
    if (this.mode !== 'system' || !this.ship) return;
    const st = store.state;
    if (!st || st.activity.type !== 'mining') return;
    const e = this.entries.find((x) => x.body.id === (st.activity as { bodyId: string }).bodyId);
    if (!e) return;
    const col = new THREE.Color(RES[res as ResId]?.color ?? '#ffffff');
    this.addParticle(col, e.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * e.size, (Math.random() - 0.2) * e.size, (Math.random() - 0.5) * e.size)), new THREE.Vector3(), 1.1, 1.3, this.ship, 0);
  }
  private addParticle(color: THREE.Color, pos: THREE.Vector3, vel: THREE.Vector3, life: number, size: number, target?: THREE.Object3D, grow = 0) {
    if (this.particles.length > 220) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.copy(pos);
    sp.scale.set(size, size, 1);
    this.fx.add(sp);
    this.particles.push({ sprite: sp, vel, life, max: life, target, grow });
  }
  private burst(pos: THREE.Vector3, color: number, n: number, speed: number, size = 0.8) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      this.addParticle(c, pos.clone(), v, 0.5 + Math.random() * 0.6, size * (0.6 + Math.random()), undefined, -0.5);
    }
  }
  private addBeam(from: THREE.Vector3, to: THREE.Vector3, color: number, life: number, width = 0.12) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(width, width, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.fx.add(m);
    this.beams.push({ mesh: m, life, max: life, from: from.clone(), to: to.clone(), color });
    this.orientBeam(m, from, to);
  }
  private orientBeam(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
    const d = tmpV.copy(b).sub(a);
    const len = d.length();
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(m.scale.x, len, m.scale.z);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
  }
  private onSfx(n: string) {
    if (this.mode !== 'system') return;
    const st = store.state;
    const combat = st?.combat;
    if (n === 'laser' && this.ship) {
      const idx = this.enemies.findIndex((e) => e.visible);
      const tgt = idx >= 0 ? this.enemies[idx].position : null;
      if (tgt) this.addBeam(this.shipPos, tgt, 0x7ad8ff, 0.18, 0.1);
    } else if (n === 'hit' && combat && this.ship) {
      const e = this.enemies.find((x) => x.visible);
      if (e) this.addBeam(e.position, this.shipPos, 0xff6a4d, 0.16, 0.09);
      this.burst(this.shipPos, 0xff9a5d, 8, 6, 0.7);
      this.shake = 0.5;
    } else if (n === 'explode') {
      const e = this.enemies.find((x) => !x.visible) ?? this.enemies[0];
      this.burst(e ? e.position : this.shipPos, 0xffb060, 26, 10, 1.3);
      this.shake = 0.6;
    } else if (n === 'pulse') {
      this.pulseFlash = 1;
    } else if (n === 'upgrade') {
      this.burst(this.shipPos, 0x9fe8ff, 18, 7, 0.9);
    } else if (n === 'discover' || n === 'achievement') {
      this.burst(this.shipPos, 0xffe27a, 22, 8, 1.1);
    } else if (n === 'sell') {
      this.burst(this.shipPos, 0xffd45e, 8, 5, 0.6);
    }
  }

  // ───────────── scene building ─────────────
  private clearGroup(g: THREE.Object3D) {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
    g.clear();
  }

  private ensureNebulae(sys: StarSystem) {
    const key = sys.id;
    if (key === this.nebKey) return;
    this.nebKey = key;
    this.clearGroup(this.nebulae);
    const h = hashString(`neb${sys.id}`);
    const hue = (h % 360) / 360;
    const palette = (off: number): [number, number, number] => {
      const c = new THREE.Color().setHSL((hue + off + 1) % 1, 0.75, 0.55);
      return [c.r * 255, c.g * 255, c.b * 255];
    };
    const n = this.quality === 'low' ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const tex = nebulaTexture(palette(i * 0.09 - 0.1), h + i * 97, this.quality === 'low' ? 96 : 160);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      const s = new THREE.Sprite(mat);
      const a = ((h >> (i * 3)) % 628) / 100;
      const el = (((h >> (i * 2 + 1)) % 100) / 100 - 0.5) * 1.2;
      const r = 1200;
      s.position.set(Math.cos(a) * r * Math.cos(el), Math.sin(el) * r, Math.sin(a) * r * Math.cos(el));
      const sc = 900 + ((h >> i) % 700);
      s.scale.set(sc, sc, 1);
      s.material.rotation = (h % 100) / 16 + i;
      s.renderOrder = -9;
      this.nebulae.add(s);
    }
  }

  private buildSystem(s: GameState, sys: StarSystem, demo: boolean) {
    this.clearGroup(this.sysGroup);
    this.entries = [];
    this.pois = [];
    this.drones = [];
    this.stationObj = [];
    this.starObj = null;

    // star
    const star = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(sys.star.radius, 40, 28), new THREE.MeshBasicMaterial({ color: sys.star.color }));
    star.add(core);
    const cStr = '#' + new THREE.Color(sys.star.color).getHexString();
    const rgba = (a: number) => {
      const c = new THREE.Color(sys.star.color);
      return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
    };
    void cStr;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(rgba(1), rgba(0)), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    glow.scale.setScalar(sys.star.radius * 5);
    star.add(glow);
    const glow2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    glow2.scale.setScalar(sys.star.radius * 2.2);
    star.add(glow2);
    this.sysGroup.add(star);
    this.starObj = star;
    this.starLight.color.set(sys.star.color).lerp(new THREE.Color(0xffffff), 0.4);
    this.starLight.intensity = 2.6 * sys.star.lum;
    this.lightPos.set(0, 0, 0);

    const seedBase = hashString(sys.id);
    const byBody = new Map<string, Entry>();
    let maxOrbit = sys.star.radius + 20;
    for (const b of sys.bodies) {
      const revealed = demo || !!s.revealedBodies[b.id];
      const e: Entry = { body: b, group: new THREE.Group(), pos: new THREE.Vector3(), hit: new THREE.Object3D(), size: Math.max(b.size, 1) };
      if (b.kind === 'belt') {
        const grp = new THREE.Group();
        const count = revealed ? 650 : 220;
        const geo = new THREE.IcosahedronGeometry(0.28, 0);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.2, flatShading: true });
        const inst = new THREE.InstancedMesh(geo, mat, count);
        const m4 = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const sc = new THREE.Vector3();
        const col = new THREE.Color();
        let rs = seedBase + hashString(b.id);
        const rnd = () => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296);
        for (let i = 0; i < count; i++) {
          const a = rnd() * Math.PI * 2;
          const r = b.orbit + (rnd() - 0.5) * 4.4 + (rnd() - 0.5) * 1.5;
          const sz = 0.25 + Math.pow(rnd(), 3) * 1.6;
          sc.set(sz * (0.7 + rnd() * 0.6), sz * (0.7 + rnd() * 0.6), sz * (0.7 + rnd() * 0.6));
          q.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6));
          m4.compose(new THREE.Vector3(Math.cos(a) * r, (rnd() - 0.5) * 1.1, Math.sin(a) * r), q, sc);
          inst.setMatrixAt(i, m4);
          const base = new THREE.Color(b.type === 'belt_ice' ? 0xbfe3f5 : b.type === 'belt_rich' ? 0xc7a96b : 0x8c8580);
          col.copy(base).multiplyScalar(0.6 + rnd() * 0.6);
          if (b.type === 'belt_rich' && rnd() < 0.18) col.set(0xff7ad8);
          inst.setColorAt(i, col);
        }
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        grp.add(inst);
        grp.visible = true;
        e.belt = grp;
        e.group = grp;
        const hit = new THREE.Mesh(new THREE.TorusGeometry(b.orbit, 2.8, 6, 64), new THREE.MeshBasicMaterial({ visible: false }));
        hit.rotation.x = Math.PI / 2;
        hit.userData.bodyId = b.id;
        e.hit = hit;
        this.sysGroup.add(grp, hit);
        e.size = 2;
        maxOrbit = Math.max(maxOrbit, b.orbit + 5);
        if (!revealed) inst.material.opacity = 0.5;
      } else {
        const parts = makePlanet(b.type, b.size, b.colorA, b.colorB, b.atmo, seedBase + hashString(b.id), b.ring, this.lightPos);
        parts.uniforms.uSeed.value = (hashString(b.id) % 1000) * 0.07;
        e.planet = parts;
        e.group = parts.group;
        e.group.rotation.z = b.tilt;
        if (!revealed) {
          parts.group.visible = false;
          const ghost = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(150,190,255,0.8)', 'rgba(150,190,255,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
          ghost.scale.setScalar(2.6);
          ghost.name = 'ghost';
          const holder = new THREE.Group();
          holder.add(parts.group, ghost);
          e.group = holder;
        }
        const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(b.size * 1.5, 1.4), 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
        hit.userData.bodyId = b.id;
        e.hit = hit;
        this.sysGroup.add(e.group, hit);
        if (b.kind === 'planet') maxOrbit = Math.max(maxOrbit, b.orbit + b.size * 2.5);
      }
      if (b.kind === 'planet') {
        const ol = new THREE.LineLoop(this.circleGeo(b.orbit, 160), new THREE.LineBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.1, depthWrite: false }));
        ol.rotation.x = Math.PI / 2;
        this.sysGroup.add(ol);
        e.orbitLine = ol;
      }
      byBody.set(b.id, e);
      this.entries.push(e);
    }
    for (const e of this.entries) if (e.body.parent) e.parent = byBody.get(e.body.parent);

    // points of interest (only when detectable)
    const m = getMods(s);
    for (const p of sys.pois) {
      const power = s.scanPower[sys.id] ?? 0;
      if (!demo && p.difficulty - m.poiScan > power) continue;
      const done = !!s.poisDone[p.id];
      const colr = POI_COLOR[p.kind] ?? 0xffffff;
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: done ? 0x555a66 : colr, emissive: done ? 0x000000 : colr, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.3, flatShading: true }));
      g.add(mesh);
      if (!done) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: colr, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        sp.scale.setScalar(5);
        g.add(sp);
      }
      const pos = new THREE.Vector3(Math.cos(p.phase) * p.orbit, 1.5, Math.sin(p.phase) * p.orbit);
      g.position.copy(pos);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.copy(pos);
      hit.userData.poiId = p.id;
      this.sysGroup.add(g, hit);
      this.pois.push({ id: p.id, mesh: g, pos, hit });
    }

    // automation visuals
    const inst = demo ? null : s.installs[sys.id];
    if (inst) {
      const focusBody = sys.bodies.length ? this.entries.find((e) => e.body.id === (inst.focus ?? '')) ?? this.entries.reduce((a, b) => (b.body.richness > a.body.richness ? b : a), this.entries[0]) : null;
      if (focusBody) {
        const droneGeo = new THREE.OctahedronGeometry(0.26, 0);
        const droneMat = new THREE.MeshStandardMaterial({ color: 0xffd45e, emissive: 0xffa020, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 });
        const nD = Math.min(inst.drone, 24);
        for (let i = 0; i < nD; i++) {
          const mesh = new THREE.Mesh(droneGeo, droneMat);
          this.sysGroup.add(mesh);
          this.drones.push({ mesh, ang: (i / Math.max(1, nD)) * Math.PI * 2, rad: focusBody.size + 1.6 + (i % 3) * 0.5, speed: 0.6 + (i % 5) * 0.12, yoff: ((i % 4) - 1.5) * 0.5, ent: focusBody.body.id, kind: 'drone' });
        }
        const nM = Math.min(inst.minerShip, 10);
        for (let i = 0; i < nM; i++) {
          const mesh = makeShip('miner', 0xffb34d);
          mesh.scale.setScalar(0.34);
          this.sysGroup.add(mesh);
          this.drones.push({ mesh, ang: (i / Math.max(1, nM)) * Math.PI * 2, rad: focusBody.size + 3.2 + (i % 2) * 0.8, speed: 0.35, yoff: (i % 3) * 0.4, ent: focusBody.body.id, kind: 'ship' });
        }
        for (let i = 0; i < Math.min(inst.station, 1); i++) {
          const st = new THREE.Group();
          const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.16, 8, 32), new THREE.MeshStandardMaterial({ color: 0x9fb4ff, metalness: 0.8, roughness: 0.3, emissive: 0x3050ff, emissiveIntensity: 0.4 }));
          const hub = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshStandardMaterial({ color: 0xdde6ff, metalness: 0.7, roughness: 0.3 }));
          ring.rotation.x = Math.PI / 2;
          st.add(ring, hub);
          this.sysGroup.add(st);
          this.stationObj.push({ mesh: st, ent: focusBody.body.id });
        }
      }
    }
    if (sys.hub || sys.id === getGalaxy(s.seed).homeId) {
      // visible dock beacon for dockable systems
      const dock = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.14, 8, 32), new THREE.MeshStandardMaterial({ color: 0x7dffb2, emissive: 0x2dff90, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.4 }));
      ring.rotation.x = Math.PI / 2;
      const hub = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), new THREE.MeshStandardMaterial({ color: 0xcffff0, emissive: 0x2dff90, emissiveIntensity: 0.4 }));
      dock.add(ring, hub);
      dock.position.set(0, 0.5, -sys.star.radius - 8);
      dock.name = 'dock';
      this.sysGroup.add(dock);
    }
    this.sysRadius = maxOrbit;
  }

  private ensureShip(id: string) {
    if (this.shipId === id && this.ship) return;
    if (this.ship) {
      this.fx.remove(this.ship);
      this.clearGroup(this.ship);
    }
    this.shipId = id;
    const def = SHIPS[id as keyof typeof SHIPS] ?? SHIPS.scout;
    this.ship = makeShip(id, def.color);
    this.ship.position.copy(this.shipPos);
    this.fx.add(this.ship);
  }

  // ───────────── galaxy ─────────────
  private buildGalaxy(s: GameState) {
    this.clearGroup(this.galLabels);
    for (const c of Array.from(this.galGroup.children)) {
      if (c.userData.dyn) {
        this.galGroup.remove(c);
        this.clearGroup(c);
      }
    }
    this.galLabelCache.clear();
    const g = getGalaxy(s.seed);
    const home = g.byId.get(g.homeId)!;
    this.galPoints = [];
    const vis = g.systems.filter((o) => s.detected[o.id]);
    const pos = new Float32Array(vis.length * 3);
    const col = new Float32Array(vis.length * 3);
    const size = new Float32Array(vis.length);
    const phase = new Float32Array(vis.length);
    vis.forEach((o, i) => {
      pos[i * 3] = o.x;
      pos[i * 3 + 1] = o.y;
      pos[i * 3 + 2] = o.z;
      const c = new THREE.Color(o.star.color);
      const visited = !!s.visited[o.id];
      const k = visited ? 1.25 : 0.8;
      col[i * 3] = c.r * k;
      col[i * 3 + 1] = c.g * k;
      col[i * 3 + 2] = c.b * k;
      size[i] = (visited ? 15 : 10) * (0.8 + o.star.radius / 12);
      phase[i] = ((hashString(o.id) % 1000) / 1000);
      this.galPoints.push({ id: o.id, pos: new THREE.Vector3(o.x, o.y, o.z) });
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const sysPts = this.starPoints(geo);
    sysPts.userData.dyn = true;
    this.galGroup.add(sysPts);

    // galactic dust (decorative spiral)
    const dust = 2600;
    const dp = new Float32Array(dust * 3);
    const dc = new Float32Array(dust * 3);
    const ds = new Float32Array(dust);
    const dph = new Float32Array(dust);
    let r1 = hashString(`dust${s.seed}`);
    const rn = () => ((r1 = (Math.imul(r1, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < dust; i++) {
      const arm = Math.floor(rn() * 3);
      const r = 3 + Math.sqrt(rn()) * 125;
      const th = arm * ((Math.PI * 2) / 3) + r * 0.042 + (rn() - 0.5) * 0.9;
      dp[i * 3] = Math.cos(th) * r;
      dp[i * 3 + 1] = (rn() - 0.5) * 7 * (1 - r / 160);
      dp[i * 3 + 2] = Math.sin(th) * r;
      const t = r / 125;
      dc[i * 3] = 0.25 + (1 - t) * 0.5;
      dc[i * 3 + 1] = 0.3 + (1 - t) * 0.25;
      dc[i * 3 + 2] = 0.55 + t * 0.25;
      ds[i] = 1.6 + rn() * 2.2;
      dph[i] = rn();
    }
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    dgeo.setAttribute('aColor', new THREE.BufferAttribute(dc, 3));
    dgeo.setAttribute('aSize', new THREE.BufferAttribute(ds, 1));
    dgeo.setAttribute('aPhase', new THREE.BufferAttribute(dph, 1));
    const dustPts = this.starPoints(dgeo);
    dustPts.userData.dyn = true;
    this.galGroup.add(dustPts);

    const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,200,140,1)', 'rgba(255,120,60,0)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 }));
    coreGlow.scale.setScalar(110);
    coreGlow.userData.dyn = true;
    this.galGroup.add(coreGlow);

    // sector rings centred on home
    const unlocked = getMods(s).sectors;
    SECTOR_RADII.forEach((rad, i) => {
      const locked = i + 1 > unlocked;
      const sec = SECTORS[i + 1];
      const ring = new THREE.LineLoop(this.circleGeo(rad, 160), new THREE.LineBasicMaterial({ color: new THREE.Color(sec.color), transparent: true, opacity: locked ? 0.2 : 0.38, depthWrite: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(home.x, 0, home.z);
      ring.userData.dyn = true;
      this.galGroup.add(ring);
      const lab = textSprite(`${sec.name}${locked ? ' (locked)' : ''}`, locked ? '#8a93a6' : sec.color, 1.2);
      lab.position.set(home.x + Math.cos(-0.6 + i * 0.35) * rad, 3, home.z + Math.sin(-0.6 + i * 0.35) * rad);
      lab.userData.dyn = true;
      this.galGroup.add(lab);
    });
    const homeLab = textSprite(SECTORS[0].name, SECTORS[0].color, 1.1);
    homeLab.position.set(home.x, 4, home.z - 14);
    homeLab.userData.dyn = true;
    this.galGroup.add(homeLab);
  }

  private starPoints(geo: THREE.BufferGeometry): THREE.Points {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: this.px } },
      vertexShader: `attribute float aSize; attribute float aPhase; attribute vec3 aColor; uniform float uTime; uniform float uPx; varying vec3 vC; varying float vT;
        void main(){ vC=aColor; vT=0.8+0.2*sin(uTime*1.3+aPhase*30.0); vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize = aSize * uPx * clamp(240.0/(-mv.z), 0.25, 2.4); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC;
        varying float vT;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vC * (0.6 + a * 1.4) * vT, a * a * 1.2);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    return p;
  }

  // ───────────── frame ─────────────
  private frame = (t: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.time += dt;
    try {
      this.update(dt);
    } catch (e) {
      // never let a visual bug kill the render loop
      console.error('stage update error', e);
    }
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    const ui = store.ui;
    const real = store.state;
    const playing = ui.playing && !!real;
    const mode: Mode = !playing || ui.screen === 'menu' ? 'menu' : ui.screen === 'galaxy' ? 'galaxy' : 'system';
    if (!playing && !this.demoState) {
      this.demoState = createState(MENU_SEED, 'sandbox');
      const g = getGalaxy(MENU_SEED);
      for (const b of g.byId.get(g.homeId)!.bodies) this.demoState.revealedBodies[b.id] = true;
    }
    const s = playing ? real! : this.demoState!;
    const demo = !playing;
    const g = getGalaxy(s.seed);
    const sys = g.byId.get(s.location)!;
    this.mode = mode;
    const modeChanged = mode !== this.lastMode;
    this.lastMode = mode;

    // background
    this.ensureNebulae(sys);
    for (const p of [this.starsA, this.starsB]) (p.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;
    this.bg.position.copy(this.camera.position);
    const traveling = s.activity.type === 'traveling' && mode === 'system';
    this.starsA.rotation.y += dt * (traveling ? 0.5 : 0.004);
    this.nebulae.rotation.y += dt * 0.002;

    this.sysGroup.visible = mode !== 'galaxy';
    this.fx.visible = mode !== 'galaxy';
    this.galGroup.visible = mode === 'galaxy';
    this.starLight.visible = mode !== 'galaxy';
    this.ambient.visible = mode !== 'galaxy';
    this.warpLines.visible = traveling;

    if (mode === 'galaxy') this.updateGalaxy(dt, s, modeChanged);
    else this.updateSystem(dt, s, sys, demo, mode, modeChanged);

    // gentle shake
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.6;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    this.camera.fov += (this.fovGoal - this.camera.fov) * (1 - Math.exp(-4 * dt));
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private updateSystem(dt: number, s: GameState, sys: StarSystem, demo: boolean, mode: Mode, modeChanged: boolean) {
    const revealedCount = sys.bodies.filter((b) => s.revealedBodies[b.id]).length;
    const m = getMods(s);
    const poiCount = sys.pois.filter((p) => p.difficulty - m.poiScan <= (s.scanPower[sys.id] ?? 0)).length;
    const done = sys.pois.filter((p) => s.poisDone[p.id]).length;
    const inst = s.installs[sys.id];
    const key = `${demo ? 'demo' : 'g'}:${sys.id}:${revealedCount}:${poiCount}:${done}:${inst ? `${inst.drone}.${inst.minerShip}.${inst.station}.${inst.focus}` : ''}`;
    if (key !== this.sysKey) {
      const sysChanged = !this.sysKey.startsWith(key.split(':').slice(0, 2).join(':'));
      this.sysKey = key;
      this.buildSystem(s, sys, demo);
      if (sysChanged || modeChanged) {
        this.followId = 'star';
        this.desiredDist = null;
        this.camera.position.set(0, this.sysRadius * 0.62, this.sysRadius * 1.1);
        this.controls.target.set(0, 0, 0);
        if (this.mode === 'system') {
          this.shipPos.set(Math.cos(0.8) * 11, 0.6, Math.sin(0.8) * 11);
        }
      }
    }
    if (modeChanged) {
      this.controls.maxDistance = 600;
      this.controls.minDistance = 4;
      this.controls.enablePan = false;
      this.controls.autoRotate = mode === 'menu';
      this.controls.autoRotateSpeed = 0.45;
      this.fovGoal = 55;
      if (mode === 'menu') {
        this.camera.position.set(-18, 9, 34);
        this.controls.target.set(14, 0, 8);
        this.followId = null;
      } else {
        this.followId = 'star';
        this.camera.position.set(0, this.sysRadius * 0.62, this.sysRadius * 1.1);
        this.controls.target.set(0, 0, 0);
      }
    }
    this.controls.autoRotate = mode === 'menu';
    const t = demo ? this.time : s.playTime;

    // bodies
    for (const e of this.entries) {
      const b = e.body;
      const ang = b.phase + (t * Math.PI * 2) / b.period;
      if (b.kind === 'belt') {
        e.group.rotation.y = t * (0.03 + 0.4 / Math.max(10, b.orbit));
        e.pos.set(0, 0, 0);
        // pseudo position of belt used for ship hover: pick a point on belt
        e.pos.set(Math.cos(b.phase + t * 0.02) * b.orbit, 0, Math.sin(b.phase + t * 0.02) * b.orbit);
      } else if (e.parent) {
        const pp = e.parent.pos;
        const a2 = b.phase + (t * Math.PI * 2) / b.period;
        e.pos.set(pp.x + Math.cos(a2) * b.orbit, 0.2 * Math.sin(a2 * 2), pp.z + Math.sin(a2) * b.orbit);
        e.group.position.copy(e.pos);
      } else {
        e.pos.set(Math.cos(ang) * b.orbit, 0, Math.sin(ang) * b.orbit);
        e.group.position.copy(e.pos);
      }
      if (b.kind !== 'belt') e.hit.position.copy(e.pos);
      else e.hit.position.set(0, 0, 0);
      if (e.planet) {
        e.planet.mesh.rotation.y += dt * (b.type === 'gas' ? 0.08 : 0.12);
        e.planet.uniforms.uTime.value = this.time;
        e.planet.uniforms.uSelected.value = store.ui.selectedBody === b.id ? 0.55 + 0.3 * Math.sin(this.time * 4) : 0;
      }
      if (e.orbitLine) {
        (e.orbitLine.material as THREE.LineBasicMaterial).opacity = store.ui.selectedBody === b.id ? 0.45 : 0.1;
      }
    }
    for (const p of this.pois) {
      p.mesh.rotation.y += dt;
      const sc = store.ui.selectedBody === `poi:${p.id}` ? 1.5 + 0.2 * Math.sin(this.time * 5) : 1;
      p.mesh.scale.setScalar(sc);
    }
    if (this.starObj) this.starObj.children[1].scale.setScalar(sys.star.radius * (9 + Math.sin(this.time * 1.5) * 0.4));
    const dock = this.sysGroup.getObjectByName('dock');
    if (dock) dock.rotation.y += dt * 0.5;

    // automation
    for (const d of this.drones) {
      const e = this.entries.find((x) => x.body.id === d.ent);
      if (!e) continue;
      d.ang += dt * d.speed;
      const base = e.body.kind === 'belt' ? e.pos : e.pos;
      d.mesh.position.set(base.x + Math.cos(d.ang) * d.rad, base.y + d.yoff, base.z + Math.sin(d.ang) * d.rad);
      d.mesh.rotation.y = -d.ang;
      if (d.kind === 'drone') d.mesh.rotation.x += dt * 3;
    }
    for (const so of this.stationObj) {
      const e = this.entries.find((x) => x.body.id === so.ent);
      if (!e) continue;
      so.mesh.position.set(e.pos.x + e.size + 2.4, e.pos.y + 0.5, e.pos.z);
      so.mesh.rotation.y += dt * 0.4;
    }

    // ship
    if (mode === 'system') this.updateShip(dt, s, sys);
    else if (this.ship) this.ship.visible = false;
    this.updateEnemies(dt, s);

    // follow / zoom goals
    const sel = store.ui.selectedBody;
    if (mode === 'system' && sel !== this.lastSelBody) {
      this.lastSelBody = sel;
      if (!sel) {
        this.followId = 'star';
        this.desiredDist = this.sysRadius * 1.25;
      } else if (sel.startsWith('poi:')) {
        this.followId = sel;
        this.desiredDist = 14;
      } else {
        const e = this.entries.find((x) => x.body.id === sel);
        this.followId = sel;
        this.desiredDist = e ? (e.body.kind === 'belt' ? Math.max(24, e.body.orbit * 0.8) : Math.max(7, e.size * 4.6)) : 20;
      }
    }
    if (mode === 'system' && !traveling(s)) this.followCamera(dt);
    // warp
    this.fovGoal = mode === 'menu' ? 50 : traveling(s) ? 92 : 55;
    if (traveling(s)) {
      const pos = this.warpLines.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i += 2) {
        let z = pos.getZ(i) + dt * 480;
        if (z > 40) z -= 460;
        const len = pos.getZ(i + 1) - pos.getZ(i);
        pos.setZ(i, z);
        pos.setZ(i + 1, z + len);
      }
      pos.needsUpdate = true;
      this.warpLines.position.copy(this.camera.position);
      this.warpLines.quaternion.copy(this.camera.quaternion);
      (this.warpLines.material as THREE.LineBasicMaterial).opacity = 0.65;
    } else (this.warpLines.material as THREE.LineBasicMaterial).opacity = 0;

    this.updateFx(dt);
  }

  private followCamera(dt: number) {
    let goal: THREE.Vector3 | null = null;
    if (this.followId === 'star') goal = tmpV.set(0, 0, 0);
    else if (this.followId?.startsWith('poi:')) {
      const p = this.pois.find((x) => `poi:${x.id}` === this.followId);
      goal = p ? tmpV.copy(p.pos) : tmpV.set(0, 0, 0);
    } else if (this.followId) {
      const e = this.entries.find((x) => x.body.id === this.followId);
      goal = e ? (e.body.kind === 'belt' ? tmpV.set(0, 0, 0).lerp(e.pos, 0.55) : tmpV.copy(e.pos)) : tmpV.set(0, 0, 0);
    }
    if (!goal) return;
    const k = 1 - Math.exp(-3.2 * dt);
    const prev = this.controls.target.clone();
    this.controls.target.lerp(goal, k);
    this.camera.position.add(this.controls.target.clone().sub(prev));
    if (this.desiredDist !== null) {
      const off = this.camera.position.clone().sub(this.controls.target);
      const cur = off.length();
      const nd = cur + (this.desiredDist - cur) * k;
      off.setLength(nd);
      this.camera.position.copy(this.controls.target).add(off);
      if (Math.abs(nd - this.desiredDist) < 0.3) this.desiredDist = null;
    }
  }

  private updateShip(dt: number, s: GameState, sys: StarSystem) {
    this.ensureShip(s.ship.active);
    const ship = this.ship!;
    ship.visible = true;
    const a = s.activity;
    const goal = new THREE.Vector3();
    let look: THREE.Vector3 | null = null;
    let thrust = 0.35;
    if (a.type === 'mining') {
      const e = this.entries.find((x) => x.body.id === a.bodyId);
      if (e) {
        const out = e.pos.clone().normalize();
        if (out.lengthSq() < 0.01) out.set(1, 0, 0);
        const hover = e.body.kind === 'belt' ? 4 : e.size + 3.2;
        goal.copy(e.pos).addScaledVector(out, hover).add(new THREE.Vector3(0, 1.2 + (e.body.kind === 'belt' ? 1 : 0), 0));
        look = e.pos;
        thrust = 0.2;
      }
    } else if (a.type === 'investigating') {
      const p = this.pois.find((x) => x.id === a.poiId);
      if (p) {
        goal.copy(p.pos).add(new THREE.Vector3(3.5, 1.2, 0));
        look = p.pos;
        thrust = 0.5;
      }
    } else if (a.type === 'traveling') {
      const f = a.t / a.dur;
      goal.copy(this.shipPos);
      thrust = 1 + f * 2;
    } else {
      const ang = 0.8 + s.playTime * 0.04;
      goal.set(Math.cos(ang) * 11, 0.6 + Math.sin(s.playTime * 0.7) * 0.25, Math.sin(ang) * 11);
      look = goal.clone().add(new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang)));
    }
    if (a.type !== 'traveling') {
      const k = 1 - Math.exp(-2.4 * dt);
      const prev = this.shipPos.clone();
      this.shipPos.lerp(goal, k);
      const vel = this.shipPos.clone().sub(prev);
      if (!look && vel.lengthSq() > 1e-8) look = this.shipPos.clone().add(vel);
      thrust = Math.max(thrust, Math.min(1.2, vel.length() / Math.max(dt, 1e-3) / 8));
    }
    ship.position.copy(this.shipPos);
    if (look) {
      const m = new THREE.Matrix4().lookAt(this.shipPos, look, UP);
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      this.shipQuat.slerp(q, 1 - Math.exp(-4 * dt));
    }
    ship.quaternion.copy(this.shipQuat);
    if (a.type === 'traveling') ship.scale.set(1, 1, 1 + a.t / a.dur * 1.5);
    else ship.scale.set(1, 1, 1);
    const eng = ship.getObjectByName('engine') as THREE.Sprite | undefined;
    if (eng) {
      const f = thrust * (0.85 + 0.15 * Math.sin(this.time * 30));
      eng.scale.set(1.6 + f * 1.6, 1.6 + f * 1.6, 1);
    }

    // beam
    const beam = this.mineBeam;
    if (a.type === 'mining' && !s.combat && !s.event) {
      const e = this.entries.find((x) => x.body.id === a.bodyId);
      if (e && !a.overheated) {
        const nose = this.shipPos.clone().add(new THREE.Vector3(0, 0, 0.8).applyQuaternion(this.shipQuat));
        const target = e.body.kind === 'belt' ? e.pos.clone() : e.pos.clone().add(tmpV.copy(this.shipPos).sub(e.pos).normalize().multiplyScalar(e.size * 0.95));
        beam.visible = true;
        const flick = 0.75 + 0.25 * Math.sin(this.time * 40);
        const w = (0.06 + 0.02 * s.upgrades.laser) * flick * (1 + this.pulseFlash * 2.5);
        beam.scale.set(w, 1, w);
        this.orientBeam(beam, nose, target);
        (beam.material as THREE.MeshBasicMaterial).color.set(this.pulseFlash > 0.1 ? 0xffffff : 0x66f0ff);
        this.sparkAcc += dt;
        if (this.sparkAcc > 0.07) {
          this.sparkAcc = 0;
          this.addParticle(new THREE.Color(0xffd9a0), target.clone(), new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.45, 0.6, undefined, -0.8);
        }
      } else beam.visible = false;
    } else beam.visible = false;
    this.pulseFlash = Math.max(0, this.pulseFlash - dt * 3);

    // scan wave
    const ring = this.scanRing;
    if (a.type === 'scanning') {
      const f = a.t / a.dur;
      const r = f * (this.sysRadius * 1.1) + 1;
      ring.scale.set(r, r, 1);
      ring.position.set(0, 0, 0);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - f);
    } else if (a.type === 'investigating') {
      const f = (a.t % 1.2) / 1.2;
      const p = this.pois.find((x) => x.id === a.poiId);
      if (p) {
        ring.position.copy(p.pos);
        ring.scale.set(1 + f * 7, 1 + f * 7, 1);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - f);
      }
    } else (ring.material as THREE.MeshBasicMaterial).opacity = 0;
    void sys;
  }

  private updateEnemies(dt: number, s: GameState) {
    const c = s.combat;
    const key = c ? c.enemies.map((e) => e.id).join(',') + ':' + s.combat?.round : '';
    const roster = c ? c.enemies.map((e) => e.id).join(',') : '';
    if (!c) {
      if (this.enemies.length) {
        this.enemies.forEach((e) => {
          this.fx.remove(e);
          this.clearGroup(e);
        });
        this.enemies = [];
        this.enemyKey = '';
      }
      return;
    }
    void key;
    if (roster !== this.enemyKey) {
      this.enemyKey = roster;
      this.enemies.forEach((e) => {
        this.fx.remove(e);
        this.clearGroup(e);
      });
      this.enemies = c.enemies.map((e) => {
        const def = ENEMIES[e.id];
        const m = makeEnemy(def.color, !!def.boss);
        this.fx.add(m);
        return m;
      });
    }
    c.enemies.forEach((e, i) => {
      const m = this.enemies[i];
      if (!m) return;
      const alive = e.hull > 0;
      if (m.visible && !alive) this.burst(m.position, 0xff9a4d, 20, 9, 1.2);
      m.visible = alive;
      const n = c.enemies.length;
      const ang = (i / n) * Math.PI * 1.1 - 0.55 + this.time * 0.15;
      const r = 12 + (i % 2) * 3;
      const goal = new THREE.Vector3(this.shipPos.x + Math.sin(ang) * r, this.shipPos.y + 1 + Math.sin(this.time * 1.3 + i) * 0.7, this.shipPos.z + Math.cos(ang) * r);
      m.position.lerp(goal, 1 - Math.exp(-2 * dt));
      m.lookAt(this.shipPos);
    });
  }

  private updateFx(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.fx.remove(p.sprite);
        p.sprite.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      const f = 1 - p.life / p.max;
      if (p.target) {
        p.sprite.position.lerp(p.target.position, Math.min(1, f * f * 0.35 + dt * 4));
        if (p.sprite.position.distanceTo(p.target.position) < 1.2) p.life = Math.min(p.life, 0.05);
      } else {
        p.sprite.position.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(1 - dt * 1.5);
      }
      const sc = Math.max(0.05, p.sprite.scale.x * (1 + p.grow * dt));
      p.sprite.scale.set(sc, sc, 1);
      p.sprite.material.opacity = p.target ? 1 - f * 0.4 : 1 - f;
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.fx.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        this.beams.splice(i, 1);
        continue;
      }
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = b.life / b.max;
    }
  }

  private updateGalaxy(dt: number, s: GameState, modeChanged: boolean) {
    const g = getGalaxy(s.seed);
    const detected = Object.keys(s.detected).length;
    const key = `${s.seed}:${detected}:${Object.keys(s.visited).length}:${getMods(s).sectors}`;
    if (key !== this.galKey) {
      this.galKey = key;
      this.buildGalaxy(s);
    }
    this.galGroup.traverse((o) => {
      const mat = (o as THREE.Points).material as THREE.ShaderMaterial | undefined;
      if (mat && mat.uniforms && mat.uniforms.uTime) mat.uniforms.uTime.value = this.time;
    });
    const cur = g.byId.get(s.location)!;
    if (modeChanged) {
      this.controls.enablePan = true;
      this.controls.autoRotate = false;
      this.controls.minDistance = 18;
      this.controls.maxDistance = 360;
      this.fovGoal = 50;
      this.followId = null;
      this.controls.target.set(cur.x, 0, cur.z);
      this.camera.position.set(cur.x + 10, 105, cur.z + 82);
      this.desiredDist = null;
    }
    // markers
    this.galMarker.visible = true;
    this.galMarker.position.set(cur.x, cur.y, cur.z);
    const pulse = 1 + 0.12 * Math.sin(this.time * 3);
    this.galMarker.scale.setScalar(7 * pulse);
    const st = shipStats(s);
    this.galRange.position.set(cur.x, cur.y, cur.z);
    this.galRange.scale.set(st.jumpRange, st.jumpRange, 1);
    const selId = store.ui.selectedSystem;
    const sel = selId ? g.byId.get(selId) : null;
    this.galSelected.visible = !!sel;
    this.galPath.visible = !!sel && sel.id !== cur.id;
    if (sel) {
      this.galSelected.position.set(sel.x, sel.y, sel.z);
      this.galSelected.scale.setScalar(8.5 + Math.sin(this.time * 4) * 0.6);
      const d = dist(sel, cur);
      const inRange = d <= st.jumpRange + 1e-6;
      const pa = this.galPath.geometry.attributes.position as THREE.BufferAttribute;
      pa.setXYZ(0, cur.x, cur.y, cur.z);
      pa.setXYZ(1, sel.x, sel.y, sel.z);
      pa.needsUpdate = true;
      (this.galPath.material as THREE.LineBasicMaterial).color.set(inRange ? 0x5dffb0 : 0xff6a6a);
      this.labelFor(sel);
    }
    const hov = this.hoverId ? g.byId.get(this.hoverId) : null;
    this.galHover.visible = !!hov && hov.id !== selId;
    if (hov) this.galHover.position.set(hov.x, hov.y, hov.z);
    // labels: current + selected + visited that are close to the view centre
    for (const sp of this.galLabelCache.values()) sp.visible = false;
    this.labelFor(cur);
    if (sel) this.labelFor(sel);
    if (hov) this.labelFor(hov);
    const distCam = this.camera.position.distanceTo(this.controls.target);
    if (distCam < 120) {
      for (const p of this.galPoints) {
        const sys = g.byId.get(p.id)!;
        if (!s.visited[p.id] || p.pos.distanceTo(this.controls.target) > distCam * 0.9) continue;
        this.labelFor(sys);
      }
    }
    void dt;
  }
  private labelFor(sys: StarSystem) {
    let sp = this.galLabelCache.get(sys.id);
    if (!sp) {
      sp = textSprite(sys.name, '#e8f4ff', 0.8);
      this.galLabels.add(sp);
      this.galLabelCache.set(sys.id, sp);
    }
    sp.visible = true;
    sp.position.set(sys.x, sys.y + 4.2, sys.z);
    const d = this.camera.position.distanceTo(sp.position);
    const k = Math.max(0.4, Math.min(2.4, d / 110));
    sp.scale.set(8 * k, 1.5 * k, 1);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.unsubs.forEach((u) => u());
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.controls.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

function traveling(s: GameState): boolean {
  return s.activity.type === 'traveling' && store.ui.screen !== 'galaxy' && store.ui.screen !== 'menu';
}
