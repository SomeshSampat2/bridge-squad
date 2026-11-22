import * as THREE from 'three';
import { buildWorld, canvasTex, DECK_HW, FORT_D } from './world.js';
import { UnitRenderer, soldierParts, enemyParts, PAL, buildHero, buildBoss } from './units.js';
import { initAudio, setMute, isMuted, sfx } from './audio.js';
import { LEVELS } from './levels.js';
import { createMissiles } from './missile.js';
import { POWERS, POWER_ORDER, createPowerCrate } from './powers.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';

// ------------------------------------------------------------------ constants
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

const FIRE_INT = 0.34, RANGE = 20;
// Bosses are big, slow and visible from far off, so the squad opens fire on them
// the moment they walk into view instead of waiting for contact range.
const BOSS_RANGE = 30;
// Enemy fire: the front ranks volley at the squad. The rate ramps with the
// stage; the burst is capped so the horde never turns into a wall of lead.
// Fire only starts once the squad is actually engaged — a one-soldier run
// cannot be sniped off the bridge before the first gate arrives.
const EFIRE_RANGE = 20, EFIRE_LANE = 4.2, EFIRE_MIN_N = 6;
const enemyFireInt = () => Math.max(0.8, 1.7 - levelIndex * 0.07);
const enemyFireBurst = () => 1 + Math.floor(levelIndex / 7);
// Boss shells: slower and bigger than a rifle bolt, and they kill a handful of
// soldiers in the blast instead of one.
const BOSS_SHOT_INT = [3.2, 2.8, 2.2];
const BOSS_SHOT_KILLS = [2, 3, 5];
const BOSS_SHOT_R = [1.7, 2.0, 2.8];
// Level-driven values — set by applyLevel().
let HORDE_X0 = -6.05, HORDE_X1 = 2.85, HORDE_D0 = 17.5, HORDE_D1 = 62.6, HSP = 0.62;
let V_SQUAD = 1.2, V_BELT = 7.0, REL = V_SQUAD + V_BELT;
let CHARGE_V = 4.6;
let CAGE_X = -4.6, CAGE_D = 16.2, CAGE_HP = 30;
let D_MAX = 55;
let AGGRO_RANGE = 6, AGGRO_WIDTH = 3.2;
let levelIndex = 0;
let L = LEVELS[0];

function applyLevel(cfg) {
  L = cfg;
  V_SQUAD = cfg.squadSpeed;
  V_BELT = cfg.beltSpeed;
  REL = V_SQUAD + V_BELT;
  CAGE_X = cfg.cage.x; CAGE_D = cfg.cage.d; CAGE_HP = cfg.cage.hp;
  HORDE_X0 = cfg.horde.x0; HORDE_X1 = cfg.horde.x1;
  // The horde is sized for a 150-soldier squad now: a looser grid and a
  // narrower aggro band keep each charge wave shootable instead of a
  // guaranteed one-for-one trade.
  HORDE_D0 = cfg.horde.d0; HORDE_D1 = cfg.horde.d1;
  HSP = cfg.horde.spacing * 1.15;
  D_MAX = cfg.dMax;
  CHARGE_V = cfg.chargeSpeed * 0.7;
  AGGRO_RANGE = cfg.aggroRange * 0.6; AGGRO_WIDTH = cfg.aggroWidth * 0.62;
}
const MAXS = 150, MAXE = 1300, MAXP = 1700, MAXPT = 1900;

// ------------------------------------------------------------------ dom
const $ = (id) => document.getElementById(id);
const stage = $('stage'), canvas = $('c');
const ov = $('ov'), ovt = $('ovt'), ovs = $('ovs'), ovb = $('ovb'), ovh = $('ovh'), stars = $('stars');
const flash = $('flash'), barF = $('barF'), hudL = $('hudL');
const hudDv = $('hudD').querySelector('b'), pwEl = $('pw');
const toastEl = $('toast');
let toastT = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 1200);
}

// ------------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(44, 9 / 16, 0.5, 500);

let quality = 2; // 0 low, 1 med, 2 high
let autoQ = true;
let composer = null, bloomPass = null;
function applyQuality() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = quality === 2 ? 1 : quality === 1 ? 0.8 : 0.55;
  renderer.setPixelRatio(dpr * scale);
  if (composer) composer.setPixelRatio(dpr * scale);
  if (bloomPass) bloomPass.strength = quality === 2 ? 0.5 : quality === 1 ? 0.36 : 0;
  $('bQual').textContent = ['LOW', 'MED', 'HIGH'][quality];
}
function setQuality(q) { quality = q; applyQuality(); resize(); }

// Two framings. CHASE is the default: a low, wide follow cam that sits just
// behind the crowd, banks into steering and eases back as the squad grows, so
// the bridge runs to a vanishing point instead of reading as a top-down map.
// CLASSIC is the original high framing.
const CAM_RIGS = ['CHASE', 'CLASSIC'];
// world-space labels and popups shrink on the close rig so they never cover
// the squad or the gate numbers
const UI_K = [0.62, 1];
let camRig = 0;
let uiK = UI_K[0];
let frameCfg = computeFraming(camera.aspect);

function computeFraming(aspect) {
  // The window shape drives the framing: portrait phones keep the tall
  // composition, desktop windows get a flatter, wider vista.
  const t = clamp((aspect - 0.65) / (1.7 - 0.65), 0, 1);
  const tt = t * t * (3 - 2 * t);
  if (camRig === 0) {
    return {
      camH: lerp(10.2, 7.6, tt),
      camB: lerp(16.0, 11.2, tt),
      lookAhead: lerp(9.5, 8.4, tt),
      lookY: 1.35,
      fov: lerp(66, 58, tt),
      crowdH: lerp(0.50, 0.46, tt),
      crowdB: lerp(0.86, 0.86, tt),
    };
  }
  // Classic: keep the vertical coverage (depth of view ahead) roughly constant
  // and let the horizontal view grow with the window, so a desktop screen shows
  // the bridge plus water on both sides instead of a giant close-up.
  const targetH = lerp(25, 19.5, tt);
  const camH = lerp(26, 23.5, tt);
  const camB = lerp(17, 16, tt);
  const lookAhead = lerp(7.6, 6, tt);
  const d = Math.hypot(camH, camB);
  const fov = 2 * Math.atan(targetH / (2 * d)) * 180 / Math.PI;
  return { camH, camB, fov, lookAhead, lookY: 0, crowdH: 0, crowdB: 0 };
}

// chase-rig follow state: the camera lags the squad laterally, eases its
// distance with the crowd and rolls a few degrees into a hard steer
let camX = -0.56, camCrowd = 0.3, camRoll = 0;

function setCamRig(i) {
  camRig = ((i % CAM_RIGS.length) + CAM_RIGS.length) % CAM_RIGS.length;
  frameCfg = computeFraming(camera.aspect);
  camX = X * 0.56;
  toast('CAMERA: ' + CAM_RIGS[camRig]);
}

