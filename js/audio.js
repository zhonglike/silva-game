// audio.js — 程序化音频：环境风声 + 收集音效（WebAudio 合成，零素材）
export function createAudio() {
  let ctx = null, master = null, windGain = null, started = false;
  let muted = false;

  function start() {
    if (started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);

      // 风声：循环白噪声 → 带通滤波 → 增益
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = last * 0.97 + white * 0.03; // 低通
        data[i] = last * 4;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 320;
      filter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0.05;
      src.connect(filter).connect(windGain).connect(master);
      src.start();

      started = true;
    } catch (e) { /* 静默降级 */ }
  }

  function setWind(intensity) {
    if (!windGain || !ctx) return;
    const t = ctx.currentTime;
    windGain.gain.setTargetAtTime(0.04 + intensity * 0.09, t, 0.5);
  }

  function chime() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const notes = [880, 1318.5, 1760];
    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[i];
      const start = t + i * 0.06;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.14 / (i + 1), start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
      osc.connect(g).connect(master);
      osc.start(start);
      osc.stop(start + 0.75);
    }
  }

  function setMuted(m) {
    muted = m;
    if (master && ctx) {
      master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.1);
    }
  }
  function isMuted() { return muted; }

  return { start, setWind, chime, setMuted, isMuted };
}
