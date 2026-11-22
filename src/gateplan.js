// Gate rows: every row lays TWO walls across the full width of the bridge. The
// walls meet on the centre line, so there is no gap to slip through — the squad
// always takes the half it is steering toward and the other wall shatters. A row
// is a decision that is always taken.
//
// Each wall prints an arithmetic expression instead of a bare number: the
// expression is how many soldiers the wall adds (or takes). "3+2×5" hands the
// squad 13, "1-4×6" costs it 23, and normal precedence applies, so the player
// has to work out both walls to know which side is worth taking.
//
// A row is { start, options: [{ parts, value, label }, { parts, value, label }] }
// where `start` is the second the row meets the squad. Pure data, no imports,
// deterministic for a given seed.

// ---- nice-number ladder: keeps every printed operand looking hand-picked
const NICE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 18, 20, 24, 25, 28, 30, 32, 35, 36, 40, 42, 45, 48, 50, 54, 56, 60, 63, 64, 70, 72, 80, 81, 90, 100, 110, 120, 125, 130, 140, 150];

// ---- tiny deterministic prng (mulberry32)
function makeRng(seed) {
  let a = (seed | 0) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r3 = (t) => Math.round(t * 1000) / 1000;
const P = (op, n) => ({ op, n });
const ri = (rng, a, b) => a + ((rng() * (b - a + 1)) | 0);
const pick = (rng, arr) => arr[(rng() * arr.length) | 0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

function snapNice(v) {
  let out = NICE[0], best = Infinity;
  for (const n of NICE) {
    const d = Math.abs(n - v);
    if (d <= best) { best = d; out = n; }
  }
  return out;
}

// ------------------------------------------------------------------ expressions
// A gate expression is a flat list of terms { op, n }: the first term carries a
// leading sign, the rest are joined with + - × ÷. × and ÷ bind tighter than + and
// -, exactly as they are taught, so "3+2×5" is 13 rather than 25.
const GLYPH = { '+': '+', '-': '-', '*': '\u00d7', '/': '\u00f7' };

export function evalParts(parts) {
  let total = 0, term = 0, sign = 1, first = true;
  for (const p of parts) {
    if (p.op === '+' || p.op === '-') {
      if (!first) total += sign * term;
      sign = p.op === '+' ? 1 : -1;
      term = p.n;
      first = false;
    } else if (p.op === '*') {
      term *= p.n;
    } else {
      term /= p.n;
    }
  }
  return Math.round(total + sign * term);
}

export function exprLabel(parts) {
  let s = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i === 0) s += (p.op === '-' ? '-' : '') + p.n;
    else s += GLYPH[p.op] + p.n;
  }
  return s;
}

// every factor pair of the 2..9 tables whose product sits in [lo, hi]
function prodPairs(lo, hi) {
  const out = [];
  for (let a = 2; a <= 9; a++) {
    for (let b = 2; b <= 9; b++) {
      const p = a * b;
      if (p >= lo && p <= hi) out.push([a, b]);
    }
  }
  return out;
}