function resize() {
  const W = window.innerWidth, H = window.innerHeight;
  const a = W / H;
  let w, h;
  if (a >= 1) {
    // PC / landscape: use the whole window
    w = W; h = H;
  } else {
    // phones: keep a portrait stage that fits the screen
    h = H; w = Math.min(W, h * 9 / 16);
  }
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  stage.style.fontSize = Math.max(10, Math.min(18, w / 40)) + 'px';
  renderer.setSize(w, h, false);
  if (composer) composer.setSize(w, h);
  camera.aspect = w / h;
  frameCfg = computeFraming(camera.aspect);
  camera.fov = frameCfg.fov;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ world
const world = buildWorld(scene, renderer);
scene.environment = world.envMap;

// ------------------------------------------------------------------ post (bloom)
{
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.9);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

// ------------------------------------------------------------------ effects
// particles
const PT = { max: MAXPT, n: 0, pos: new Float32Array(MAXPT * 3), col: new Float32Array(MAXPT * 3), size: new Float32Array(MAXPT), life: new Float32Array(MAXPT), maxLife: new Float32Array(MAXPT), vel: new Float32Array(MAXPT * 3), grav: new Float32Array(MAXPT) };
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(PT.pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aColor', new THREE.BufferAttribute(PT.col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(PT.size, 1).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  const partTex = canvasTex(64, 64, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }, { srgb: false });
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTex: { value: partTex } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; varying vec3 vC;
      void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (320.0 / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); if (t.a < 0.02) discard;
        gl_FragColor = vec4(vC * (0.4 + t.a), t.a); }`,
  });
  PT.points = new THREE.Points(g, mat);
  PT.points.frustumCulled = false;
  PT.points.renderOrder = 5;
  scene.add(PT.points);
  PT.geo = g;
}
function burst(x, y, d, n, spd, r, g, b, size, life, grav = 0, up = 0) {
  for (let i = 0; i < n && PT.n < PT.max; i++) {
    const k = PT.n++;
    const a = Math.random() * TAU, e = Math.random() * 2 - 1, s = spd * (0.35 + Math.random() * 0.65);
    const c = Math.sqrt(1 - e * e);
    PT.pos[k * 3] = x; PT.pos[k * 3 + 1] = y; PT.pos[k * 3 + 2] = -d;
    PT.vel[k * 3] = Math.cos(a) * c * s;
    PT.vel[k * 3 + 1] = Math.abs(e) * s + up;
    PT.vel[k * 3 + 2] = Math.sin(a) * c * s;
    PT.life[k] = PT.maxLife[k] = life * (0.6 + Math.random() * 0.4);
    PT.size[k] = size * (0.6 + Math.random() * 0.6);
    PT.col[k * 3] = r; PT.col[k * 3 + 1] = g; PT.col[k * 3 + 2] = b;
    PT.grav[k] = grav;
  }
}
function updateParticles(dt) {
  let n = 0;
  for (let i = 0; i < PT.n; i++) {
    PT.life[i] -= dt;
    if (PT.life[i] <= 0) continue;
    const k = i * 3;
    PT.vel[k + 1] += PT.grav[i] * dt;
    PT.pos[k] += PT.vel[k] * dt;
    PT.pos[k + 1] += PT.vel[k + 1] * dt;
    PT.pos[k + 2] += PT.vel[k + 2] * dt;
    if (PT.pos[k + 1] < 0.02) { PT.pos[k + 1] = 0.02; PT.vel[k + 1] *= -0.35; }
    PT.size[i] *= Math.max(0, 1 - dt * 1.5);
    if (n !== i) {
      PT.pos[n * 3] = PT.pos[k]; PT.pos[n * 3 + 1] = PT.pos[k + 1]; PT.pos[n * 3 + 2] = PT.pos[k + 2];
      PT.vel[n * 3] = PT.vel[k]; PT.vel[n * 3 + 1] = PT.vel[k + 1]; PT.vel[n * 3 + 2] = PT.vel[k + 2];
      PT.life[n] = PT.life[i]; PT.maxLife[n] = PT.maxLife[i];
      PT.size[n] = PT.size[i];
      PT.col[n * 3] = PT.col[k]; PT.col[n * 3 + 1] = PT.col[k + 1]; PT.col[n * 3 + 2] = PT.col[k + 2];
      PT.grav[n] = PT.grav[i];
    }
    n++;
  }
  PT.n = n;
  PT.geo.setDrawRange(0, n);
  PT.geo.attributes.position.needsUpdate = true;
  PT.geo.attributes.aColor.needsUpdate = true;
  PT.geo.attributes.aSize.needsUpdate = true;
}

// shock rings
const rings = [];
{
  const geo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    m.visible = false; m.renderOrder = 4;
    scene.add(m);
    rings.push({ m, life: 0, max: 1, r0: 1, r1: 5 });
  }
}
function ring(x, d, r0, r1, life, color) {
  const r = rings.find(q => q.life <= 0) || rings[0];
  r.life = r.max = life; r.r0 = r0; r.r1 = r1;
  r.m.material.color.set(color).multiplyScalar(1.25);
  r.m.position.set(x, 0.08, -d);
  r.m.visible = true;
}
function updateRings(dt) {
  for (const r of rings) {
    if (r.life <= 0) continue;
    r.life -= dt;
    if (r.life <= 0) { r.m.visible = false; continue; }
    const t = 1 - r.life / r.max;
    const s = lerp(r.r0, r.r1, 1 - Math.pow(1 - t, 2));
    r.m.scale.setScalar(s);
    r.m.material.opacity = 1 - t;
  }
}

// confetti — one instanced draw call of fluttering paper strips for the
// victory celebration. Pieces burst up around the squad, tumble down and
// settle flat on the deck before fading out.
const CONF_MAX = 460;
const CONF_COLORS = [0xffd24a, 0x66e0ff, 0xffffff, 0xff66e0, 0x7dff9f, 0xff9a3a, 0x4a9cff];
const confetti = { pieces: [], mesh: null };
{
  const geo = new THREE.PlaneGeometry(0.11, 0.18);
  const mat = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide, roughness: 0.42, metalness: 0.12, envMapIntensity: 0.9,
  });
  const im = new THREE.InstancedMesh(geo, mat, CONF_MAX);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  im.castShadow = false;
  im.count = 0;
  const c = new THREE.Color();
  for (let i = 0; i < CONF_MAX; i++) {
    im.setColorAt(i, c.setHex(CONF_COLORS[i % CONF_COLORS.length]));
    confetti.pieces.push({ life: 0 });
  }
  im.instanceColor.needsUpdate = true;
  scene.add(im);
  confetti.mesh = im;
}
const _cq = new THREE.Quaternion(), _ce = new THREE.Euler();
const _cp = new THREE.Vector3(), _cs = new THREE.Vector3(1, 1, 1), _cm = new THREE.Matrix4();
function confettiBurst(x, d, n, spread = 2, power = 8) {
  for (let k = 0; k < n; k++) {
    let q = null;
    for (const p of confetti.pieces) if (p.life <= 0) { q = p; break; }
    if (!q) return;
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * spread;
    q.x = x + Math.cos(a) * r;
    q.z = -d + Math.sin(a) * r * 0.8;
    q.y = 1.1 + Math.random() * 1.8;
    const sp = power * (0.35 + Math.random() * 0.75);
    q.vx = Math.cos(a) * sp * (0.35 + Math.random() * 0.5);
    q.vz = Math.sin(a) * sp * (0.35 + Math.random() * 0.5);
    q.vy = 5.4 + Math.random() * 5.2;
    q.rx = Math.random() * TAU; q.ry = Math.random() * TAU; q.rz = Math.random() * TAU;
    q.wx = rand(-8, 8); q.wy = rand(-10, 10); q.wz = rand(-8, 8);
    q.ph = Math.random() * TAU;
    q.sway = 0.8 + Math.random() * 1.4;
    q.life = 2.8 + Math.random() * 2.2;
    q.sc = 0.7 + Math.random() * 0.8;
    q.land = false;
  }
}
function updateConfetti(dt) {
  let n = 0;
  for (const q of confetti.pieces) {
    if (q.life <= 0) continue;
    q.life -= dt;
    if (q.life <= 0) continue;
    if (!q.land) {
      q.vy = Math.max(-3.4, q.vy - 9.4 * dt);
      q.x += (q.vx + Math.sin(time * q.sway + q.ph) * 0.85) * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      q.vx *= 1 - Math.min(0.9, dt * 1.6);
      q.vz *= 1 - Math.min(0.9, dt * 1.6);
      q.rx += q.wx * dt; q.ry += q.wy * dt; q.rz += q.wz * dt;
      if (q.y <= 0.05) {
        q.y = 0.05; q.land = true;
        q.rx = -Math.PI / 2; q.ry = Math.random() * TAU; q.rz = 0;
      }
    }
    const sc = q.sc * Math.min(1, q.life / 0.55);
    _cq.setFromEuler(_ce.set(q.rx, q.ry, q.rz));
    _cp.set(q.x, q.y, q.z);
    _cs.set(sc, sc, sc);
    _cm.compose(_cp, _cq, _cs);
    confetti.mesh.setMatrixAt(n, _cm);
    n++;
  }
  confetti.mesh.count = n;
  if (n) confetti.mesh.instanceMatrix.needsUpdate = true;
}
function clearConfetti() {
  for (const q of confetti.pieces) q.life = 0;
  confetti.mesh.count = 0;
}

// popups (floating text)
const POPS = [];
function makePopup() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  sp.renderOrder = 12; sp.visible = false; sp.scale.set(2.6, 1.3, 1);
  scene.add(sp);
  return { c, ctx, tex, sp, life: 0, max: 1, x: 0, y: 0, d: 0 };
}
for (let i = 0; i < 28; i++) POPS.push(makePopup());
function popup(text, x, y, d, fill, stroke, px, life, scale) {
  const L = POPS.find(p => p.life <= 0) || POPS[0];
  const ctx = L.ctx;
  ctx.clearRect(0, 0, 256, 128);
  const font = (s) => `900 ${s}px "Arial Black","Segoe UI Black",Impact,Arial`;
  let size = Math.min(88, 44 + px * 16);
  ctx.font = font(size);
  // long gate expressions shrink to fit the sprite instead of spilling out
  while (size > 18 && ctx.measureText(text).width > 236) { size -= 2; ctx.font = font(size); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(6, size * 0.11); ctx.strokeStyle = stroke; ctx.strokeText(text, 128, 64);
  const g = ctx.createLinearGradient(0, 20, 0, 108);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, fill); g.addColorStop(1, fill);
  ctx.fillStyle = g; ctx.fillText(text, 128, 64);
  L.tex.needsUpdate = true;
  L.life = L.max = life; L.x = x; L.y = y; L.d = d;
  L.sp.visible = true;
  L.sp.scale.set(scale * 2.2 * uiK, scale * 1.1 * uiK, 1);
}
function updatePops(dt) {
  for (const L of POPS) {
    if (L.life <= 0) continue;
    L.life -= dt;
    if (L.life <= 0) { L.sp.visible = false; continue; }
    const t = 1 - L.life / L.max;
    L.sp.position.set(L.x, L.y + t * 1.6, -(L.d + t * 0.4));
    L.sp.material.opacity = 1 - Math.pow(t, 2.2);
  }
}

// labels (counter pills)
function mkLabel(cw, ch, ww, wh) {
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  sp.renderOrder = 11; sp.scale.set(ww, wh, 1); sp.visible = false;
  scene.add(sp);
  return { c, ctx, tex, sp, w: cw, h: ch, w0: ww, h0: wh, last: null };
}
function fitLabel(L, k) { L.sp.scale.set(L.w0 * k, L.h0 * k, 1); }
function drawPill(L, text, kind) {
  const key = kind + text;
  if (L.last === key) return;
  L.last = key;
  const x = L.ctx, w = L.w, h = L.h, red = kind === 'enemy';
  x.clearRect(0, 0, w, h);
  const r = h * 0.42;
  x.save();
  x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 10; x.shadowOffsetY = 6;
  x.beginPath();
  x.moveTo(r + 26, 8); x.lineTo(w - r - 8, 8);
  x.quadraticCurveTo(w - 8, 8, w - 8, 8 + r);
  x.lineTo(w - 8, h - 8 - r);
  x.quadraticCurveTo(w - 8, h - 8, w - r - 8, h - 8);
  x.lineTo(r + 26, h - 8);
  x.quadraticCurveTo(8, h - 8, 8, h - 8 - r);
  x.lineTo(8, 8 + r);
  x.quadraticCurveTo(8, 8, r + 26, 8);
  x.closePath();
  const g = x.createLinearGradient(0, 8, 0, h - 8);
  if (red) { g.addColorStop(0, '#ff6a5e'); g.addColorStop(1, '#b3141d'); }
  else { g.addColorStop(0, '#6fb4ff'); g.addColorStop(1, '#1a46c0'); }
  x.fillStyle = g; x.fill();
  x.lineWidth = 6; x.strokeStyle = '#fff'; x.stroke();
  x.restore();
  // icon badge
  x.beginPath(); x.arc(h * 0.52, h / 2, h * 0.34, 0, TAU);
  x.fillStyle = red ? '#ffd9c9' : '#d7ecff'; x.fill();
  x.lineWidth = 4; x.strokeStyle = '#fff'; x.stroke();
  // tiny helmet icon
  x.fillStyle = red ? '#8a0d18' : '#0b2a7a';
  x.beginPath(); x.arc(h * 0.52, h * 0.46, h * 0.17, Math.PI, 0); x.fill();
  x.fillRect(h * 0.52 - h * 0.2, h * 0.46, h * 0.4, h * 0.07);
  x.font = `900 ${Math.round(h * 0.52)}px "Arial Black","Segoe UI Black",Impact,Arial`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 8; x.strokeStyle = red ? '#5a0508' : '#08245e';
  x.strokeText(text, w * 0.56, h * 0.54);
  x.fillStyle = '#fff';
  x.fillText(text, w * 0.56, h * 0.54);
  L.tex.needsUpdate = true;
}
const lblSquad = mkLabel(320, 96, 3.4, 1.02);
const lblEnemy = mkLabel(320, 96, 3.4, 1.02);
const lblCage = mkLabel(320, 88, 2.9, 0.8);
function drawCageBar() {
  const t = Math.ceil(cage.hp);
  if (lblCage.last === t) return;
  lblCage.last = t;
  const x = lblCage.ctx;
  x.clearRect(0, 0, 320, 88);
  const bx = 62, by = 26, bw = 244, bh = 34, f = clamp(cage.hp / CAGE_HP, 0, 1);
  x.save(); x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 8; x.shadowOffsetY = 5;
  x.fillStyle = '#16181f'; x.fillRect(bx - 6, by - 6, bw + 12, bh + 12); x.restore();
  x.lineWidth = 4; x.strokeStyle = '#fff'; x.strokeRect(bx - 6, by - 6, bw + 12, bh + 12);
  if (f > 0) {
    const g = x.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0, '#fff27a'); g.addColorStop(0.5, '#ffc21a'); g.addColorStop(1, '#e08a00');
    x.fillStyle = g; x.fillRect(bx, by, Math.max(16, bw * f), bh);
  }
  // padlock badge
  x.fillStyle = '#ffc21a'; x.strokeStyle = '#fff'; x.lineWidth = 4;
  x.beginPath(); x.arc(34, 44, 30, 0, TAU); x.fill(); x.stroke();
  x.strokeStyle = '#3a2500'; x.lineWidth = 6;
  x.beginPath(); x.arc(34, 38, 10, Math.PI, 0); x.stroke();
  x.fillStyle = '#3a2500'; x.fillRect(20, 38, 28, 22);
  lblCage.tex.needsUpdate = true;
}

// ------------------------------------------------------------------ gates
// Every row is TWO walls that meet on the centre line: together they cover the
// whole deck, so there is no gap to slip through — the squad always commits to
// the half it is steering toward and the other wall shatters. Each wall prints an
// arithmetic expression, and that expression is how many soldiers it adds or
// takes, so the row is a maths problem rather than a colour to chase.
const GATE_H = 1.78, GATE_TILT = -0.52, GATE_Y = 1.22;
const GATE_W = DECK_HW - 0.04;           // one wall covers half the road
const GATE_LANE = GATE_W / 2;            // wall centres, seam on the centre line
const GATE_TEX_W = 768;
const GATE_TEX_H = Math.round(GATE_TEX_W * (GATE_H * 0.91) / (GATE_W * 0.93));
function gateNumTex(text, color) {
  return canvasTex(GATE_TEX_W, GATE_TEX_H, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const font = (px) => `900 ${px}px "Arial Black","Segoe UI Black",Impact,Arial`;
    let size = Math.round(h * 0.94);
    x.font = font(size);
    while (size > 20 && x.measureText(text).width > w * 0.92) {
      size -= 4;
      x.font = font(size);
    }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    const lw = Math.max(6, size * 0.18);
    x.lineWidth = lw; x.strokeStyle = '#ffffff'; x.strokeText(text, w / 2, h / 2);
    x.lineWidth = lw * 0.45; x.strokeStyle = '#062a7a'; x.strokeText(text, w / 2, h / 2);
    const g = x.createLinearGradient(0, h * 0.12, 0, h * 0.88);
    g.addColorStop(0, '#a8ccff'); g.addColorStop(0.4, color); g.addColorStop(1, '#062a7a');
    x.fillStyle = g; x.fillText(text, w / 2, h / 2);
  });
}
const gateTexDefault = gateNumTex('3+2\u00d75', '#0b41c4');
const gateTexCache = new Map();
function gateTexFor(g) {
  let t = gateTexCache.get(g.label);
  if (!t) { t = gateNumTex(g.label, g.color); gateTexCache.set(g.label, t); }
  return t;
}
// Both walls wear the same glass: colour never gives the answer away, the sum
// does. A wall is a wall, whichever side of the bridge it lands on.
const GATE_STYLE = { color: '#0b41c4', tint: [0.2, 0.45, 1.0] };

const gateSlabGeo = (() => {
  const w = GATE_W - 0.04, h = GATE_H - 0.16, r = 0.26, s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return new THREE.ExtrudeGeometry(s, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3, curveSegments: 6 }).translate(0, 0, -0.16);
})();
const glowTex = canvasTex(128, 128, (x, w, h) => {
  const g = x.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
});
// ------------------------------------------------------------------ missiles
// Homing missile battery — unlocked by the MISSILE power-up. The pool owns the
// flight and the visuals; impacts come back here and the damage is applied.
const missiles = createMissiles(scene, {
  max: 24,
  glowTex,
  onTrail: (x, y, d, hot) => {
    if (PT.n < PT.max - 80) burst(x, y, d, 1, 0.7, 2.3 * hot, 1.1 * hot, 0.3 * hot, 0.5, 0.42);
  },
});
let missileT = 0;
const gateFrameMat = new THREE.MeshPhysicalMaterial({
  color: 0xe4ecff, roughness: 0.3, metalness: 0.85, envMapIntensity: 0.8, clearcoat: 1,
});
const gatePool = [];
const gateNumGeo = new THREE.PlaneGeometry(GATE_W * 0.93, GATE_H * 0.91);
for (let i = 0; i < 64; i++) {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(gateSlabGeo, new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03,
    envMapIntensity: 0.35, transparent: true, opacity: 0.5, depthWrite: false,
  }));
  g.add(slab);
  // metal frame around the glass — one material per pool slot so a row can fade
  // in from the horizon instead of popping into existence
  const frameMat = gateFrameMat.clone();
  frameMat.transparent = true;
  const fw = GATE_W + 0.04, fh = GATE_H + 0.04, t = 0.1, d = 0.24;
  const barTop = new THREE.Mesh(new THREE.BoxGeometry(fw, t, d), frameMat);
  barTop.position.set(0, fh / 2 - t / 2 + 0.02, 0);
  const barBot = barTop.clone(); barBot.position.y = -fh / 2 + t / 2 - 0.02;
  const barL = new THREE.Mesh(new THREE.BoxGeometry(t, fh, d), frameMat);
  barL.position.set(-fw / 2 + t / 2 - 0.02, 0, 0);
  const barR = barL.clone(); barR.position.x = fw / 2 - t / 2 + 0.02;
  g.add(barTop, barBot, barL, barR);
  // number: dark underlay + bright face for parallax depth
  const numBack = new THREE.Mesh(gateNumGeo, new THREE.MeshBasicMaterial({
    map: gateTexDefault, transparent: true, alphaTest: 0.4, depthWrite: false, color: 0x6a8fbf, opacity: 0.8,
  }));
  numBack.position.z = -0.055;
  g.add(numBack);
  const num = new THREE.Mesh(gateNumGeo, new THREE.MeshBasicMaterial({
    map: gateTexDefault, transparent: true, alphaTest: 0.4, depthWrite: false, toneMapped: false,
  }));
  num.position.z = 0.02;
  g.add(num);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color(0.3, 0.6, 1.4), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.16,
  }));
  glow.scale.set(7.0, 3.2, 1);
  glow.position.z = -0.1;
  g.add(glow);
  g.rotation.x = GATE_TILT;
  g.visible = false;
  scene.add(g);
  gatePool.push({ g, slab, num, numBack, glow, frameMat, pop: 0 });
}

// ------------------------------------------------------------------ cage + hero + crate
const cage = { hp: CAGE_HP, open: false, flash: 0, group: new THREE.Group(), bars: [], debris: [] };
{
  scene.add(cage.group);
  cage.group.position.set(CAGE_X, 0, -CAGE_D);
  const hz = canvasTex(256, 64, (x, w, h) => {
    x.fillStyle = '#f5b90a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#20222a';
    for (let i = -64; i < w + 64; i += 64) {
      x.beginPath(); x.moveTo(i, h); x.lineTo(i + 32, h); x.lineTo(i + 64, 0); x.lineTo(i + 32, 0); x.fill();
    }
  }, { repeat: [3, 1] });
  const side = new THREE.MeshStandardMaterial({ map: hz, roughness: 0.55, metalness: 0.15 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x596076, roughness: 0.42, metalness: 0.75 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.56, 3.8), [side, side, steel, steel, side, side]);
  base.position.y = 0.28; base.castShadow = base.receiveShadow = true;
  cage.group.add(base);
  cage.mat = new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.26, metalness: 0.7, envMapIntensity: 1.15 });
  const mk = (geo, x, y, z, ry = 0, mat = cage.mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.userData.home = [x, y, z]; m.userData.ry = ry;
    m.castShadow = true;
    cage.group.add(m); cage.bars.push(m);
    return m;
  };
  const barG = new THREE.CylinderGeometry(0.07, 0.07, 2.7, 8);
  const postG = new THREE.CylinderGeometry(0.13, 0.13, 2.9, 10);
  const railG = new THREE.BoxGeometry(3.26, 0.18, 0.18);
  for (let k = 1; k < 6; k++) {
    const o = -1.5 + k * 0.5;
    mk(barG, o, 1.9, 1.5); mk(barG, o, 1.9, -1.5); mk(barG, 1.5, 1.9, o); mk(barG, -1.5, 1.9, o);
  }
  for (const sx of [-1.5, 1.5]) for (const sz of [-1.5, 1.5]) {
    mk(postG, sx, 2.0, sz); mk(new THREE.SphereGeometry(0.19, 10, 8), sx, 3.52, sz);
  }
  for (const [x, z, ry] of [[0, 1.5, 0], [0, -1.5, 0], [1.5, 0, Math.PI / 2], [-1.5, 0, Math.PI / 2]]) {
    mk(railG, x, 3.3, z, ry); mk(railG, x, 1.1, z, ry);
  }
  mk(new THREE.BoxGeometry(0.52, 0.46, 0.22), 0, 1.1, 1.66, 0, steel);
  // ornate dome + finial + gold trim
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.86, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cage.mat);
  dome.position.y = 3.3; dome.castShadow = true;
  cage.group.add(dome);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), cage.mat);
  fin.position.y = 4.18; fin.castShadow = true;
  cage.group.add(fin);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 8), cage.mat);
  tip.position.y = 4.33; tip.castShadow = true;
  cage.group.add(tip);
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.045, 8, 24), steel);
  ring1.rotation.x = Math.PI / 2; ring1.position.y = 3.3;
  cage.group.add(ring1);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.04, 8, 24), cage.mat);
  ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.26;
  cage.group.add(ring2);
  cage.beacon = mk(new THREE.SphereGeometry(0.21, 10, 8), 1.5, 3.86, 1.5, 0,
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.1) }));
  cage.beacon.castShadow = false;
  const beaconGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color(3, 0.3, 0.1), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.7,
  }));
  beaconGlow.scale.set(1.4, 1.4, 1);
  beaconGlow.position.set(1.5, 3.86, 1.5);
  cage.group.add(beaconGlow);
  cage.beaconGlow = beaconGlow;
}

const hero = {
  state: 'caged', x: CAGE_X, d: CAGE_D, y: 0, jt: 0, land: 0, cd: 0, kick: 0,
  ...buildHero(),
};
scene.add(hero.group);
hero.group.position.set(CAGE_X, 0, -CAGE_D);

// ATK crate
const crate = { state: 'none', x: 0, d: 0, y: 0, t: 0, x0: 0, d0: 0, x1: 0, d1: 0 };
{
  const tx = canvasTex(128, 128, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ffe066'); gr.addColorStop(1, '#ff9d0a');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#7a3d00'; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10);
    x.fillStyle = '#ff2fc8'; x.strokeStyle = '#fff'; x.lineWidth = 6; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(64, 20); x.lineTo(104, 62); x.lineTo(80, 62); x.lineTo(80, 106);
    x.lineTo(48, 106); x.lineTo(48, 62); x.lineTo(24, 62); x.closePath(); x.stroke(); x.fill();
  });
  crate.group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    map: tx, roughness: 0.3, metalness: 0.4, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.6,
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), bodyMat);
  box.castShadow = true;
  crate.group.add(box);
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x8b93a8, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.1 });
  for (const y of [-0.32, 0.32]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.1, 1.04), bandMat);
    band.position.y = y; band.castShadow = true;
    crate.group.add(band);
  }
  for (const x of [-0.36, 0.36]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.03, 1.03), bandMat);
    edge.position.x = x; edge.castShadow = true;
    crate.group.add(edge);
  }
  // extruded gold star on the front
  {
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.13 : 0.3;
      const a = i / 10 * Math.PI * 2 + Math.PI / 2;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i) sh.lineTo(px, py); else sh.moveTo(px, py);
    }
    const star = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }),
      new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.2, metalness: 1, envMapIntensity: 1.2, emissive: 0x8a5200, emissiveIntensity: 0.5 }));
    star.position.set(0, 0, -0.52); star.rotation.y = Math.PI;
    crate.group.add(star);
  }
  const gl = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color(2.2, 1.6, 0.4), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  gl.scale.set(4.2, 4.2, 1);
  crate.group.add(gl);
  crate.group.visible = false;
  scene.add(crate.group);
}

// ------------------------------------------------------------------ power crates
// One reusable crate visual per pickup slot; the level decides what sits on the
// bridge and where. Pickups live in world space, off the gate lane, so taking
// one always costs a lane change.
const powerCrates = [];
for (let i = 0; i < 6; i++) powerCrates.push(createPowerCrate(scene, glowTex));
const powerPickups = [];
const POWER_X = [-1.7, 1.5, -2.4, 2.2, 0.2, -0.6];

// ------------------------------------------------------------------ soldiers + enemies
const soldierPal = PAL.soldier, poweredPal = PAL.powered, enemyPal = PAL.enemy;
const matKeyOf = (pal) => (p) => Object.keys(pal).find(k => pal[k] === p.mat);
const solParts = soldierParts(soldierPal).map(p => ({ ...p, matKey: matKeyOf(soldierPal)(p) }));
const enParts = enemyParts(enemyPal).map(p => ({ ...p, matKey: matKeyOf(enemyPal)(p) }));
const soldierR = new UnitRenderer(scene, solParts, MAXS);
const enemyR = new UnitRenderer(scene, enParts, MAXE, { faceOffset: 0, shadow: false });
const poweredParts = soldierParts(poweredPal).map(p => ({ ...p, matKey: matKeyOf(poweredPal)(p) }));
const poweredR = new UnitRenderer(scene, poweredParts, MAXS);
let usingPowered = false;

// ------------------------------------------------------------------ bullets
const bullets = [];
const bulletMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.085, 0.085, 0.8),
  new THREE.MeshBasicMaterial({
    color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false,
  }), MAXP);
bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
bulletMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3);
bulletMesh.frustumCulled = false;
bulletMesh.count = 0;
scene.add(bulletMesh);

// ------------------------------------------------------------------ boss
// Every boss carries a fixed, round amount of damage-to-kill that is printed
// above its head from the moment it walks in. Hits subtract from that number,
// the bar under it drains, and the boss dies exactly when the number hits zero.
const BOSS_HP = [2500, 4500, 12000];   // default by kind: grunt, brute, fortress
// The live squad cap is 150 now, so the printed damage-to-kill numbers are
// scaled to keep a boss fight in the same window it had with the old crowd.
const BOSS_HP_SCALE = 0.5;
const bosses = [];
const fmtNum = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function spawnBoss(kind, x, d, drop, hp) {
  const model = buildBoss(kind);
  const sc = kind === 2 ? 1.35 : kind === 1 ? 1.12 : 1;
  model.group.scale.setScalar(sc);
  scene.add(model.group);
  const hpK = kind === 2 ? 0.35 : BOSS_HP_SCALE;
  const maxHp = Math.max(1, Math.round((hp ?? BOSS_HP[kind] ?? BOSS_HP[0]) * hpK));
  const label = mkLabel(512, 256, 6.2, 3.1);
  const b = {
    kind, x, d, r: 2.2 * sc, sc, hp: maxHp, maxHp, dealt: 0, ...model, label,
    speed: 2.2 + kind * 0.4, active: false, dead: false, dying: 0,
    wind: 0, windD: 0, smashT: 0.35, flash: 0, acc: 0, accT: 0.14,
    roar: 0, fall: 0, contact: false, drop,
    shootT: rand(1.2, 2.6), shootA: 0,
    walkPh: Math.random() * TAU, walkAmp: 0, moving: false,
  };
  bosses.push(b);
  return b;
}
// The number over a boss is the exact damage still required to kill it:
// it ticks down with every hit and the boss dies when it reaches zero.
function drawBossBar(b) {
  const t = Math.max(0, Math.ceil(b.hp));
  const key = t + ':' + b.maxHp;
  if (b.label.last === key) return;
  b.label.last = key;
  const x = b.label.ctx, w = b.label.w, h = b.label.h;
  x.clearRect(0, 0, w, h);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';

  // caption
  x.font = '900 26px "Arial Black","Segoe UI Black",Impact,Arial';
  x.lineWidth = 9; x.strokeStyle = 'rgba(10,4,8,0.85)';
  x.strokeText('DAMAGE TO KILL', w / 2, 26);
  x.fillStyle = '#ffe6c2'; x.fillText('DAMAGE TO KILL', w / 2, 26);

  // the number itself
  const txt = fmtNum(t);
  x.font = '900 104px "Arial Black","Segoe UI Black",Impact,Arial';
  x.save();
  x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 10; x.shadowOffsetY = 6;
  x.lineWidth = 22; x.strokeStyle = 'rgba(24,6,10,0.92)'; x.strokeText(txt, w / 2, 88);
  x.restore();
  const g = x.createLinearGradient(0, 36, 0, 138);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.48, '#ffe14a'); g.addColorStop(1, '#ff9d0a');
  x.fillStyle = g; x.fillText(txt, w / 2, 88);

  // remaining-damage bar + max on the right
  const bx = 34, by = 168, bw = w - 165, bh = 26;
  x.save();
  x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 6; x.shadowOffsetY = 4;
  x.fillStyle = '#16181f'; x.fillRect(bx - 5, by - 5, bw + 10, bh + 10);
  x.restore();
  x.lineWidth = 4; x.strokeStyle = '#fff'; x.strokeRect(bx - 5, by - 5, bw + 10, bh + 10);
  const f = clamp(b.hp / b.maxHp, 0, 1);
  const g2 = x.createLinearGradient(0, by, 0, by + bh);
  g2.addColorStop(0, '#ff9a7a'); g2.addColorStop(0.5, '#e0222c'); g2.addColorStop(1, '#8a0b14');
  x.fillStyle = g2; x.fillRect(bx, by, Math.max(4, bw * f), bh);
  x.font = '900 24px "Arial Black","Segoe UI Black",Impact,Arial';
  x.lineWidth = 7; x.strokeStyle = 'rgba(10,4,8,0.85)';
  x.strokeText(fmtNum(b.maxHp), w - 46, by + bh / 2 + 1);
  x.fillStyle = '#fff'; x.fillText(fmtNum(b.maxHp), w - 46, by + bh / 2 + 1);

  b.label.tex.needsUpdate = true;
}

// ------------------------------------------------------------------ decals (final boss slam)
const dangerTex = canvasTex(256, 256, (x, w, h) => {
  x.clearRect(0, 0, w, h);
  x.translate(w / 2, h / 2);
  const g = x.createRadialGradient(0, 0, 20, 0, 0, 122);
  g.addColorStop(0, 'rgba(255,40,30,0.05)');
  g.addColorStop(0.8, 'rgba(255,40,30,0.38)');
  g.addColorStop(1, 'rgba(255,40,30,0)');
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, 124, 0, TAU); x.fill();
  x.strokeStyle = 'rgba(255,235,220,1)'; x.lineWidth = 7;
  x.beginPath(); x.arc(0, 0, 112, 0, TAU); x.stroke();
  x.setLineDash([22, 14]); x.lineWidth = 5; x.strokeStyle = 'rgba(255,120,90,1)';
  x.beginPath(); x.arc(0, 0, 88, 0, TAU); x.stroke();
});
const danger = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: dangerTex, color: new THREE.Color(1.8, 0.35, 0.25), transparent: true, depthWrite: false, opacity: 0, fog: false }));
danger.renderOrder = 2; danger.visible = false;
scene.add(danger);
const crackTex = canvasTex(512, 512, (x, w, h) => {
  x.clearRect(0, 0, w, h);
  x.translate(w / 2, h / 2);
  const sc = x.createRadialGradient(0, 0, 0, 0, 0, 150);
  sc.addColorStop(0, 'rgba(8,8,14,0.7)'); sc.addColorStop(1, 'rgba(8,8,14,0)');
  x.fillStyle = sc; x.fillRect(-256, -256, 512, 512);
  x.strokeStyle = 'rgba(14,16,24,0.92)'; x.lineCap = 'round';
  for (let i = 0; i < 18; i++) {
    let a = i / 18 * TAU + Math.random() * 0.3, r = 8;
    let px = Math.cos(a) * r, py = Math.sin(a) * r;
    while (r < 240) {
      r += 16 + Math.random() * 26; a += (Math.random() - 0.5) * 0.55;
      const nx = Math.cos(a) * r, ny = Math.sin(a) * r;
      x.lineWidth = 1 + 9 * (1 - r / 245);
      x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
      if (Math.random() < 0.3) {
        const b = a + (Math.random() < 0.5 ? 1 : -1) * 0.9, l = 14 + Math.random() * 30;
        x.lineWidth = 1 + 4 * (1 - r / 245);
        x.beginPath(); x.moveTo(nx, ny); x.lineTo(nx + Math.cos(b) * l, ny + Math.sin(b) * l); x.stroke();
      }
      px = nx; py = ny;
    }
  }
});
const crack = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, opacity: 0 }));
crack.renderOrder = 1; crack.visible = false;
scene.add(crack);
let crackT = 0;

// ------------------------------------------------------------------ game state
let state = 'menu', time = 0, gt = 0, timeScale = 1, slowT = 0, endT = 0, shake = 0;
let X = -1, targetX = -1, D = 0, hw = 0.3, hd = 0.3, atk = false, kills = 0, peakN = 1;
let gateCombo = 0, gateComboT = 0, popBudget = 0;
let enemyFireT = 0, chargeThreat = 99;
let bossSpawned = [];
let loseMsg = '', fovK = 0, cheerK = 0, hudPr = -1;
let winCheerT = 0, winBurstT = 0, winFireT = 0;

// ------------------------------------------------------------------ power-ups
// Timed effects tick down in seconds; the missile battery is permanent for the
// run. The host applies every effect — powers.js only supplies data + visuals.
const powerState = { rage: 0, shield: 0, freeze: 0 };
let missileBattery = false, hudDps = -1, pwLast = '';
const MISSILE_INT = 2.2, MISSILE_DMG = 320;
const fmtShort = (v) => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'K' : String(Math.round(v));
const rageOn = () => powerState.rage > 0;
function squadDps() {
  const m = rageOn() ? 2 : 1;
  let dps = aliveN() * (atk ? 2.6 : 1) * m / FIRE_INT;
  if (hero.state === 'joined') dps += (atk ? 9 : 4.5) * m / 0.25;
  if (missileBattery) dps += MISSILE_DMG / MISSILE_INT;
  return dps;
}
function updatePowerHud() {
  let s = '';
  for (const id of POWER_ORDER) {
    if (id === 'missile') {
      if (missileBattery) s += `<span class="pwc" style="color:${POWERS.missile.color}"><i>MISSILE</i><s>ON</s></span>`;
      continue;
    }
    if (powerState[id] > 0) {
      s += `<span class="pwc" style="color:${POWERS[id].color}"><i>${POWERS[id].name}</i><s>${Math.ceil(powerState[id])}s</s></span>`;
    }
  }
  if (s !== pwLast) { pwLast = s; pwEl.innerHTML = s; }
}

const soldiers = [];
const enemies = [];
const gates = [];
const gateRows = [];

function addSoldiers(n, x, d, spread) {
  for (let i = 0; i < n && soldiers.length < MAXS; i++) {
    soldiers.push({
      x: x + rand(-spread, spread), d: d + rand(-spread, spread),
      cd: Math.random() * FIRE_INT, phase: Math.random() * TAU, dead: false, scale: 1.15,
      rate: 0.85 + Math.random() * 0.3, walk: 0.16 + Math.random() * 0.12,
    });
  }
  peakN = Math.max(peakN, soldiers.length);
}
function aliveN() { let n = 0; for (const s of soldiers) if (!s.dead) n++; return n; }
function killSoldier(s) {
  if (powerState.shield > 0) {
    // the shield eats the blow: a hard spark, no casualty
    burst(s.x, 0.7, s.d, 5, 4, 0.6, 1.7, 2.8, 0.5, 0.24, -4, 1);
    return;
  }
  s.dead = true;
  burst(s.x, 0.5, s.d, 8, 5, 0.35, 0.8, 2.4, 0.55, 0.3, -6, 1.5);
}
function aimTarget(x, d) {
  let bx = x, bd = d + 8, best = 1e9, boss = false;
  // the caged hero is a priority target while the shooter is in its lane
  if (!cage.open && Math.abs(x - CAGE_X) < 3.6) {
    const dd = CAGE_D - d;
    if (dd > 0.5 && dd < RANGE + 2) { bx = CAGE_X; bd = CAGE_D; best = dd * dd; }
  }
  // a live boss wins the target slot, however far up the bridge it is — unless
  // a charger is already on top of the formation, in which case the squad
  // shoots what is about to hit it first
  if (chargeThreat > 6.5) {
    for (const b of bosses) {
      if (b.dead || !b.active) continue;
      const dd = b.d - d;
      if (dd < 0.5 || dd > BOSS_RANGE) continue;
      const dx = b.x - x, dist = dx * dx + dd * dd;
      if (dist < best) { best = dist; bx = b.x; bd = b.d; boss = true; }
    }
  }
  if (!boss) {
    for (const e of enemies) {
      if (e.dead) continue;
      const dd = e.d - d;
      if (dd < 0.5 || dd > RANGE) continue;
      const dx = e.x - x, dist = dx * dx + dd * dd;
      if (dist < best) { best = dist; bx = e.x; bd = e.d; }
    }
  }
  return { x: bx, d: bd, boss };
}
function fire(x, d, type, canHitCage) {
  if (bullets.length >= MAXP) return;
  const t = aimTarget(x, d);
  const dx = t.x - x, dd = t.d - d, l = Math.hypot(dx, dd) || 1;
  bullets.push({
    x, d, ux: dx / l, ud: dd / l, s: 0, cage: !!canHitCage, boss: t.boss,
    type, max: t.boss ? BOSS_RANGE + 6 : RANGE + 2,
    dmg: (type === 3 ? 9 : type === 2 ? 4.5 : atk ? 2.6 : 1) * (rageOn() ? 2 : 1),
  });
}

// A horde rifle bolt. It is aimed at where a soldier stands right now, so a
// hard lane change can make the volley fall behind the crowd.
function fireEnemyBolt(e) {
  if (bullets.length >= MAXP) return;
  let tgt = null;
  for (let k = 0; k < 3 && !tgt; k++) {
    const s = soldiers[(Math.random() * soldiers.length) | 0];
    if (s && !s.dead) tgt = s;
  }
  const tx = (tgt ? tgt.x : X) + rand(-0.5, 0.5);
  const td = (tgt ? tgt.d : D) + rand(-0.4, 0.4);
  const dx = tx - e.x, dd = td - e.d, l = Math.hypot(dx, dd) || 1;
  bullets.push({
    x: e.x, d: e.d, y: 1.05, ux: dx / l, ud: dd / l, s: 0,
    foe: true, type: 4, max: l + 1.5, kills: 1, hitR: 1.0, big: 0,
  });
  burst(e.x, 1.15, e.d, 3, 3, 2.6, 0.7, 0.2, 0.3, 0.18);
  sfx.enemyShot();
}

// ------------------------------------------------------------------ level reset
function reset() {
  time = 0; gt = 0; timeScale = 1; slowT = 0; endT = 0; shake = 0;
  X = targetX = -1; D = 0; atk = false; kills = 0; gateCombo = 0; gateComboT = 0;
  popBudget = 0; peakN = 1; loseMsg = ''; crackT = 0; fovK = 0; cheerK = 0; hudPr = -1;
  winCheerT = 0; winBurstT = 0; winFireT = 0; clearConfetti(); hero.cheer = 0;
  enemyFireT = 2.2;
  chargeThreat = 99;
  camX = X * 0.56; camCrowd = 0.3; camRoll = 0;
  soldiers.length = 0; enemies.length = 0; bullets.length = 0; PT.n = 0;
  powerState.rage = powerState.shield = powerState.freeze = 0;
  missileBattery = false; missileT = 0; missiles.reset(); hudDps = -1; pwLast = '';
  addSoldiers(1, X, 0, 0);
  usingPowered = false;
  soldierR.meshes.forEach((m, i) => { m.material = solParts[i].mat; m.visible = true; });
  poweredR.meshes.forEach(m => { m.count = 0; });

  // horde grid
  for (let d = HORDE_D0; d <= HORDE_D1; d += HSP) {
    for (let x = HORDE_X0; x <= HORDE_X1 + 0.01; x += HSP) {
      if (x < CAGE_X + 2.2 && d < CAGE_D + 2.6) continue;
      if (enemies.length >= MAXE) break;
      enemies.push({
        x: x + rand(-0.13, 0.13), d: d + rand(-0.13, 0.13),
        // tougher the deeper the horde goes: front rows stay chewable for a
        // small squad, the back ranks soak a real beating
        hp: L.horde.hpBase + Math.floor(d / L.horde.hpDiv),
        st: 0, phase: Math.random() * TAU, dead: false, scale: 1.18,
        // per-unit animation jitter: no two enemies march in step
        rate: 0.72 + Math.random() * 0.62,
        walkIdle: 0.2 + Math.random() * 0.2,
        walkCharge: 0.46 + Math.random() * 0.2,
        walk: 0.3,
        // the horde is a mix: some break ranks and charge, the rest hold the
        // line and shoot. Chargers are the melee threat, riflemen the new one.
        charger: Math.random() < 0.38,
        // staggered first volley so the horde does not fire in one huge salute
        fireCd: rand(0.6, 4.5),
      });
    }
  }
  // gates — every row is a pair of walls laid across the whole deck. The squad
  // commits to the half it is steering toward and the other wall shatters, so
  // each row is a real decision and no row can be dodged.
  for (const t of gateTexCache.values()) t.dispose();
  gateTexCache.clear();
  gates.length = 0;
  gateRows.length = 0;
  for (const row of L.gates) {
    const d = REL * row.start;
    const pair = [];
    row.options.forEach((o, i) => {
      const g = {
        x: i === 0 ? -GATE_LANE : GATE_LANE, d,
        // the two walls of a row sit a hair apart in depth so their frames can
        // meet on the centre line without fighting over the same pixels
        zo: i === 0 ? 0.05 : -0.05,
        parts: o.parts, value: o.value, label: o.label,
        color: GATE_STYLE.color, tint: GATE_STYLE.tint,
        alive: true, pop: 0,
      };
      pair.push(g);
      gates.push(g);
    });
    gateRows.push({ d, gates: pair, done: false });
  }

  // power-up pickups — fixed spots on the deck, one lane change away from the
  // gate conveyor so grabbing one is always a trade
  powerPickups.length = 0;
  powerCrates.forEach(c => c.hide());
  (L.powers || []).forEach((p, i) => {
    const crate = powerCrates[i % powerCrates.length];
    const x = POWER_X[i % POWER_X.length];
    crate.set(p.kind);
    crate.group.visible = true;
    crate.group.scale.setScalar(1.25);
    crate.group.position.set(x, 1.05, -p.atD);
    powerPickups.push({ kind: p.kind, x, d: p.atD, taken: false, crate });
  });

  // cage / hero / crate
  cage.hp = CAGE_HP; cage.open = false; cage.flash = 0; cage.debris.length = 0;
  lblCage.last = null;
  for (const b of cage.bars) {
    b.visible = true;
    b.position.set(...b.userData.home);
    b.rotation.set(0, b.userData.ry || 0, 0);
  }
  hero.state = 'caged'; hero.x = CAGE_X; hero.d = CAGE_D; hero.cd = 0; hero.y = 0; hero.jt = 0;
  hero.group.visible = true;
  hero.group.position.set(CAGE_X, 0, -CAGE_D);
  crate.state = 'none'; crate.group.visible = false;

  for (const b of bosses) {
    scene.remove(b.group);
    scene.remove(b.label.sp);
    b.label.tex.dispose();
    b.label.sp.material.dispose();
  }
  bosses.length = 0;
  bossSpawned = L.bosses.map(() => false);
  spawnBoss(2, (HORDE_X0 + HORDE_X1) / 2 - 0.3, FORT_D - 2.6, false, L.finalHp);

  for (const L of POPS) { L.life = 0; L.sp.visible = false; }
  for (const r of rings) { r.life = 0; r.m.visible = false; }
  danger.visible = false; crack.visible = false;
  lblSquad.last = null; lblEnemy.last = null;
  flash.style.opacity = 0;
}

// ------------------------------------------------------------------ overlays
let endShown = 0, ovAction = 'start';
function showOverlay(title, cls, sub, btn, starCount = 0, action = 'start') {
  stars.className = starCount ? 'show' : '';
  stars.innerHTML = starCount
    ? [0, 1, 2].map(i => `<span class="${i < starCount ? 'on' : ''}">&#9733;</span>`).join('')
    : '';
  ovt.innerHTML = title; ovt.className = cls;
  ovs.innerHTML = sub; ovb.textContent = btn;
  ovAction = action;
  ov.classList.add('show');
  endShown = performance.now();
}

