import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/addons/geometries/RoundedBoxGeometry.js';
import { canvasTex } from './world.js';

// ------------------------------------------------------------------ power table
export const POWER_ORDER = ['rage', 'shield', 'freeze', 'nuke', 'reinforce', 'missile'];

export const POWERS = {
  rage:      { id: 'rage',      name: 'RAGE',      color: '#ff7a1a', tint: [1.0, 0.42, 0.05], duration: 10, blurb: 'DOUBLE DAMAGE' },
  shield:    { id: 'shield',    name: 'SHIELD',    color: '#38b6ff', tint: [0.20, 0.70, 1.0], duration: 8,  blurb: 'SQUAD IMMUNE' },
  freeze:    { id: 'freeze',    name: 'FREEZE',    color: '#7ff0ff', tint: [0.40, 0.95, 1.0], duration: 6,  blurb: 'ENEMIES FROZEN' },
  nuke:      { id: 'nuke',      name: 'NUKE',      color: '#ffe14a', tint: [1.0, 0.88, 0.25], duration: 0,  blurb: 'CLEARS THE ROAD' },
  reinforce: { id: 'reinforce', name: 'REINFORCE', color: '#8dff9f', tint: [0.35, 1.0, 0.45], duration: 0,  blurb: '+40 SOLDIERS' },
  missile:   { id: 'missile',   name: 'MISSILE',   color: '#ff4a6e', tint: [1.0, 0.25, 0.35], duration: 0,  blurb: 'HOMING BATTERY' },
};

// ------------------------------------------------------------------ canvas helpers
const TAU = Math.PI * 2;

const starPath = (x, cx, cy, ro, ri, n) => {
  x.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro, a = -Math.PI / 2 + (i * Math.PI) / n, px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.closePath();
};

const rrect = (x, px, py, pw, ph, r) => {
  x.beginPath(); x.moveTo(px + r, py);
  x.lineTo(px + pw - r, py); x.quadraticCurveTo(px + pw, py, px + pw, py + r);
  x.lineTo(px + pw, py + ph - r); x.quadraticCurveTo(px + pw, py + ph, px + pw - r, py + ph);
  x.lineTo(px + r, py + ph); x.quadraticCurveTo(px, py + ph, px, py + ph - r);
  x.lineTo(px, py + r); x.quadraticCurveTo(px, py, px + r, py); x.closePath();
};

// helmet + brim + shoulders, drawn in the unit icon box
const soldierGlyph = (x, cx, cy, s = 1) => {
  x.beginPath(); x.arc(cx, cy - 0.02 * s, 0.085 * s, Math.PI, 0); x.closePath(); x.fill();
  rrect(x, cx - 0.10 * s, cy - 0.025 * s, 0.20 * s, 0.045 * s, 0.02 * s); x.fill();
  x.beginPath();
  x.moveTo(cx - 0.135 * s, cy + 0.215 * s);
  x.quadraticCurveTo(cx - 0.125 * s, cy + 0.055 * s, cx, cy + 0.055 * s);
  x.quadraticCurveTo(cx + 0.125 * s, cy + 0.055 * s, cx + 0.135 * s, cy + 0.215 * s); x.closePath(); x.fill();
};

