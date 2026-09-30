// sky.js — 程序化天空：昼夜调色板、太阳/月亮、星空、云层
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32, lerp, clamp } from './rng.js';
import { makeNoise2D } from './noise.js';

// 按小时的关键帧插值
function keyed(t, keys) {
  const h = ((t % 24) + 24) % 24;
  if (h <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [h0, v0] = keys[i], [h1, v1] = keys[i + 1];
    if (h >= h0 && h <= h1) {
      const f = (h - h0) / (h1 - h0 || 1);
      if (typeof v0 === 'number') return lerp(v0, v1, f);
      return [
        lerp(v0[0], v1[0], f), lerp(v0[1], v1[1], f), lerp(v0[2], v1[2], f),
      ];
    }
  }
  return keys[keys.length - 1][1];
}

const K = {
  top: [[0, [0.04, 0.06, 0.15]], [5.2, [0.18, 0.30, 0.44]], [7.5, [0.18, 0.44, 0.64]], [16.5, [0.16, 0.43, 0.64]], [18.4, [0.20, 0.40, 0.54]], [19.8, [0.11, 0.14, 0.28]], [21.5, [0.04, 0.06, 0.15]], [24, [0.04, 0.06, 0.15]]],
  hor: [[0, [0.07, 0.10, 0.18]], [5.2, [0.72, 0.46, 0.30]], [7.5, [0.78, 0.88, 0.90]], [16.5, [0.80, 0.89, 0.90]], [18.4, [0.90, 0.55, 0.30]], [19.8, [0.42, 0.28, 0.36]], [21.5, [0.07, 0.10, 0.18]], [24, [0.07, 0.10, 0.18]]],
  sun: [[0, [0.62, 0.72, 1.0]], [5.2, [1.0, 0.60, 0.35]], [8.5, [1.0, 0.95, 0.84]], [16.5, [1.0, 0.95, 0.84]], [18.4, [1.0, 0.55, 0.26]], [19.8, [0.95, 0.35, 0.2]], [21.5, [0.62, 0.72, 1.0]], [24, [0.62, 0.72, 1.0]]],
  fog: [[0, [0.05, 0.07, 0.13]], [5.2, [0.62, 0.46, 0.36]], [8.5, [0.75, 0.85, 0.88]], [16.5, [0.75, 0.85, 0.88]], [18.4, [0.78, 0.52, 0.34]], [19.8, [0.30, 0.22, 0.30]], [21.5, [0.05, 0.07, 0.13]], [24, [0.05, 0.07, 0.13]]],
  light: [[0, 0.06], [5.0, 0.42], [8.0, 1.12], [16.5, 1.08], [18.4, 0.85], [19.8, 0.3], [21.5, 0.06], [24, 0.06]],
  cloud: [[0, [0.03, 0.05, 0.10]], [5.4, [0.85, 0.5, 0.4]], [9.0, [1.0, 1.0, 1.0]], [16.5, [1.0, 1.0, 1.0]], [18.4, [1.0, 0.62, 0.4]], [19.8, [0.45, 0.28, 0.34]], [21.5, [0.03, 0.05, 0.10]], [24, [0.03, 0.05, 0.10]]],
};

