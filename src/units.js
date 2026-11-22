import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/addons/geometries/RoundedBoxGeometry.js';

// ------------------------------------------------------------------ geometry helpers
const rb = (x, y, z, r = 0.03, s = 3) => new RoundedBoxGeometry(x, y, z, s, Math.min(r, Math.min(x, y, z) * 0.45));
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const cyl = (r0, r1, h, s = 12) => new THREE.CylinderGeometry(r0, r1, h, s);
const cone = (r, h, s = 10) => new THREE.ConeGeometry(r, h, s);
const cap = (r, l, s = 10) => new THREE.CapsuleGeometry(r, l, 4, s);
const tor = (r, t, s = 16, ts = 8) => new THREE.TorusGeometry(r, t, ts, s);

const M = (color, rough = 0.5, metal = 0, env = 0.5, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: env, ...extra });
const MP = (color, rough = 0.3, metal = 0.2, env = 1.0, extra = {}) =>
  new THREE.MeshPhysicalMaterial({
    color, roughness: rough, metalness: metal, envMapIntensity: env,
    clearcoat: 1, clearcoatRoughness: 0.12, ...extra,
  });

// ------------------------------------------------------------------ palettes
export const PAL = {
  soldier: {
    suit: M(0x122a5e, 0.6, 0.1, 0.4),
    armor: MP(0x2064ff, 0.28, 0.25, 1.0),
    armorLite: MP(0x8fc9ff, 0.26, 0.18, 1.05),
    trim: M(0xffc531, 0.22, 1, 1.15),
    skin: M(0xffcf9f, 0.62, 0, 0.3),
    visor: M(0x0a1220, 0.15, 0.6, 1.2, { emissive: 0x2a86b8, emissiveIntensity: 0.45 }),
    metal: M(0x333a48, 0.32, 0.85, 1.0),
    sole: M(0x14171f, 0.7, 0.1, 0.2),
    pack: M(0x1a2c52, 0.55, 0.25, 0.5),
    glow: M(0x9fe8ff, 0.2, 0, 0.4, { emissive: 0x66d9ff, emissiveIntensity: 2.2 }),
  },
  powered: {
    suit: M(0x22406f, 0.45, 0.3, 0.8),
    armor: MP(0x9fc8e8, 0.26, 0.3, 1.05, { emissive: 0x2a6fc4, emissiveIntensity: 0.18 }),
    armorLite: MP(0xcfe6f7, 0.22, 0.28, 1.1, { emissive: 0x4f9fd8, emissiveIntensity: 0.22 }),
    trim: M(0xffd24a, 0.2, 1, 1.2, { emissive: 0x6a4400, emissiveIntensity: 0.2 }),
    skin: M(0xffdcc0, 0.58, 0, 0.3),
    visor: M(0x140a18, 0.14, 0.6, 1.2, { emissive: 0xff7fe0, emissiveIntensity: 1.5 }),
    metal: M(0x394152, 0.32, 0.85, 1.0),
    sole: M(0x1a1e28, 0.7, 0.1, 0.2),
    pack: M(0x2c4a7a, 0.5, 0.3, 0.7),
    glow: M(0xffc9f5, 0.2, 0, 0.4, { emissive: 0xff66e0, emissiveIntensity: 1.8 }),
  },
  enemy: {
    suit: M(0x2e0b11, 0.65, 0.1, 0.3),
    armor: MP(0xc4281f, 0.42, 0.1, 0.75),
    armorLite: MP(0xd6543c, 0.45, 0.05, 0.75),
    trim: M(0x767e92, 0.32, 0.85, 0.95),
    skin: M(0xe8b78d, 0.62, 0, 0.3),
    visor: M(0x1a0a06, 0.2, 0.3, 0.6, { emissive: 0xff9a1f, emissiveIntensity: 0.65 }),
    metal: M(0x241014, 0.5, 0.45, 0.55),
    sole: M(0x10080a, 0.7, 0.1, 0.2),
    pack: M(0x4a141c, 0.55, 0.2, 0.5),
    glow: M(0xffc06a, 0.2, 0, 0.4, { emissive: 0xff7a1f, emissiveIntensity: 1.8 }),
  },
};