// ------------------------------------------------------------------ icons (unit box, -0.5..0.5, y down)
const ICONS = {
  // two-tipped flame with a hollow core
  rage(x) {
    const flame = () => {
      x.moveTo(0.07, -0.46);
      x.quadraticCurveTo(0.15, -0.27, 0.26, -0.08); x.quadraticCurveTo(0.34, 0.13, 0.16, 0.28);
      x.quadraticCurveTo(0.06, 0.36, 0.02, 0.38); x.quadraticCurveTo(-0.05, 0.38, -0.10, 0.30);
      x.quadraticCurveTo(-0.29, 0.13, -0.24, -0.05); x.quadraticCurveTo(-0.21, -0.18, -0.15, -0.25);
      x.quadraticCurveTo(-0.11, -0.34, -0.13, -0.42); x.quadraticCurveTo(-0.02, -0.26, 0.07, -0.46);
      x.closePath();
    };
    x.beginPath(); flame();
    x.save(); x.translate(0.01, 0.07); x.scale(0.5, 0.5); flame(); x.restore();
    x.fill('evenodd');
  },

  // shield outline with a four-point spark
  shield(x) {
    x.lineWidth = 0.095;
    x.beginPath(); x.moveTo(-0.33, -0.29);
    x.quadraticCurveTo(0, -0.41, 0.33, -0.29); x.lineTo(0.33, 0);
    x.quadraticCurveTo(0.33, 0.30, 0, 0.44); x.quadraticCurveTo(-0.33, 0.30, -0.33, 0);
    x.closePath(); x.stroke();
    starPath(x, 0, 0.02, 0.165, 0.05, 4); x.fill();
  },

  // six arms, two pairs of branches on each
  freeze(x) {
    x.lineWidth = 0.075;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3, ax = Math.cos(a), ay = Math.sin(a);
      x.beginPath(); x.moveTo(0, 0); x.lineTo(ax * 0.44, ay * 0.44); x.stroke();
      for (const r of [0.22, 0.34]) for (const s of [-1, 1]) {
        const b = a + s * 0.85;
        x.beginPath(); x.moveTo(ax * r, ay * r);
        x.lineTo(ax * r + Math.cos(b) * 0.125, ay * r + Math.sin(b) * 0.125); x.stroke();
      }
    }
  },

  // twelve-point burst with a hollow core
  nuke(x) {
    starPath(x, 0, 0, 0.46, 0.20, 12);
    x.moveTo(0.115, 0); x.arc(0, 0, 0.115, 0, TAU);
    x.fill('evenodd');
  },

  // three soldiers in a row, the middle one leading
  reinforce(x) {
    soldierGlyph(x, -0.29, -0.045, 0.94);
    soldierGlyph(x, 0, -0.06, 1.06);
    soldierGlyph(x, 0.29, -0.045, 0.94);
  },

  // rocket body, swept fins, porthole, twin-tongue exhaust
  missile(x) {
    x.beginPath(); x.moveTo(0, -0.46);
    x.quadraticCurveTo(0.095, -0.30, 0.115, -0.12); x.lineTo(0.115, 0.10);
    x.quadraticCurveTo(0.115, 0.19, 0.05, 0.19); x.lineTo(-0.05, 0.19);
    x.quadraticCurveTo(-0.115, 0.19, -0.115, 0.10); x.lineTo(-0.115, -0.12);
    x.quadraticCurveTo(-0.095, -0.30, 0, -0.46); x.closePath(); x.fill();
    for (const s of [-1, 1]) {
      x.beginPath(); x.moveTo(s * 0.11, -0.08);
      x.lineTo(s * 0.30, 0.24); x.lineTo(s * 0.11, 0.19); x.closePath(); x.fill();
    }
    x.beginPath(); x.arc(0, -0.08, 0.045, 0, TAU);
    x.fillStyle = 'rgba(0,0,0,0.30)'; x.fill(); x.fillStyle = '#fff';
    x.beginPath(); x.moveTo(-0.10, 0.27);
    x.quadraticCurveTo(-0.09, 0.40, -0.045, 0.48); x.quadraticCurveTo(0, 0.35, 0.045, 0.48);
    x.quadraticCurveTo(0.09, 0.40, 0.10, 0.27); x.quadraticCurveTo(0, 0.33, -0.10, 0.27);
    x.closePath(); x.fill();
  },
};

export function powerIcon(id, ctx, w, h) {
  const s = Math.min(w, h);
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(s, s);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
  (ICONS[id] || ICONS.rage)(ctx);
  ctx.restore();
}

// ------------------------------------------------------------------ crate face texture
const faceCache = new Map();

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