function makeCloudTexture(seed) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const n = makeNoise2D(seed);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let d = n.fbm(u * 4.0 + 11.0, v * 4.0 - 7.0, 5) * 0.7
            + n.fbm(u * 9.0 - 5.0, v * 9.0 + 3.0, 3) * 0.3;
      // 云朵形状：压扁、抬升
      d = Math.pow(Math.max(0, d - 0.52) * 3.2, 1.5);
      const i = (y * size + x) * 4;
      img.data[i] = d * 255;
      img.data[i + 1] = d * 255;
      img.data[i + 2] = d * 255;
      img.data[i + 3] = d * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createSky() {
  const group = new THREE.Group();
  group.name = 'sky';

  // ---- 天穹 ----
  const domeGeo = new THREE.SphereGeometry(4200, 24, 12);
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0.16, 0.43, 0.64) },
      uHor: { value: new THREE.Color(0.8, 0.89, 0.9) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
      uSunPower: { value: 200.0 },
      uNight: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHor;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uSunPower;
      uniform float uNight;
      varying vec3 vWorld;
      void main() {
        vec3 dir = normalize(vWorld);
        float h = clamp(dir.y, -0.05, 1.0);
        float t = pow(max(h, 0.0), 0.55);
        vec3 col = mix(uHor, uTop, t);
        // 地平线暖带
        float hz = exp(-abs(dir.y) * 9.0);
        col = mix(col, uHor * 1.18, hz * 0.55);
        // 太阳
        float sd = max(dot(dir, uSunDir), 0.0);
        col += uSunColor * pow(sd, uSunPower) * 1.2 * (1.0 - uNight * 0.85);
        col += uSunColor * pow(sd, 8.0) * 0.22;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.frustumCulled = false;
  group.add(dome);

  // ---- 太阳 / 月亮发光体 ----
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(42, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false, transparent: true })
  );
  group.add(sunDisc);
  const moonDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: 0xcfe0ff, fog: false, transparent: true, opacity: 0.9 })
  );
  group.add(moonDisc);

  // ---- 星空 ----
  const starN = 1600;
  const srng = mulberry32(0x5eed5eed);
  const sPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const u = srng() * 2 - 1, v = srng() * 2 - 1;
    const len = Math.sqrt(u * u + v * v);
    if (len > 0.98 || len < 0.1) { i--; continue; }
    const r = 4000;
    const y = Math.abs(v) * 0.9 + 0.1;
    const a = Math.atan2(u, v);
    const rr = r * Math.sqrt(1 - y * y);
    sPos[i * 3] = Math.cos(a) * rr;
    sPos[i * 3 + 1] = r * y;
    sPos[i * 3 + 2] = Math.sin(a) * rr;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xdbe8ff, size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0,
    depthWrite: false, fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  group.add(stars);

  // ---- 云层（两层视差 + 高层薄云） ----
  const cloudTex = makeCloudTexture(0x51e0);
  const cloudLayers = [];
  const layerDefs = [
    { y: 760, size: 7600, scale: 1.0, speed: 0.008, opacity: 0.85 },
    { y: 980, size: 9000, scale: 1.6, speed: -0.013, opacity: 0.6 },
    { y: 1250, size: 11000, scale: 2.3, speed: 0.005, opacity: 0.35 },
  ];
  for (const def of layerDefs) {
    const cgeo = new THREE.PlaneGeometry(def.size, def.size);
    cgeo.rotateX(-Math.PI / 2);
    const cmat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTex: { value: cloudTex },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uOpacity: { value: def.opacity },
        uScale: { value: def.scale },
        uScroll: { value: new THREE.Vector2(0, 0) },
        uCamY: { value: 10 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTex;
        uniform vec3 uTint;
        uniform float uOpacity;
        uniform float uScale;
        uniform vec2 uScroll;
        varying vec2 vUv;
        void main() {
          vec2 uv2 = vUv * uScale + uScroll;
          float a = texture2D(uTex, uv2).a;
          float fade = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x)
                     * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
          gl_FragColor = vec4(uTint, a * uOpacity * fade);
        }
      `,
    });
    const cm = new THREE.Mesh(cgeo, cmat);
    cm.position.y = def.y;
    cm.frustumCulled = false;
    group.add(cm);
    cloudLayers.push({ mesh: cm, mat: cmat, def });
  }

  // ---- 光照 ----
  const sunLight = new THREE.DirectionalLight(0xfff2d6, 1.1);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  const sc = sunLight.shadow.camera;
  sc.left = -500; sc.right = 500; sc.top = 500; sc.bottom = -500;
  sc.near = 10; sc.far = 2200;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.6;
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x44553c, 0.55);
  group.add(sunLight, sunLight.target, hemi);

  // ---- 状态 ----
  const state = {
    sunDir: new THREE.Vector3(0.4, 0.75, 0.3).normalize(),
    fogColor: new THREE.Color(0.75, 0.85, 0.88),
    exposure: 1.0,
    tHours: 9,
    sunLight, hemi, stars, sunDisc, moonDisc, domeMat,
  };

  function update(tHours, camPos) {
    state.tHours = tHours;
    // 太阳方位
    const theta = ((tHours - 6) / 12) * Math.PI;
    const elev = Math.sin(theta) * 1.05;
    const az = 2.25 + Math.cos(theta) * 0.22;
    const sunDir = new THREE.Vector3(
      Math.cos(az) * Math.cos(elev),
      Math.sin(elev),
      Math.sin(az) * Math.cos(elev)
    ).normalize();
    const isNight = sunDir.y < -0.04;
    const nightF = clamp(1 - (sunDir.y + 0.02) / 0.14, 0, 1); // 0 白天 → 1 深夜

    const top = keyed(tHours, K.top);
    const hor = keyed(tHours, K.hor);
    const sunC = keyed(tHours, K.sun);
    const fog = keyed(tHours, K.fog);
    const lightI = keyed(tHours, K.light);
    const cloudC = keyed(tHours, K.cloud);

    domeMat.uniforms.uTop.value.set(top[0], top[1], top[2]);
    domeMat.uniforms.uHor.value.set(hor[0], hor[1], hor[2]);
    domeMat.uniforms.uSunDir.value.copy(sunDir);
    domeMat.uniforms.uSunColor.value.set(sunC[0], sunC[1], sunC[2]);
    domeMat.uniforms.uNight.value = nightF;

    sunLight.position.copy(sunDir).multiplyScalar(1600);
    sunLight.intensity = lightI;
    sunLight.color.set(sunC[0], sunC[1], sunC[2]);
    hemi.intensity = 0.3 + lightI * 0.4;
    hemi.color.set(lerp(0.35, sunC[0], 0.3), lerp(0.5, sunC[1], 0.3), lerp(0.8, sunC[2], 0.3));

    // 太阳/月亮朝向相机
    if (camPos) {
      sunDisc.position.copy(sunDir).multiplyScalar(3800).add(camPos);
      sunDisc.lookAt(camPos);
      moonDisc.position.copy(sunDir).multiplyScalar(-3800).add(camPos);
      moonDisc.lookAt(camPos);
      moonDisc.material.opacity = 0.9 * nightF;
    }

    stars.material.opacity = nightF * 0.95;

    for (const L of cloudLayers) {
      L.mat.uniforms.uScroll.value.x += L.def.speed;
      L.mat.uniforms.uScroll.value.y += L.def.speed * 0.4;
      L.mat.uniforms.uTint.value.set(cloudC[0], cloudC[1], cloudC[2]);
      L.mat.uniforms.uOpacity.value = L.def.opacity * (0.25 + 0.75 * (1 - nightF * 0.55));
      L.mesh.position.x = camPos ? camPos.x : 0;
      L.mesh.position.z = camPos ? camPos.z : 0;
    }

    state.sunDir.copy(sunDir);
    state.fogColor.set(fog[0], fog[1], fog[2]);
    state.exposure = 0.42 + lightI * 0.85;
    state.isNight = isNight;
  }

  return { group, update, sunLight, hemi, state };
}
