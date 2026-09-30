// main.js — SILVA 森语 · 启动与主循环
import * as THREE from '../vendor/three.module.min.js';
import { createTerrain } from './terrain.js';
import { createWater } from './water.js';
import { createSky } from './sky.js';
import { createVegetation } from './veg.js';
import { createMotes } from './motes.js';
import { createControls } from './controls.js';
import { createAudio } from './audio.js';
import { hashString, clamp } from './rng.js';

// ---------- URL 参数 ----------
const qs = new URLSearchParams(location.search);
const seedStr = (qs.get('seed') || '').trim();
const seed = seedStr === '' ? ((Math.random() * 0xffffffff) >>> 0) : hashString(seedStr);
const startT = parseFloat(qs.get('T')) || 9;
const quality = ['low', 'med', 'high'].includes(qs.get('q')) ? qs.get('q') : 'med';
const motesEnabled = qs.get('motes') !== '0';
const FOG_DENSITY = 0.00085;
const MOTES_TOTAL = 40;

// ---------- 渲染器 ----------
function showFatal(text) {
  const el = document.getElementById('errMsg');
  el.textContent = text;
  el.classList.remove('hidden');
}
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  showFatal('无法创建 WebGL 上下文。请确认浏览器已开启硬件加速，或换用 Chrome / Edge / 新版 Safari 访问。');
  throw e;
}
const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setClearColor(0xbfd8e2);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 6200);
camera.position.set(0, 8, 60);

const fog = new THREE.FogExp2(0xbfd8e2, FOG_DENSITY);
scene.fog = fog;

// ---------- 世界 ----------
const terrain = createTerrain(seed, quality);
scene.add(terrain.mesh);

const sky = createSky();
if (quality === 'low') sky.sunLight.shadow.mapSize.set(1024, 1024);
scene.add(sky.group);

const water = createWater(terrain, quality);
scene.add(water.mesh);

const veg = createVegetation(scene, terrain, seed, quality);
scene.add(veg.group);

const audio = createAudio();

let collected = 0;
let motes = null;
if (motesEnabled) {
  motes = createMotes(scene, terrain, seed, MOTES_TOTAL, () => {
    collected++;
    audio.chime();
    updateHudMotes();
    msg('光之种子 +1');
    if (collected >= MOTES_TOTAL) msg('全部 40 颗光之种子已收集！');
  });
  scene.add(motes.group);
}

const controls = createControls(camera, terrain, { dom: document });
controls.state.onModeChange = updateHudMode;
if (qs.get('fly') === '1') controls.toggleFly();

// cam 参数
const camP = qs.get('cam');
if (camP) {
  const parts = camP.split(',').map(Number);
  if (parts.length >= 5 && parts.every(Number.isFinite)) {
    controls.state.pos.set(parts[0], parts[1], parts[2]);
    controls.state.yaw = parts[3];
    controls.state.pitch = parts[4];
  }
}

// ---------- HUD ----------
const elMotes = document.getElementById('hudMotes');
const elTime = document.getElementById('hudTime');
const elFps = document.getElementById('hudFps');
const elMode = document.getElementById('hudMode');
const elMsg = document.getElementById('hudMsg');
const compassCv = document.getElementById('compass');
const compassCtx = compassCv.getContext('2d');

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function updateHudMotes() {
  if (!motesEnabled) { elMotes.textContent = '光之种子 已关闭'; return; }
  elMotes.innerHTML = `光之种子 <span class="hl">${collected}</span> / ${MOTES_TOTAL}`;
}
function updateHudTime() {
  const h = Math.floor(tHours), m = Math.floor((tHours % 1) * 60);
  elTime.textContent = pad2(h) + ':' + pad2(m);
}
function updateHudMode() {
  elMode.textContent = controls.state.flying ? '飞行' : '步行';
}
let fpsAccum = 0, fpsFrames = 0, fps = 0;
function updateHudFps(dt) {
  fpsAccum += dt; fpsFrames++;
  if (fpsAccum >= 0.5) {
    fps = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0; fpsFrames = 0;
    elFps.textContent = fps + ' fps';
  }
}