/** Load a stage and start running it. */
function startLevel(i) {
  initAudio();
  levelIndex = clamp(i, 0, LEVELS.length - 1);
  applyLevel(LEVELS[levelIndex]);
  if (world.setTheme) world.setTheme(L.theme);
  reset();
  state = 'play';
  ov.classList.remove('show');
  sfx.click();
}

function startGame() { startLevel(0); }

function nextStage() {
  if (levelIndex < LEVELS.length - 1) startLevel(levelIndex + 1);
  else startLevel(0);
}

function toMenu() {
  levelIndex = 0;
  applyLevel(LEVELS[0]);
  if (world.setTheme) world.setTheme(L.theme);
  reset();
  state = 'menu';
  showOverlay('BRIDGE<br>SQUAD', '',
    'Two walls, one choice: read both sums and steer into the better one.<br>× and ÷ count before + and −, so 3+2×5 is 13.<br>Free the hero. Grab the ATK crate. Read the boss number —<br>that is the damage you must land.<br><b>' + LEVELS.length + ' STAGES</b>',
    'TAP TO START', 0, 'start');
}

// ------------------------------------------------------------------ combat helpers
function openCage() {
  cage.open = true; cage.hp = 0;
  sfx.cageBreak();
  shake = Math.max(shake, 0.35);
  for (const b of cage.bars) {
    const h = b.userData.home;
    const a = Math.atan2(h[2], h[0]) + rand(-0.4, 0.4), s = rand(3, 8);
    cage.debris.push({ m: b, vx: Math.cos(a) * s, vy: rand(4, 10), vz: Math.sin(a) * s, rx: rand(-9, 9), rz: rand(-9, 9), t: 0 });
  }
  burst(CAGE_X, 2, CAGE_D, 50, 9, 2.4, 2.0, 0.5, 1.1, 0.5, -8, 3);
  ring(CAGE_X, CAGE_D, 0.5, 5, 0.4, 0xffe066);
  popup('FREE!', CAGE_X, 5.2, CAGE_D, '#7fe3ff', '#06306e', 2.2, 1.0, 1.8);
  hero.state = 'run'; hero.jt = 0;
  lblCage.sp.visible = false;
  crate.state = 'arc'; crate.t = 0;
  crate.x0 = CAGE_X; crate.d0 = CAGE_D;
  crate.x1 = clamp(X, -3.2, -0.6) * 0.5 - 1.0;
  crate.d1 = clamp(D + hd + 2.6, CAGE_D - 6.5, CAGE_D + 0.4);
  crate.group.visible = true;
}
function takeCrate() {
  crate.state = 'taken'; crate.group.visible = false;
  atk = true;
  usingPowered = true;
  fovK = 1;
  popup('ATK+150%', clamp(X, -2, 2), 3.4, D + 2, '#ffe23a', '#3a1d00', 2.7, 1.6, 1.4);
  burst(X, 0.8, D, 70, 9, 2.4, 0.6, 2.0, 1.2, 0.6, -4, 3);
  burst(X, 0.8, D, 40, 6, 2.4, 2.0, 0.5, 1.0, 0.5, -4, 3);
  ring(X, D, 0.5, 6.5, 0.5, 0xff66e0);
  flash.style.transition = 'none'; flash.style.opacity = 0.55;
  requestAnimationFrame(() => { flash.style.transition = 'opacity .45s'; flash.style.opacity = 0; });
  sfx.power();
  shake = Math.max(shake, 0.3);
}
function trimSquad(n) {
  let left = Math.max(0, Math.round(n));
  for (let i = soldiers.length - 1; i >= 0 && left > 0; i--) {
    const s = soldiers[i];
    if (s.dead) continue;
    s.dead = true;
    burst(s.x, 0.5, s.d, 5, 4.5, 2.6, 0.35, 0.3, 0.5, 0.28, -6, 1.2);
    left--;
  }
}
// one wall of a row was taken; `other` is the wall that shattered next to it.
// The printed expression is evaluated to a soldier delta: positive recruits,
// negative casualties, and the popup shows the working so the maths is readable
// after the fact.
function takeGate(g, other) {
  const c = new THREE.Color(g.tint[0], g.tint[1], g.tint[2]);
  if (other) burst(other.x, 1.2, other.d, 14, 5, c.r * 0.7, c.g * 0.7, c.b * 0.7, 0.6, 0.3, -5, 1);
  const v = g.value;
  popup(g.label, g.x, 4.4, g.d, '#dff0ff', '#06306e', 1.05, 0.9, 1.5);
  if (v > 0) {
    addSoldiers(v, g.x + rand(-0.8, 0.8), g.d, 1.0);
    if (v >= 10) { sfx.gate99(); shake = Math.max(shake, 0.2); }
    else { gateCombo++; gateComboT = 0.8; sfx.gate(gateCombo); }
    popup('+' + v, g.x, 3.0, g.d, '#c8ffd8', '#083a16', 2.6, 0.9, 2.2);
    burst(g.x, 1, g.d, 30, 8, 0.7, 2.0, 0.9, 1.0, 0.45, -5, 3);
    ring(g.x, g.d, 0.5, 5, 0.4, 0x8dff9f);
  } else {
    const n = aliveN();
    trimSquad(Math.min(-v, n - 1));
    sfx.bad();
    popup(String(v), g.x, 3.0, g.d, '#ff6a5e', '#3a0000', 2.6, 0.9, 2.3);
    burst(g.x, 1, g.d, 30, 8, 1.6, 0.25, 0.2, 1.0, 0.45, -5, 2);
    ring(g.x, g.d, 0.5, 4.5, 0.4, 0xff3b30);
    shake = Math.max(shake, 0.25);
  }
}
function nukeBlast() {
  flash.style.transition = 'none'; flash.style.opacity = 0.85;
  requestAnimationFrame(() => { flash.style.transition = 'opacity .6s'; flash.style.opacity = 0; });
  sfx.boom(); shake = Math.max(shake, 1.5);
  ring(X, D + 8, 1, 26, 0.8, 0xffe066);
  ring(X, D + 8, 1, 16, 0.6, 0xffffff);
  burst(X, 1, D + 8, 120, 16, 2.6, 2.2, 0.6, 1.4, 0.8, -6, 4);
  let n = 0;
  for (const e of enemies) {
    if (e.dead || n >= 320) continue;
    const dd = e.d - D;
    if (dd < -2 || dd > 22) continue;
    killEnemy(e); n++;
  }
  for (const b of bosses) {
    if (b.dead || b.d - D > 34) continue;
    hitBoss(b, 2200, b.x);
  }
}
function takePower(p) {
  p.taken = true;
  p.crate.hide();
  const pw = POWERS[p.kind] || POWERS.rage;
  const c = new THREE.Color(pw.tint[0], pw.tint[1], pw.tint[2]);
  popup(pw.name, clamp(X, -2.4, 2.4), 3.7, D + 2.2, pw.color, '#101018', 2.5, 1.4, 1.5);
  popup(pw.blurb, clamp(X, -2.4, 2.4), 2.5, D + 2.2, '#ffffff', '#101018', 1.2, 1.3, 1.05);
  burst(X, 0.9, D, 60, 8, pw.tint[0] * 2.4, pw.tint[1] * 2.4, pw.tint[2] * 2.4, 1.1, 0.6, -4, 3);
  ring(X, D, 0.5, 6, 0.45, c.getHex());
  flash.style.transition = 'none'; flash.style.opacity = 0.35;
  requestAnimationFrame(() => { flash.style.transition = 'opacity .45s'; flash.style.opacity = 0; });
  sfx.power();
  shake = Math.max(shake, 0.25);
  if (p.kind === 'rage') powerState.rage = pw.duration;
  else if (p.kind === 'shield') powerState.shield = pw.duration;
  else if (p.kind === 'freeze') powerState.freeze = pw.duration;
  else if (p.kind === 'reinforce') addSoldiers(40, X, D, 1.4);
  else if (p.kind === 'missile') { missileBattery = true; missileT = 0.6; }
  else if (p.kind === 'nuke') nukeBlast();
}
function killEnemy(e) {
  e.dead = true; kills++;
  burst(e.x, 0.6, e.d, 3, 4.5, 2.4, 0.5, 0.35, 0.6, 0.3, -6, 1.5);
  if (popBudget >= 1) {
    popBudget -= 1;
    popup('+1', e.x + rand(-0.2, 0.2), 1.5, e.d, '#fff', '#8a0d18', 1.05, 0.5, 2.6);
  }
  sfx.pop();
}
function hitBoss(b, dmg, x) {
  // dormant bosses cannot be damaged — their number only starts falling once
  // they wake up and the fight is actually on
  if (b.dead || !b.active) return;
  // every point of damage comes off the printed number — the boss dies at zero
  const applied = Math.min(b.hp, dmg);
  b.hp -= applied;
  b.dealt += applied;
  b.flash = 1;
  b.acc += applied;
  burst(x, rand(1, 3), b.d, 2, 4, 2.4, 0.5, 0.4, 0.6, 0.22);
  if (b.hp <= 0) {
    b.dead = true; b.dying = 0.9;
    b.hp = 0;
    kills++;
  }
}
function explodeBoss(b) {
  burst(b.x, 2.5 * b.sc, b.d, 90, 12, 2.4, 0.9, 0.3, 1.3, 0.7, -6, 4);
  burst(b.x, 1.5 * b.sc, b.d, 50, 8, 2.4, 1.8, 0.4, 1.0, 0.6, -5, 3);
  ring(b.x, b.d, 0.6, 9 * b.sc, 0.6, 0xffb03a);
  sfx.boom();
  shake = Math.max(shake, b.kind === 2 ? 1.6 : 0.9);
  scene.remove(b.group);
  scene.remove(b.label.sp);
  if (b.kind === 2) {
    timeScale = 0.32; slowT = 0.9;
    state = 'won';
    cheerK = 1;
    winCheerT = 0; winBurstT = 0; winFireT = 0.15;
    // every surviving soldier joins the celebration: a staggered hop, a turn
    // to face the player and both arms up
    for (const s of soldiers) {
      if (s.dead) continue;
      s.cheer = 0.001;
      s.cheerDelay = Math.random() * 0.35;
      s.cheerPh = Math.random() * TAU;
      s.cheerRate = 2.8 + Math.random() * 1.8;
    }
    confettiBurst(X, D, 190, 2.6, 9);
    burst(X, 1.6, D, 70, 9, 2.6, 1.9, 0.4, 1.1, 0.9, -3, 5);
    ring(X, D, 0.5, 9, 0.7, 0xffe066);
    ring(X, D, 0.5, 5, 0.5, 0xffffff);
    popup('WIN!', X, 4.2, D, '#ffe23a', '#8a3d00', 3.0, 2.2, 1.5);
    sfx.win();
    sfx.cheer();
  }
}
// A heavy shell lobbed at where the crowd stands. It flies slower than a rifle
// bolt, so a hard lane change lets the squad slide out from under the blast.
function bossShoot(b) {
  if (bullets.length >= MAXP) return;
  const sx = b.x, sd = b.d - b.r * 0.55;
  const tx = X + rand(-1.1, 1.1), td = D + rand(-0.5, 0.5);
  const dx = tx - sx, dd = td - sd, l = Math.hypot(dx, dd) || 1;
  bullets.push({
    x: sx, d: sd, y: 3.2 * b.sc, ux: dx / l, ud: dd / l, s: 0,
    foe: true, type: 5, max: l + 1, big: b.kind === 2 ? 3.4 : 2.2,
    kills: BOSS_SHOT_KILLS[b.kind], hitR: BOSS_SHOT_R[b.kind],
  });
  b.shootA = 1;
  burst(sx, 3.2 * b.sc, sd, 12, 7, 2.6, 0.9, 0.3, 0.5, 0.35, -4, 2);
  ring(sx, sd, 3.2 * b.sc, 1.4, 0.25, 0xff7a3a);
  sfx.bossShot();
  shake = Math.max(shake, 0.2);
}
function bossSmash(b) {
  sfx.smash();
  b.smashA = 1;
  shake = Math.max(shake, b.kind === 2 ? 2.2 : 0.8);
  ring(b.x, b.d - 1.2, 0.6, (b.kind === 2 ? 11 : 5) * b.sc, 0.45, 0xffffff);
  burst(b.x, 0.4, b.d - 1.2, 26, 8, 2, 1.6, 1.2, 1, 0.45, -6, 2);
  const R = (b.kind === 2 ? 7.5 : 3.6) * b.sc;
  const R2 = R * R;
  // A single smash can only take out so many units — dramatic, never a wipe.
  const cap = b.kind === 2 ? 8 : 4;
  let taken = 0;
  for (const s of soldiers) {
    if (s.dead || taken >= cap) continue;
    const dx = s.x - b.x, dd = s.d - (b.d - 1.4);
    if (dx * dx + dd * dd < R2) { killSoldier(s); taken++; }
  }
  if (b.kind === 2) {
    crackT = 7;
    crack.position.set(b.x, 0.066, -(b.d - 1.4));
    crack.rotation.y = Math.random() * TAU;
    crack.scale.set(DECK_HW * 2 + 0.4, 1, 23);
    crack.visible = true;
  }
}

