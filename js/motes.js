// motes.js — 光之种子：散落在山谷中的收集物
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32 } from './rng.js';

export function createMotes(scene, terrain, seed, count = 40, onCollect) {
  const group = new THREE.Group();
  group.name = 'motes';

  const rng = mulberry32(seed ^ 0x51e5);
  const coreGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xbfffe0 });
  const glowGeo = new THREE.SphereGeometry(0.85, 10, 8);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x5fae8f, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const motes = [];
  let attempts = 0;
  while (motes.length < count && attempts < count * 40) {
    attempts++;
    const ang = rng() * Math.PI * 2;
    const r = 30 + Math.sqrt(rng()) * 640;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    const h = terrain.heightAt(x, z);
    if (h < terrain.lakeLevel - 1 || h > terrain.lakeLevel + 90) continue;
    if (Math.abs(x) > terrain.half - 20 || Math.abs(z) > terrain.half - 20) continue;
    // 避免与已有太近
    let ok = true;
    for (const m of motes) {
      const dd = (m.base.x - x) ** 2 + (m.base.z - z) ** 2;
      if (dd < 140 * 140) { ok = false; break; }
    }
    if (!ok) continue;
    const base = new THREE.Vector3(x, h + 1.8, z);
    const core = new THREE.Mesh(coreGeo, coreMat);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    core.position.copy(base);
    glow.position.copy(base);
    group.add(core, glow);
    motes.push({ core, glow, base, phase: rng() * Math.PI * 2, collected: false });
  }

  function update(dt, playerPos) {
    const t = performance.now() / 1000;
    for (const m of motes) {
      if (m.collected) continue;
      const bob = Math.sin(t * 1.6 + m.phase) * 0.35;
      m.core.position.set(m.base.x, m.base.y + bob, m.base.z);
      m.glow.position.copy(m.core.position);
      m.glow.scale.setScalar(1 + Math.sin(t * 2.2 + m.phase) * 0.18);
      m.core.rotation.y = t * 1.4 + m.phase;
      // 收集判定
      const dx = m.base.x - playerPos.x, dy = m.base.y - playerPos.y, dz = m.base.z - playerPos.z;
      if (dx * dx + dy * dy + dz * dz < 3.4 * 3.4) {
        m.collected = true;
        m.core.visible = m.glow.visible = false;
        if (onCollect) onCollect(m);
      }
    }
  }

  function remaining() {
    let n = 0;
    for (const m of motes) if (!m.collected) n++;
    return n;
  }
  function nearestTo(pos) {
    let best = null, bd = Infinity;
    for (const m of motes) {
      if (m.collected) continue;
      const d = m.base.distanceTo(pos);
      if (d < bd) { bd = d; best = m; }
    }
    return best ? { pos: best.base, dist: bd } : null;
  }

  return { group, update, remaining, nearestTo };
}
