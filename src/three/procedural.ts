import * as THREE from 'three';
import type { BodyType } from '../game/data';
import { Rng } from '../game/rng';

// ───────────────────────────── Canvas textures ─────────────────────────────
function valueNoise2(w: number, h: number, rng: Rng, cell: number): Float32Array {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = x / cell;
      const fy = y / cell;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      let tx = fx - ix;
      let ty = fy - iy;
      tx = tx * tx * (3 - 2 * tx);
      ty = ty * ty * (3 - 2 * ty);
      const a = grid[iy * gw + ix];
      const b = grid[iy * gw + ix + 1];
      const c = grid[(iy + 1) * gw + ix];
      const d = grid[(iy + 1) * gw + ix + 1];
      out[y * w + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

const texCache = new Map<string, THREE.Texture>();

/** Soft, colourful nebula cloud with a radial falloff so it blends into space. */
export function nebulaTexture(color: [number, number, number], seed: number, size = 160): THREE.Texture {
  const key = `neb:${color.join(',')}:${seed}:${size}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const rng = new Rng(seed);
  const octaves = [valueNoise2(size, size, rng, size / 3), valueNoise2(size, size, rng, size / 6), valueNoise2(size, size, rng, size / 12), valueNoise2(size, size, rng, size / 24)];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const n = octaves[0][i] * 0.5 + octaves[1][i] * 0.28 + octaves[2][i] * 0.15 + octaves[3][i] * 0.07;
      const dx = (x / size - 0.5) * 2;
      const dy = (y / size - 0.5) * 2;
      const fall = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      const a = Math.pow(Math.max(0, n - 0.32) * 1.9, 1.5) * fall * fall;
      const p = i * 4;
      const tint = 0.6 + n * 0.7;
      img.data[p] = Math.min(255, color[0] * tint);
      img.data[p + 1] = Math.min(255, color[1] * tint);
      img.data[p + 2] = Math.min(255, color[2] * tint);
      img.data[p + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): THREE.Texture {
  const key = `glow:${inner}:${outer}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)'));
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

export function ringTexture(): THREE.Texture {
  const hit = texCache.get('ring');
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 4;
  const g = c.getContext('2d')!;
  const rng = new Rng(77);
  for (let x = 0; x < 256; x++) {
    const t = x / 255;
    const edge = Math.min(1, t * 6) * Math.min(1, (1 - t) * 6);
    const band = 0.35 + 0.65 * Math.abs(Math.sin(t * 40 + rng.next() * 0.4)) * (0.5 + 0.5 * rng.next());
    const a = edge * band * 0.85;
    g.fillStyle = `rgba(${200 + rng.int(0, 40)},${185 + rng.int(0, 30)},${160 + rng.int(0, 30)},${a})`;
    g.fillRect(x, 0, 1, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set('ring', t);
  return t;
}

export function textSprite(text: string, color = '#cfe9ff', scale = 1): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.font = '600 44px Rajdhani, "Segoe UI", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.9)';
  g.shadowBlur = 8;
  g.fillStyle = color;
  g.fillText(text, 256, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false });
  const s = new THREE.Sprite(m);
  s.scale.set(10 * scale, 1.9 * scale, 1);
  s.renderOrder = 20;
  return s;
}

// ───────────────────────────── Starfield ─────────────────────────────
const starVert = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPx;
  varying vec3 vColor;
  varying float vTw;
  void main() {
    vColor = aColor;
    vTw = 0.7 + 0.3 * sin(uTime * (0.6 + aPhase * 0.6) + aPhase * 40.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPx;
    gl_Position = projectionMatrix * mv;
  }
`;
const starFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vTw;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a = a * a * vTw;
    gl_FragColor = vec4(vColor * (0.7 + a), a);
    #include <colorspace_fragment>
  }
`;

export function makeStarfield(count: number, radius: number, seed: number, px: number): THREE.Points {
  const rng = new Rng(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const tints: [number, number, number][] = [[1, 1, 1], [0.7, 0.82, 1], [1, 0.9, 0.75], [1, 0.75, 0.7], [0.8, 0.75, 1]];
  for (let i = 0; i < count; i++) {
    const u = rng.range(-1, 1);
    const th = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - u * u);
    const rad = radius * rng.range(0.7, 1);
    pos[i * 3] = Math.cos(th) * r * rad;
    pos[i * 3 + 1] = u * rad;
    pos[i * 3 + 2] = Math.sin(th) * r * rad;
    const tn = rng.pick(tints);
    const br = rng.range(0.4, 1);
    col[i * 3] = tn[0] * br;
    col[i * 3 + 1] = tn[1] * br;
    col[i * 3 + 2] = tn[2] * br;
    size[i] = Math.pow(rng.next(), 6) * 5 + 1.1;
    phase[i] = rng.next();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: starVert,
    fragmentShader: starFrag,
    uniforms: { uTime: { value: 0 }, uPx: { value: px } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -10;
  return pts;
}

// ───────────────────────────── Planet shader ─────────────────────────────
const planetVert = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vPos = position;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const planetFrag = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uAtmo;
  uniform float uType;
  uniform float uSeed;
  uniform vec3 uLightPos;
  uniform float uTime;
  uniform float uSelected;
  varying vec3 vPos;
  varying vec3 vNormalW;
  varying vec3 vWorld;

  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5; float s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }

  void main() {
    vec3 p = normalize(vPos);
    vec3 q = p * 2.2 + uSeed;
    float n = fbm(q);
    vec3 col;
    vec3 emit = vec3(0.0);
    float shine = 0.0;
    if (uType < 0.5) {
      col = mix(uColB, uColA, smoothstep(0.3, 0.72, n));
      col *= 0.7 + 0.6 * fbm(q * 4.0);
      float crater = smoothstep(0.62, 0.7, fbm(q * 3.0 + 9.0));
      col *= 1.0 - 0.25 * crater;
    } else if (uType < 1.5) {
      float land = smoothstep(0.52, 0.56, n);
      vec3 sea = mix(uColB, uColA, fbm(q * 3.0) * 0.7);
      vec3 landc = mix(vec3(0.22, 0.42, 0.2), vec3(0.72, 0.64, 0.44), fbm(q * 5.0));
      col = mix(sea, landc, land);
      shine = (1.0 - land) * 0.6;
      float cl = smoothstep(0.55, 0.82, fbm(q * 2.6 + uTime * 0.03));
      col = mix(col, vec3(1.0), cl * 0.65);
      shine *= 1.0 - cl;
    } else if (uType < 2.5) {
      float warp = fbm(vec3(p.x * 2.0, p.y * 5.0, p.z * 2.0) + uTime * 0.02) * 3.0;
      float band = sin(p.y * 13.0 + warp) * 0.5 + 0.5;
      col = mix(uColA, uColB, band);
      col *= 0.85 + 0.3 * fbm(vec3(p.x * 3.0, p.y * 14.0, p.z * 3.0));
      float storm = smoothstep(0.78, 0.9, fbm(q * 1.4 + 4.0));
      col = mix(col, uColB * 1.3, storm * 0.5);
    } else if (uType < 3.5) {
      col = mix(uColA, uColA * 1.8, fbm(q * 3.0));
      float c = 1.0 - smoothstep(0.0, 0.07, abs(fbm(q * 2.4) - 0.5));
      float c2 = 1.0 - smoothstep(0.0, 0.05, abs(fbm(q * 5.0 + 3.0) - 0.5));
      emit = uColB * (c * 1.6 + c2 * 0.8);
    } else if (uType < 4.5) {
      float line = smoothstep(0.0, 0.035, abs(fbm(q * 3.2) - 0.5));
      col = mix(uColB, uColA, line * 0.6 + 0.4 * fbm(q * 5.0));
      col = mix(col, vec3(1.0), smoothstep(0.7, 0.95, abs(p.y)) * 0.6);
      shine = 0.35;
    } else {
      vec3 cell = floor(q * 3.2);
      float h = hash(cell);
      col = mix(uColA, uColB, h);
      float edge = 1.0 - smoothstep(0.0, 0.08, min(fract(q.x * 3.2), min(fract(q.y * 3.2), fract(q.z * 3.2))));
      emit = uAtmo * (0.25 + edge * 0.6 + 0.3 * sin(uTime * 1.2 + h * 20.0));
      shine = 0.8;
    }
    vec3 N = normalize(vNormalW);
    vec3 L = normalize(uLightPos - vWorld);
    vec3 V = normalize(cameraPosition - vWorld);
    float diff = max(dot(N, L), 0.0);
    float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    vec3 lit = col * (0.05 + diff * 1.15);
    lit += uAtmo * 0.05 * wrap;
    vec3 H = normalize(L + V);
    lit += vec3(1.0) * pow(max(dot(N, H), 0.0), 40.0) * shine * diff * 0.8;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    lit += uAtmo * fres * (0.15 + diff * 0.9) * 0.7;
    lit += emit;
    float sel = uSelected * pow(1.0 - max(dot(N, V), 0.0), 2.0);
    lit += vec3(0.4, 0.9, 1.0) * sel * 1.2;
    gl_FragColor = vec4(lit, 1.0);
    #include <colorspace_fragment>
  }
`;
const atmoFrag = /* glsl */ `
  uniform vec3 uAtmo;
  uniform vec3 uLightPos;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightPos - vWorld);
    float rim = pow(1.0 - abs(dot(N, V)), 3.2);
    float lightSide = 0.25 + 0.75 * clamp(dot(N, L) * 0.7 + 0.4, 0.0, 1.0);
    gl_FragColor = vec4(uAtmo * rim * lightSide * 1.4, rim * 0.9);
    #include <colorspace_fragment>
  }
`;

const TYPE_ID: Record<BodyType, number> = {
  rocky: 0, desert: 0, moon_rock: 0, ocean: 1, gas: 2, lava: 3, ice: 4, moon_ice: 4, crystal: 5,
  belt_metal: 0, belt_ice: 4, belt_rich: 0,
};

export interface PlanetParts {
  group: THREE.Group;
  mesh: THREE.Mesh;
  uniforms: Record<string, { value: any }>;
  dispose: () => void;
}

export function makePlanet(type: BodyType, size: number, colA: number, colB: number, atmo: number, seed: number, ring: boolean, lightPos: THREE.Vector3): PlanetParts {
  const group = new THREE.Group();
  const uniforms = {
    uColA: { value: new THREE.Color(colA) },
    uColB: { value: new THREE.Color(colB) },
    uAtmo: { value: new THREE.Color(atmo) },
    uType: { value: TYPE_ID[type] },
    uSeed: { value: (seed % 1000) * 0.137 },
    uLightPos: { value: lightPos },
    uTime: { value: 0 },
    uSelected: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: planetVert, fragmentShader: planetFrag, uniforms });
  const geo = new THREE.SphereGeometry(size, 48, 32);
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);
  const disposables: { dispose: () => void }[] = [geo, mat];
  if (type !== 'lava' && type !== 'moon_rock' && type !== 'rocky' && type !== 'desert') {
    const am = new THREE.ShaderMaterial({
      vertexShader: planetVert,
      fragmentShader: atmoFrag,
      uniforms: { uAtmo: uniforms.uAtmo, uLightPos: uniforms.uLightPos },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ag = new THREE.SphereGeometry(size * 1.07, 40, 28);
    group.add(new THREE.Mesh(ag, am));
    disposables.push(ag, am);
  }
  if (ring) {
    const rg = new THREE.RingGeometry(size * 1.5, size * 2.5, 96, 1);
    const pos = rg.attributes.position;
    const uv = rg.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(i, (r - size * 1.5) / (size), 0.5);
    }
    const rm = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, color: 0xffffff });
    const rmesh = new THREE.Mesh(rg, rm);
    rmesh.rotation.x = Math.PI / 2 - 0.35;
    group.add(rmesh);
    disposables.push(rg, rm);
  }
  return { group, mesh, uniforms, dispose: () => disposables.forEach((d) => d.dispose()) };
}

// ───────────────────────────── Ship models ─────────────────────────────
export function makeShip(id: string, color: number): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness: 0.35, emissive: color, emissiveIntensity: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.8, roughness: 0.4 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    g.add(m);
    return m;
  };
  // nose points along +Z
  const cone = (r: number, h: number) => new THREE.ConeGeometry(r, h, 6);
  switch (id) {
    case 'miner':
      add(new THREE.BoxGeometry(0.9, 0.7, 1.8), hull);
      add(cone(0.45, 0.8), hull, 0, 0, 1.3, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), dark, 0.55, -0.35, 1.2, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), dark, -0.55, -0.35, 1.2, Math.PI / 2);
      add(new THREE.BoxGeometry(1.6, 0.12, 0.6), dark, 0, 0.1, -0.4);
      break;
    case 'freighter':
      add(new THREE.BoxGeometry(1.0, 0.8, 3.2), hull);
      add(new THREE.BoxGeometry(0.8, 0.6, 0.8), dark, 0, 0.55, 1.1);
      for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(1.3, 0.55, 0.7), dark, 0, -0.05, -0.9 + i * 0.85);
      break;
    case 'explorer':
      add(cone(0.38, 2.6), hull, 0, 0, 0.4, Math.PI / 2);
      add(new THREE.BoxGeometry(2.4, 0.06, 0.8), dark, 0, 0, -0.5, 0, 0, 0, 1, 1, 1);
      add(new THREE.SphereGeometry(0.28, 12, 8), glow, 0, 0.22, 0.5);
      break;
    case 'combat':
      add(new THREE.BoxGeometry(0.9, 0.5, 2.4), hull);
      add(cone(0.42, 1.0), hull, 0, 0, 1.7, Math.PI / 2);
      add(new THREE.BoxGeometry(2.8, 0.1, 1.0), dark, 0, 0, -0.3);
      add(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), glow, 0.9, 0.1, 0.7, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), glow, -0.9, 0.1, 0.7, Math.PI / 2);
      break;
    case 'interstellar':
      add(new THREE.OctahedronGeometry(0.9), hull, 0, 0, 0, 0, 0, 0, 0.8, 0.6, 2.4);
      add(new THREE.TorusGeometry(1.4, 0.08, 8, 48), glow, 0, 0, 0, Math.PI / 2);
      add(new THREE.TorusGeometry(1.1, 0.06, 8, 40), glow, 0, 0, -0.9, 0, 0, 0);
      add(new THREE.BoxGeometry(3.4, 0.06, 0.8), dark, 0, 0, -0.9);
      break;
    default: // scout
      add(cone(0.42, 1.9), hull, 0, 0, 0.3, Math.PI / 2);
      add(new THREE.BoxGeometry(1.8, 0.07, 0.8), dark, 0, 0, -0.4);
      add(new THREE.SphereGeometry(0.2, 10, 8), glow, 0, 0.2, 0.2);
  }
  // engine glow
  const eng = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(120,220,255,1)', 'rgba(60,120,255,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  eng.position.set(0, 0, -1.4);
  eng.scale.set(2.2, 2.2, 1);
  eng.name = 'engine';
  g.add(eng);
  return g;
}

export function makeEnemy(color: number, boss: boolean): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a1418, metalness: 0.7, roughness: 0.4, emissive: color, emissiveIntensity: 0.35 });
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(boss ? 1.6 : 0.8), mat);
  body.scale.set(1.2, 0.6, 1.6);
  g.add(body);
  const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,90,70,1)', 'rgba(255,40,20,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  eye.scale.set(boss ? 5 : 2.6, boss ? 5 : 2.6, 1);
  eye.position.z = boss ? 1.4 : 0.8;
  g.add(eye);
  g.rotation.y = Math.PI;
  return g;
}