// ---- shapes for a positive gate (the expression evaluates to +m) ------------
function shSum2(rng, m) {
  if (m < 2) return null;
  const a = ri(rng, 1, m - 1);
  return [P('+', a), P('+', m - a)];
}
function shDiff2(rng, m) {
  const b = ri(rng, 1, Math.max(1, Math.round(m * 0.6)));
  return [P('+', m + b), P('-', b)];
}
function shSum3(rng, m) {
  if (m < 3) return null;
  const a = ri(rng, 1, m - 2);
  const b = ri(rng, 1, m - a - 1);
  return [P('+', a), P('+', b), P('+', m - a - b)];
}
function shAddProd(rng, m) {        // c + a × b
  if (m < 5) return null;
  const pairs = prodPairs(4, m - 1);
  if (!pairs.length) return null;
  const [a, b] = pick(rng, pairs);
  return [P('+', m - a * b), P('+', a), P('*', b)];
}
function shProdAdd(rng, m) {        // a × b + c
  if (m < 5) return null;
  const pairs = prodPairs(4, m - 1);
  if (!pairs.length) return null;
  const [a, b] = pick(rng, pairs);
  return [P('+', a), P('*', b), P('+', m - a * b)];
}
function shProdSub(rng, m) {        // a × b - c
  const pairs = prodPairs(m + 1, m + 24);
  if (!pairs.length) return null;
  const [a, b] = pick(rng, pairs);
  return [P('+', a), P('*', b), P('-', a * b - m)];
}
function shDiffProd(rng, m) {       // a - b × c
  const pairs = prodPairs(4, m + 30);
  if (!pairs.length) return null;
  const [b, c] = pick(rng, pairs);
  return [P('+', m + b * c), P('-', b), P('*', c)];
}
function shDivAdd(rng, m) {         // a ÷ b + c
  if (m < 4) return null;
  const b = ri(rng, 2, 5);
  const q = ri(rng, 1, Math.min(9, m - 1));
  return [P('+', q * b), P('/', b), P('+', m - q)];
}
function shAddDiv(rng, m) {         // c + a ÷ b
  if (m < 4) return null;
  const b = ri(rng, 2, 5);
  const q = ri(rng, 1, Math.min(9, m - 1));
  return [P('+', m - q), P('+', q * b), P('/', b)];
}
function shProdProd(rng, m) {       // a × b + c × d
  if (m < 10) return null;
  const pairs = prodPairs(4, m - 4);
  if (!pairs.length) return null;
  for (let i = 0; i < 26; i++) {
    const [a, b] = pick(rng, pairs);
    const rem = m - a * b;
    const fs = prodPairs(4, rem).filter(([c, d]) => c * d === rem);
    if (fs.length) {
      const [c, d] = pick(rng, fs);
      return [P('+', a), P('*', b), P('+', c), P('*', d)];
    }
  }
  return null;
}

// ---- shapes for a negative gate (the expression evaluates to -m) ------------
function shNegDiff2(rng, m) {       // a - b
  const a = ri(rng, 1, Math.max(1, m));
  return [P('+', a), P('-', a + m)];
}
function shNegSumDiff(rng, m) {     // a + b - c
  const a = ri(rng, 1, Math.max(1, m));
  const b = ri(rng, 1, 9);
  return [P('+', a), P('+', b), P('-', a + b + m)];
}
function shNegDiffProd(rng, m) {    // a - b × c
  const pairs = prodPairs(m + 1, m + 30);
  if (!pairs.length) return null;
  const [b, c] = pick(rng, pairs);
  return [P('+', b * c - m), P('-', b), P('*', c)];
}
function shNegProdSub(rng, m) {     // a × b - c
  const pairs = prodPairs(4, m + 24);
  if (!pairs.length) return null;
  const [a, b] = pick(rng, pairs);
  return [P('+', a), P('*', b), P('-', a * b + m)];
}
function shNegDivSub(rng, m) {      // a ÷ b - c
  const b = ri(rng, 2, 5);
  const q = ri(rng, 1, 9);
  return [P('+', q * b), P('/', b), P('-', q + m)];
}

// complexity pools, easiest first. Even the opening stage mixes in products, so
// the first row already reads like "3+2×5" instead of a bare +2; the deeper
// stages stack divisions and four-term sums on top.
const POS_POOL = [
  [shSum2, shSum3, shAddProd, shProdAdd, shDiffProd, shDiff2],
  [shSum3, shAddProd, shProdAdd, shProdSub, shDiffProd, shDivAdd],
  [shAddProd, shProdAdd, shProdSub, shDiffProd, shDivAdd, shAddDiv, shProdProd],
];
const NEG_POOL = [
  [shNegDiff2, shNegSumDiff, shNegProdSub, shNegDiffProd],
  [shNegSumDiff, shNegDiffProd, shNegProdSub, shNegDivSub],
  [shNegDiffProd, shNegProdSub, shNegDivSub, shNegSumDiff],
];

