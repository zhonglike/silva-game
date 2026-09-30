// controls.js — 第一人称操控：步行/飞行、跳跃、镜头、观景台、电影镜头、触屏
import * as THREE from '../vendor/three.module.min.js';
import { clamp } from './rng.js';

export function createControls(camera, terrain, opts = {}) {
  const dom = opts.dom || document;
  const state = {
    pos: new THREE.Vector3(terrain.spawn.x, terrain.spawn.y, terrain.spawn.z),
    vel: new THREE.Vector3(),
    yaw: Math.PI * 0.25,   // 初始面向湖心（西侧）
    pitch: -0.06,
    mode: 'walk',
    grounded: true,
    flying: false,
    flySpeed: 30,
    sprinting: false,
    bobPhase: 0,
    keys: new Set(),
    locked: false,
    flythrough: null,
    flyThroughT: 0,
    onModeChange: null,
  };

  // 出生点朝向湖心
  {
    const dx = terrain.lakeCenter.x - state.pos.x;
    const dz = terrain.lakeCenter.z - state.pos.z;
    state.yaw = Math.atan2(-dx, -dz);
  }

  const EYE = 1.7;
  const WALK = 4.4, SPRINT = 8.2;
  const GRAVITY = 24, JUMP = 8.2;

  // ---------- 键盘 ----------
  const keyMap = {
    KeyW: 'fwd', ArrowUp: 'fwd',
    KeyS: 'back', ArrowDown: 'back',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'sprint', ShiftRight: 'sprint',
    Space: 'jump',
    KeyE: 'up', KeyQ: 'down',
  };

  function onKeyDown(e) {
    const k = keyMap[e.code];
    if (k) {
      state.keys.add(k);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    }
  }
  function onKeyUp(e) {
    const k = keyMap[e.code];
    if (k) state.keys.delete(k);
  }
  dom.addEventListener('keydown', onKeyDown);
  dom.addEventListener('keyup', onKeyUp);

  // ---------- 鼠标（指针锁定） ----------
  function onMouseMove(e) {
    if (!state.locked) return;
    state.yaw -= e.movementX * 0.0022;
    state.pitch -= e.movementY * 0.0022;
    state.pitch = clamp(state.pitch, -1.45, 1.45);
  }
  function onLockChange() {
    state.locked = document.pointerLockElement === dom;
  }
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('mousemove', onMouseMove);

  function lock() {
    if (dom.requestPointerLock) dom.requestPointerLock();
  }

  // ---------- 触屏 ----------
  let joyActive = false, joyId = null, joyCX = 0, joyCY = 0;
  let joyVec = { x: 0, y: 0 };
  let lookId = null, lastLX = 0, lastLY = 0;
  const touchUI = document.getElementById('touchUI');
  const joyBase = document.getElementById('joyBase');
  const joyKnob = document.getElementById('joyKnob');
  const touchLook = document.getElementById('touchLook');

  function isTouchDevice() {
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  if (touchUI && joyBase && isTouchDevice()) {
    touchUI.classList.remove('hidden');
    joyBase.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyActive = true; joyId = t.identifier;
      joyCX = t.clientX; joyCY = t.clientY;
      joyKnob.style.transform = 'translate(-50%,-50%)';
    }, { passive: false });
    joyBase.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        let dx = t.clientX - joyCX, dy = t.clientY - joyCY;
        const len = Math.hypot(dx, dy);
        const max = 52;
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        joyKnob.style.transform = `translate(${dx - 23}px, ${dy - 23}px)`;
        const dead = 7; // 死区：避免手抖误动
        if (len < dead) { joyVec = { x: 0, y: 0 }; continue; }
        const k = 1 / (max - dead);
        joyVec = { x: dx * k, y: dy * k };
      }
    }, { passive: false });
    const joyEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyActive = false; joyId = null;
          joyVec = { x: 0, y: 0 };
          joyKnob.style.transform = 'translate(-50%,-50%)';
        }
      }
    };
    joyBase.addEventListener('touchend', joyEnd);
    joyBase.addEventListener('touchcancel', joyEnd);

    touchLook.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      lookId = t.identifier; lastLX = t.clientX; lastLY = t.clientY;
    }, { passive: false });
    touchLook.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        const dx = t.clientX - lastLX, dy = t.clientY - lastLY;
        lastLX = t.clientX; lastLY = t.clientY;
        state.yaw -= dx * 0.0045;
        state.pitch -= dy * 0.0045;
        state.pitch = clamp(state.pitch, -1.45, 1.45);
      }
    }, { passive: false });
    const lookEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === lookId) lookId = null;
      }
    };
    touchLook.addEventListener('touchend', lookEnd);
    touchLook.addEventListener('touchcancel', lookEnd);

    const jumpBtn = document.getElementById('btnJump');
    if (jumpBtn) {
      jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); state.keys.add('jump'); });
      jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); state.keys.delete('jump'); });
    }
    const flyBtn = document.getElementById('btnFly');
    if (flyBtn) flyBtn.addEventListener('touchstart', (e) => { e.preventDefault(); toggleFly(); });
    const sprintBtn = document.getElementById('btnSprint');
    if (sprintBtn) {
      sprintBtn.addEventListener('touchstart', (e) => { e.preventDefault(); state.keys.add('sprint'); });
      sprintBtn.addEventListener('touchend', (e) => { e.preventDefault(); state.keys.delete('sprint'); });
    }
  }

  // ---------- 观景台 ----------
  const BOOKMARKS = [
    { name: '湖光山色', pos: [150, 260], look: [60, 40] },
    { name: '溪流弯道', pos: [40, 195], look: [5, 120] },
    { name: '林间光柱', pos: [-265, -145], look: [-330, -95] },
    { name: '草甸晨雾', pos: [60, -195], look: [60, 40] },
    { name: '溪源高地', pos: [-445, 335], look: [-340, 260] },
    { name: '西侧山脊', pos: [560, -425], look: [380, -180] },
    { name: '雪峰之巅', pos: [860, 720], look: [420, 260] },
    { name: '金色时刻', pos: [395, -55], look: [60, 40] },
    { name: '云海长空', pos: [0, 590, -780], look: [60, 40], fly: true },
  ];

  const bookmarkPoses = BOOKMARKS.map((b) => {
    let x, y, z;
    if (Array.isArray(b.pos) && b.pos.length === 3) { x = b.pos[0]; y = b.pos[1]; z = b.pos[2]; }
    else { x = b.pos[0]; z = b.pos[1]; y = Math.max(terrain.heightAt(x, z) + 3, terrain.lakeLevel + 1); }
    return { x, y, z, lx: b.look[0], lz: b.look[1], name: b.name, fly: !!b.fly };
  });

  function jumpTo(i) {
    if (i < 1 || i > bookmarkPoses.length) return;
    const b = bookmarkPoses[i - 1];
    state.pos.set(b.x, b.y, b.z);
    state.vel.set(0, 0, 0);
    state.flying = !!b.fly;
    state.mode = state.flying ? 'fly' : 'walk';
    const dir = new THREE.Vector3(b.lx - b.x, 0, b.lz - b.z).normalize();
    state.yaw = Math.atan2(-dir.x, -dir.z);
    state.pitch = -0.08;
    if (state.onModeChange) state.onModeChange();
    return b.name;
  }

  // ---------- 电影镜头 ----------
  function startFlythrough() {
    const pts = bookmarkPoses.map((b) => new THREE.Vector3(b.x, b.y, b.z));
    state.flythrough = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    state.flyThroughT = 0;
    return true;
  }
  function stopFlythrough() {
    state.flythrough = null;
    if (!state.flying) state.mode = 'walk';
  }

  function toggleFly() {
    state.flying = !state.flying;
    state.mode = state.flying ? 'fly' : 'walk';
    state.vel.set(0, 0, 0);
    if (state.onModeChange) state.onModeChange();
  }

  function reset() {
    state.pos.set(terrain.spawn.x, terrain.spawn.y, terrain.spawn.z);
    state.vel.set(0, 0, 0);
    state.flying = false;
    state.mode = 'walk';
    state.flythrough = null;
    const dx = terrain.lakeCenter.x - state.pos.x;
    const dz = terrain.lakeCenter.z - state.pos.z;
    state.yaw = Math.atan2(-dx, -dz);
    state.pitch = -0.06;
    if (state.onModeChange) state.onModeChange();
  }

  // ---------- 每帧更新 ----------
  function update(dt, tHours) {
    if (state.flythrough) {
      const dur = 95;
      state.flyThroughT += dt / dur;
      if (state.flyThroughT >= 1) { state.flythrough = null; }
      else {
        const p = state.flythrough.getPoint(state.flyThroughT);
        const p2 = state.flythrough.getPoint(Math.min(1, state.flyThroughT + 0.012));
        camera.position.copy(p);
        camera.up.set(0, 1, 0);
        camera.lookAt(p2);
        return;
      }
    }

    // 输入向量
    let ix = 0, iz = 0;
    if (state.keys.has('fwd')) iz -= 1;
    if (state.keys.has('back')) iz += 1;
    if (state.keys.has('left')) ix -= 1;
    if (state.keys.has('right')) ix += 1;
    if (joyActive) {
      // 摇杆：推上 = 前进（屏幕 y 向下为正，所以 joyVec.y 为负时前进）
      ix += joyVec.x;
      iz += joyVec.y;
    }
    const ilen = Math.hypot(ix, iz);
    if (ilen > 1) { ix /= ilen; iz /= ilen; }

    const sprint = state.keys.has('sprint') && !state.flying;
    const speed = state.flying ? state.flySpeed : (sprint ? SPRINT : WALK);
    state.sprinting = sprint;

    // 转向向量（相机系）
    const sinY = Math.sin(state.yaw), cosY = Math.cos(state.yaw);
    // forward = (-sinY, -cosY)，right = (cosY, -sinY)
    let mx = (-sinY) * (-iz) + (cosY) * ix;
    let mz = (-cosY) * (-iz) + (-sinY) * ix;

    const mlen = Math.hypot(mx, mz);
    if (mlen > 0) { mx /= mlen; mz /= mlen; }

    if (state.flying) {
      state.vel.x = mx * speed;
      state.vel.z = mz * speed;
      let vy = 0;
      if (state.keys.has('up')) vy += 1;
      if (state.keys.has('down')) vy -= 1;
      if (state.keys.has('jump')) vy += 1;
      state.vel.y = vy * speed * 0.75;
    } else {
      const accel = 1 / Math.max(dt, 0.001);
      state.vel.x += (mx * speed - state.vel.x) * Math.min(1, dt * 9);
      state.vel.z += (mz * speed - state.vel.z) * Math.min(1, dt * 9);
      state.vel.y -= GRAVITY * dt;
    }

    state.pos.x += state.vel.x * dt;
    state.pos.z += state.vel.z * dt;

    // 世界边界
    const half = terrain.half - 4;
    state.pos.x = clamp(state.pos.x, -half, half);
    state.pos.z = clamp(state.pos.z, -half, half);

    const ground = terrain.heightAt(state.pos.x, state.pos.z);
    const waterY = terrain.lakeLevel - 0.15;

    if (state.flying) {
      state.pos.y += state.vel.y * dt;
      state.pos.y = Math.max(state.pos.y, Math.min(ground, waterY) + 1);
    } else {
      // 步行：地形 + 涉水（水面保持）
      const surface = Math.max(ground, waterY);
      if (state.pos.y <= surface + EYE) {
        state.pos.y = surface + EYE;
        state.vel.y = Math.max(state.vel.y, 0);
        state.grounded = true;
        if (state.keys.has('jump')) {
          state.vel.y = JUMP;
          state.grounded = false;
        }
      } else {
        state.grounded = false;
      }
      state.pos.y += state.vel.y * dt;
    }

    // 镜头
    const hSpeed = Math.hypot(state.vel.x, state.vel.z);
    const isGroundedWalk = !state.flying && state.grounded;
    if (isGroundedWalk && hSpeed > 0.6) {
      state.bobPhase += dt * (5 + hSpeed * 0.85);
    } else {
      state.bobPhase *= 0.9;
    }
    const bobAmp = isGroundedWalk ? Math.min(0.085, hSpeed * 0.012) : 0;
    const bobY = Math.sin(state.bobPhase * 2) * bobAmp;
    const bobX = Math.sin(state.bobPhase) * bobAmp * 0.7;
    const wade = Math.max(0, Math.min(1, (waterY - ground) / 1.2)) * 0.16;

    camera.position.set(state.pos.x + bobX, state.pos.y + bobY - wade * EYE, state.pos.z);
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotation.y = state.yaw;
    camera.rotation.x = state.pitch;
  }

  // 滚轮调整飞行速度
  function onWheel(e) {
    if (!state.flying) return;
    state.flySpeed = clamp(state.flySpeed * (e.deltaY > 0 ? 1.25 : 0.8), 8, 220);
  }
  dom.addEventListener('wheel', onWheel, { passive: true });

  return {
    state, update, lock, jumpTo, toggleFly, reset,
    startFlythrough, stopFlythrough,
    bookmarkPoses, get isTouch() { return isTouchDevice(); },
  };
}