// ------------------------------------------------------------------ soldier parts
// Smooth rounded forms (spheres / capsules) so the units read as glossy blobs
// rather than stacked boxes. Legs and arms carry an `anim` pivot so the
// renderer can swing them per instance.
export function soldierParts(P) {
  const L = [];
  const add = (geo, key, pos, rot, scl, anim) => L.push({ geo, mat: P[key], key, pos, rot, scl, anim });
  const legPivot = (s) => ({ pivot: [s * 0.095, 0.45, 0], sign: s, limb: 'leg' });
  const armPivot = (s) => ({ pivot: [s * 0.225, 0.71, 0], sign: -s * 0.8, limb: 'arm' });

  for (const s of [-1, 1]) {
    add(cap(0.062, 0.16, 8), 'suit', [s * 0.095, 0.22, 0.005], null, null, legPivot(s));
    add(sph(0.105, 10, 8), 'metal', [s * 0.095, 0.055, -0.03], null, [1, 0.72, 1.55], legPivot(s));
    add(cap(0.052, 0.13, 8), 'armor', [s * 0.24, 0.5, -0.02], [0.12, 0, s * 0.06], null, armPivot(s));
    add(sph(0.062, 8, 6), 'sole', [s * 0.255, 0.4, -0.07], null, null, armPivot(s));
  }
  add(sph(0.19, 12, 8), 'suit', [0, 0.46, 0], null, [1, 0.74, 0.8]);
  add(cyl(0.168, 0.168, 0.055, 18), 'trim', [0, 0.5, 0]);
  add(sph(0.05, 10, 8), 'armorLite', [0, 0.5, -0.155], null, [1.6, 1, 0.7]);
  add(sph(0.205, 14, 10), 'armor', [0, 0.63, 0], null, [1, 0.98, 0.8]);
  add(sph(0.155, 12, 8), 'armorLite', [0, 0.665, -0.115], null, [1, 0.8, 0.45]);
  add(sph(0.12, 10, 8), 'suit', [0, 0.55, -0.12], null, [1, 0.6, 0.42]);
  add(sph(0.11, 10, 8), 'pack', [0, 0.64, 0.145], null, [1, 1.1, 0.62]);
  add(cyl(0.008, 0.008, 0.3, 5), 'metal', [0.105, 0.9, 0.185]);
  add(sph(0.022, 8, 6), 'glow', [0.105, 1.055, 0.185]);
  for (const s of [-1, 1]) {
    add(sph(0.1, 10, 8), 'armorLite', [s * 0.225, 0.715, 0], null, [1, 0.85, 1]);
    add(sph(0.045, 10, 8), 'pack', [s * 0.15, 0.47, -0.1], null, [1, 1.2, 0.7]);
  }
  add(cyl(0.05, 0.05, 0.06, 10), 'suit', [0, 0.825, 0]);
  add(sph(0.088, 16, 12), 'skin', [0, 0.9, -0.012]);
  add(sph(0.122, 14, 10), 'armor', [0, 0.945, 0.012], null, [1, 0.9, 1]);
  add(sph(0.034, 10, 8), 'armorLite', [0, 0.995, 0.015], null, [1, 1.1, 2.8]);
  add(sph(0.1, 12, 8), 'visor', [0, 0.902, -0.082], null, [0.64, 0.26, 0.5]);
  for (const s of [-1, 1]) add(sph(0.034, 10, 8), 'armorLite', [s * 0.112, 0.9, 0.012]);

  // rifle — carried in the right hand, so it follows the shoulder pivot
  add(rb(0.05, 0.065, 0.13, 0.018), 'metal', [0.19, 0.52, 0.03], null, null, armPivot(1));
  add(rb(0.055, 0.075, 0.3, 0.02), 'metal', [0.19, 0.545, -0.16], null, null, armPivot(1));
  add(rb(0.04, 0.1, 0.06, 0.012), 'metal', [0.19, 0.475, -0.135], [0.35, 0, 0], null, armPivot(1));
  add(cyl(0.018, 0.018, 0.22, 10), 'metal', [0.19, 0.55, -0.4], [Math.PI / 2, 0, 0], null, armPivot(1));
  add(rb(0.03, 0.032, 0.07, 0.008), 'armorLite', [0.19, 0.6, -0.2], null, null, armPivot(1));
  add(cyl(0.026, 0.026, 0.04, 10), 'glow', [0.19, 0.55, -0.51], [Math.PI / 2, 0, 0], null, armPivot(1));
  return L;
}