// ---- build an expression that evaluates exactly to `value` -----------------
export function makeExpr(rng, value, tier = 0) {
  const shapes = (value >= 0 ? POS_POOL : NEG_POOL)[clamp(Math.round(tier), 0, 2)].slice();
  for (let i = shapes.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = shapes[i]; shapes[i] = shapes[j]; shapes[j] = t;
  }
  for (const f of shapes) {
    const parts = f(rng, Math.abs(value));
    if (parts && parts.every((p) => p.n >= 1 && p.n <= 200) && evalParts(parts) === value) return parts;
  }
  // guaranteed fallback, still an expression rather than a bare number
  if (value > 1) return [P('+', value - 1), P('+', 1)];
  if (value === 1) return [P('+', 2), P('-', 1)];
  if (value === -1) return [P('+', 1), P('-', 2)];
  return [P('+', 1), P('-', 1 - value)];
}

// ---- how a gate changes a squad of n soldiers
export function applyOption(n, o) {
  return Math.max(1, n + o.value);
}

// ---- balance probes: the squad size if the player always picks the better /
// worse gate of every row
export function bestPath(rows) {
  let n = 1;
  for (const row of rows) {
    let best = 1;
    for (const o of row.options) best = Math.max(best, applyOption(n, o));
    n = best;
  }
  return n;
}
export function worstPath(rows) {
  let n = 1;
  for (const row of rows) {
    let worst = Infinity;
    for (const o of row.options) worst = Math.min(worst, applyOption(n, o));
    n = Math.max(1, worst);
  }
  return n;
}

// best-path squad size after `k` rows
export function bestAt(rows, k) {
  let n = 1;
  for (let i = 0; i < Math.min(k, rows.length); i++) {
    let best = 1;
    for (const o of rows[i].options) best = Math.max(best, applyOption(n, o));
    n = best;
  }
  return n;
}

// ---- row archetypes. The mix is fixed per stage so the economy is predictable,
// the order is shuffled, the magnitudes are jittered and the good side of each
// pair is random. `subSub` is the rare damage-control row where both walls cost
// soldiers and the pick is the cheaper loss.
const ARCHETYPES = ['add2', 'addSub', 'add2', 'addSub', 'add2', 'addSub', 'add2', 'addSub', 'add2', 'addSub', 'subSub', 'add2', 'addSub', 'add2'];

// ---- one pass of row generation. The good value ramps linearly from `d0` to
// `d1` (scaled by `k`), so the crowd grows steadily from the first row instead
// of exploding at the end; the losing wall is a fraction of the good one.
function generateRows(cfg, k) {
  const rng = makeRng(cfg.seed ?? 1);
  const rows = Math.max(1, Math.round(cfg.rows ?? 12));
  const t0 = cfg.t0 ?? 1.4;
  const t1 = cfg.t1 ?? 23;
  const d0 = Math.max(1, (cfg.d0 ?? 5) * k);
  const d1 = Math.max(d0 + 1, (cfg.d1 ?? 40) * k);
  const gap = rows > 1 ? (t1 - t0) / (rows - 1) : 0;
  const baseTier = cfg.tier ?? 0;

  const plan = [];
  for (let i = 0; i < rows; i++) plan.push(ARCHETYPES[i % ARCHETYPES.length]);
  for (let i = plan.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = plan[i]; plan[i] = plan[j]; plan[j] = t;
  }

  const made = [];
  for (let i = 0; i < rows; i++) {
    const t = rows > 1 ? i / (rows - 1) : 0;
    const kind = plan[i];
    const delta = Math.max(1, snapNice((d0 + (d1 - d0) * t) * (0.85 + rng() * 0.3)));
    // expressions get one notch harder as the ladder climbs
    const tier = Math.min(2, baseTier + (t > 0.55 ? 1 : 0));
    let good, bad;
    if (kind === 'add2') {
      good = delta;
      bad = Math.max(1, snapNice(delta * (0.3 + rng() * 0.35)));
      if (bad >= good) bad = Math.max(1, good - 1);
    } else if (kind === 'subSub') {
      good = -Math.max(1, snapNice(delta * (0.22 + rng() * 0.18)));
      bad = -Math.max(1, snapNice(delta * (0.5 + rng() * 0.35)));
      if (bad >= good) bad = good - Math.max(1, Math.round(delta * 0.3));
    } else {
      good = delta;
      bad = -Math.max(1, snapNice(delta * (0.45 + rng() * 0.45)));
    }
    const pair = [good, bad].map((v) => {
      const parts = makeExpr(rng, v, tier);
      return { parts, value: v, label: exprLabel(parts) };
    });
    if (rng() < 0.5) pair.reverse();          // the good side is never fixed
    made.push(pair);
  }
  return made.map((options, i) => ({ start: r3(t0 + i * gap), options }));
}

