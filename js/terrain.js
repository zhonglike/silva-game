// terrain.js — 程序化地形：高度场合成 + 湖盆 + 河流刻蚀 + 生物群系顶点着色
import * as THREE from '../vendor/three.module.min.js';
import { makeNoise2D } from './noise.js';
import { mulberry32, smoothstep, clamp, lerp } from './rng.js';

export const WORLD = {
  SIZE: 2600,          // 世界边长（米）
  LAKE_LEVEL: 42,
  LAKE_CENTER: { x: 60, z: 40 },
  RIVER: [
    [-540, 420], [-420, 350], [-300, 300], [-180, 240],
    [-80, 170], [0, 120], [40, 90], [60, 70], [68, 55],
  ],
};

function makeHeights(seed) {
  const n1 = makeNoise2D(seed ^ 0x9e3779b9);
  const n2 = makeNoise2D(seed ^ 0x85ebca6b);
  const n3 = makeNoise2D(seed ^ 0xc2b2ae35);
  const n4 = makeNoise2D(seed ^ 0x27d4eb2f);

  // 河流路径采样
  const R = WORLD.RIVER;
  const riverN = 64;
  const riverPath = [];
  for (let i = 0; i <= riverN; i++) {
    const t = i / riverN;
    const f = t * (R.length - 1);
    const i0 = Math.floor(f), i1 = Math.min(i0 + 1, R.length - 1);
    const lf = f - i0;
    riverPath.push({
      x: lerp(R[i0][0], R[i1][0], lf),
      z: lerp(R[i0][1], R[i1][1], lf),
      t,
      w: lerp(7.5, 13, t),
    });
  }

  function carveRiver(x, z, h) {
    let best = Infinity;
    for (let i = 0; i < riverPath.length; i++) {
      const p = riverPath[i];
      const dx = x - p.x, dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) best = d2;
    }
    // 找到最近点（含 t / w）
    let bi = 0, bd = Infinity;
    for (let i = 0; i < riverPath.length; i++) {
      const p = riverPath[i];
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < bd) { bd = d; bi = i; }
    }
    const p = riverPath[bi];
    const target = WORLD.LAKE_LEVEL + 3.2 - 4.7 * Math.pow(p.t, 0.7);
    const soft = p.w * 1.5;
    if (bd < soft) {
      const m = smoothstep(soft, p.w * 0.55, bd);
      h = h + (target - h) * m;
    }
    return h;
  }

  function computeHeight(x, z) {
    const px = x / 1000, pz = z / 1000;
    const lx = x - WORLD.LAKE_CENTER.x, lz = z - WORLD.LAKE_CENTER.z;
    const d = Math.hypot(lx, lz);
    const edgeMask = smoothstep(0.5, 1.0, d / 1350);
    let h = n1.fbm(px * 1.05 + 13.7, pz * 1.05 - 4.2, 4) * 118;
    h += n2.ridged(px * 0.85 + 61.2, pz * 0.85 + 9.1, 5) * 168 * (0.28 + 0.72 * edgeMask);
    h += n2.ridged(px * 1.18 + 27.0, pz * 1.18 - 8.0, 5) * 215 * smoothstep(0.68, 1.0, d / 1350) * edgeMask;
    h += n1.fbm(px * 2.4 + 3.3, pz * 2.4 + 88.0, 3) * 22 * (1 - edgeMask * 0.45);
    h = Math.max(h, WORLD.LAKE_LEVEL - 15);
    if (d < 235) {
      const lakeMask = smoothstep(235, 90, d);
      h = Math.min(h, WORLD.LAKE_LEVEL - 1.5 - 6.5 * lakeMask);
    }
    h = carveRiver(x, z, h);
    return h;
  }

  return { computeHeight, riverPath };
}

