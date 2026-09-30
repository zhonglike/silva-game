// veg.js — 程序化植被：6 树种（实例化+飘动）、草地、岩石、灌木、花朵、远景树冠
import * as THREE from '../vendor/three.module.min.js';
import { makeNoise2D } from './noise.js';
import { mulberry32, range, lerp, clamp, smoothstep } from './rng.js';

// ---------- 工具 ----------
function mergeGeos(list) {
  const pos = [], nor = [], idx = [];
  let off = 0;
  for (const g of list) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < n.length; i++) nor.push(n[i]);
    const gi = g.index ? g.index.array : null;
    if (gi) { for (let i = 0; i < gi.length; i++) idx.push(gi[i] + off); }
    else { for (let i = 0; i < p.length / 3; i++) idx.push(i + off); }
    off += p.length / 3;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

function makeBarkTexture(seed, base, dark) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rng = mulberry32(seed);
  for (let i = 0; i < 260; i++) {
    const x = rng() * size;
    const w = 1 + rng() * 2.5;
    const a = 0.12 + rng() * 0.3;
    ctx.strokeStyle = rng() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.5})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (rng() - 0.5) * 8, size * 0.33, x + (rng() - 0.5) * 10, size * 0.66, x + (rng() - 0.5) * 8, size);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRockTexture(seed) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a867d';
  ctx.fillRect(0, 0, size, size);
  const rng = mulberry32(seed);
  for (let i = 0; i < 400; i++) {
    const g = 110 + rng() * 70;
    ctx.fillStyle = `rgba(${g},${g - 6},${g - 16},${0.10 + rng() * 0.22})`;
    const r = 2 + rng() * 12;
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- 几何体 ----------
function coneLayers(layers, r0, r1, h0, h1, seg = 6) {
  const parts = [];
  for (let i = 0; i < layers; i++) {
    const t0 = i / layers, t1 = (i + 1) / layers;
    const r = lerp(r0, r1, t0);
    const y0 = lerp(h0, h1, t0), y1 = lerp(h0, h1, t1);
    const cone = new THREE.ConeGeometry(r, Math.max(0.5, y1 - y0), seg, 1);
    cone.translate(0, (y0 + y1) / 2, 0);
    parts.push(cone);
  }
  return mergeGeos(parts);
}
function blob(rad, y, seg = 1) {
  const g = new THREE.IcosahedronGeometry(rad, seg);
  g.translate(0, y, 0);
  return g;
}

// 树种定义
const SPECIES = [
  { // 云杉
    name: 'spruce',
    trunk: () => new THREE.CylinderGeometry(0.16, 0.36, 5.2, 5, 1),
    foliage: () => coneLayers(5, 3.4, 0.2, 1.1, 11.5, 6),
    color: [0.15, 0.30, 0.19],
    maxY: 11.5,
    barkBase: '#4a3a2c', barkDark: '#2e2319',
    weight: 0.30, minD: 8, scale: [0.8, 1.25],
    accept: (s, b) => s.h > 58 && s.h < 215 && s.slope < 0.7 && b.temp < 0.62 && b.moisture > 0.28 && b.moisture < 0.9,
  },
  { // 松
    name: 'pine',
    trunk: () => new THREE.CylinderGeometry(0.18, 0.4, 7.5, 5, 1),
    foliage: () => coneLayers(4, 2.5, 0.2, 2.2, 13.5, 5),
    color: [0.18, 0.35, 0.21],
    maxY: 13.5,
    barkBase: '#5a4634', barkDark: '#3a2c1e',
    weight: 0.18, minD: 9, scale: [0.8, 1.3],
    accept: (s, b) => s.h > 90 && s.h < 245 && s.slope < 0.78 && b.temp < 0.58 && b.moisture > 0.18 && b.moisture < 0.8,
  },
  { // 橡树（阔叶）
    name: 'oak',
    trunk: () => new THREE.CylinderGeometry(0.42, 0.85, 4.2, 5, 1),
    foliage: () => { const g = blob(3.6, 5.4, 1); g.scale(1.0, 0.78, 1.0); return g; },
    color: [0.32, 0.46, 0.23],
    maxY: 9.5,
    barkBase: '#4e3c2c', barkDark: '#33261a',
    weight: 0.18, minD: 11, scale: [0.8, 1.2],
    accept: (s, b) => s.h > 38 && s.h < 130 && s.slope < 0.5 && b.temp > 0.4 && b.moisture > 0.3 && b.moisture < 0.82,
  },
  { // 桦树
    name: 'birch',
    trunk: () => new THREE.CylinderGeometry(0.12, 0.28, 5.6, 5, 1),
    foliage: () => { const g = blob(2.2, 7.0, 1); g.scale(1.0, 0.85, 1.0); return g; },
    color: [0.42, 0.55, 0.26],
    maxY: 9.6,
    barkBase: '#d8d2c0', barkDark: '#b0a890',
    weight: 0.13, minD: 9, scale: [0.8, 1.2],
    accept: (s, b) => s.h < 110 && s.slope < 0.45 && b.moisture > 0.5 && b.moisture < 0.95 && b.temp > 0.35,
  },
  { // 枫（秋色）
    name: 'maple',
    trunk: () => new THREE.CylinderGeometry(0.3, 0.65, 3.6, 5, 1),
    foliage: () => { const g = blob(3.0, 4.6, 1); g.scale(1.05, 0.8, 1.05); return g; },
    color: [0.52, 0.42, 0.18],
    maxY: 8.0,
    barkBase: '#57432f', barkDark: '#38291b',
    weight: 0.10, minD: 10, scale: [0.8, 1.15],
    accept: (s, b) => s.h > 60 && s.h < 185 && s.slope < 0.55 && b.moisture > 0.22 && b.moisture < 0.7,
  },
  { // 高山矮松
    name: 'alpine',
    trunk: () => new THREE.CylinderGeometry(0.22, 0.48, 1.3, 5, 1),
    foliage: () => coneLayers(3, 3.6, 0.3, 0.6, 4.4, 5),
    color: [0.21, 0.34, 0.22],
    maxY: 4.4,
    barkBase: '#4c3b2a', barkDark: '#312517',
    weight: 0.11, minD: 8, scale: [0.85, 1.3],
    accept: (s, b) => s.h > 165 && s.h < 285 && s.slope > 0.2 && s.slope < 0.92 && b.temp < 0.42,
  },
];

// ---------- 飘动叶片 / 草 Shader ----------
function foliageMaterial(color, maxY, barkTexBase) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.75, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
      uAmbient: { value: new THREE.Color(0.28, 0.33, 0.3) },
      uSky: { value: new THREE.Color(0.5, 0.65, 0.85) },
      uMaxY: { value: maxY },
      uFogColor: { value: new THREE.Color(0.75, 0.85, 0.88) },
      uFogDensity: { value: 0.0011 },
      uWindAmp: { value: 1.0 },
    },
    vertexShader: `
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uMaxY;
      uniform float uWindAmp;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 p = position;
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          float ph = fract(ip.x * 0.137 + ip.z * 0.0713 + ip.y * 0.019);
          float amp = clamp(position.y / uMaxY, 0.0, 1.0) * uWindAmp;
          float sw = sin(uTime * 1.5 + ph * 6.2831);
          float sw2 = sin(uTime * 0.8 + ph * 12.566);
          p.x += (sw * 0.18 + sw2 * 0.08) * amp;
          p.z += (cos(uTime * 1.2 + ph * 6.2831) * 0.15 + sw * 0.06) * amp;
        #endif
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vColor = aColor;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uAmbient;
      uniform vec3 uSky;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 n = normalize(vNormal);
        float ndl = max(dot(n, uSunDir), 0.0);
        vec3 col = vColor * (uAmbient + uSunColor * ndl);
        col += vColor * uSky * (0.30 + 0.30 * max(n.y, 0.0));
        float back = pow(max(dot(n, -uSunDir), 0.0), 2.0);
        col += vColor * uSunColor * back * 0.32;
        float fogF = 1.0 - exp(-length(vWorld - cameraPosition) * uFogDensity);
        col = mix(col, uFogColor, fogF);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function grassMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.75, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
      uAmbient: { value: new THREE.Color(0.26, 0.32, 0.26) },
      uSky: { value: new THREE.Color(0.5, 0.65, 0.85) },
      uFogColor: { value: new THREE.Color(0.75, 0.85, 0.88) },
      uFogDensity: { value: 0.0011 },
      uGrassH: { value: 1.0 },
      uWindDir: { value: new THREE.Vector2(0.6, 0.3) },
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aPhase;
      uniform float uTime;
      uniform float uGrassH;
      uniform vec2 uWindDir;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 p = position;
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          float ph = fract(ip.x * 0.173 + ip.z * 0.091 + aPhase);
          float amp = clamp(p.y / uGrassH, 0.0, 1.0);
          float sw = sin(uTime * 2.2 + ph * 9.42);
          p.x += (sw * 0.22 + sin(uTime * 1.4 + ph * 5.0) * 0.10) * amp * uWindDir.x;
          p.z += (cos(uTime * 1.9 + ph * 8.0) * 0.18 + sw * 0.05) * amp * uWindDir.y;
        #endif
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vColor = aColor;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uAmbient;
      uniform vec3 uSky;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 n = normalize(vNormal);
        float ndl = max(dot(n, uSunDir), 0.0);
        vec3 col = vColor * (uAmbient + uSunColor * ndl);
        col += vColor * uSky * 0.35;
        float fogF = 1.0 - exp(-length(vWorld - cameraPosition) * uFogDensity);
        col = mix(col, uFogColor, fogF);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

// ---------- 散布 ----------
function scatter(terrain, rng, radius, count, minDist, accept) {
  const out = [];
  const map = new Map();
  const cell = Math.max(4, minDist * 1.6);
  let attempts = 0, placed = 0;
  const half = terrain.half - 12;
  const e = 3;
  while (placed < count && attempts < count * 16) {
    attempts++;
    const ang = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * radius;
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    if (Math.abs(x) > half || Math.abs(z) > half) continue;
    const hh = terrain.heightAt(x, z);
    const hx = (terrain.heightAt(x + e, z) - terrain.heightAt(x - e, z)) / (2 * e);
    const hz = (terrain.heightAt(x, z + e) - terrain.heightAt(x, z - e)) / (2 * e);
    const slope = Math.hypot(hx, hz);
    if (!accept({ x, z, h: hh, slope })) continue;
    const cx = Math.round(x / cell), cz = Math.round(z / cell);
    let ok = true;
    outer:
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const arr = map.get((cx + dx) * 100000 + (cz + dz));
      if (arr) for (const p of arr) {
        const dd = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (dd < minDist * minDist) { ok = false; break outer; }
      }
    }
    if (!ok) continue;
    const key = cx * 100000 + cz;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ x, z });
    out.push({ x, z, yaw: rng() * Math.PI * 2, scale: 1 });
    placed++;
  }
  return out;
}

// ---------- 主入口 ----------
export function createVegetation(scene, terrain, seed, quality) {
  const group = new THREE.Group();
  group.name = 'vegetation';

  const counts = quality === 'high' ? [4200, 2600, 1400] : quality === 'med' ? [2600, 1600, 900] : [1400, 900, 550];
  const treeTotal = counts[0];
  const treeScale = counts[0] / 4200;

  const n3 = makeNoise2D(seed ^ 0xc2b2ae35);
  const n4 = makeNoise2D(seed ^ 0x27d4eb2f);
  const n6 = makeNoise2D(seed ^ 0x7f4a7c15);
  const rng = mulberry32(seed ^ 0xfa110c);

  function biomeAt(x, z) {
    const px = x / 1000, pz = z / 1000;
    return {
      moisture: n3.fbm(px * 1.25 + 40.0, pz * 1.25 - 20.0, 3),
      temp: n4.fbm(px * 0.8 + 7.0, pz * 0.8 + 55.0, 2),
    };
  }

  const barkTex = makeBarkTexture(seed ^ 0x11, '#6b5338', '#2e2319');
  const rockTex = makeRockTexture(seed ^ 0x22);

  // ---- 树木 ----
  const foliageMats = [];
  const R_TREE = 760;
  const spawn = terrain.spawn;

  for (const sp of SPECIES) {
    const spCount = Math.max(60, Math.round(treeTotal * sp.weight / (sp.minD * sp.minD / 64)));
    // 简化：按权重 × 密度折算
    const rawCount = Math.round(treeTotal * sp.weight);
    const count = Math.max(80, rawCount);

    const pts = scatter(terrain, rng, R_TREE, count, sp.minD, (s) => {
      if (s.h < terrain.lakeLevel + 1.6) return false;
      const b = biomeAt(s.x, s.z);
      if (!sp.accept(s, b)) return false;
      return true;
    });

    // 近/远分层（近处参与阴影）
    const near = [], far = [];
    for (const p of pts) {
      const d = Math.hypot(p.x - spawn.x, p.z - spawn.z);
      if (d < 240) near.push(p); else far.push(p);
    }

    for (const [list, doShadow] of [[near, true], [far, false]]) {
      if (list.length === 0) continue;
      // 树干
      const tGeo = sp.trunk();
      const tMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.92, metalness: 0 });
      const tMesh = new THREE.InstancedMesh(tGeo, tMat, list.length);
      // 树冠
      const fGeo = sp.foliage();
      const fMat = foliageMaterial(sp.color, sp.maxY, barkTex);
      foliageMats.push(fMat);
      const fMesh = new THREE.InstancedMesh(fGeo, fMat, list.length);
      const aColor = new Float32Array(list.length * 3);

      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      const eul = new THREE.Euler();
      const col = new THREE.Color();

      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const sc = range(rng, sp.scale[0], sp.scale[1]) * (0.85 + 0.3 * rng());
        eul.set(0, p.yaw, 0);
        q.setFromEuler(eul);
        const hh = terrain.heightAt(p.x, p.z);
        scl.set(sc, sc, sc);
        m4.compose(new THREE.Vector3(p.x, hh, p.z), q, scl);
        tMesh.setMatrixAt(i, m4);
        fMesh.setMatrixAt(i, m4);
        // 树干色
        const tv = 0.75 + rng() * 0.5;
        tMesh.setColorAt(i, col.setRGB(tv * 0.6, tv * 0.5, tv * 0.4));
        // 树冠色
        const dry = rng() < 0.05;
        let r = sp.color[0] + (rng() - 0.5) * 0.09;
        let g = sp.color[1] + (rng() - 0.5) * 0.09;
        let b = sp.color[2] + (rng() - 0.5) * 0.07;
        if (dry) { r = 0.5; g = 0.41; b = 0.28; }
        aColor[i * 3] = r; aColor[i * 3 + 1] = g; aColor[i * 3 + 2] = b;
      }
      tMesh.instanceMatrix.needsUpdate = true;
      if (tMesh.instanceColor) tMesh.instanceColor.needsUpdate = true;
      fMesh.instanceMatrix.needsUpdate = true;
      fGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 3));

      tMesh.castShadow = doShadow;
      tMesh.receiveShadow = true;
      fMesh.castShadow = doShadow;
      tMesh.frustumCulled = fMesh.frustumCulled = false;
      group.add(tMesh, fMesh);
    }
  }

  // ---- 远景树冠海 ----
  {
    const canopyCount = Math.round([1700, 1100, 650][quality === 'high' ? 0 : quality === 'med' ? 1 : 2]);
    const cGeo = blob(1, 0, 0); cGeo.scale(1, 0.55, 1);
    const cMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    const cMesh = new THREE.InstancedMesh(cGeo, cMat, canopyCount);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), scl = new THREE.Vector3(), eul = new THREE.Euler();
    const col = new THREE.Color();
    const pts = scatter(terrain, rng, 1250, canopyCount, 15, (s) => s.h > 26 && s.h < 210 && s.slope < 0.85);
    for (let i = 0; i < Math.min(pts.length, canopyCount); i++) {
      const p = pts[i];
      const sc = 7 + rng() * 9;
      const b = biomeAt(p.x, p.z);
      eul.set(0, rng() * Math.PI, 0);
      q.setFromEuler(eul);
      scl.set(sc * (0.7 + rng() * 0.6), sc * 0.5, sc * (0.7 + rng() * 0.6));
      m4.compose(new THREE.Vector3(p.x, p.h + 30 + rng() * 34, p.z), q, scl);
      cMesh.setMatrixAt(i, m4);
      const g = 0.34 + b.moisture * 0.14 + (rng() - 0.5) * 0.06;
      cMesh.setColorAt(i, col.setRGB(g * 0.9, g, g * 0.68));
    }
    cMesh.instanceMatrix.needsUpdate = true;
    if (cMesh.instanceColor) cMesh.instanceColor.needsUpdate = true;
    cMesh.frustumCulled = false;
    group.add(cMesh);
  }

  // ---- 草地 ----
  {
    const gCount = [30000, 19000, 9000][quality === 'high' ? 0 : quality === 'med' ? 1 : 2];
    const grassH = 1.0;
    const geo = new THREE.BufferGeometry();
    const w = 0.1;
    const v = [
      -w, 0, 0, 0, 0, 1, 0, grassH, 0,
      0, 0, -w, 0, 0, 1, 0, grassH, 0,
    ];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geo.setIndex([0, 1, 2, 3, 4, 5]);
    const mat = grassMaterial();
    const mesh = new THREE.InstancedMesh(geo, mat, gCount);
    const aColor = new Float32Array(gCount * 3);
    const aPhase = new Float32Array(gCount);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), scl = new THREE.Vector3(), eul = new THREE.Euler();
    const pts = scatter(terrain, rng, 300, gCount, 0.55, (s) =>
      s.h > terrain.lakeLevel + 0.4 && s.h < terrain.lakeLevel + 30 && s.slope < 0.4);
    for (let i = 0; i < Math.min(pts.length, gCount); i++) {
      const p = pts[i];
      const sc = 0.7 + rng() * 0.8;
      eul.set(0, rng() * Math.PI, 0);
      q.setFromEuler(eul);
      scl.set(sc, sc * (0.9 + rng() * 0.5), sc);
      m4.compose(new THREE.Vector3(p.x, p.h - 0.03, p.z), q, scl);
      mesh.setMatrixAt(i, m4);
      const b = biomeAt(p.x, p.z);
      const g1 = 0.30 + b.moisture * 0.16 + (rng() - 0.5) * 0.08;
      const dry = rng() < 0.12;
      if (dry) { aColor[i * 3] = 0.62; aColor[i * 3 + 1] = 0.55; aColor[i * 3 + 2] = 0.30; }
      else { aColor[i * 3] = g1 * 0.85; aColor[i * 3 + 1] = g1; aColor[i * 3 + 2] = g1 * 0.6; }
      aPhase[i] = rng();
    }
    mesh.instanceMatrix.needsUpdate = true;
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 3));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // ---- 岩石 ----
  {
    const rCount = [900, 600, 350][quality === 'high' ? 0 : quality === 'med' ? 1 : 2];
    const rGeo = new THREE.IcosahedronGeometry(1, 1);
    // 让岩石更嶙峋：顶点随机位移
    const posA = rGeo.attributes.position.array;
    const rr = mulberry32(seed ^ 0x77);
    for (let i = 0; i < posA.length; i += 3) {
      const f = 0.06 + rr() * 0.22;
      posA[i] *= 1 + f; posA[i + 1] *= 1 + f; posA[i + 2] *= 1 + f;
    }
    rGeo.computeVertexNormals();
    const rMat = new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.95, metalness: 0.02 });
    const rMesh = new THREE.InstancedMesh(rGeo, rMat, rCount);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), scl = new THREE.Vector3(), eul = new THREE.Euler();
    const col = new THREE.Color();
    const pts = scatter(terrain, rng, 900, rCount, 7, (s) => {
      if (s.h < terrain.lakeLevel - 4) return false;
      if (s.slope > 0.22) return true;
      return Math.abs(s.h - terrain.lakeLevel) < 10; // 近水也有
    });
    for (let i = 0; i < Math.min(pts.length, rCount); i++) {
      const p = pts[i];
      const sc = range(rng, 0.5, 2.4);
      eul.set(rng() * 0.5 - 0.25, rng() * Math.PI, rng() * 0.5 - 0.25);
      q.setFromEuler(eul);
      scl.set(sc, sc * (0.6 + rng() * 0.6), sc);
      m4.compose(new THREE.Vector3(p.x, p.h - 0.05, p.z), q, scl);
      rMesh.setMatrixAt(i, m4);
      const g = 0.55 + rng() * 0.3;
      rMesh.setColorAt(i, col.setRGB(g, g * 0.98, g * 0.92));
    }
    rMesh.instanceMatrix.needsUpdate = true;
    if (rMesh.instanceColor) rMesh.instanceColor.needsUpdate = true;
    rMesh.receiveShadow = true;
    rMesh.frustumCulled = false;
    group.add(rMesh);
  }

  // ---- 河滩卵石 ----
  {
    const pCount = [1400, 900, 550][quality === 'high' ? 0 : quality === 'med' ? 1 : 2];
    const pGeo = new THREE.IcosahedronGeometry(0.32, 0);
    const pMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.02 });
    const pMesh = new THREE.InstancedMesh(pGeo, pMat, pCount);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), scl = new THREE.Vector3(), eul = new THREE.Euler();
    const col = new THREE.Color();
    const pts = scatter(terrain, rng, 620, pCount, 1.8, (s) =>
      Math.abs(s.h - terrain.lakeLevel) < 9 && s.slope < 0.6);
    for (let i = 0; i < Math.min(pts.length, pCount); i++) {
      const p = pts[i];
      const sc = range(rng, 0.35, 1.3);
      eul.set(rng(), rng() * Math.PI, rng());
      q.setFromEuler(eul);
      scl.set(sc, sc * 0.7, sc);
      m4.compose(new THREE.Vector3(p.x, p.h - 0.02, p.z), q, scl);
      pMesh.setMatrixAt(i, m4);
      const g = 0.35 + rng() * 0.25;
      pMesh.setColorAt(i, col.setRGB(g, g * 0.96, g * 0.9));
    }
    pMesh.instanceMatrix.needsUpdate = true;
    if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
    pMesh.frustumCulled = false;
    group.add(pMesh);
  }

  // ---- 灌木（含粉色花灌木） ----
  {
    const sCount = [520, 360, 220][quality === 'high' ? 0 : quality === 'med' ? 1 : 2];
    const sGeo = blob(0.9, 0, 0); sGeo.scale(1, 0.6, 1);
    const sMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    const sMesh = new THREE.InstancedMesh(sGeo, sMat, sCount);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), scl = new THREE.Vector3(), eul = new THREE.Euler();
    const col = new THREE.Color();
    const pts = scatter(terrain, rng, 520, sCount, 6, (s) => s.h > terrain.lakeLevel + 1 && s.h < 170 && s.slope < 0.5);
    for (let i = 0; i < Math.min(pts.length, sCount); i++) {
      const p = pts[i];
      const sc = range(rng, 0.7, 1.7);
      eul.set(0, rng() * Math.PI, 0);
      q.setFromEuler(eul);
      scl.set(sc, sc * (0.55 + rng() * 0.5), sc);
      m4.compose(new THREE.Vector3(p.x, p.h - 0.02, p.z), q, scl);
      sMesh.setMatrixAt(i, m4);
      const b = biomeAt(p.x, p.z);
      const pink = b.moisture > 0.62 && rng() < 0.4;
      if (pink) sMesh.setColorAt(i, col.setRGB(0.72, 0.5, 0.55));
      else {
        const g = 0.28 + b.moisture * 0.14 + (rng() - 0.5) * 0.08;
        sMesh.setColorAt(i, col.setRGB(g * 0.85, g, g * 0.6));
      }
    }
    sMesh.instanceMatrix.needsUpdate = true;
    if (sMesh.instanceColor) sMesh.instanceColor.needsUpdate = true;
    sMesh.frustumCulled = false;
    group.add(sMesh);
  }

  // ---- 野花 ----
  {
    const fCount = [900, 620, 380][quality === 'high' ? 0 : quality === 'med' ? 1 : 2];
    const fGeo = new THREE.IcosahedronGeometry(0.17, 0);
    const fMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
    const fMesh = new THREE.InstancedMesh(fGeo, fMat, fCount);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), scl = new THREE.Vector3(), eul = new THREE.Euler();
    const col = new THREE.Color();
    const flowerCols = [[0.96, 0.94, 0.9], [0.95, 0.62, 0.6], [0.98, 0.82, 0.42], [0.68, 0.55, 0.9], [0.8, 0.4, 0.5]];
    const pts = scatter(terrain, rng, 400, fCount, 1.4, (s) =>
      s.h > terrain.lakeLevel + 0.6 && s.h < terrain.lakeLevel + 26 && s.slope < 0.35);
    for (let i = 0; i < Math.min(pts.length, fCount); i++) {
      const p = pts[i];
      const sc = range(rng, 0.8, 1.7);
      eul.set(0, rng() * Math.PI, 0);
      q.setFromEuler(eul);
      scl.set(sc, sc, sc);
      m4.compose(new THREE.Vector3(p.x, p.h + 0.05, p.z), q, scl);
      fMesh.setMatrixAt(i, m4);
      const fc = flowerCols[(rng() * flowerCols.length) | 0];
      fMesh.setColorAt(i, col.setRGB(fc[0], fc[1], fc[2]));
    }
    fMesh.instanceMatrix.needsUpdate = true;
    if (fMesh.instanceColor) fMesh.instanceColor.needsUpdate = true;
    fMesh.frustumCulled = false;
    group.add(fMesh);
  }

  // ---- 倒木与树桩 ----
  {
    const dCount = [180, 120, 80][quality === 'high' ? 0 : quality === 'med' ? 1 : 2];
    const logGeo = new THREE.CylinderGeometry(0.2, 0.34, 3.4, 5, 1);
    logGeo.rotateZ(Math.PI / 2);
    const stumpGeo = new THREE.CylinderGeometry(0.3, 0.42, 0.9, 6, 1);
    const lMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 });
    const sMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 });
    const lMesh = new THREE.InstancedMesh(logGeo, lMat, Math.floor(dCount * 0.7));
    const sMesh = new THREE.InstancedMesh(stumpGeo, sMat, Math.ceil(dCount * 0.3));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), scl = new THREE.Vector3(), eul = new THREE.Euler();
    const col = new THREE.Color();
    const pts = scatter(terrain, rng, 620, dCount, 16, (s) => s.h > 38 && s.h < 195 && s.slope < 0.5);
    let li = 0, si = 0;
    for (let i = 0; i < pts.length && (li < lMesh.count || si < sMesh.count); i++) {
      const p = pts[i];
      const isLog = rng() < 0.65 && li < lMesh.count;
      if (isLog) {
        eul.set(0, rng() * Math.PI, rng() * 0.4 - 0.2);
        q.setFromEuler(eul);
        scl.set(1, 1, 1);
        m4.compose(new THREE.Vector3(p.x, p.h + 0.15, p.z), q, scl);
        lMesh.setMatrixAt(li, m4);
        const g = 0.5 + rng() * 0.25;
        lMesh.setColorAt(li, col.setRGB(g * 0.9, g * 0.8, g * 0.6));
        li++;
      } else if (si < sMesh.count) {
        eul.set(0, rng() * Math.PI, 0);
        q.setFromEuler(eul);
        scl.set(1, 1, 1);
        m4.compose(new THREE.Vector3(p.x, p.h - 0.02, p.z), q, scl);
        sMesh.setMatrixAt(si, m4);
        const g = 0.5 + rng() * 0.25;
        sMesh.setColorAt(si, col.setRGB(g * 0.9, g * 0.8, g * 0.6));
        si++;
      }
    }
    lMesh.instanceMatrix.needsUpdate = true;
    sMesh.instanceMatrix.needsUpdate = true;
    if (lMesh.instanceColor) lMesh.instanceColor.needsUpdate = true;
    if (sMesh.instanceColor) sMesh.instanceColor.needsUpdate = true;
    lMesh.castShadow = true; sMesh.castShadow = true;
    lMesh.frustumCulled = sMesh.frustumCulled = false;
    group.add(lMesh, sMesh);
  }

  const mats = [...foliageMats];

  function update(tHours, dt, sunDir, sunColor, fogColor, fogDensity) {
    const t = tHours * 3600; // 秒
    for (const m of mats) {
      m.uniforms.uTime.value = t;
      m.uniforms.uSunDir.value.copy(sunDir);
      m.uniforms.uSunColor.value.copy(sunColor);
      m.uniforms.uFogColor.value.copy(fogColor);
      m.uniforms.uFogDensity.value = fogDensity;
    }
  }

  return { group, update };
}