// ------------------------------------------------------------------ enemy parts
export function enemyParts(P) {
  const L = [];
  const add = (geo, key, pos, rot, scl, anim) => L.push({ geo, mat: P[key], key, pos, rot, scl, anim });
  const legPivot = (s) => ({ pivot: [s * 0.1, 0.45, 0], sign: s });
  const armPivot = (s) => ({ pivot: [s * 0.235, 0.72, 0], sign: -s * 0.8 });

  for (const s of [-1, 1]) {
    add(cap(0.068, 0.16, 8), 'suit', [s * 0.1, 0.22, 0.005], null, null, legPivot(s));
    add(sph(0.115, 10, 8), 'metal', [s * 0.1, 0.055, -0.03], null, [1, 0.7, 1.5], legPivot(s));
    add(cap(0.058, 0.13, 8), 'armor', [s * 0.255, 0.5, -0.02], [0.14, 0, s * 0.08], null, armPivot(s));
    add(sph(0.078, 10, 8), 'metal', [s * 0.275, 0.4, -0.06], null, null, armPivot(s));
  }
  add(sph(0.2, 12, 8), 'suit', [0, 0.46, 0], null, [1, 0.74, 0.82]);
  add(cyl(0.178, 0.178, 0.06, 18), 'trim', [0, 0.5, 0]);
  add(sph(0.05, 10, 8), 'glow', [0, 0.5, -0.168], null, [1.5, 1, 0.7]);
  add(sph(0.225, 14, 10), 'armor', [0, 0.64, 0], null, [1, 1, 0.82]);
  add(sph(0.17, 12, 8), 'armorLite', [0, 0.68, -0.12], null, [1, 0.8, 0.45]);
  for (let i = 0; i < 3; i++) add(cone(0.05, 0.22, 10), 'trim', [0, 0.74 - i * 0.13, 0.19], [-0.75, 0, 0]);
  for (const s of [-1, 1]) {
    add(sph(0.105, 10, 8), 'armor', [s * 0.245, 0.73, 0], null, [1, 0.9, 1]);
    add(cone(0.055, 0.2, 10), 'trim', [s * 0.27, 0.85, 0], [0, 0, -s * 0.45]);
    add(sph(0.042, 10, 8), 'metal', [s * 0.13, 0.47, -0.11], null, [1, 1.2, 0.7]);
  }
  add(cyl(0.055, 0.055, 0.06, 10), 'suit', [0, 0.855, 0]);
  add(sph(0.092, 12, 8), 'skin', [0, 0.93, -0.014]);
  add(sph(0.138, 14, 10), 'metal', [0, 0.972, 0.014], null, [1, 0.9, 1]);
  add(cone(0.055, 0.24, 10), 'trim', [0, 1.115, 0.02]);
  for (const s of [-1, 1]) add(sph(0.028, 10, 8), 'visor', [s * 0.05, 0.945, -0.112], null, [1, 1, 0.6]);
  add(sph(0.082, 10, 8), 'armorLite', [0, 0.872, -0.085], null, [1.15, 0.6, 0.8]);
  for (let i = 0; i < 2; i++) add(cone(0.018, 0.05, 6), 'trim', [-0.03 + i * 0.06, 0.852, -0.115], [Math.PI, 0, 0]);
  return L;
}