// ------------------------------------------------------------------ input
let keyL = false, keyR = false, dragId = null, dragX0 = 0, dragSX = 0;
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
const _pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5), _hit = new THREE.Vector3(), _v = new THREE.Vector3();
function worldXAt(clientX) {
  const r = canvas.getBoundingClientRect();
  _v.set(X, 0.5, -D).project(camera);
  _ndc.set(((clientX - r.left) / r.width) * 2 - 1, _v.y);
  _ray.setFromCamera(_ndc, camera);
  return _ray.ray.intersectPlane(_pl, _hit) ? _hit.x : X;
}
stage.addEventListener('pointerdown', e => {
  if (e.target.closest('.ib') || e.target.id === 'unhide') return;
  if (state !== 'play') {
    if (performance.now() - endShown < 500) return;
    // let the victory celebration play before the results panel takes input
    if ((state === 'won' || state === 'lost') && !ov.classList.contains('show')) return;
    if (state === 'menu') startLevel(0);
    else if (ovAction === 'next') nextStage();
    else startLevel(levelIndex);
    return;
  }
  if (e.pointerType === 'mouse') targetX = worldXAt(e.clientX);
  else { dragId = e.pointerId; dragX0 = e.clientX; dragSX = targetX; }
});
window.addEventListener('pointermove', e => {
  if (state !== 'play') return;
  if (e.pointerType === 'mouse') targetX = worldXAt(e.clientX);
  else if (e.pointerId === dragId) targetX = dragSX + (e.clientX - dragX0) / stage.clientWidth * 17;
});
window.addEventListener('pointerup', e => { if (e.pointerId === dragId) dragId = null; });
window.addEventListener('pointercancel', e => { if (e.pointerId === dragId) dragId = null; });
window.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 'arrowleft') keyL = true;
  else if (k === 'd' || k === 'arrowright') keyR = true;
  else if (k === 'h') document.body.classList.toggle('clean');
  else if (k === 'm') { initAudio(); setMute(!isMuted()); }
  else if (k === 'q') { autoQ = false; setQuality((quality + 2) % 3); }
  else if (k === 'c') setCamRig(camRig + 1);
  else if (k === 'r') startLevel(levelIndex);
  else if (k === '1' || k === '2' || k === '3') { initAudio(); startLevel(+k - 1); }
  else if ((k === ' ' || k === 'enter') && state !== 'play') {
    if ((state === 'won' || state === 'lost') && !ov.classList.contains('show')) return;
    if (state === 'menu') startLevel(0);
    else if (ovAction === 'next') nextStage();
    else startLevel(levelIndex);
  }
});
window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 'arrowleft') keyL = false;
  else if (k === 'd' || k === 'arrowright') keyR = false;
});
$('bMute').addEventListener('click', () => { initAudio(); setMute(!isMuted()); sfx.click(); });
$('bRestart').addEventListener('click', () => { initAudio(); startGame(); });
$('bCam').addEventListener('click', () => { sfx.click(); setCamRig(camRig + 1); });
$('bHide').addEventListener('click', () => document.body.classList.toggle('clean'));
$('bQual').addEventListener('click', () => { autoQ = false; setQuality((quality + 1) % 3); });
$('unhide').addEventListener('click', () => document.body.classList.toggle('clean'));

