// Stage definitions. Everything the simulation needs is data, so new stages
// are just another entry in this list.
//
//  gates     – gate rows built by gateplan.js: each row lays two full-width walls
//              across the deck, the squad takes the half it steers toward and the
//              other wall shatters. Every wall prints an arithmetic expression
//              that adds or takes that many soldiers, and `start` is the second
//              the row meets the squad (the belt closes at squadSpeed + beltSpeed).
//  horde     – enemy grid extents, spacing and durability curve
//  cage      – hero cage position and hit points
//  bosses    – mid-boss spawn list keyed by the distance the squad must reach.
//              `hp` is the exact damage printed above that boss: the squad has
//              to deal that much to kill it. The kind-2 fortress boss is always
//              the last one and uses `finalHp`.
//  powers    – power-up pickups: `{ atD, kind }`, kinds come from powers.js
import { buildGateRows, GATE_PRESETS } from './gateplan.js';
import { EXTRA_LEVELS } from './levels-extra.js';

// gate rows are generated per stage so the printed numbers stay varied and the
// economy stays tuned (see GATE_PRESETS for the per-stage targets)
const rowsFor = (i) => buildGateRows(GATE_PRESETS[i]);

const BASE = [
  {
    name: 'SUNRISE BRIDGE',
    theme: 'day',
    squadSpeed: 1.2, beltSpeed: 5.6,
    horde: { x0: -6.05, x1: 2.85, d0: 25.5, d1: 62.6, spacing: 0.62, hpBase: 2, hpDiv: 20 },
    cage: { x: -4.6, d: 16.2, hp: 0 },
    chargeSpeed: 4.6, aggroRange: 6, aggroWidth: 3.2,
    bosses: [{ kind: 0, atD: 12.6, hp: 4000 }, { kind: 1, atD: 21.0, hp: 5600 }],
    dMax: 55,
    finalHp: 11000,
    powers: [{ atD: 8, kind: 'rage' }, { atD: 30, kind: 'missile' }],
  },
  {
    name: 'IRON GAUNTLET',
    theme: 'sunset',
    squadSpeed: 1.25, beltSpeed: 6.1,
    horde: { x0: -6.2, x1: 3.1, d0: 26.0, d1: 70.0, spacing: 0.6, hpBase: 2, hpDiv: 18 },
    cage: { x: -4.8, d: 18.5, hp: 0 },
    chargeSpeed: 4.6, aggroRange: 5.5, aggroWidth: 3.0,
    bosses: [{ kind: 0, atD: 11.0, hp: 5200 }, { kind: 1, atD: 19.0, hp: 6800 }, { kind: 0, atD: 27.0, hp: 8400 }],
    dMax: 60,
    finalHp: 16000,
    powers: [{ atD: 9, kind: 'shield' }, { atD: 24, kind: 'nuke' }],
  },
  {
    name: 'STORMBREAK',
    theme: 'storm',
    squadSpeed: 1.3, beltSpeed: 6.6,
    horde: { x0: -6.3, x1: 3.4, d0: 26.0, d1: 78.0, spacing: 0.58, hpBase: 2, hpDiv: 16 },
    cage: { x: -5.0, d: 20.0, hp: 0 },
    chargeSpeed: 4.6, aggroRange: 5.0, aggroWidth: 2.8,
    bosses: [{ kind: 0, atD: 10.0, hp: 6000 }, { kind: 1, atD: 17.0, hp: 7600 }, { kind: 0, atD: 24.0, hp: 9200 }],
    dMax: 66,
    finalHp: 20000,
    powers: [{ atD: 10, kind: 'freeze' }, { atD: 20, kind: 'reinforce' }, { atD: 33, kind: 'missile' }],
  },
  {
    // Products on the ladder from the first rows: the pair that lands mid run
    // is the one that decides the boss fights, not the raw adds.
    name: 'CROSSWIND',
    theme: 'sunset',
    squadSpeed: 1.32, beltSpeed: 7.1,
    horde: { x0: -6.2, x1: 3.2, d0: 25.5, d1: 72.0, spacing: 0.6, hpBase: 2, hpDiv: 17 },
    cage: { x: -4.7, d: 17.0, hp: 0 },
    chargeSpeed: 4.8, aggroRange: 5.4, aggroWidth: 3.0,
    bosses: [{ kind: 0, atD: 11.0, hp: 6800 }, { kind: 1, atD: 19.0, hp: 8400 }, { kind: 0, atD: 26.0, hp: 10000 }],
    dMax: 58,
    finalHp: 24000,
    powers: [{ atD: 9, kind: 'rage' }, { atD: 22, kind: 'shield' }, { atD: 31, kind: 'missile' }],
  },
  {
    // Four mid-bosses and the first stage where a bad pick can hand you a
    // division right before the cage.
    name: 'THE LONG SPAN',
    theme: 'day',
    squadSpeed: 1.35, beltSpeed: 7.5,
    horde: { x0: -6.3, x1: 3.3, d0: 26.0, d1: 80.0, spacing: 0.58, hpBase: 2, hpDiv: 15 },
    cage: { x: -4.9, d: 18.5, hp: 100 },
    chargeSpeed: 5.0, aggroRange: 5.2, aggroWidth: 2.8,
    bosses: [{ kind: 0, atD: 10.0, hp: 7600 }, { kind: 1, atD: 17.0, hp: 9200 }, { kind: 0, atD: 24.0, hp: 10800 }, { kind: 1, atD: 30.0, hp: 12400 }],
    dMax: 62,
    finalHp: 28000,
    powers: [{ atD: 10, kind: 'nuke' }, { atD: 21, kind: 'freeze' }, { atD: 30, kind: 'reinforce' }],
  },
  {
    // The last stand: the tightest ladder of the base campaign and the toughest
    // cage, so every row is a live decision.
    name: 'LAST STAND',
    theme: 'storm',
    squadSpeed: 1.36, beltSpeed: 7.8,
    horde: { x0: -6.4, x1: 3.5, d0: 26.5, d1: 86.0, spacing: 0.56, hpBase: 2, hpDiv: 14 },
    cage: { x: -5.0, d: 19.5, hp: 100 },
    chargeSpeed: 5.2, aggroRange: 5.0, aggroWidth: 2.6,
    bosses: [{ kind: 0, atD: 9.5, hp: 8400 }, { kind: 1, atD: 16.0, hp: 10000 }, { kind: 0, atD: 23.0, hp: 11600 }, { kind: 1, atD: 29.0, hp: 13200 }],
    dMax: 66,
    finalHp: 32000,
    powers: [{ atD: 8, kind: 'missile' }, { atD: 19, kind: 'rage' }, { atD: 30, kind: 'shield' }],
  },
];

export const LEVELS = [
  ...BASE.map((s, i) => ({ ...s, gates: rowsFor(i) })),
  ...EXTRA_LEVELS.map((s, i) => ({ ...s, gates: rowsFor(6 + i) })),
];