export function createTerrain(seed, quality) {
  const seg = quality === 'high' ? 512 : quality === 'med' ? 384 : 256;
  const grid = seg + 1;
  const step = WORLD.SIZE / seg;
  const half = WORLD.SIZE / 2;

  const { computeHeight, riverPath } = makeHeights(seed);
  const h = new Float32Array(grid * grid);
  const idx = (ix, iz) => iz * grid + ix;

  // 生成高度场
  for (let iz = 0; iz < grid; iz++) {
    const z = -half + iz * step;
    for (let ix = 0; ix < grid; ix++) {
      const x = -half + ix * step;
      h[idx(ix, iz)] = computeHeight(x, z);
    }
  }

  function heightAt(x, z) {
    const fx = (x + half) / step, fz = (z + half) / step;
    let ix = Math.floor(fx), iz = Math.floor(fz);
    ix = clamp(ix, 0, seg - 1); iz = clamp(iz, 0, seg - 1);
    const tx = clamp(fx - ix, 0, 1), tz = clamp(fz - iz, 0, 1);
    const a = h[idx(ix, iz)], b = h[idx(ix + 1, iz)];
    const c = h[idx(ix, iz + 1)], d = h[idx(ix + 1, iz + 1)];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  // 顶点 + 法线
  const positions = new Float32Array(grid * grid * 3);
  for (let iz = 0; iz < grid; iz++) {
    const z = -half + iz * step;
    for (let ix = 0; ix < grid; ix++) {
      const x = -half + ix * step;
      const i = idx(ix, iz);
      positions[i * 3] = x;
      positions[i * 3 + 1] = h[i];
      positions[i * 3 + 2] = z;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const quads = (seg) * (seg) * 6;
  const indexArr = new Uint32Array(quads);
  let k = 0;
  for (let iz = 0; iz < seg; iz++) {
    for (let ix = 0; ix < seg; ix++) {
      const a = idx(ix, iz), b = idx(ix + 1, iz), c = idx(ix, iz + 1), d = idx(ix + 1, iz + 1);
      indexArr[k++] = a; indexArr[k++] = c; indexArr[k++] = b;
      indexArr[k++] = b; indexArr[k++] = c; indexArr[k++] = d;
    }
  }
  geo.setIndex(new THREE.BufferAttribute(indexArr, 1));
  geo.computeVertexNormals();

  // 顶点着色（生物群系）
  const n3 = makeNoise2D(seed ^ 0xc2b2ae35);
  const n4 = makeNoise2D(seed ^ 0x27d4eb2f);
  const n5 = makeNoise2D(seed ^ 0x165667b1);
  const n6 = makeNoise2D(seed ^ 0x7f4a7c15);
  const rng = mulberry32(seed ^ 0xabcdef01);

  const colors = new Float32Array(grid * grid * 3);
  const W = WORLD.LAKE_LEVEL;

  for (let iz = 0; iz < grid; iz++) {
    const z = -half + iz * step;
    for (let ix = 0; ix < grid; ix++) {
      const x = -half + ix * step;
      const i = idx(ix, iz);
      const hh = h[i];
      // 坡度（有限差分）
      const hx = (h[idx(Math.min(ix + 1, seg), iz)] - h[idx(Math.max(ix - 1, 0), iz)]) / (2 * step);
      const hz = (h[idx(ix, Math.min(iz + 1, seg))] - h[idx(ix, Math.max(iz - 1, 0))]) / (2 * step);
      const slope = Math.min(1.5, Math.hypot(hx, hz));
      const px = x / 1000, pz = z / 1000;

      const moisture = n3.fbm(px * 1.25 + 40.0, pz * 1.25 - 20.0, 3);
      const temp = n4.fbm(px * 0.8 + 7.0, pz * 0.8 + 55.0, 2);
      const patch = n5.fbm(px * 2.1 - 12.0, pz * 2.1 + 33.0, 2);
      const rockVar = n6.noise(px * 3.0 + 100.0, pz * 3.0 - 40.0);

      const snowline = 205 + (temp - 0.5) * 45;
      let snow = smoothstep(snowline, snowline + 60, hh) * (1 - smoothstep(0.28, 0.62, slope));
      let rock = Math.max(smoothstep(0.55, 0.82, slope), smoothstep(165, 235, hh)) * (1 - snow);
      let grass = Math.max(0, 1 - rock - snow);

      // 基础色
      const g = 100 + (moisture - 0.5) * 46 + (temp - 0.5) * 22;
      let r = g * 0.86 + 20, gc = g, b = g * 0.62 + 8;
      if (patch > 0.74) { // 秋色斑块
        const am = smoothstep(0.74, 0.9, patch) * 0.6;
        r = lerp(r, 168, am); gc = lerp(gc, 122, am); b = lerp(b, 58, am);
      }
      const grassCol = [r / 255, gc / 255, b / 255];

      const rk = 122 + rockVar * 22;
      const rockCol = [rk / 255, (rk - 4) / 255, (rk - 12) / 255];

      const snowCol = [226 / 255, 236 / 255, 248 / 255];

      const dry = hh - W;
      const sand = smoothstep(5.5, 0.3, dry) * smoothstep(-1.8, 0.3, dry);
      const bed = smoothstep(1.2, -1.8, dry) * (1 - sand) * 0.9;

      // 混合
      let col = [
        grassCol[0] * grass + rockCol[0] * rock + snowCol[0] * snow,
        grassCol[1] * grass + rockCol[1] * rock + snowCol[1] * snow,
        grassCol[2] * grass + rockCol[2] * rock + snowCol[2] * snow,
      ];
      // 沙带
      if (sand > 0) {
        const sandCol = [196 / 255, 183 / 255, 140 / 255];
        col[0] = lerp(col[0], sandCol[0], sand);
        col[1] = lerp(col[1], sandCol[1], sand);
        col[2] = lerp(col[2], sandCol[2], sand);
      }
      // 河床卵石
      if (bed > 0) {
        const bedCol = [92 / 255, 86 / 255, 74 / 255];
        const mv = (n5.noise(px * 5.0, pz * 5.0) - 0.5) * 0.12;
        col[0] = lerp(col[0], bedCol[0] + mv, bed);
        col[1] = lerp(col[1], bedCol[1] + mv, bed);
        col[2] = lerp(col[2], bedCol[2] + mv, bed);
      }
      // 水边潮湿加深
      if (dry < 6) {
        const wet = smoothstep(6, 0.5, dry) * 0.18;
        col[0] *= 1 - wet; col[1] *= 1 - wet; col[2] *= 1 - wet * 1.2;
      }
      // 每顶点轻微抖动，避免色带
      const j = (rng() - 0.5) * 0.02;
      colors[i * 3] = clamp(col[0] + j, 0, 1);
      colors[i * 3 + 1] = clamp(col[1] + j, 0, 1);
      colors[i * 3 + 2] = clamp(col[2] + j, 0, 1);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';

  // 出生点：湖东岸草甸（湖盆外），面向湖心
  const spawnX = WORLD.LAKE_CENTER.x + 265;
  const spawnZ = WORLD.LAKE_CENTER.z - 55;
  const spawn = { x: spawnX, y: heightAt(spawnX, spawnZ) + 2.0, z: spawnZ };

  return {
    mesh, heightAt, riverPath, spawn,
    lakeLevel: W, lakeCenter: WORLD.LAKE_CENTER,
    half, size: WORLD.SIZE,
  };
}