// ------------------------------------------------------------------ simulation
function update(dt) {
  time += dt;
  const play = state === 'play';
  if (play) gt += dt;
  popBudget = Math.min(4, popBudget + dt * 16);
  if (play) for (const k in powerState) if (powerState[k] > 0) powerState[k] = Math.max(0, powerState[k] - dt);

  // steering + advance
  if (play) {
    if (keyL) targetX -= 13 * dt;
    if (keyR) targetX += 13 * dt;
  }
  const N = aliveN();
  const sp = N < 40 ? 0.72 : lerp(0.72, 0.52, Math.min(1, (N - 40) / 220));
  const cF = sp * 0.62, R = cF * Math.sqrt(Math.max(N, 1));
  const kx = Math.min(1, 4.9 / Math.max(R, 0.01)), kd = 1 / kx;
  hw = R * kx + 0.3; hd = R * kd + 0.3;
  const lim = Math.max(0, DECK_HW - 0.35 - (hw - 0.3));
  targetX = clamp(targetX, -lim, lim);
  if (play) {
    X += clamp(targetX - X, -18 * dt, 18 * dt);
    if (D < D_MAX) D += V_SQUAD * dt;
  }

  // gate rows
  if (play) {
    gateComboT -= dt;
    if (gateComboT <= 0) gateCombo = 0;
    for (const row of gateRows) {
      if (row.done) continue;
      row.d -= V_BELT * dt;
      for (const g of row.gates) g.d = row.d;
      // row slipped past the squad — both options are gone
      if (row.d < D - hd - 3) {
        row.done = true;
        for (const g of row.gates) g.alive = false;
        continue;
      }
      if (row.d > D + hd + 1.2) continue;
      // the walls cover the road, so the row is always taken: the crowd commits
      // to the half it is steering toward and the other wall shatters
      row.done = true;
      const pick = X < 0 ? row.gates[0] : row.gates[1];
      const other = row.gates[0] === pick ? row.gates[1] : row.gates[0];
      for (const g of row.gates) { g.alive = false; g.pop = 1; }
      takeGate(pick, other);
    }
  }

  // soldiers: formation + fire
  // nearest charging enemy ahead of the squad: while one is on top of the
  // formation the squad stops focusing a distant boss and shoots it down
  chargeThreat = 99;
  for (const e of enemies) {
    if (e.dead || e.st !== 1) continue;
    const dd = e.d - D;
    if (dd > 0 && dd < chargeThreat) chargeThreat = dd;
  }
  const follow = 1 - Math.exp(-9 * dt);
  const firing = play;
  for (let i = 0; i < soldiers.length; i++) {
    const s = soldiers[i];
    if (s.dead) continue;
    const r = cF * Math.sqrt(i), a = i * 2.39996323;
    let tx = clamp(X + Math.cos(a) * r * kx, -DECK_HW + 0.35, DECK_HW - 0.35);
    const td = D + Math.sin(a) * r * kd;
    if (tx < CAGE_X + 2.25 && td > CAGE_D - 2.3 && td < CAGE_D + 2.3) tx = CAGE_X + 2.25;
    s.x += (tx - s.x) * follow;
    s.d += (td - s.d) * follow;
    if (firing) {
      s.cd -= dt;
      if (s.cd <= 0) {
        s.cd += FIRE_INT;
        fire(s.x + 0.31, s.d + 0.28, atk ? 1 : 0, Math.abs(s.x - CAGE_X) < 3.2);
        if (atk) sfx.laser(); else sfx.shot();
        if (PT.n < PT.max - 200 && Math.random() < (soldiers.length > 80 ? 0.12 : 0.5)) {
          burst(s.x + 0.31, 0.9, s.d + 0.4, 1, 0.7, atk ? 2.4 : 2.4, atk ? 0.7 : 1.8, atk ? 2.1 : 0.5, 0.7, 0.07);
        }
      }
    }
  }

  // hero
  if (hero.state === 'run' || hero.state === 'joined') {
    const hx = clamp(X, -DECK_HW + 0.8, DECK_HW - 0.8), hdd = D + hd + 0.9;
    if (hero.state === 'run') {
      hero.jt += dt / 0.8;
      const t = Math.min(1, hero.jt), e = t * t * (3 - 2 * t);
      hero.x = lerp(CAGE_X, hx, e);
      hero.d = lerp(CAGE_D, hdd, e);
      hero.y = 0.6 * (1 - t) + Math.sin(t * Math.PI) * 4.4;
      if (t >= 1) {
        hero.state = 'joined'; hero.y = 0; hero.land = 1;
        sfx.land(); shake = Math.max(shake, 0.35);
        ring(hero.x, hero.d, 0.5, 4.6, 0.4, 0x8fd8ff);
        burst(hero.x, 0.3, hero.d, 26, 7, 1.6, 1.9, 2.4, 0.9, 0.4, -5, 1.5);
      }
    } else {
      hero.x += (hx - hero.x) * follow;
      hero.d += (hdd - hero.d) * follow;
      if (play) {
        hero.cd -= dt;
        if (hero.cd <= 0) {
          hero.cd += 0.25;
          fire(hero.x + 0.99, hero.d + 0.9, atk ? 3 : 2, Math.abs(hero.x - CAGE_X) < 3.6);
          hero.kick = 1;
          sfx.heroShot();
        }
      }
    }
  }

  // crate
  if (crate.state === 'arc') {
    crate.t += dt / 0.6;
    const t = Math.min(1, crate.t);
    crate.x = lerp(crate.x0, crate.x1, t);
    crate.d = lerp(crate.d0, crate.d1, t);
    crate.y = 0.75 + Math.sin(t * Math.PI) * 4.5 + (1 - t) * 1.5;
    if (t >= 1) { crate.state = 'idle'; ring(crate.x, crate.d, 0.3, 2.6, 0.3, 0xffe066); }
  } else if (crate.state === 'idle') {
    crate.y = 0.85 + Math.sin(time * 5) * 0.14;
    if (play) {
      for (const s of soldiers) {
        if (s.dead) continue;
        const dx = s.x - crate.x, dd = s.d - crate.d;
        if (dx * dx + dd * dd < 1.5) { takeCrate(); break; }
      }
    }
    if (crate.state === 'idle' && crate.d < D - hd - 4) {
      crate.state = 'missed';
      crate.group.visible = false;
    }
  }

  // power pickups
  for (const p of powerPickups) {
    if (p.taken) continue;
    if (p.d < D - hd - 4) { p.taken = true; p.crate.hide(); continue; }
    if (!play) continue;
    for (const s of soldiers) {
      if (s.dead) continue;
      const dx = s.x - p.x, dd = s.d - p.d;
      if (dx * dx + dd * dd < 2.2) { takePower(p); break; }
    }
  }

  // enemies: aggro + charge
  const front = D + hd;
  // Front-rank volleys: a handful of shooters at a time, aimed at the crowd.
  // The horde is scanned front to back, so the units nearest the squad — the
  // ones the player can actually see — are the ones that open fire.
  if (play) {
    enemyFireT -= dt;
    if (enemyFireT <= 0 && powerState.freeze <= 0 && aliveN() >= EFIRE_MIN_N) {
      enemyFireT = enemyFireInt();
      let shots = enemyFireBurst();
      for (const e of enemies) {
        if (shots <= 0) break;
        if (e.dead || e.st !== 0 || e.fireCd > 0) continue;
        const dd = e.d - D;
        if (dd < 3.5 || dd > EFIRE_RANGE) continue;
        if (Math.abs(e.x - X) > hw + EFIRE_LANE) continue;
        e.fireCd = rand(2.4, 5.2);
        fireEnemyBolt(e);
        shots--;
      }
    }
  }
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.fireCd > 0) e.fireCd -= dt;
    if (powerState.freeze > 0) { e.walk = 0; continue; }
    // marching in place looks alive once every unit has its own rhythm; on the
    // victory screen the beaten horde stands still
    e.walk = state === 'won' ? 0 : e.st === 1 ? e.walkCharge : e.walkIdle;
    if (play && e.st === 0) {
      if (e.charger && e.d - front < AGGRO_RANGE && Math.abs(e.x - X) < hw + AGGRO_WIDTH) e.st = 1;
    } else if (e.st === 1 && state !== 'won') {
      const dx = X - e.x, dd = D - e.d, l = Math.hypot(dx, dd) || 1;
      const st = CHARGE_V * dt;
      e.x += dx / l * st;
      e.d += dd / l * st;
      // trade blows once the charger reaches the formation ring
      if (l < Math.max(hw, hd) + 0.9) {
        let best = null, bd = 6.25;
        for (const s of soldiers) {
          if (s.dead) continue;
          const sx = s.x - e.x, sd = s.d - e.d;
          const d2 = sx * sx + sd * sd;
          if (d2 < bd) { bd = d2; best = s; }
        }
        if (best) {
          // a charger trades with the formation, but the squad often shoots it
          // down on the last step — a charge is a threat, not a guaranteed loss
          e.dead = true;
          if (Math.random() < 0.35) killSoldier(best);
          else burst(e.x, 0.6, e.d, 4, 5, 2.4, 0.5, 0.35, 0.55, 0.28, -6, 1.5);
        }
      }
    }
  }

  // bosses — stage spawn list
  if (play) {
    for (let i = 0; i < L.bosses.length; i++) {
      if (!bossSpawned[i] && D >= L.bosses[i].atD) {
        bossSpawned[i] = true;
        // walk in from far enough that the squad can open fire on the way, but
        // never spawn behind the fortress
        spawnBoss(L.bosses[i].kind, clamp(X, -4, 1.5), Math.min(D + 22, FORT_D - 3), true, L.bosses[i].hp);
      }
    }
  }
  // One boss at a time, in the order they walked in. A boss is live the moment
  // it steps onto the bridge — the squad starts burning its number down while it
  // is still far away. The fortress boss waits until every mid-boss is dead.
  let wakeB = null;
  if (play && !bosses.some(o => o.active && !o.dead)) {
    for (const o of bosses) {
      if (o.active || o.dead) continue;
      if (o.kind === 2 && !(bossSpawned.every(Boolean) && !bosses.some(q => q.kind !== 2 && !q.dead))) continue;
      wakeB = o; break;
    }
  }
  for (let k = bosses.length - 1; k >= 0; k--) {
    const b = bosses[k];
    if (b.dead) {
      b.dying -= dt / Math.max(0.15, timeScale);
      if (b.dying <= 0) { explodeBoss(b); bosses.splice(k, 1); }
      continue;
    }
    b.flash = Math.max(0, b.flash - dt * 6);
    b.smashA = Math.max(0, (b.smashA || 0) - dt * 2.6);
    b.shootA = Math.max(0, (b.shootA || 0) - dt * 2.2);
    b.land = Math.max(0, (b.land || 0) - dt * 4);
    if (b.fall > 0) {
      b.fall -= dt / 0.45;
      if (b.fall <= 0) {
        b.fall = 0; b.land = 1; b.roar = 0.75;
        sfx.bossLand(); sfx.roar();
        shake = Math.max(shake, 0.5);
        ring(b.x, b.d, 0.6, 6 * b.sc, 0.45, 0xffffff);
        burst(b.x, 0.4, b.d, 30, 8, 2, 1.6, 1.2, 1, 0.45, -6, 2);
      }
    }
    if (!play) continue;
    if (!b.active) {
      if (b !== wakeB) continue;
      b.active = true; b.roar = 0.95;
      // The damage-to-kill number was fixed when the boss walked in — it never
      // rescales, so the number the player read is exactly what the squad must
      // deal. The ATK crate and the power-ups are what shorten the fight.
      b.label.last = null;
      sfx.bossLand(); sfx.roar();
      shake = Math.max(shake, 0.5);
      ring(b.x, b.d, 0.6, 9, 0.5, 0xff5a5a);
      popup('BOSS!', b.x, 8.4, b.d, '#ff4a4a', '#3a0000', 3.4, 1.2, 1.2);
      popup(fmtNum(b.maxHp) + ' DMG', b.x, 6.4, b.d, '#ffe14a', '#3a1d00', 2.2, 1.4, 1.5);
      continue;
    }
    if (b.fall > 0) continue;
    if (b.roar > 0) { b.roar -= dt; continue; }
    // freeze locks the boss in place: no advance, no wind-up, no smash
    const frozen = powerState.freeze > 0;
    if (frozen) b.wind = 0;
    const td = D + hd + b.r * 0.55;
    const contact = !frozen && Math.abs(b.d - td) < 0.5;
    b.contact = contact;
    if (frozen) {
      b.smashT = Math.min(0.35, b.smashT + dt);
      b.moving = false;
    } else if (b.wind > 0) {
      b.wind -= dt;
      b.moving = false;
      if (b.kind === 2 && b.wind < b.windD * 0.55) {
        b.d -= Math.max(0, b.d - (D + hd * 0.25)) * Math.min(1, dt * 5);
      }
      if (b.wind <= 0) { b.wind = 0; bossSmash(b); }
    } else {
      // while it is still far off the boss only stalks forward — it stays a
      // readable, shootable target instead of sprinting into the squad before
      // the gate run is done
      const gap = b.d - td;
      const adv = gap > 20 ? 1.0 : b.speed;
      if (gap >= 0.5) b.d -= adv * dt;
      else if (!contact) b.d += Math.min(td - b.d, 4 * dt);
      b.moving = !contact && gap > 0.2;
      b.x += clamp(X - b.x, -(contact ? 3 : 1.1) * dt, (contact ? 3 : 1.1) * dt);
      if (contact && Math.abs(b.x - X) < hw + b.r + 0.4) {
        b.smashT -= dt;
        if (b.smashT <= 0) {
          b.smashT = b.kind === 2 ? 1.2 : 2.0;
          b.wind = b.windD = b.kind === 2 ? 1.2 : 0.3;
          if (b.kind === 2) sfx.charge();
          if (b.kind === 2) {
            danger.visible = true;
            danger.position.set(X, 0.07, -(D + hd * 0.25));
            danger.scale.setScalar(6 + b.r);
          }
        }
      } else b.smashT = Math.min(0.35, b.smashT + dt);
      // ranged attack: while it is still closing the boss shells the squad
      if (!contact && b.fall <= 0) {
        b.shootT -= dt;
        if (b.shootT <= 0) {
          b.shootT = BOSS_SHOT_INT[b.kind];
          bossShoot(b);
        }
      }
    }
    b.accT -= dt;
    if (b.accT <= 0 && b.acc >= 1) {
      b.accT = 0.14;
      popup('-' + Math.round(b.acc), b.x + (Math.random() < 0.5 ? -1 : 1) * b.r * rand(0.9, 1.5),
        rand(1.2, 2.6) * b.sc, b.d, atk ? '#ffb3f2' : '#fff', atk ? '#7a0a63' : '#5a1a00',
        1.1 + Math.min(1.1, b.acc / 150), 0.55, 1.7);
      b.acc = 0;
    }
  }
  if (danger.visible) {
    danger.material.opacity = 0.4 + Math.sin(time * 12) * 0.25;
    const active = bosses.find(b => b.kind === 2 && b.wind > 0);
    if (!active) danger.visible = false;
    else danger.position.set(active.x, 0.07, -(active.d - 1.4));
  }

  // missile battery — auto-fires at whatever is in front of the squad
  if (play && missileBattery) {
    missileT -= dt;
    if (missileT <= 0) {
      missileT = MISSILE_INT;
      let tgt = null, best = 1e9;
      for (const b of bosses) {
        if (b.dead || !b.active) continue;
        const dd = b.d - D;
        if (dd > 1 && dd < 42 && dd < best) { best = dd; tgt = b; }
      }
      if (!tgt) for (const e of enemies) {
        if (e.dead) continue;
        const dd = e.d - D;
        if (dd > 1 && dd < 28 && dd < best) { best = dd; tgt = e; }
      }
      if (tgt) {
        const src = soldiers.find(s => !s.dead);
        missiles.launch({
          x: (src ? src.x : X) + rand(-0.4, 0.4), d: (src ? src.d : D) + 0.4,
          tx: tgt.x, td: tgt.d, ty: tgt.kind !== undefined ? 3.4 * (tgt.sc || 1) : 1.3,
          dmg: MISSILE_DMG, radius: 4.5, target: tgt,
        });
        sfx.missile();
      }
    }
  }

  // bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const p = bullets[i];
    const spd = p.foe ? (p.big ? 24 : 30) : (p.type >= 2 ? 54 : p.type === 1 ? 54 : 36);
    const st = spd * dt;
    const x0 = p.x, x1 = x0 + p.ux * st, d0 = p.d, d1 = p.d + p.ud * st;
    p.s += st;
    p.x = x1; p.d = d1;
    let dead = p.s > p.max || x1 < -DECK_HW - 1 || x1 > DECK_HW + 1;
    let dmg = p.dmg;
    const pw = (p.type >= 2 ? 0.55 : 0.42) + Math.abs(x1 - x0) / 2;

    // enemy fire — bolts and shells hit the squad, not the horde
    if (p.foe) {
      // a shell drags a trail of embers behind it
      if (p.big && Math.random() < 0.7) burst(p.x, p.y, p.d, 1, 0.8, 2.4, 0.7, 0.2, 0.4, 0.25);
      if (!dead) {
        const r2 = (p.hitR || 1) * (p.hitR || 1);
        let killed = 0;
        for (const s of soldiers) {
          if (s.dead) continue;
          const dx = s.x - x1, dd = s.d - d1;
          if (dx * dx + dd * dd > r2) continue;
          killSoldier(s);
          if (++killed >= (p.kills || 1)) break;
        }
        if (killed > 0) {
          dead = true;
          burst(x1, p.big ? 1.4 : 0.8, d1, p.big ? 16 : 5, p.big ? 7 : 4, 2.4, 0.55, 0.25, 0.6, 0.3, -5, p.big ? 2 : 1.2);
          if (p.big) {
            ring(x1, d1, 0.4, 2.4, 0.3, 0xff5a3a);
            shake = Math.max(shake, 0.3);
            sfx.smash();
          }
        }
      }
      if (dead && p.big && p.s >= p.max) {
        // a shell that misses still detonates at the end of its flight
        ring(x1, d1, 0.4, 2.2, 0.3, 0xff5a3a);
        burst(x1, 0.7, d1, 10, 6, 2.4, 0.5, 0.25, 0.5, 0.3, -5, 1.5);
      }
      if (dead) bullets.splice(i, 1);
      continue;
    }

    // cage hit — only shots fired from the cage lane can damage it
    if (!dead && p.cage && !cage.open && x1 > CAGE_X - 1.85 && x1 < CAGE_X + 1.85 && d1 >= CAGE_D - 1.75 && d0 <= CAGE_D + 1.75) {
      cage.hp -= dmg; cage.flash = 1; dead = true;
      sfx.cageHit();
      burst(x1, rand(0.8, 2.6), CAGE_D - 1.75, 2, 4, 2.4, 2.0, 0.6, 0.7, 0.2);
      if (cage.hp <= 0) openCage();
    }
    // boss hit
    if (!dead) {
      for (const b of bosses) {
        // dormant bosses cannot be damaged — they only take hits once awake
        if (!b.active || b.dead || b.fall > 0.3) continue;
        if (Math.abs(x1 - b.x) < b.r && d1 >= b.d - b.r * 0.8 && d0 <= b.d + b.r) {
          hitBoss(b, dmg, x1);
          dead = true;
          break;
        }
      }
    }
    // enemy hit — damage is applied properly so tougher enemies can soak hits.
    // Shots already committed to a boss fly over the horde: focus fire means the
    // boss starts losing its number the moment it is in view.
    if (!dead && !p.boss) {
      for (const e of enemies) {
        if (e.dead) continue;
        if (Math.abs(e.x - x1) > pw || e.d < d0 - 0.35 || e.d > d1 + 0.35) continue;
        const hit = Math.min(e.hp, dmg);
        e.hp -= hit;
        dmg -= hit;
        if (e.hp <= 0.01) killEnemy(e);
        else if (Math.random() < 0.25) burst(e.x, 0.8, e.d, 1, 3, 2.4, 0.9, 0.4, 0.4, 0.15);
        if (dmg <= 0.01) { dead = true; break; }
      }
    }
    if (dead) bullets.splice(i, 1);
  }

  // missiles: flight + splash damage
  const hits = missiles.update(dt, enemies);
  for (const im of hits) {
    const tgt = im.target;
    if (tgt && !tgt.dead) {
      if (tgt.kind !== undefined) hitBoss(tgt, im.dmg, tgt.x);
      else { tgt.hp -= im.dmg; if (tgt.hp <= 0.01) killEnemy(tgt); }
    }
    const r2 = im.radius * im.radius;
    for (const e of enemies) {
      if (e.dead || e === tgt) continue;
      const dx = e.x - im.x, dd = e.d - im.d;
      if (dx * dx + dd * dd < r2) {
        e.hp -= im.dmg * 0.6;
        if (e.hp <= 0.01) killEnemy(e);
      }
    }
    burst(im.x, im.y, im.d, 26, 9, 2.6, 1.6, 0.5, 1.0, 0.5, -6, 2);
    ring(im.x, im.d, 0.4, im.radius, 0.35, 0xffb03a);
    sfx.missileHit();
  }

  // enemy corpses cleanup
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);

  // soldiers cleanup
  for (let i = soldiers.length - 1; i >= 0; i--) if (soldiers[i].dead) soldiers.splice(i, 1);

  // cage debris physics
  for (let i = cage.debris.length - 1; i >= 0; i--) {
    const d = cage.debris[i];
    d.t += dt;
    d.vy -= 26 * dt;
    d.m.position.x += d.vx * dt;
    d.m.position.y += d.vy * dt;
    d.m.position.z += d.vz * dt;
    d.m.rotation.x += d.rx * dt;
    d.m.rotation.z += d.rz * dt;
    if (d.t > 2.2) { d.m.visible = false; cage.debris.splice(i, 1); }
  }

  // crack fade
  if (crackT > 0) {
    crackT -= dt;
    crack.material.opacity = Math.min(1, crackT / 2);
    if (crackT <= 0) crack.visible = false;
  }

  // victory celebration — the squad ramps into its cheer, and a few extra
  // poppers and firework bursts keep the sky busy while the confetti falls
  if (state === 'won') {
    winCheerT += dt;
    for (const s of soldiers) {
      if (s.dead) continue;
      if (s.cheerDelay > 0) s.cheerDelay -= dt;
      else s.cheer = Math.min(1, (s.cheer || 0) + dt * 4.2);
    }
    winBurstT -= dt;
    if (winBurstT <= 0 && winCheerT < 3.2) {
      winBurstT = rand(0.28, 0.5);
      confettiBurst(X + rand(-hw, hw), D + rand(-hd, hd), 26, 2.2, 8);
    }
    winFireT -= dt;
    if (winFireT <= 0 && winCheerT < 4.5) {
      winFireT = rand(0.4, 0.8);
      const fx = X + rand(-7, 7), fy = rand(6, 10.5), fd = D + rand(-4, 12);
      const pick = Math.random();
      const col = pick < 0.4 ? [2.6, 1.9, 0.5] : pick < 0.7 ? [0.7, 2.0, 2.6] : [2.6, 0.7, 2.2];
      burst(fx, fy, fd, 26, 8, col[0], col[1], col[2], 1.0, 0.8, -2.2, 1.5);
    }
  }

  // end conditions
  if (play) {
    const n = aliveN();
    if (n <= 0) {
      state = 'lost'; endT = 0;
      loseMsg = `Your squad was overrun after ${gt.toFixed(1)}s.<br>Collect more gates and grab the ATK crate!`;
      sfx.lose();
    }
  }

  // particles / fx
  updateParticles(dt);
  updateRings(dt);
  updatePops(dt);
  updateConfetti(dt);

  // camera
  shake = Math.max(0, shake - dt * 1.8);
  fovK = Math.max(0, fovK - dt * 1.6);
  cheerK = Math.max(0, cheerK - dt * 0.5);
}