// ------------------------------------------------------------------ instanced unit renderer
export class UnitRenderer {
  constructor(scene, parts, max, opts = {}) {
    this.parts = parts;
    this.max = max;
    this.meshes = [];
    this.faceOffset = opts.faceOffset ?? 0;
    this.tilt = opts.tilt ?? 0;
    const shadow = opts.shadow !== false;
    for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, max);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = shadow;
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
      this.meshes.push(im);
    }
    this._m = new THREE.Matrix4();
    this._local = new THREE.Matrix4();
    this._tmp = new THREE.Matrix4();
    this._rx = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._pre = [];
    for (const p of parts) {
      const lm = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot || [0, 0, 0])));
      lm.compose(new THREE.Vector3(...p.pos), q, new THREE.Vector3(...(p.scl || [1, 1, 1])));
      this._pre.push(lm);
      if (p.anim) {
        // rotation happens around the limb pivot: local = M * T(pivot) * Rx * T(-pivot) * pre
        const [px, py, pz] = p.anim.pivot;
        p._pivot = new THREE.Matrix4().makeTranslation(px, py, pz);
        p._rest = new THREE.Matrix4().makeTranslation(-px, -py, -pz).multiply(lm);
      }
    }
  }

  setMaterials(palette) {
    for (let i = 0; i < this.parts.length; i++) {
      const key = this.parts[i].key;
      if (key && palette[key]) this.meshes[i].material = palette[key];
    }
  }

  update(units, time) {
    let n = 0;
    for (const u of units) {
      if (u.dead) continue;
      if (n >= this.max) break;
      // Every unit gets its own stride speed, amplitude and phase so the horde
      // never marches in lockstep.
      const walk = u.walk || 0;
      // `cheer` is set on the squad when a level is won: the unit hops in place,
      // turns to face the player and waves both arms overhead.
      const cheer = u.cheer || 0;
      const cheering = cheer > 0.01;
      const cph = time * (u.cheerRate || 3.4) + (u.cheerPh ?? u.phase);
      const walking = walk > 0.02 && !cheering;
      const rate = (walking ? 7.6 : 2.1) * (u.rate || 1);
      const ph = time * rate + u.phase;
      const swing = walking ? Math.sin(ph) * walk : 0;
      const bob = cheering
        ? Math.abs(Math.sin(cph)) * 0.46 * cheer
        : walking ? Math.sin(ph * 1.1) * (0.018 + walk * 0.02) : Math.sin(ph) * 0.011;
      const lean = Math.sin(ph) * (walking ? 0.03 : 0.011);
      this._e.set(
        cheering ? Math.sin(cph * 0.5) * 0.07 * cheer : lean * 0.6 - walk * 0.16,
        this.faceOffset + (u.yaw || 0) + (cheering ? Math.PI * cheer : 0),
        this.tilt,
      );
      this._q.setFromEuler(this._e);
      this._p.set(u.x, (u.y || 0) + bob, -u.d);
      const sc = u.scale || 1;
      const squash = 1 + (cheering ? Math.sin(cph * 2) * 0.03 * cheer : walking ? Math.sin(ph * 2) * 0.018 : Math.sin(ph) * 0.008);
      this._s.set(sc, sc * squash, sc);
      this._m.compose(this._p, this._q, this._s);
      for (let i = 0; i < this.meshes.length; i++) {
        const p = this.parts[i];
        if (p.anim) {
          let ang = swing * p.anim.sign;
          if (cheering) {
            const side = p.anim.sign > 0 ? 0 : Math.PI;
            const raise = p.anim.limb === 'arm'
              ? (2.55 + Math.sin(cph * 1.8 + side) * 0.22) * cheer
              : (0.3 + Math.sin(cph + side) * 0.18) * cheer;
            ang = ang * (1 - cheer) + raise;
          }
          this._rx.makeRotationX(ang);
          this._tmp.multiplyMatrices(this._m, p._pivot);
          this._tmp.multiply(this._rx);
          this._tmp.multiply(p._rest);
          this.meshes[i].setMatrixAt(n, this._tmp);
        } else {
          this._local.multiplyMatrices(this._m, this._pre[i]);
          this.meshes[i].setMatrixAt(n, this._local);
        }
      }
      n++;
    }
    for (const im of this.meshes) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    }
    return n;
  }
}