export function powerFaceTex(id, size = 128) {
  const key = POWERS[id] ? id : POWER_ORDER[0];
  const ck = key + ':' + size, hit = faceCache.get(ck);
  if (hit) return hit;
  const col = POWERS[key].color;
  const tex = canvasTex(size, size, (x, w, h) => {
    const pad = w * 0.045;
    // dark backing so the rounded plate corners never show through
    x.fillStyle = shade(col, -0.62);
    x.fillRect(0, 0, w, h);
    rrect(x, pad, pad, w - pad * 2, h - pad * 2, w * 0.20);
    const g = x.createLinearGradient(0, pad, 0, h - pad);
    g.addColorStop(0, shade(col, 0.30)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.22));
    x.fillStyle = g; x.fill();
    x.lineWidth = w * 0.05; x.strokeStyle = shade(col, -0.52); x.stroke();
    // rivets on the plate rim
    x.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      x.beginPath(); x.arc(w / 2 + Math.cos(a) * w * 0.415, h / 2 + Math.sin(a) * w * 0.415, w * 0.016, 0, TAU); x.fill();
    }
    // recessed field + white border
    const ins = w * 0.125;
    rrect(x, ins, ins, w - ins * 2, h - ins * 2, w * 0.145);
    const g2 = x.createRadialGradient(w / 2, h * 0.42, w * 0.05, w / 2, h / 2, w * 0.46);
    g2.addColorStop(0, shade(col, -0.30)); g2.addColorStop(1, shade(col, -0.64));
    x.fillStyle = g2; x.fill();
    x.lineWidth = w * 0.032; x.strokeStyle = '#fff'; x.stroke();
    // icon
    const iw = w * 0.60;
    x.save();
    x.translate((w - iw) / 2, (h - iw) / 2);
    powerIcon(key, x, iw, iw);
    x.restore();
  });
  faceCache.set(ck, tex);
  return tex;
}

// ------------------------------------------------------------------ power crate
let _glowFallback = null;
const fallbackGlow = () => _glowFallback || (_glowFallback = canvasTex(128, 128, (x, w, h) => {
  const g = x.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}));

export function createPowerCrate(scene, glowTex) {
  const group = new THREE.Group();   // host owns group.position
  const spin = new THREE.Group();    // orientation + bob live here
  group.add(spin); group.visible = false;

  const first = powerFaceTex(POWER_ORDER[0]);
  const faceMat = new THREE.MeshStandardMaterial({
    map: first, emissiveMap: first, emissive: 0xffffff, emissiveIntensity: 0.45,
    roughness: 0.36, metalness: 0.3, envMapIntensity: 0.9,
  });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.95, 0.95, 4, 0.11), faceMat);
  body.castShadow = body.receiveShadow = true; spin.add(body);

  const metal = new THREE.MeshStandardMaterial({ color: 0x8b93a8, roughness: 0.3, metalness: 0.92, envMapIntensity: 1.1 });
  const bandG = new THREE.BoxGeometry(0.99, 0.075, 0.99);
  const postG = new THREE.BoxGeometry(0.085, 0.99, 0.085);
  for (const y of [-0.3, 0.3]) {
    const band = new THREE.Mesh(bandG, metal);
    band.position.y = y; band.castShadow = true; spin.add(band);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(postG, metal);
    post.position.set(sx * 0.44, 0, sz * 0.44); post.castShadow = true; spin.add(post);
  }

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex || fallbackGlow(), color: new THREE.Color(2.2, 1.0, 0.2),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.8,
  }));
  glow.scale.set(3.6, 3.6, 1);
  group.add(glow); scene.add(group);

  let cur = null;
  const set = (id) => {
    const key = POWERS[id] ? id : POWER_ORDER[0];
    if (key === cur) return;
    cur = key;
    const tex = powerFaceTex(key);
    faceMat.map = tex; faceMat.emissiveMap = tex; faceMat.needsUpdate = true;
    const t = POWERS[key].tint;
    glow.material.color.setRGB(t[0] * 2.2, t[1] * 2.2, t[2] * 2.2);
  };

  const update = (t) => {
    spin.rotation.y = t * 2.4;
    spin.rotation.x = Math.sin(t * 1.7) * 0.12;
    spin.position.y = Math.sin(t * 3) * 0.1;
    glow.material.opacity = 0.72 + Math.sin(t * 3) * 0.16;
  };

  const hide = () => { group.visible = false; };

  return { group, set, update, hide };
}
