// Tiny WebAudio synth — every sound is generated, no audio files needed.
let ctx = null;
let master = null;
let muted = false;

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

export function setMute(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}
export function isMuted() { return muted; }

function tone(type, f0, f1, dur, vol, when = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, f0), t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.012, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, vol, filterFreq = 1200, when = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  shot() { tone('square', 880, 220, 0.05, 0.05); noise(0.04, 0.03, 2400); },
  enemyShot() { tone('square', 540, 170, 0.06, 0.035); noise(0.05, 0.035, 2100); },
  bossShot() { tone('sawtooth', 210, 55, 0.3, 0.14); noise(0.24, 0.1, 800); },
  laser() { tone('sawtooth', 1400, 300, 0.07, 0.06); noise(0.05, 0.04, 3000); },
  heroShot() { tone('sawtooth', 220, 70, 0.14, 0.11); noise(0.09, 0.07, 900); },
  pop() { tone('triangle', 640, 200, 0.06, 0.05); },
  gate(combo) {
    const f = 523 * Math.pow(2, Math.min(combo, 14) / 12);
    tone('triangle', f, f * 1.5, 0.11, 0.16);
    tone('sine', f * 2, f * 3, 0.09, 0.06);
  },
  gate99() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone('triangle', f, f, 0.16, 0.13, i * 0.055));
    noise(0.3, 0.05, 3000);
  },
  bad() { tone('sawtooth', 240, 70, 0.22, 0.12); noise(0.16, 0.1, 700); },
  cageHit() { tone('square', 320, 190, 0.05, 0.045); noise(0.05, 0.04, 1600); },
  cageBreak() {
    noise(0.4, 0.18, 1400);
    [392, 523, 659].forEach((f, i) => tone('triangle', f, f * 1.2, 0.18, 0.1, i * 0.07));
  },
  land() { tone('sine', 120, 50, 0.18, 0.2); noise(0.12, 0.1, 500); },
  bossLand() { tone('sine', 90, 38, 0.4, 0.3); noise(0.3, 0.18, 380); },
  roar() {
    tone('sawtooth', 140, 60, 0.55, 0.16);
    tone('square', 95, 42, 0.6, 0.12);
    noise(0.5, 0.1, 700);
  },
  charge() { tone('sawtooth', 180, 420, 0.7, 0.08); },
  smash() { noise(0.18, 0.16, 900); tone('sine', 160, 60, 0.2, 0.18); },
  power() {
    [523, 784, 1046, 1568].forEach((f, i) => tone('triangle', f, f * 1.25, 0.2, 0.12, i * 0.06));
    noise(0.35, 0.08, 4000);
  },
  missile() { tone('sawtooth', 300, 110, 0.3, 0.07); noise(0.3, 0.06, 2600); },
  missileHit() { noise(0.22, 0.12, 1100); tone('sine', 180, 58, 0.26, 0.16); },
  boom() { noise(0.7, 0.28, 700); tone('sine', 110, 30, 0.7, 0.25); },
  win() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.22, 0.14, i * 0.12));
  },
  cheer() {
    // crowd roar: a swell of filtered noise under a few bright whoops
    noise(1.1, 0.14, 2200);
    noise(0.8, 0.08, 900, 0.12);
    [660, 880, 990, 1320].forEach((f, i) => tone('triangle', f, f * 1.22, 0.42, 0.045, 0.18 + i * 0.11));
  },
  lose() {
    [392, 330, 262, 196].forEach((f, i) => tone('sawtooth', f, f * 0.94, 0.26, 0.1, i * 0.16));
  },
  click() { tone('square', 660, 880, 0.05, 0.05); },
};