// ------------------------------------------------------------------ hero (detailed, single instance)
export function buildHero() {
  const g = new THREE.Group();
  const blue = MP(0x2064ff, 0.24, 0.25, 1.05);
  const lite = MP(0x8fc9ff, 0.24, 0.18, 1.1);
  const gold = M(0xffc531, 0.2, 1, 1.2);
  const skin = M(0xffcf9f, 0.6, 0, 0.3);
  const navy = M(0x122a5e, 0.55, 0.15, 0.5);
  const white = M(0xf2f6ff, 0.35, 0, 0.5);
  const metal = M(0x2c313d, 0.3, 0.85, 1);
  const red = MP(0xff2c4e, 0.45, 0.15, 0.7);
  const glow = M(0x9fe8ff, 0.2, 0, 0.4, { emissive: 0x66d9ff, emissiveIntensity: 3.0 });
  const visor = M(0x0a1220, 0.12, 0.6, 1.3, { emissive: 0x66e0ff, emissiveIntensity: 2.4 });

  const add = (p, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz);
    m.castShadow = true; p.add(m); return m;
  };

  // hips + legs
  add(g, rb(0.34, 0.2, 0.24, 0.06), navy, 0, 0.45, 0);
  add(g, cyl(0.27, 0.27, 0.07, 18), gold, 0, 0.52, 0);
  add(g, rb(0.12, 0.08, 0.04, 0.015), gold, 0, 0.52, -0.26);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.15, 0.44, 0);
    g.add(leg);
    add(leg, cap(0.085, 0.12), navy, 0, -0.1, 0);
    const shin = new THREE.Group();
    shin.position.set(0, -0.2, 0);
    leg.add(shin);
    leg.userData.shin = shin;
    add(shin, sph(0.06), gold, 0, 0, -0.09);
    add(shin, cap(0.075, 0.11), blue, 0, -0.1, 0);
    add(shin, rb(0.13, 0.12, 0.1, 0.03), lite, 0, -0.09, -0.07);
    add(shin, rb(0.24, 0.19, 0.38, 0.05), metal, 0, -0.22, -0.045);
    add(shin, rb(0.26, 0.06, 0.4, 0.02), gold, 0, -0.13, -0.045);
    add(shin, rb(0.24, 0.05, 0.34, 0.015), gold, 0, -0.31, -0.05);
    legs.push(leg);
  }
  // torso
  const torso = new THREE.Group();
  torso.position.set(0, 0.5, 0);
  g.add(torso);
  add(torso, rb(0.56, 0.34, 0.4, 0.09, 4), blue, 0, 0.22, 0);
  add(torso, rb(0.42, 0.2, 0.08, 0.03), lite, 0, 0.26, -0.2);
  add(torso, rb(0.46, 0.05, 0.42, 0.02), gold, 0, 0.11, 0);
  // star emblem
  {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.05 : 0.115;
      const a = i / 10 * Math.PI * 2 + Math.PI / 2;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i) shape.lineTo(px, py); else shape.moveTo(px, py);
    }
    const star = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 }), gold);
    star.position.set(0, 0.3, -0.245); star.rotation.y = Math.PI;
    torso.add(star);
  }
  add(torso, tor(0.21, 0.035, 20, 8), red, 0, 0.47, 0, 1, 1, 0.55, Math.PI / 2, 0, 0);
  // cape (animated)
  const cape = new THREE.Group();
  cape.position.set(0, 0.42, 0.22);
  torso.add(cape);
  for (let i = 0; i < 3; i++) {
    add(cape, rb(0.42 - i * 0.06, 0.3, 0.05, 0.02), red, 0, -0.16 - i * 0.27, 0.02 + i * 0.02, 1, 1, 1, 0.12 + i * 0.06, 0, 0);
  }
  // backpack + jet glow
  add(torso, rb(0.34, 0.3, 0.16, 0.05), blue, 0, 0.24, 0.23);
  for (const s of [-1, 1]) add(torso, cyl(0.05, 0.05, 0.16, 10), metal, s * 0.11, 0.24, 0.32, 1, 1, 1, Math.PI / 2, 0, 0);
  add(torso, cyl(0.07, 0.07, 0.04, 12), glow, 0, 0.24, 0.37, 1, 1, 1, Math.PI / 2, 0, 0);
  // arms
  const arms = [];
  for (const s of [-1, 1]) {
    add(torso, rb(0.2, 0.15, 0.24, 0.05), lite, s * 0.4, 0.44, 0);
    add(torso, rb(0.22, 0.035, 0.25, 0.012), gold, s * 0.4, 0.37, 0);
    const arm = new THREE.Group();
    arm.position.set(s * 0.45, 0.38, 0);
    torso.add(arm);
    add(arm, cap(0.065, 0.1), blue, 0, -0.09, 0);
    const fore = new THREE.Group();
    fore.position.set(0, -0.17, 0);
    arm.add(fore);
    arm.userData.fore = fore;
    add(fore, cap(0.06, 0.1), lite, 0, -0.08, 0);
    add(fore, cyl(0.08, 0.08, 0.03, 12), gold, 0, -0.04, 0);
    add(fore, rb(0.11, 0.1, 0.12, 0.03), white, 0, -0.19, 0);
    for (let f = 0; f < 3; f++) add(fore, rb(0.025, 0.05, 0.03, 0.008), white, -0.03 + f * 0.03, -0.255, -0.03);
    arms.push(arm);
  }
  // head
  const head = new THREE.Group();
  head.position.set(0, 0.56, 0);
  torso.add(head);
  add(head, sph(0.2, 16, 12), skin, 0, 0.04, -0.01);
  add(head, new THREE.SphereGeometry(0.25, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), blue, 0, 0.07, 0);
  add(head, cyl(0.257, 0.257, 0.035, 18), gold, 0, 0.02, 0);
  add(head, rb(0.32, 0.085, 0.06, 0.02), visor, 0, 0.03, -0.215);
  add(head, rb(0.042, 0.15, 0.34, 0.016), gold, 0, 0.32, 0.03);
  add(head, cyl(0.008, 0.008, 0.2, 5), metal, 0.16, 0.33, 0.1);
  add(head, sph(0.022), glow, 0.16, 0.44, 0.1);
  for (const s of [-1, 1]) add(head, rb(0.035, 0.14, 0.2, 0.012), gold, s * 0.27, 0.17, 0.06, 1, 1, 1, 0, 0, -s * 0.5);
  // shoulder cannon
  const cannon = new THREE.Group();
  cannon.position.set(0.47, 0.6, 0);
  torso.add(cannon);
  add(cannon, rb(0.16, 0.18, 0.2, 0.04), metal, 0, -0.02, 0.04);
  add(cannon, cyl(0.13, 0.13, 0.9, 14), metal, 0, 0, -0.15, 1, 1, 1, Math.PI / 2, 0, 0);
  add(cannon, cyl(0.155, 0.155, 0.06, 14), gold, 0, 0, 0.12, 1, 1, 1, Math.PI / 2, 0, 0);
  add(cannon, cyl(0.155, 0.155, 0.06, 14), gold, 0, 0, -0.3, 1, 1, 1, Math.PI / 2, 0, 0);
  add(cannon, cyl(0.17, 0.17, 0.14, 14), metal, 0, 0, -0.63, 1, 1, 1, Math.PI / 2, 0, 0);
  add(cannon, cyl(0.125, 0.125, 0.03, 14), glow, 0, 0, -0.71, 1, 1, 1, Math.PI / 2, 0, 0);
  add(cannon, rb(0.08, 0.16, 0.1, 0.02), metal, 0, -0.16, -0.1);

  g.scale.setScalar(2.2);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: g, torso, head, arms, legs, cannon, cape };
}