let msgTimer = null;
function msg(text, ms = 1800) {
  elMsg.textContent = text;
  elMsg.classList.add('show');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => elMsg.classList.remove('show'), ms);
}

function drawCompass() {
  const ctx = compassCtx;
  const S = compassCv.width;
  const cx = S / 2, cy = S / 2, r = S / 2 - 6;
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(210,230,220,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

  const yaw = controls.state.yaw;
  // 北（世界 -Z）
  let ang = yaw;
  ctx.strokeStyle = '#e6f2ec';
  ctx.beginPath();
  ctx.moveTo(cx + Math.sin(ang) * (r - 4), cy - Math.cos(ang) * (r - 4));
  ctx.lineTo(cx + Math.sin(ang) * (r - 13), cy - Math.cos(ang) * (r - 13));
  ctx.stroke();

  // 最近光之种子
  if (motes) {
    const near = motes.nearestTo(camera.position);
    if (near) {
      const d = new THREE.Vector3(near.pos.x - camera.position.x, 0, near.pos.z - camera.position.z).normalize();
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const a = Math.atan2(d.dot(right), d.dot(fwd));
      ctx.fillStyle = near.dist < 60 ? '#8ff0c8' : '#5fae8f';
      ctx.beginPath();
      ctx.arc(cx + Math.sin(a) * (r - 12), cy - Math.cos(a) * (r - 12), 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------- 时间 ----------
let tHours = startT;
let timeSpeed = 1;
const clock = new THREE.Clock();

// ---------- 覆盖层 / 设置 ----------
const overlay = document.getElementById('overlay');
const seedInput = document.getElementById('seedInput');
const qualitySelect = document.getElementById('qualitySelect');
const seedDice = document.getElementById('seedDice');
const startBtn = document.getElementById('startBtn');

if (seedStr) seedInput.value = seedStr;
qualitySelect.value = quality;
seedDice.addEventListener('click', () => {
  seedInput.value = Math.random().toString(36).slice(2, 8);
});

function enter() {
  overlay.classList.add('gone');
  audio.start();
  if (!controls.isTouch) controls.lock();
  msg('按 P 设置 · H 帮助 · 1-9 观景台', 2600);
}
startBtn.addEventListener('click', () => {
  const s = seedInput.value.trim();
  const q = qualitySelect.value;
  if (s !== seedStr || q !== quality) {
    const p = new URLSearchParams();
    if (s) p.set('seed', s);
    p.set('q', q);
    if (qs.get('T')) p.set('T', qs.get('T'));
    location.search = p.toString();
    return;
  }
  enter();
});

// 设置面板
const settingsPanel = document.getElementById('settingsPanel');
const setSeed = document.getElementById('setSeed');
const setSeedApply = document.getElementById('setSeedApply');
const timeSlider = document.getElementById('timeSlider');
const speedSlider = document.getElementById('speedSlider');
const setQuality = document.getElementById('setQuality');
const muteBtn = document.getElementById('muteBtn');
const resetBtn = document.getElementById('resetBtn');
const settingsClose = document.getElementById('settingsClose');
const helpPanel = document.getElementById('helpPanel');
const helpClose = document.getElementById('helpClose');

setSeed.value = seedStr || '';
timeSlider.value = tHours;
speedSlider.value = timeSpeed;
setQuality.value = quality;

function openPanel(el) { el.classList.remove('hidden'); }
function closePanel(el) { el.classList.add('hidden'); }
settingsClose.addEventListener('click', () => closePanel(settingsPanel));
helpClose.addEventListener('click', () => closePanel(helpPanel));
setSeedApply.addEventListener('click', () => {
  const p = new URLSearchParams();
  const s = setSeed.value.trim();
  if (s) p.set('seed', s);
  p.set('q', setQuality.value);
  location.search = p.toString();
});
timeSlider.addEventListener('input', () => { tHours = parseFloat(timeSlider.value); updateHudTime(); });
speedSlider.addEventListener('input', () => { timeSpeed = parseFloat(speedSlider.value); });
setQuality.addEventListener('change', () => {
  const p = new URLSearchParams();
  if (seedStr) p.set('seed', seedStr);
  p.set('q', setQuality.value);
  location.search = p.toString();
});
resetBtn.addEventListener('click', () => {
  controls.reset();
  closePanel(settingsPanel);
  msg('已回到出生点');
});
muteBtn.addEventListener('click', () => {
  const m = !audio.isMuted();
  audio.setMuted(m);
  muteBtn.textContent = m ? '开启声音' : '静音';
  muteBtn.classList.toggle('active', m);
});

// ---------- 快捷键 ----------
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  const c = e.code;
  if (c.startsWith('Digit')) {
    const n = parseInt(c.slice(5), 10);
    if (n >= 1 && n <= 9) {
      const name = controls.jumpTo(n);
      if (name) msg(`观景台 ${n} · ${name}`);
    }
  } else if (c === 'KeyF') {
    if (controls.state.flythrough) { controls.stopFlythrough(); msg('电影镜头结束'); }
    else { controls.startFlythrough(); msg('电影镜头 · 再次按 F 结束'); }
  } else if (c === 'KeyV') {
    controls.toggleFly();
    msg(controls.state.flying ? '飞行模式（E/Q 升降，滚轮调速）' : '步行模式');
  } else if (c === 'KeyP') {
    openPanel(settingsPanel);
  } else if (c === 'KeyH') {
    openPanel(helpPanel);
  } else if (c === 'KeyM') {
    const m = !audio.isMuted();
    audio.setMuted(m);
    muteBtn.textContent = m ? '开启声音' : '静音';
    muteBtn.classList.toggle('active', m);
  } else if (c === 'KeyT') {
    tHours = (tHours + 4) % 24;
    timeSlider.value = tHours;
    msg('时间前进 4 小时');
  } else if (c === 'KeyR') {
    controls.reset();
    msg('已回到出生点');
  } else if (c === 'Equal' || c === 'NumpadAdd') {
    timeSpeed = clamp(timeSpeed + 0.5, 0, 10);
    speedSlider.value = timeSpeed;
  } else if (c === 'Minus' || c === 'NumpadSubtract') {
    timeSpeed = clamp(timeSpeed - 0.5, 0, 10);
    speedSlider.value = timeSpeed;
  }
});

// ---------- 主循环 ----------
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  tHours += dt * timeSpeed * 0.04;
  if (tHours >= 24) tHours -= 24;

  controls.update(dt, tHours);
  sky.update(tHours, camera.position);

  // 太阳阴影跟随玩家（钳制在 600m 内）
  const lx = clamp(camera.position.x, -600, 600);
  const lz = clamp(camera.position.z, -600, 600);
  sky.sunLight.target.position.set(lx, 0, lz);
  sky.sunLight.position.copy(sky.state.sunDir).multiplyScalar(1600).add(new THREE.Vector3(lx, 0, lz));

  fog.color.copy(sky.state.fogColor);
  renderer.toneMappingExposure = sky.state.exposure;
  const sunDir = sky.state.sunDir;
  const sunColor = sky.sunLight.color;

  veg.update(tHours, dt, sunDir, sunColor, fog.color, FOG_DENSITY);
  water.update(dt, camera.position, sunDir, sunColor);
  if (motes) motes.update(dt, controls.state.pos);

  // 风声强度
  const speed = Math.hypot(controls.state.vel.x, controls.state.vel.z);
  audio.setWind(clamp(0.25 + speed * 0.09, 0, 1.2));

  updateHudFps(dt);
  updateHudTime();
  updateHudMode();
  drawCompass();

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

updateHudMotes();
updateHudTime();
if (qs.get('auto') === '1') enter();
loop();
