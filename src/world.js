import * as THREE from 'three';

// ------------------------------------------------------------------ constants
export const DECK_HW = 6.6;
export const FORT_D = 68;
const DK0 = -30, DK1 = 240;            // deck extents in metres (D space, +D = forward)
const DKL = DK1 - DK0;
const DKC = -(DK0 + DKL / 2);          // centre of the deck in world z
const TILE = DECK_HW * 2;

// ------------------------------------------------------------------ helpers
export function canvasTex(w, h, draw, { srgb = true, repeat = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

const std = (o) => new THREE.MeshStandardMaterial(o);
const boxG = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cylG = (r0, r1, h, s = 12) => new THREE.CylinderGeometry(r0, r1, h, s);
const sphG = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const coneG = (r, h, s = 12) => new THREE.ConeGeometry(r, h, s);

function shadeNoise(ctx, w, h, amount, tint) {
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = Math.random() < 0.5
      ? `rgba(255,255,255,${amount})`
      : `rgba(${tint},${amount})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.4, 1 + Math.random() * 2.4);
  }
}

// ------------------------------------------------------------------ build
export function buildWorld(scene, renderer) {
  const refs = { waterMat: null, fort: null };

  // ---------------- sky dome
  const skyGeo = new THREE.SphereGeometry(420, 32, 16);
  const skyUniforms = {
    top: { value: new THREE.Color(0x6db8ff) },
    mid: { value: new THREE.Color(0xcfe9ff) },
    bot: { value: new THREE.Color(0xf3e7cf) },
  };
  const skyVert = 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  const skyFrag = (out, spread) => `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
      void main(){ float h = normalize(vP).y;
        vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, ${spread}, h)) : mix(mid, bot, smoothstep(0.0, 0.25, -h));
        gl_FragColor = vec4(${out}, 1.0); }`;
  // The composer tone-maps the whole frame, so the visible dome hands over
  // linear colour, and it reaches the deep blue close to the horizon: the low
  // chase camera sees mostly the bottom 20 degrees of sky. The env copy keeps
  // the old gamma-encoded output and gradient — the PMREM reflections were
  // tuned against it.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: skyVert, fragmentShader: skyFrag('c', '0.16'),
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // ---------------- lights
  const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x6e7078, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.1);
  sun.position.set(-26, 46, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0006;
  sun.target.position.set(0, 0, -30);
  scene.add(sun, sun.target);
  refs.sun = sun;
  const rim = new THREE.DirectionalLight(0x8ec8ff, 0.55);
  rim.position.set(20, 18, -40);
  scene.add(rim);

  // ---------------- environment reflections (procedural PMREM)
  {
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
      vertexShader: skyVert, fragmentShader: skyFrag('pow(c, vec3(0.4545))', '0.55'),
    }));
    envScene.add(envSky);
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.6, 3) }));
    sunBall.position.set(-20, 30, 10);
    envScene.add(sunBall);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 24),
      new THREE.MeshBasicMaterial({ color: 0x31435e, side: THREE.DoubleSide }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -8;
    envScene.add(ground);
    const pmrem = new THREE.PMREMGenerator(renderer);
    refs.envMap = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
  }

  // ---------------- concrete deck
  const deckTex = canvasTex(2048, 2048, (x, w, h) => {
    x.fillStyle = '#b9bec9'; x.fillRect(0, 0, w, h);
    const cw = w / 3, rh = h / 2;
    // panel tone variation
    for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) {
      const v = Math.random();
      x.fillStyle = v < 0.5 ? `rgba(255,255,255,${0.03 + v * 0.1})` : `rgba(50,60,85,${(v - 0.5) * 0.12})`;
      x.fillRect(i * cw, j * rh, cw, rh);
    }
    // broad stains
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * w, b = Math.random() * h, r = 60 + Math.random() * 220;
      const g = x.createRadialGradient(a, b, 0, a, b, r);
      g.addColorStop(0, 'rgba(60,66,84,0.10)'); g.addColorStop(1, 'rgba(60,66,84,0)');
      x.fillStyle = g; x.fillRect(a - r, b - r, r * 2, r * 2);
    }
    // oil drips
    for (let i = 0; i < 14; i++) {
      const a = 200 + Math.random() * (w - 400), b = Math.random() * h;
      const r = 12 + Math.random() * 34;
      const g = x.createRadialGradient(a, b, 0, a, b, r);
      g.addColorStop(0, 'rgba(34,38,48,0.22)'); g.addColorStop(1, 'rgba(34,38,48,0)');
      x.fillStyle = g; x.fillRect(a - r, b - r, r * 2, r * 2);
    }
    // cracks
    x.strokeStyle = 'rgba(40,46,60,0.5)'; x.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      let a = Math.random() * w, b = Math.random() * h, ang = Math.random() * Math.PI * 2;
      x.lineWidth = 1 + Math.random() * 2;
      x.beginPath(); x.moveTo(a, b);
      for (let s = 0; s < 7; s++) { ang += (Math.random() - 0.5) * 0.9; a += Math.cos(ang) * (14 + Math.random() * 30); b += Math.sin(ang) * (14 + Math.random() * 30); x.lineTo(a, b); }
      x.stroke();
    }
    // brushed streaks
    for (let i = 0; i < 20; i++) { x.fillStyle = 'rgba(50,56,74,0.05)'; x.fillRect(70 + Math.random() * 1400, 0, 5 + Math.random() * 18, h); }
    // fine speckle
    shadeNoise(x, w, h, 0.09, '40,48,66');
    // panel seams
    for (const y of [0, rh]) {
      x.fillStyle = 'rgba(52,58,76,0.75)'; x.fillRect(0, y - 5, w, 10);
      x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, y + 5, w, 3);
    }
    x.fillStyle = 'rgba(52,58,76,0.3)'; x.fillRect(cw - 2, 0, 4, h); x.fillRect(2 * cw - 2, 0, 4, h);
    // expansion joint strip (rubber)
    for (const y of [rh * 0.5]) {
      x.fillStyle = 'rgba(30,34,44,0.55)'; x.fillRect(0, y - 3, w, 6);
    }
    // hazard band along the left edge
    x.save(); x.beginPath(); x.rect(12, 0, 60, h); x.clip();
    x.fillStyle = '#f2b90c'; x.fillRect(12, 0, 60, h);
    x.fillStyle = '#23252d';
    for (let y = -128; y < h + 128; y += 128) {
      x.beginPath(); x.moveTo(12, y); x.lineTo(72, y + 60); x.lineTo(72, y + 124); x.lineTo(12, y + 64); x.fill();
    }
    x.restore();
  }, { repeat: [1, DKL / TILE] });
  const deckMat = std({ map: deckTex, roughness: 0.82, metalness: 0, envMapIntensity: 0.26 });
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(TILE, DKL).rotateX(-Math.PI / 2), deckMat);
  deck.position.set(0, 0, DKC);
  deck.receiveShadow = true;
  scene.add(deck);

  // ---------------- barriers, girder, piers
  const conc = std({ color: 0xa3a8b6, roughness: 0.8, envMapIntensity: 0.3 });
  const steel = std({ color: 0x4d5468, roughness: 0.55, metalness: 0.5, envMapIntensity: 0.5 });
  const pierM = std({ color: 0x5c6276, roughness: 0.85 });
  const prof = [[0, -0.25], [0.78, -0.25], [0.78, 0.2], [0.56, 0.4], [0.44, 0.84], [0.16, 0.84], [0, 0.44]];
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape();
    const pts = s > 0 ? prof : prof.map(p => [-p[0], p[1]]).reverse();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    const b = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: DKL, bevelEnabled: false, steps: 1 }), conc);
    b.position.set(s * DECK_HW, 0, -DK1);
    b.receiveShadow = b.castShadow = true;
    scene.add(b);
  }
  const under = new THREE.Mesh(boxG(TILE + 1.3, 1.5, DKL), steel);
  under.position.set(0, -1.0, DKC);
  scene.add(under);
  for (const s of [-1, 1]) {
    const fl = new THREE.Mesh(boxG(0.35, 0.3, DKL), steel);
    fl.position.set(s * (DECK_HW + 0.95), -1.7, DKC);
    scene.add(fl);
  }
  for (let d = -10; d < DK1; d += 34) {
    const p = new THREE.Mesh(boxG(9.5, 14, 4.5), pierM);
    p.position.set(0, -8.7, -d); scene.add(p);
    const c2 = new THREE.Mesh(boxG(15.5, 1.2, 5.5), pierM);
    c2.position.set(0, -2.1, -d); scene.add(c2);
  }
  // reflector studs
  const studMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.9, 0.12) });
  const studs = new THREE.InstancedMesh(boxG(0.2, 0.09, 0.42), studMat, 200);
  let ns = 0;
  const m4 = new THREE.Matrix4();
  for (let d = -24; d < 220 && ns < 200; d += 2.8) {
    for (const s of [-1, 1]) { m4.makeTranslation(s * (DECK_HW + 0.3), 0.88, -d); studs.setMatrixAt(ns++, m4); }
  }
  studs.count = ns;
  studs.frustumCulled = false;
  scene.add(studs);

  // expansion joints + drain grates on the deck
  {
    const jointMat = std({ color: 0x2b3040, roughness: 0.7, metalness: 0.35 });
    const joints = new THREE.InstancedMesh(boxG(TILE - 0.2, 0.03, 0.16), jointMat, 60);
    let nj = 0;
    for (let d = -28; d < 236 && nj < 60; d += 4.4) { m4.makeTranslation(0, 0.012, -d); joints.setMatrixAt(nj++, m4); }
    joints.count = nj;
    joints.receiveShadow = true;
    scene.add(joints);
    const grateMat = std({ color: 0x3a4050, roughness: 0.55, metalness: 0.7 });
    const grates = new THREE.InstancedMesh(boxG(0.42, 0.03, 0.72), grateMat, 40);
    let ng = 0;
    for (let d = -20; d < 232 && ng < 40; d += 7.6) { m4.makeTranslation(-5.9, 0.013, -d); grates.setMatrixAt(ng++, m4); }
    grates.count = ng;
    grates.receiveShadow = true;
    scene.add(grates);
  }

  // ---------------- water
  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 },
      uDeep: { value: new THREE.Color(0.005, 0.022, 0.075) },
      uShal: { value: new THREE.Color(0.014, 0.082, 0.24) },
    },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uT; uniform vec3 uDeep; uniform vec3 uShal; varying vec3 vW;
      float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float ns(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hs(i), hs(i+vec2(1.0,0.0)), f.x), mix(hs(i+vec2(0.0,1.0)), hs(i+vec2(1.0,1.0)), f.x), f.y); }
      void main(){
        vec2 p = vW.xz * 0.11;
        float w = ns(p + vec2(uT*0.10, uT*0.07))*0.55 + ns(p*2.3 + vec2(-uT*0.13, uT*0.16))*0.3 + ns(p*5.7 + vec2(uT*0.3, -uT*0.2))*0.15;
        vec3 c = mix(uDeep, uShal, smoothstep(0.25, 0.8, w));
        float g = smoothstep(0.66, 0.75, w) * (0.4 + 0.6*ns(p*9.0 - uT*0.4));
        c += vec3(0.20,0.38,0.66) * g * 0.22;
        gl_FragColor = vec4(pow(c, vec3(0.4545)), 1.0); }`,
  });
  refs.waterMat = waterMat;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), waterMat);
  water.position.set(0, -15, -90);
  scene.add(water);

  // ---------------- fortress (guarded horde objective)
  const stoneTex = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#3d3146'; x.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row++) for (let col = -1; col < 4; col++) {
      x.fillStyle = `hsl(${272 + Math.random() * 14},${12 + Math.random() * 8}%,${34 + Math.random() * 12}%)`;
      x.fillRect(col * 64 + (row % 2) * 32 + 3, row * 32 + 3, 61, 29);
    }
    shadeNoise(x, w, h, 0.07, '20,12,30');
  }, { repeat: [3, 2.4] });
  const wallM = std({ map: stoneTex, roughness: 0.85, envMapIntensity: 0.3 });
  const towerM = wallM.clone();
  towerM.map = stoneTex.clone(); towerM.map.repeat.set(3, 3.2); towerM.map.needsUpdate = true;
  const darkM = new THREE.MeshBasicMaterial({ color: 0x0c060f });
  const redM = std({ color: 0xd3203c, roughness: 0.5, metalness: 0.1 });
  const goldM = std({ color: 0xffc83a, roughness: 0.25, metalness: 1, envMapIntensity: 1.1 });
  const fortGroup = new THREE.Group();
  scene.add(fortGroup);
  refs.fort = fortGroup;
  const HX0 = -6.05, HX1 = 2.85;
  const cx = (HX0 + HX1) / 2 - 0.3, W = 10.2;
  const addF = (g, m, x, y, z, sh = true) => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z);
    o.castShadow = sh; o.receiveShadow = true; fortGroup.add(o); return o;
  };
  addF(boxG(W, 8, 3.4), wallM, cx, 4, -(FORT_D + 2));
  for (let i = 0; i < 6; i++) addF(boxG(1, 1, 3.6), wallM, cx - W / 2 + 0.8 + i * (W - 1.6) / 5, 8.5, -(FORT_D + 2));
  addF(boxG(4.6, 5.6, 0.3), darkM, cx, 2.8, -(FORT_D + 0.2), false);
  addF(boxG(3.8, 3.2, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.22, 0.08) }), cx, 1.6, -(FORT_D + 0.45), false);
  addF(boxG(5.3, 0.5, 0.5), goldM, cx, 5.85, -(FORT_D + 0.15));
  for (let i = 0; i < 7; i++) {
    addF(cylG(0.09, 0.09, 5.4, 6), std({ color: 0x1d1a22, roughness: 0.4, metalness: 0.8 }),
      cx - 1.8 + i * 0.6, 2.8, -(FORT_D + 0.05), false);
  }
  const bannerTex = canvasTex(128, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#e22a48'); g.addColorStop(1, '#a3122c');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffc83a'; x.fillRect(0, 0, w, 14);
    x.beginPath(); x.moveTo(64, 70); x.lineTo(98, 120); x.lineTo(64, 170); x.lineTo(30, 120); x.closePath(); x.fill();
    x.fillStyle = '#a3122c'; x.beginPath(); x.arc(64, 120, 16, 0, Math.PI * 2); x.fill();
  });
  const banM = std({ map: bannerTex, roughness: 0.7 });
  const winM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.5, 0.35) });
  const glowTexF = canvasTex(128, 128, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  for (const s of [-1, 1]) {
    addF(cylG(1.5, 1.75, 11, 16), towerM, cx + s * (W / 2 - 0.4), 5.5, -(FORT_D + 2));
    addF(coneG(1.95, 3.2, 16), redM, cx + s * (W / 2 - 0.4), 12.6, -(FORT_D + 2));
    addF(boxG(1.3, 3.4, 0.12), banM, cx + s * 3.55, 5.0, -(FORT_D + 0.22), false);
    addF(sphG(0.24, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 1.7, 0.3) }),
      cx + s * 2.75, 4.4, -(FORT_D - 0.1), false);
    addF(cylG(0.08, 0.12, 0.8, 6), goldM, cx + s * 2.75, 3.9, -(FORT_D - 0.1), false);
    // tower windows + torch glow
    for (let i = 0; i < 2; i++) {
      addF(boxG(0.26, 0.5, 0.1), winM, cx + s * (W / 2 - 0.4) + (i ? 0.22 : -0.22), 7.2 - i * 1.6, -(FORT_D + 2 - 1.55), false);
    }
    const torch = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexF, color: new THREE.Color(2.6, 1.1, 0.25), transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.9,
    }));
    torch.scale.set(2.4, 2.4, 1);
    torch.position.set(cx + s * 2.75, 4.4, -(FORT_D - 0.15));
    fortGroup.add(torch);
  }
  // portcullis chains
  const chainM = std({ color: 0x2a2e3a, roughness: 0.4, metalness: 0.85 });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.028, 6, 10), chainM);
      link.position.set(cx + s * 0.9, 5.3 - i * 0.22, -(FORT_D + 0.1));
      link.rotation.y = Math.PI / 2;
      fortGroup.add(link);
    }
  }

  // ---------------- clouds
  {
    const cloudTex = canvasTex(256, 128, (x, w, h) => {
      x.clearRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {
        const a = 40 + Math.random() * (w - 80), b = h * 0.45 + (Math.random() - 0.5) * h * 0.35;
        const r = 22 + Math.random() * 34;
        const g = x.createRadialGradient(a, b, 0, a, b, r);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(0.55, 'rgba(255,255,255,0.45)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.beginPath(); x.arc(a, b, r, 0, Math.PI * 2); x.fill();
      }
    });
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTex, transparent: true, depthWrite: false, fog: false,
        color: 0xffffff, opacity: 0.55 + Math.random() * 0.3,
      }));
      const side = i % 2 ? 1 : -1;
      sp.position.set(side * (30 + Math.random() * 60), 26 + Math.random() * 26, -(40 + Math.random() * 200));
      const s = 34 + Math.random() * 40;
      sp.scale.set(s, s * 0.45, 1);
      scene.add(sp);
    }
  }

  // ---------------- fog + background
  scene.fog = new THREE.Fog(0xcfe4f5, 60, 190);
  scene.background = null;

  // ---------------- stage themes
  const THEMES = {
    day: {
      top: 0x6db8ff, mid: 0xcfe9ff, bot: 0xf3e7cf, fog: 0xcfe4f5, fogNear: 60, fogFar: 190,
      sun: 0xfff2dd, sunI: 2.1, hemiSky: 0xbfe0ff, hemiGround: 0x6e7078, hemiI: 1.0,
      deep: [0.005, 0.022, 0.075], shal: [0.014, 0.082, 0.24],
    },
    sunset: {
      top: 0x3f4f9e, mid: 0xffa878, bot: 0xffd9a0, fog: 0xe9b898, fogNear: 55, fogFar: 175,
      sun: 0xff9a55, sunI: 2.2, hemiSky: 0xffc9a0, hemiGround: 0x5a4a48, hemiI: 0.9,
      deep: [0.055, 0.022, 0.07], shal: [0.30, 0.13, 0.13],
    },
    storm: {
      top: 0x1d2b42, mid: 0x5c7391, bot: 0x8ea2b8, fog: 0x7f93ab, fogNear: 38, fogFar: 135,
      sun: 0xc4d0e2, sunI: 1.25, hemiSky: 0x8ea6c4, hemiGround: 0x343b46, hemiI: 0.85,
      deep: [0.008, 0.016, 0.036], shal: [0.045, 0.085, 0.16],
    },
  };
  refs.setTheme = (name) => {
    const t = THEMES[name] || THEMES.day;
    skyMat.uniforms.top.value.setHex(t.top);
    skyMat.uniforms.mid.value.setHex(t.mid);
    skyMat.uniforms.bot.value.setHex(t.bot);
    scene.fog.color.setHex(t.fog);
    scene.fog.near = t.fogNear;
    scene.fog.far = t.fogFar;
    waterMat.uniforms.uDeep.value.setRGB(t.deep[0], t.deep[1], t.deep[2]);
    waterMat.uniforms.uShal.value.setRGB(t.shal[0], t.shal[1], t.shal[2]);
    sun.color.setHex(t.sun);
    sun.intensity = t.sunI;
    hemi.color.setHex(t.hemiSky);
    hemi.groundColor.setHex(t.hemiGround);
    hemi.intensity = t.hemiI;
  };

  return refs;
}