// ------------------------------------------------------------------ boss (armoured ogre)
const BOSS_PALS = [
  { skin: 0xe23a32, lite: 0xff7a5c, armor: 0x5b1a22, trim: 0xffc640, cloth: 0x2a1014, eye: 0xffc24a },
  { skin: 0xd92f72, lite: 0xff7fae, armor: 0x47236e, trim: 0xffd24a, cloth: 0x1f1030, eye: 0xffe07a },
  { skin: 0xc8201c, lite: 0xf2613c, armor: 0x23232e, trim: 0xffb31f, cloth: 0x5a0d14, eye: 0xff8a2a },
];

export function buildBoss(kind) {
  const pal = BOSS_PALS[kind] || BOSS_PALS[0];
  const g = new THREE.Group();
  const skin = MP(pal.skin, 0.42, 0.02, 0.85);
  const lite = MP(pal.lite, 0.44, 0.02, 0.85);
  const armor = MP(pal.armor, 0.3, 0.75, 1.05);
  const trim = M(pal.trim, 0.2, 1, 1.2);
  const bone = M(0xfff0d2, 0.32, 0, 0.35);
  const cloth = M(pal.cloth, 0.75, 0, 0.3);
  const dark = M(0x1c1012, 0.55, 0.2, 0.5);
  const eyeM = M(0x1a0f00, 0.2, 0.3, 0.6, { emissive: pal.eye, emissiveIntensity: 3.0 });
  const gemM = M(0xffc060, 0.2, 0, 0.4, { emissive: 0xff7a1f, emissiveIntensity: 2.6 });
  const add = (p, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz);
    m.castShadow = true; p.add(m); return m;
  };
  const hips = new THREE.Group();
  g.add(hips);
  add(hips, sph(0.6, 18, 12), cloth, 0, 1.3, 0, 1.5, 0.85, 1.3);
  add(hips, cyl(0.62, 0.62, 0.28, 18), armor, 0, 1.52, 0, 1.55, 1, 1.3);
  add(hips, cyl(0.27, 0.27, 0.1, 14), trim, 0, 1.52, 0.8, 1, 1, 1, Math.PI / 2, 0, 0);
  add(hips, sph(0.14, 12, 8), gemM, 0, 1.52, 0.86, 1, 1, 0.5);
  for (const i of [-1, 0, 1]) {
    add(hips, rb(0.38, 0.54, 0.1, 0.03), armor, i * 0.44, 1.08, 0.66 - Math.abs(i) * 0.12, 1, 1, 1, -0.12, -i * 0.4, 0);
    add(hips, rb(0.38, 0.07, 0.11, 0.02), trim, i * 0.44, 0.84, 0.69 - Math.abs(i) * 0.12, 1, 1, 1, -0.12, -i * 0.4, 0);
  }
  add(hips, rb(1.0, 0.76, 0.1, 0.03), cloth, 0, 1.0, -0.62, 1, 1, 1, 0.15, 0, 0);

  const body = new THREE.Group();
  body.position.y = 1.5;
  g.add(body);
  const Y = -1.5;
  add(body, cyl(0.55, 0.5, 0.74, 18), skin, 0, 1.95 + Y, 0, 1.6, 1, 1.3);
  add(body, sph(0.68, 20, 14), skin, 0, 2.6 + Y, 0, 2, 1.35, 1.44);
  // layered chest armour
  add(body, rb(1.5, 0.9, 0.42, 0.12, 4), armor, 0, 2.72 + Y, 0.56, 1, 1, 1, -0.12, 0, 0);
  add(body, rb(1.2, 0.22, 0.3, 0.06), trim, 0, 2.28 + Y, 0.66, 1, 1, 1, -0.12, 0, 0);
  add(body, rb(0.5, 0.4, 0.16, 0.05), trim, 0, 2.74 + Y, 0.8, 1, 1, 1, -0.12, 0, 0);
  add(body, sph(0.17, 12, 8), gemM, 0, 2.74 + Y, 0.9, 1, 1, 0.6);
  for (const s of [-1, 1]) {
    add(body, sph(0.27, 14, 10), lite, s * 0.5, 2.64 + Y, 0.62, 2, 1.6, 1.4);
    add(body, sph(0.2), skin, s * 0.86, 2.2 + Y, 0.1, 1.7, 2.5, 3);
    // rib cage bumps
    for (let r = 0; r < 3; r++) add(body, sph(0.095), lite, s * 0.2, 2.14 - r * 0.25 + Y, 0.68 - r * 0.02);
  }
  // back spikes
  for (let i = 0; i < 4; i++) add(body, cone(0.12, 0.5, 8), bone, 0, 3.05 - i * 0.42 + Y, -0.9 - i * 0.02, 1, 1, 1, -1.25, 0, 0);
  // collar
  add(body, tor(0.62, 0.15, 20, 8), armor, 0, 2.56 + Y, 0.02, 1.7, 1.7, 1.5, Math.PI / 2 - 0.25, 0.62, 0);
  add(body, sph(0.31, 16, 12), skin, 0, 3.12 + Y, -0.05, 2, 1.15, 1.6);
  for (const s of [-1, 1]) add(body, sph(0.25), skin, s * 0.62, 3.02 + Y, -0.1, 2, 1.05, 1.7, 0, 0, s * 0.35);

  // head
  const head = new THREE.Group();
  head.position.set(0, 3.5 + Y, 0.2);
  body.add(head);
  add(head, sph(0.28, 18, 12), skin, 0, 0, 0, 2, 2, 2);
  add(head, rb(0.56, 0.2, 0.3, 0.06), armor, 0, 0.3, -0.1, 1, 1, 1, 0.15, 0, 0);
  for (const s of [-1, 1]) {
    add(head, sph(0.075, 10, 8), eyeM, s * 0.17, 0.06, 0.24);
    add(head, rb(0.24, 0.08, 0.1, 0.02), dark, s * 0.17, 0.2, 0.22, 1, 1, 1, 0, 0, -s * 0.4);
    add(head, cone(0.1, 0.46, 8), bone, s * 0.23, 0.36, -0.02, 1, 1, 1, 0, 0, s * 0.5);
    add(head, cone(0.06, 0.24, 7), bone, s * 0.32, 0.18, -0.02, 1, 1, 1, 0, 0, s * 1.0);
  }
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.16, 0.05);
  head.add(jaw);
  add(jaw, sph(0.2, 14, 10), lite, 0, -0.02, 0.12, 1.9, 0.55, 1.5);
  for (let i = 0; i < 4; i++) add(jaw, cone(0.03, 0.1, 6), bone, -0.12 + i * 0.08, 0.06, 0.25, 1, 1, 1, 0, 0, Math.PI);
  for (let i = 0; i < 4; i++) add(head, cone(0.032, 0.11, 6), bone, -0.12 + i * 0.08, -0.1, 0.26, 1, 1, 1, Math.PI, 0, 0);

  // arms
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.95, 1.1, 0);
    body.add(sh);
    add(sh, sph(0.34, 14, 10), armor, 0, 0.05, 0, 1.5, 1.1, 1.3);
    add(sh, rb(0.42, 0.16, 0.42, 0.05), trim, 0, -0.14, 0, 1, 1, 1);
    for (let i = 0; i < 2; i++) add(sh, cone(0.09, 0.34, 7), trim, s * (0.12 + i * 0.1), 0.36, 0.02, 1, 1, 1, 0, 0, -s * (0.4 + i * 0.35));
    add(sh, sph(0.22, 12, 10), skin, 0, -0.38, 0.05, 1.3, 1.7, 1.3);
    const fore = new THREE.Group();
    fore.position.set(0, -0.72, 0.05);
    sh.add(fore);
    add(fore, sph(0.19), skin, 0, -0.3, 0, 1.25, 1.9, 1.25);
    add(fore, cyl(0.24, 0.22, 0.3, 14), armor, 0, -0.5, 0);
    add(fore, cyl(0.25, 0.25, 0.08, 14), trim, 0, -0.36, 0);
    add(fore, sph(0.26, 14, 10), lite, 0, -0.74, 0, 1.35, 1.15, 1.35);
    for (let i = 0; i < 3; i++) add(fore, cone(0.055, 0.16, 6), bone, (i - 1) * 0.12, -0.86, 0.16, 1, 1, 1, 0.5, 0, 0);
    arms.push({ sh, fore });
  }

  // legs
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.45, 1.1, 0);
    g.add(leg);
    add(leg, sph(0.3), cloth, 0, -0.15, 0, 1.2, 1.2, 1.2);
    add(leg, sph(0.24), skin, 0, -0.55, 0.03, 1.2, 1.6, 1.2);
    add(leg, rb(0.44, 0.24, 0.36, 0.05), armor, 0, -0.62, -0.14);
    add(leg, rb(0.46, 0.07, 0.38, 0.02), trim, 0, -0.5, -0.14);
    add(leg, rb(0.5, 0.28, 0.72, 0.06), armor, 0, -0.94, 0.12);
    add(leg, rb(0.52, 0.08, 0.74, 0.02), trim, 0, -0.82, 0.12);
    for (let i = 0; i < 3; i++) add(leg, cone(0.06, 0.16, 6), bone, (i - 1) * 0.14, -1.02, 0.46, 1, 1, 1, 1.35, 0, 0);
    legs.push(leg);
  }

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return { group: g, body, head, jaw, arms, legs, hips };
}
