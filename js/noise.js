// noise.js — 纯 JS 程序化噪声（值噪声 / fBm / ridged / 域扭曲）
import { mulberry32 } from './rng.js';

export function makeNoise2D(seed) {
  const p = new Uint8Array(512);
  const tmp = new Uint8Array(256);
  const rng = mulberry32(seed);
  for (let i = 0; i < 256; i++) tmp[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = tmp[i]; tmp[i] = tmp[j]; tmp[j] = t;
  }
  for (let i = 0; i < 512; i++) p[i] = tmp[i & 255];

  function value2(ix, iy) {
    return p[(p[ix & 255] + iy) & 255] / 255;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }

  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = smooth(fx), sy = smooth(fy);
    const a = value2(ix, iy), b = value2(ix + 1, iy);
    const c = value2(ix, iy + 1), d = value2(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  function fbm(x, y, oct, lacunarity = 2.0, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += amp * noise(x * freq, y * freq);
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm; // 0..1
  }

  function ridged(x, y, oct, lacunarity = 2.1, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      const n = 1 - Math.abs(noise(x * freq, y * freq) * 2 - 1);
      sum += amp * n * n;
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm; // 0..1，0 = 脊线
  }

  return { noise, fbm, ridged };
}