// ---- calibrated builder: the ramp is scaled so a perfect run of picks lands on
// `target` soldiers at `at` of the ladder (default 70%), which is roughly when
// the squad meets the horde — the end of the ladder is allowed to overshoot into
// the live squad cap
export function buildGateRows(cfg = {}) {
  const target = cfg.target ?? 120;
  const at = cfg.at ?? 0.7;
  const cap = cfg.cap ?? 150;
  let lo = 0.05, hi = 8, best = generateRows(cfg, 1);
  for (let i = 0; i < 16; i++) {
    const k = (lo + hi) / 2;
    best = generateRows(cfg, k);
    const mid = Math.min(cap, bestAt(best, Math.round(best.length * at)));
    if (mid < target) lo = k; else hi = k;
  }
  return best;
}

// ---- tuned rows, stage 1 (gentlest) to stage 12 (red horizon). `target` is the
// squad a perfect picker has at 70% of the ladder; `cap` is the live squad cap,
// so no stage can ever hand out more than 150 soldiers. `tier` sets how much
// arithmetic the expressions carry.
export const GATE_PRESETS = [
  { seed: 11, rows: 13, t0: 2.4, t1: 22.5, d0: 5, d1: 40, target: 100, cap: 150, tier: 0 },
  { seed: 27, rows: 13, t0: 2.2, t1: 22.5, d0: 6, d1: 44, target: 104, cap: 150, tier: 0 },
  { seed: 43, rows: 13, t0: 2.2, t1: 22.5, d0: 7, d1: 48, target: 108, cap: 150, tier: 0 },
  { seed: 61, rows: 14, t0: 2.0, t1: 23.0, d0: 8, d1: 52, target: 112, cap: 150, tier: 1 },
  { seed: 79, rows: 14, t0: 2.0, t1: 23.0, d0: 9, d1: 56, target: 116, cap: 150, tier: 1 },
  { seed: 97, rows: 14, t0: 2.0, t1: 23.0, d0: 10, d1: 60, target: 120, cap: 150, tier: 1 },
  { seed: 113, rows: 14, t0: 2.0, t1: 23.5, d0: 11, d1: 64, target: 123, cap: 150, tier: 1 },
  { seed: 131, rows: 15, t0: 1.9, t1: 24.0, d0: 12, d1: 68, target: 126, cap: 150, tier: 1 },
  { seed: 149, rows: 15, t0: 1.9, t1: 24.0, d0: 13, d1: 72, target: 129, cap: 150, tier: 2 },
  { seed: 167, rows: 15, t0: 1.9, t1: 24.0, d0: 14, d1: 76, target: 132, cap: 150, tier: 2 },
  { seed: 191, rows: 15, t0: 1.8, t1: 24.5, d0: 15, d1: 80, target: 135, cap: 150, tier: 2 },
  { seed: 223, rows: 15, t0: 1.8, t1: 24.5, d0: 16, d1: 84, target: 138, cap: 150, tier: 2 },
];