// ------------------------------------------------------------------ render sync
const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bs = new THREE.Vector3(1, 1, 1), _bp = new THREE.Vector3();
const bulletColor = new THREE.Color();

function syncVisuals(dt) {
  uiK = UI_K[camRig];
  fitLabel(lblSquad, uiK); fitLabel(lblEnemy, uiK); fitLabel(lblCage, uiK);
  // soldiers (instanced) — choose palette
  const live = soldiers;
  const usePowered = atk;
  soldierR.meshes.forEach(m => { m.visible = !usePowered; });
  poweredR.meshes.forEach(m => { m.visible = usePowered; });
  const rendererForSoldiers = usePowered ? poweredR : soldierR;
  rendererForSoldiers.update(live, time);

  // enemies
  enemyR.update(enemies, time);

  // bullets
  let bn = 0;
  for (const p of bullets) {
    if (bn >= MAXP) break;
    _bp.set(p.x, p.y ?? 0.92, -p.d);
    _bq.setFromEuler(new THREE.Euler(Math.PI / 2, Math.atan2(-p.ux, -p.ud), 0, 'YXZ'));
    const bs = p.big ? 2.6 : p.foe ? 1.6 : 1;
    _bs.set(bs, bs, p.big ? 1.5 : 1);
    _bm.compose(_bp, _bq, _bs);
    bulletMesh.setMatrixAt(bn, _bm);
    if (p.foe) bulletColor.setRGB(3.2, p.big ? 1.3 : 0.5, 0.2);
    else if (p.type === 0) bulletColor.setRGB(2.6, 2.1, 0.6);
    else if (p.type === 1) bulletColor.setRGB(2.6, 0.5, 1.6);
    else if (p.type === 2) bulletColor.setRGB(0.5, 2.0, 2.6);
    else bulletColor.setRGB(2.6, 0.6, 2.2);
    bulletMesh.setColorAt(bn, bulletColor);
    bn++;
  }
  bulletMesh.count = bn;
  bulletMesh.instanceMatrix.needsUpdate = true;
  if (bulletMesh.instanceColor) bulletMesh.instanceColor.needsUpdate = true;

  // gates — a row slides in out of the fog: the far wall is transparent, and it
  // solidifies as it closes, so nothing ever pops into the middle of the bridge
  let gi = 0;
  for (const g of gates) {
    if (!g.alive || gi >= gatePool.length) continue;
    const P = gatePool[gi++];
    const near = g.d < D + 52 && g.d > D - 6;
    P.g.visible = near;
    if (!near) continue;
    P.g.position.set(g.x, GATE_Y, -g.d + (g.zo || 0));
    P.g.rotation.x = GATE_TILT;
    const popScale = 1 + (g.pop > 0 ? (1 - g.pop) * 0.5 : 0);
    P.g.scale.setScalar(popScale);
    const numTex = gateTexFor(g);
    if (P.num.material.map !== numTex) {
      P.num.material.map = numTex;
      P.numBack.material.map = numTex;
      P.num.material.needsUpdate = true;
      P.numBack.material.needsUpdate = true;
    }
    const k = clamp((D + 52 - g.d) / 14, 0, 1);
    const fade = k * k * (3 - 2 * k);
    const tint = g.tint;
    P.glow.material.color.setRGB(tint[0] * 1.35, tint[1] * 1.35, tint[2] * 1.35);
    P.slab.material.color.setRGB(tint[0], tint[1], tint[2]);
    P.slab.material.opacity = (0.5 + Math.sin(time * 3 + gi) * 0.05) * fade;
    P.frameMat.opacity = fade;
    P.num.material.opacity = fade;
    P.numBack.material.opacity = 0.8 * fade;
    P.glow.material.opacity = (0.14 + Math.sin(time * 3 + gi) * 0.04) * fade;
  }
  for (; gi < gatePool.length; gi++) gatePool[gi].g.visible = false;

  // cage
  if (!cage.open) {
    cage.beacon.material.color.setRGB(3 * (0.6 + Math.sin(time * 8) * 0.4), 0.25, 0.1);
    lblCage.sp.visible = true;
    lblCage.sp.position.set(CAGE_X, 5.4, -(CAGE_D));
    drawCageBar();
  }
  cage.group.visible = !cage.open || cage.debris.length > 0;

  // hero — joins the victory party when he is out of the cage
  const heroCheerOn = state === 'won' && hero.state === 'joined';
  hero.cheer = clamp((hero.cheer || 0) + (heroCheerOn ? dt * 3.4 : -dt * 6), 0, 1);
  const hc = hero.cheer;
  const hop = Math.abs(Math.sin(time * 4.2)) * 0.75 * hc;
  hero.group.position.set(hero.x, hero.y + hop, -hero.d);
  hero.group.visible = hero.state !== 'caged' || !cage.open;
  if (hero.state === 'caged') {
    hero.group.position.set(CAGE_X, 0, -CAGE_D);
    hero.group.rotation.y = Math.PI * 0.15 + Math.sin(time * 0.8) * 0.05;
  } else {
    hero.group.rotation.y = Math.PI * hc;
  }
  // hero pose
  const running = hero.state === 'run';
  const t = time * (running ? 14 : 9);
  hero.legs.forEach((leg, i) => {
    const s = Math.sin(t + i * Math.PI) * (running ? 0.7 : 0.18);
    leg.rotation.x = lerp(s, 0.34 + Math.sin(time * 5 + i * Math.PI) * 0.16, hc);
    leg.userData.shin.rotation.x = Math.max(0, -s) * 0.8 * (1 - hc);
  });
  hero.arms.forEach((arm, i) => {
    const wave = 2.55 + Math.sin(time * 6 + i * Math.PI) * 0.24;
    arm.rotation.x = lerp(-0.25 + Math.sin(t + i * Math.PI) * 0.35, wave, hc);
  });
  hero.torso.rotation.x = (running ? 0.12 : 0.02) + Math.sin(t * 0.5) * 0.02 - hc * 0.08;
  hero.cannon.rotation.x = -hero.kick * 0.35 - hc * 0.3;
  hero.kick = Math.max(0, hero.kick - dt * 5);
  hero.head.rotation.y = Math.sin(time * 0.7) * 0.12 * (1 - hc);
  if (hero.cape) hero.cape.rotation.x = 0.08 + Math.sin(time * 4.2) * 0.07 + (running ? 0.14 : 0) + hc * 0.12;
  hero.land = Math.max(0, hero.land - dt * 4);
  const ls = 1 - hero.land * 0.12;
  hero.group.scale.set(2.2 / ls, 2.2 * ls, 2.2 / ls);

  // crate
  crate.group.visible = crate.state === 'arc' || crate.state === 'idle';
  if (crate.group.visible) {
    crate.group.position.set(crate.x, crate.y, -crate.d);
    crate.group.rotation.y = time * 2.4;
    crate.group.rotation.x = Math.sin(time * 1.7) * 0.12;
  }

  // power crates
  for (const p of powerPickups) if (!p.taken) p.crate.update(time);

  // bosses
  for (const b of bosses) {
    b.group.position.set(b.x, 0, -b.d);
    // face the squad, leaning into a sideways correction instead of sliding
    b.group.rotation.y = Math.PI + clamp((X - b.x) * 0.07, -0.28, 0.28);
    // Per-boss stride: phase and amplitude follow whether the boss is actually
    // advancing, so it plants its feet when it stops to swing and the arms
    // counter-swing against the legs.
    const moving = b.moving && b.wind <= 0 && b.roar <= 0 && b.fall <= 0;
    b.walkAmp += ((moving ? 1 : 0) - b.walkAmp) * Math.min(1, dt * 5);
    b.walkPh += dt * (b.kind === 2 ? 3.2 : 4.0) * (0.35 + b.walkAmp * 0.65);
    const step = Math.sin(b.walkPh), amp = b.walkAmp;
    const bob = Math.abs(Math.cos(b.walkPh)) * 0.07 * amp;
    b.group.position.y = bob;
    // pose
    const roar = b.roar > 0 ? Math.min(1, b.roar / 0.6) : 0;
    const wind = b.wind > 0 ? Math.min(1, 1 - b.wind / (b.windD || 1)) : 0;
    const smash = b.smashA || 0;
    const shoot = b.shootA || 0;
    b.body.rotation.x = roar * -0.18 + wind * -0.22 + smash * 0.3 + amp * 0.05 - shoot * 0.12;
    b.body.rotation.z = -step * 0.035 * amp;
    b.body.position.y = 1.5 + roar * 0.08 - smash * 0.12 + bob * 0.35;
    b.hips.rotation.z = step * 0.045 * amp;
    b.hips.rotation.y = -step * 0.03 * amp;
    b.arms.forEach((a, i) => {
      const s = i ? 1 : -1;
      const swing = step * (i ? 1 : -1) * 0.3 * amp;
      a.sh.rotation.x = -roar * 2.1 + wind * 1.9 - smash * 1.4 + swing - shoot * 1.5;
      a.sh.rotation.z = s * (0.1 + roar * 0.5 + shoot * 0.2);
      a.fore.rotation.x = -0.2 - roar * 0.5 + smash * 0.7 + shoot * 0.4;
    });
    b.legs.forEach((leg, i) => { leg.rotation.x = step * (i ? -1 : 1) * 0.5 * amp; });
    b.jaw.rotation.x = roar * 0.4 + shoot * 0.25;
    b.head.rotation.x = roar * -0.2 - amp * 0.03;
    b.head.rotation.z = step * 0.025 * amp;
    // the damage-to-kill number is readable as soon as the boss is on screen —
    // dormant bosses show what they will cost before the fight starts
    b.label.sp.visible = !b.dead && (b.active || b.d - D < 46);
    fitLabel(b.label, uiK);
    b.label.sp.position.set(b.x, (b.kind === 2 ? 6.2 : 5.2) * b.sc, -b.d);
    drawBossBar(b);
    if (b.dead) {
      const t2 = clamp(1 - b.dying / 0.9, 0, 1);
      b.group.rotation.x = -t2 * 1.2;
      b.group.position.y = -t2 * 0.6;
    }
  }

  // labels
  const n = aliveN();
  const aliveEnemies = enemies.length;
  // the count pill steps aside on the victory screen so the celebrating hero
  // and crowd are unobstructed
  lblSquad.sp.visible = n > 0 && state !== 'won';
  // the close rig keeps the pill just over the crowd's back, rising with the
  // formation so it never floats off into the gates
  const pillY = camRig === 0 ? 2.8 + hd * 0.3 : 3.2;
  lblSquad.sp.position.set(X, pillY + Math.sin(time * 2) * 0.06, -(D - hd - 0.6));
  drawPill(lblSquad, String(n), 'squad');
  lblEnemy.sp.visible = aliveEnemies > 0 && state === 'play';
  if (lblEnemy.sp.visible) {
    lblEnemy.sp.position.set(clamp(X, -4, 2), 3.4, -(Math.min(D + 9, HORDE_D0)));
    drawPill(lblEnemy, String(aliveEnemies), 'enemy');
  }

  // HUD progress
  const pr = Math.round(clamp(D / D_MAX, 0, 1) * 1000) / 10;
  if (pr !== hudPr) {
    hudPr = pr;
    barF.style.width = pr + '%';
  }
  hudL.textContent = state === 'won' ? 'CLEAR' : `STAGE ${levelIndex + 1}`;
  // live damage output — the number a boss shows is the damage you must land,
  // so the squad's own dmg/s is the yardstick the player reads it against
  const dps = Math.round(squadDps());
  if (dps !== hudDps) {
    hudDps = dps;
    hudDv.textContent = fmtShort(dps);
  }
  updatePowerHud();

  // water time
  world.waterMat.uniforms.uT.value = time;

  // camera
  const sx = (Math.random() - 0.5) * shake * 1.2;
  const sy = (Math.random() - 0.5) * shake * 0.9;
  // the chase rig eases back and up with the crowd so the formation never
  // outgrows the frame; classic stays rigid
  camCrowd += (clamp(hd, 0, 11) - camCrowd) * Math.min(1, dt * 2.6);
  const crowd = camRig === 0 ? camCrowd : 0;
  const camH = frameCfg.camH + crowd * frameCfg.crowdH - cheerK * 1.5;
  const camB = frameCfg.camB + crowd * frameCfg.crowdB - cheerK * 2.2;
  let cx;
  if (camRig === 0) {
    // lag the squad laterally and roll into the steer — a hard lane change
    // leans the horizon, a straight run sits level. The victory push-in adds a
    // slow party sway so the celebration reads from a couple of angles.
    const prevCamX = camX;
    const winSway = state === 'won' ? Math.sin(winCheerT * 0.8) * 0.9 : 0;
    camX += ((X + winSway) * 0.56 - camX) * Math.min(1, dt * 6.5);
    const vx = dt > 0 ? (camX - prevCamX) / dt : 0;
    camRoll += (clamp(-vx * 0.006, -0.05, 0.05) - camRoll) * Math.min(1, dt * 7);
    cx = camX;
  } else {
    cx = X * 0.2 + 0.25;
  }
  const fov = frameCfg.fov - fovK * fovK * (camRig === 0 ? 5 : 3.2);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  if (camOverride) {
    camera.fov = 44;
    camera.updateProjectionMatrix();
    camera.position.set(camOverride[0], camOverride[1], camOverride[2]);
    camera.lookAt(camOverride[3], camOverride[4], camOverride[5]);
  } else {
    const bob = camRig === 0 ? Math.sin(time * 2.1) * 0.05 : 0;
    let px = cx + sx, py = camH + sy + bob, pz = -(D - camB);
    let tx = cx + sx, ty = frameCfg.lookY, tz = -(D + frameCfg.lookAhead);
    if (state === 'won') {
      // ease from the chase view into a low, centred shot of the celebrating
      // crowd, then orbit slowly so the party reads in 3D
      const k = clamp(winCheerT / 0.45, 0, 1);
      const wc = k * k * (3 - 2 * k);
      const orbit = Math.sin(winCheerT * 0.55) * 1.7;
      px = lerp(px, X + orbit + sx, wc);
      py = lerp(py, 5.6 + sy, wc);
      pz = lerp(pz, -(D - 10.4), wc);
      tx = lerp(tx, X + orbit * 0.3, wc);
      ty = lerp(ty, 1.1, wc);
      tz = lerp(tz, -D, wc);
    }
    camera.position.set(px, py, pz);
    camera.lookAt(tx, ty, tz);
    if (camRig === 0) camera.rotateZ(camRoll);
  }
  world.sun.position.set(cx - 26, 46, -(D - 18));
  world.sun.target.position.set(cx, 0, -(D + 10));

  // end-of-run overlay
  if (state === 'won' && endT === 0) {
    endT = 0.0001;
    const last = levelIndex >= LEVELS.length - 1, wonLevel = levelIndex;
    setTimeout(() => {
      if (state !== 'won' || levelIndex !== wonLevel) return;
      showOverlay('VICTORY!', 'win',
        `<div class="chips"><div class="chip">STAGE<b>${levelIndex + 1}/${LEVELS.length}</b></div><div class="chip">SQUAD<b>${aliveN()}</b></div><div class="chip">TIME<b>${gt.toFixed(1)}s</b></div><div class="chip">DEFEATED<b>${kills}</b></div></div>`,
        last ? 'PLAY AGAIN' : 'NEXT STAGE', aliveN() >= 120 ? 3 : aliveN() >= 80 ? 2 : 1,
        last ? 'restart' : 'next');
    }, 2600);
  } else if (state === 'lost' && endT === 0) {
    endT = 0.0001;
    const lostLevel = levelIndex;
    setTimeout(() => {
      if (state !== 'lost' || levelIndex !== lostLevel) return;
      showOverlay('DEFEATED', 'lose',
        `${loseMsg || 'Your squad was overrun.'}<br><span style="opacity:.8">Stage ${levelIndex + 1} — ${L.name}</span>`,
        'RETRY', 0, 'restart');
    }, 500);
  }
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), fpsAvg = 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsAvg = fpsAvg * 0.95 + (1 / Math.max(0.001, dt)) * 0.05;
  renderer.info.autoReset = false;
  renderer.info.reset();
  if (slowT > 0) {
    slowT -= dt;
    if (slowT <= 0) timeScale = 1;
  }
  const sdt = dt * timeScale;
  update(sdt);
  syncVisuals(sdt);
  if (quality > 0 && composer) composer.render();
  else renderer.render(scene, camera);
}

