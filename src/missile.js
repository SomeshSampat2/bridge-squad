import * as THREE from 'three';
import { canvasTex } from './world.js';

// ------------------------------------------------------------------ constants
const TAU = Math.PI * 2;
const MAX_AGE = 4;              // seconds of flight before self-destruct
const IMPACT_R = 1.1;           // proximity detonation radius
const REACQ_R = 6;              // re-acquire search radius around the aim point
const DECK_X = 9, D_LO = -2, D_HI = 200;
const HOME = 5.5;               // homing turn strength (1/s)
const LAUNCH_Y = 1.0, AIM_Y = 2.2;
const BODY_LEN = 1.15, BODY_R = 0.13;
const GLOW_SIZE = 0.5;
const GLOW_RGB = [2.4, 1.05, 0.3];
const TRAIL_INT = 0.1;          // seconds between onTrail callbacks

// ------------------------------------------------------------------ helpers
const falloff = (x, w, h) => {
  const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
};

// three quads crossed around the flight axis — a soft puff from any angle
function glowCross() {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3, c = Math.cos(a), s = Math.sin(a), b = pos.length / 3;
    for (const [px, py] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      pos.push(px * c, px * s, py);
      uv.push(px + 0.5, py + 0.5);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function findNear(list, ax, ad) {
  if (!list) return null;
  let best = null, bq = REACQ_R * REACQ_R;
  for (const t of list) {
    if (!t || t.dead) continue;
    const dx = t.x - ax, dd = t.d - ad, q = dx * dx + dd * dd;
    if (q < bq) { bq = q; best = t; }
  }
  return best;
}

// ------------------------------------------------------------------ pool
export function createMissiles(scene, opts = {}) {
  const max = opts.max ?? 24;
  const onTrail = opts.onTrail || null;
  const tex = opts.glowTex || canvasTex(64, 64, falloff, { srgb: false });

  // ---------------- body: hot dart, white nose fading to an orange tail
  // (cone UVs run v=1 at the base, v=0 at the tip, and canvas rows are flipped)
  const bodyTex = canvasTex(8, 64, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ff8a24');
    g.addColorStop(0.55, '#ffd08a');
    g.addColorStop(1, '#ffffff');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  const bodyGeo = new THREE.ConeGeometry(BODY_R, BODY_LEN, 8, 1).rotateX(Math.PI / 2);
  const bodyMat = new THREE.MeshBasicMaterial({
    map: bodyTex, color: new THREE.Color(3, 2.4, 1.6), toneMapped: false, fog: false,
  });
  const body = new THREE.InstancedMesh(bodyGeo, bodyMat, max);
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  body.frustumCulled = false;
  body.count = 0;
  body.visible = false;
  scene.add(body);

  // ---------------- exhaust: additive glow cross, faded per instance via colour
  const glowMat = new THREE.MeshBasicMaterial({
    map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
  const glow = new THREE.InstancedMesh(glowCross(), glowMat, max);
  glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glow.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  glow.frustumCulled = false;
  glow.renderOrder = 4;
  glow.count = 0;
  glow.visible = false;
  scene.add(glow);

  // ---------------- state
  const pool = [];
  for (let i = 0; i < max; i++) {
    pool.push({
      alive: false, x: 0, y: LAUNCH_Y, d: 0, vx: 0, vy: 0, vd: 0, speed: 0,
      dmg: 0, radius: 0, target: null, aimX: 0, aimY: AIM_Y, aimD: 0,
      ax: 0, ay: 0, ad: 1, age: 0, roll: 0, seed: 0, trail: 0, lost: true,
    });
  }
  const active = [];

  // scratch — nothing is allocated per frame
  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const _c = new THREE.Color();
  const ZAX = new THREE.Vector3(0, 0, 1);

  // ---------------- launch
  function launch(o = {}) {
    const m = pool.find(p => !p.alive);
    if (!m) return null;
    const x = o.x ?? 0, d = o.d ?? 0;
    const tx = o.tx ?? x, td = o.td ?? d + 24, ty = o.ty ?? AIM_Y;
    const dx = tx - x, dy = ty - LAUNCH_Y, dd = td - d;
    const len = Math.hypot(dx, dy, dd) || 1;
    const sp = o.speed ?? 26;
    m.alive = true;
    m.x = x; m.y = LAUNCH_Y; m.d = d;
    m.vx = (dx / len) * sp; m.vy = (dy / len) * sp; m.vd = (dd / len) * sp;
    m.speed = sp;
    m.dmg = o.dmg ?? 0;
    m.radius = o.radius ?? 1;
    m.target = o.target || null;
    m.aimX = tx; m.aimY = ty; m.aimD = td;
    m.ax = dx / len; m.ay = dy / len; m.ad = dd / len;   // launch heading
    m.age = 0; m.roll = Math.random() * TAU; m.seed = Math.random();
    m.trail = 0; m.lost = false;
    active.push(m);
    return m;
  }

  // ---------------- update
  function update(dt, targets) {
    const out = [];

    // physics + detonation
    for (let i = active.length - 1; i >= 0; i--) {
      const m = active[i];
      if (m.target && m.target.dead) { m.target = null; m.lost = false; }
      if (!m.target && !m.lost) { m.lost = true; m.target = findNear(targets, m.aimX, m.aimD); }
      const t = m.target;
      const live = !!(t && !t.dead);
      const ax = live ? t.x : m.aimX;
      const ay = live ? (t.y ?? AIM_Y) : m.aimY;
      const ad = live ? t.d : m.aimD;

      // steer toward the live target, otherwise keep the launch heading
      if (live) {
        const dx = ax - m.x, dy = ay - m.y, dd = ad - m.d;
        const l = Math.hypot(dx, dy, dd) || 1;
        const k = Math.min(1, HOME * dt);
        m.vx += ((dx / l) * m.speed - m.vx) * k;
        m.vy += ((dy / l) * m.speed - m.vy) * k;
        m.vd += ((dd / l) * m.speed - m.vd) * k;
        const n = m.speed / (Math.hypot(m.vx, m.vy, m.vd) || 1);
        m.vx *= n; m.vy *= n; m.vd *= n;
      }

      m.x += m.vx * dt; m.y += m.vy * dt; m.d += m.vd * dt;
      m.age += dt;
      m.roll += dt * 9;

      if (onTrail) {
        m.trail += dt;
        if (m.trail >= TRAIL_INT) {
          m.trail = 0;
          onTrail(m.x, m.y, m.d, Math.max(0, 1 - m.age / MAX_AGE));
        }
      }

      const ex = ax - m.x, ey = ay - m.y, ed = ad - m.d;
      let hit = false, hx = m.x, hy = m.y, hd = m.d;
      if (ex * ex + ey * ey + ed * ed < IMPACT_R * IMPACT_R) {
        hit = true; hx = ax; hy = ay; hd = ad;                     // land on the target
      } else if (!live && (m.x - m.aimX) * m.ax + (m.y - m.aimY) * m.ay + (m.d - m.aimD) * m.ad > 0) {
        hit = true;                                                 // flew past the aim point
      } else if (m.age > MAX_AGE || Math.abs(m.x) > DECK_X || m.d < D_LO || m.d > D_HI) {
        hit = true;                                                 // timeout / off the deck
      }

      if (hit) {
        out.push({ x: hx, y: hy, d: hd, dmg: m.dmg, radius: m.radius, target: live ? t : null });
        active.splice(i, 1);
        m.alive = false; m.target = null;
      }
    }

    // sync instances
    let n = 0;
    for (const m of active) {
      const ph = m.age * 9 + m.seed * TAU;
      // slight lateral wobble so it reads as a missile, not a bullet
      const px = m.x + Math.sin(ph) * 0.05;
      const py = m.y + Math.cos(ph * 1.2) * 0.04;
      _v.set(
        m.vx + Math.sin(m.age * 26 + m.seed * TAU) * 0.9,
        m.vy + Math.cos(m.age * 21 + m.seed * TAU) * 0.9,
        -m.vd,
      ).normalize();
      _q.setFromUnitVectors(ZAX, _v);
      _q2.setFromAxisAngle(ZAX, m.roll);
      _q.multiply(_q2);
      _p.set(px, py, -m.d);
      _s.set(1, 1, 1);
      _m4.compose(_p, _q, _s);
      body.setMatrixAt(n, _m4);

      const heat = Math.max(0, 1 - m.age / MAX_AGE);
      const k = (0.35 + 0.75 * heat) * (0.82 + 0.18 * Math.sin(m.age * 40 + m.seed * 60));
      _p.set(px, py, -m.d).addScaledVector(_v, -BODY_LEN * 0.62);
      _s.setScalar(GLOW_SIZE * (0.75 + 0.5 * heat));
      _m4.compose(_p, _q, _s);
      glow.setMatrixAt(n, _m4);
      _c.setRGB(GLOW_RGB[0] * k, GLOW_RGB[1] * k, GLOW_RGB[2] * k);
      glow.setColorAt(n, _c);
      n++;
    }

    body.count = n; glow.count = n;
    body.visible = glow.visible = n > 0;
    body.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
    if (glow.instanceColor) glow.instanceColor.needsUpdate = true;
    return out;
  }

  // ---------------- reset
  function reset() {
    for (const m of pool) {
      m.alive = false; m.target = null; m.age = 0; m.trail = 0; m.lost = true;
      m.vx = m.vy = m.vd = 0;
    }
    active.length = 0;
    body.count = 0; glow.count = 0;
    body.visible = glow.visible = false;
    body.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
  }

  return {
    launch,
    update,
    reset,
    get count() { return active.length; },
  };
}
