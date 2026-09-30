// water.js — 程序化水面：波浪法线、深度吸收、岸边泡沫
import * as THREE from '../vendor/three.module.min.js';
import { makeNoise2D } from './noise.js';

function makeFoamTexture(seed) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const n = makeNoise2D(seed ^ 0xfa0b);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = n.fbm(x / size * 5.0, y / size * 5.0, 4);
      const blob = Math.pow(v, 2.6);
      const i = (y * size + x) * 4;
      img.data[i] = blob * 255;
      img.data[i + 1] = blob * 255;
      img.data[i + 2] = blob * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createWater(terrain, quality) {
  const seg = quality === 'high' ? 144 : quality === 'med' ? 96 : 64;
  const geo = new THREE.PlaneGeometry(terrain.size * 1.04, terrain.size * 1.04, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, terrain.lakeLevel - 0.06, 0);

  // 逐顶点水深（相对湖面）
  const pos = geo.attributes.position;
  const depths = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const th = terrain.heightAt(x, z);
    depths[i] = terrain.lakeLevel - th; // >0 = 水下
  }
  geo.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1));

  const foamTex = makeFoamTexture(0x5eed);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(1.0, 0.9, 0.7) },
      uCamPos: { value: new THREE.Vector3() },
      uDeep: { value: new THREE.Color(0.05, 0.16, 0.20) },
      uShallow: { value: new THREE.Color(0.16, 0.38, 0.34) },
      uFoam: { value: new THREE.Color(0.92, 0.97, 0.95) },
      uFoamTex: { value: foamTex },
    },
    vertexShader: `
      uniform float uTime;
      attribute float aDepth;
      varying vec3 vWorld;
      varying float vDepth;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vDepth = aDepth;
        vec3 p = position;
        float w = sin(position.x * 0.09 + uTime * 1.1) * 0.30
                + sin(position.z * 0.12 - uTime * 0.85) * 0.30;
        w *= smoothstep(0.0, 5.0, aDepth);
        p.y += w;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uCamPos;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uFoam;
      uniform sampler2D uFoamTex;
      varying vec3 vWorld;
      varying float vDepth;
      varying vec2 vUv;
      void main() {
        vec3 viewDir = normalize(uCamPos - vWorld);
        float t = uTime;
        vec2 uv1 = vUv * 6.0 + vec2(t * 0.05, t * 0.032);
        vec2 uv2 = vUv * 11.0 + vec2(-t * 0.042, t * 0.06);
        float w1 = sin(uv1.x * 6.283 + uv1.y * 3.141 + t * 1.2);
        float w2 = sin(uv2.x * 4.0 - uv2.y * 7.0 + t * 0.9);
        float w3 = sin(uv1.y * 5.0 + uv1.x * 2.0 - t * 0.6);
        vec3 N = normalize(vec3(w1 * 0.16 + w2 * 0.10, 1.0, w3 * 0.16 + w2 * 0.08));

        float fres = pow(1.0 - max(dot(N, viewDir), 0.0), 3.0);
        float depth = clamp(vDepth, 0.0, 12.0);
        float absorb = 1.0 - exp(-depth * 0.24);
        vec3 col = mix(uShallow, uDeep, absorb);
        col = mix(col, vec3(0.86, 0.94, 0.98), fres * 0.55);

        vec3 refl = reflect(-uSunDir, N);
        float spec = pow(max(dot(refl, viewDir), 0.0), 90.0);
        col += uSunColor * spec * 1.5;

        float foam = smoothstep(1.1, 0.0, vDepth);
        float fn = texture2D(uFoamTex, vUv * 22.0 + vec2(t * 0.02, -t * 0.016)).r;
        foam *= smoothstep(0.30, 0.72, fn);
        col = mix(col, uFoam, foam * 0.8);

        float alpha = mix(0.5, 0.86, absorb) + fres * 0.25;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.frustumCulled = false;

  function update(dt, camPos, sunDir, sunColor) {
    mat.uniforms.uTime.value += dt;
    if (camPos) mat.uniforms.uCamPos.value.copy(camPos);
    if (sunDir) mat.uniforms.uSunDir.value.copy(sunDir);
    if (sunColor) mat.uniforms.uSunColor.value.copy(sunColor);
  }

  return { mesh, update, material: mat };
}