let camOverride = null;

// dev hook used by the smoke-test harness
window.__bs = {
  cam(px, py, pz, tx, ty, tz) { camOverride = px === null ? null : [px, py, pz, tx, ty, tz]; },
  get state() { return state; },
  get gt() { return gt; },
  get D() { return D; },
  get X() { return X; },
  get N() { return aliveN(); },
  get enemies() { return enemies.length; },
  get bosses() { return bosses.length; },
  get atk() { return atk; },
  get hero() { return hero.state; },
  get kills() { return kills; },
  get fps() { return Math.round(fpsAvg); },
  get level() { return levelIndex; },
  get levelCount() { return LEVELS.length; },
  get levelCfg() { return L; },
  get bossInfo() {
    const b = bosses.find(q => !q.dead && q.kind !== 2) || bosses.find(q => !q.dead);
    return b ? { x: b.x, d: b.d, hp: Math.round(b.hp), maxHp: b.maxHp, kind: b.kind, active: b.active } : null;
  },
  get bossList() {
    return bosses.map(b => ({
      kind: b.kind, hp: Math.round(b.hp), maxHp: b.maxHp, dealt: Math.round(b.dealt),
      active: b.active, dead: b.dead, d: +b.d.toFixed(1),
    }));
  },
  get powers() { return { ...powerState, battery: missileBattery, pickups: powerPickups.map(p => ({ kind: p.kind, x: p.x, d: p.d, taken: p.taken })) }; },
  get nextRow() {
    let row = null;
    for (const r of gateRows) if (!r.done && r.d > D && (!row || r.d < row.d)) row = r;
    return row ? { d: +row.d.toFixed(1), options: row.gates.map(g => ({ x: g.x, expr: g.label, value: g.value })) } : null;
  },
  get gateInfo() {
    let near = null;
    for (const g of gates) if (g.alive && (!near || Math.abs(g.d - D) < Math.abs(near.d - D))) near = g;
    const s = soldiers.find(q => !q.dead);
    return {
      alive: gates.filter(g => g.alive).length,
      rowsLeft: gateRows.filter(r => !r.done).length,
      near: near ? { d: +near.d.toFixed(2), x: near.x, v: near.value, expr: near.label } : null,
      X: +X.toFixed(2), D: +D.toFixed(2), n: soldiers.length,
      sx: s ? +s.x.toFixed(2) : null, sd: s ? +s.d.toFixed(2) : null,
    };
  },
  get dps() { return Math.round(squadDps()); },
  get missileCount() { return missiles.count; },
  startLevel(i) { startLevel(i); },
  next() { nextStage(); },
  // headless balance harness: advance the simulation without waiting for frames
  sim(sec, step = 1 / 60) {
    const n = Math.max(1, Math.round(sec / step));
    for (let i = 0; i < n; i++) update(step);
    return { state, D: +D.toFixed(1), N: aliveN(), kills };
  },
  get info() { const r = renderer.info.render; return { calls: r.calls, tris: r.triangles, points: r.points }; },
  start() { startGame(); },
  steer(x) { targetX = x; },
  camMode(name) {
    if (name === undefined) return CAM_RIGS[camRig];
    const i = CAM_RIGS.indexOf(String(name).toUpperCase());
    if (i >= 0) setCamRig(i);
    return CAM_RIGS[camRig];
  },
  get camModeName() { return CAM_RIGS[camRig]; },
  get camState() {
    return { pos: camera.position.toArray().map(v => +v.toFixed(2)), fov: +camera.fov.toFixed(1), hd: +hd.toFixed(2), hw: +hw.toFixed(2), camCrowd: +camCrowd.toFixed(2), camX: +camX.toFixed(2) };
  },
};

// ------------------------------------------------------------------ boot
resize();
applyQuality();
toMenu();
initAudio();

// loader fade (everything is procedural — brief hold for the title reveal)
{
  const lf = $('lfill'), lt = $('ltxt'), ld = $('load');
  let p = 0;
  const step = () => {
    p += 0.12 + Math.random() * 0.1;
    lf.style.width = Math.min(100, p * 100) + '%';
    lt.textContent = 'LOADING… ' + Math.round(Math.min(1, p) * 100) + '%';
    if (p < 1) requestAnimationFrame(step);
    else {
      lt.textContent = 'LOADING… 100%';
      ld.classList.add('done');
      setTimeout(() => { ld.style.display = 'none'; }, 500);
      requestAnimationFrame(frame);
    }
  };
  requestAnimationFrame(step);
}
