// Campaign stages 7-12. Same schema and units as LEVELS in levels.js: gate rows
// come from gateplan.js (levels.js attaches them by stage index), mid-bosses
// only, and `finalHp` for the kind-2 fortress boss the engine spawns at
// FORT_D - 2.6.
export const EXTRA_LEVELS = [
  // First stage of the tail: the row mix starts leaning on products, so a wrong
  // pick costs a whole multiplication instead of a handful of soldiers.
  {
    name: 'IRON TIDE',
    theme: 'day',
    squadSpeed: 1.33, beltSpeed: 8.0,
    horde: { x0: -6.3, x1: 3.2, d0: 26.5, d1: 58.5, spacing: 0.56, hpBase: 2, hpDiv: 14 },
    cage: { x: -4.8, d: 19.0, hp: 100 },
    chargeSpeed: 5.0, aggroRange: 5.4, aggroWidth: 3.0,
    bosses: [{ kind: 0, atD: 10.0, hp: 5200 }, { kind: 1, atD: 17.5, hp: 7200 }, { kind: 0, atD: 25.0, hp: 9200 }],
    dMax: 62,
    finalHp: 15000,
    powers: [{ atD: 7.5, kind: 'rage' }, { atD: 27.0, kind: 'missile' }],
  },
  // Same shape, longer tail: denser horde and a third mid-boss, with the cage
  // sitting right where the mid-run gate rows land.
  {
    name: 'BREAKWATER',
    theme: 'sunset',
    squadSpeed: 1.35, beltSpeed: 8.2,
    horde: { x0: -6.3, x1: 3.2, d0: 27.0, d1: 56.5, spacing: 0.55, hpBase: 2, hpDiv: 14 },
    cage: { x: -4.9, d: 19.5, hp: 100 },
    chargeSpeed: 5.1, aggroRange: 5.4, aggroWidth: 3.0,
    bosses: [{ kind: 0, atD: 10.0, hp: 5800 }, { kind: 1, atD: 18.0, hp: 7800 }, { kind: 0, atD: 26.0, hp: 10100 }],
    dMax: 63,
    finalHp: 19000,
    powers: [{ atD: 6.0, kind: 'shield' }, { atD: 28.5, kind: 'nuke' }],
  },
  // First four-boss stage. hpDiv drops to 13 and hpBase to 3, so the back
  // ranks soak two extra hits; the belt runs at 10.6, faster than the squad can
  // cross lanes, so a missed row is gone for good.
  {
    name: 'BLACK SURGE',
    theme: 'storm',
    squadSpeed: 1.37, beltSpeed: 8.5,
    horde: { x0: -6.4, x1: 3.2, d0: 27.5, d1: 55.5, spacing: 0.55, hpBase: 3, hpDiv: 13 },
    cage: { x: -4.9, d: 20.0, hp: 100 },
    chargeSpeed: 5.2, aggroRange: 5.3, aggroWidth: 2.9,
    bosses: [
      { kind: 0, atD: 9.5, hp: 6600 }, { kind: 1, atD: 17.0, hp: 9000 },
      { kind: 0, atD: 24.5, hp: 11500 }, { kind: 1, atD: 32.0, hp: 13800 },
    ],
    dMax: 64,
    finalHp: 24000,
    powers: [{ atD: 8.0, kind: 'freeze' }, { atD: 13.0, kind: 'reinforce' }, { atD: 30.0, kind: 'missile' }],
  },
  // The division rows get meaner here: a big subtraction at the wrong moment is
  // worse than any horde, and the bosses are sized for a crowd that survived.
  {
    name: 'DEADLOCK',
    theme: 'day',
    squadSpeed: 1.39, beltSpeed: 8.7,
    horde: { x0: -6.4, x1: 3.2, d0: 27.5, d1: 54.0, spacing: 0.54, hpBase: 3, hpDiv: 12 },
    cage: { x: -5.0, d: 20.0, hp: 100 },
    chargeSpeed: 5.3, aggroRange: 5.3, aggroWidth: 2.9,
    bosses: [
      { kind: 0, atD: 9.5, hp: 7200 }, { kind: 1, atD: 17.0, hp: 9800 },
      { kind: 0, atD: 24.5, hp: 12400 }, { kind: 1, atD: 32.0, hp: 15000 },
    ],
    dMax: 65,
    finalHp: 30000,
    powers: [{ atD: 7.0, kind: 'nuke' }, { atD: 14.5, kind: 'rage' }, { atD: 29.0, kind: 'shield' }],
  },
  // Tight rows (0.3 s apart on the front half) and horde spacing down to 0.53:
  // there is no time to read every pair, so commit early or eat the bad side.
  {
    name: 'GRAVEBELT',
    theme: 'sunset',
    squadSpeed: 1.42, beltSpeed: 9.0,
    horde: { x0: -6.4, x1: 3.1, d0: 28.0, d1: 54.0, spacing: 0.53, hpBase: 3, hpDiv: 12 },
    cage: { x: -5.0, d: 20.5, hp: 100 },
    chargeSpeed: 5.4, aggroRange: 5.2, aggroWidth: 2.8,
    bosses: [
      { kind: 0, atD: 9.0, hp: 7800 }, { kind: 1, atD: 17.0, hp: 10600 },
      { kind: 0, atD: 25.0, hp: 13500 }, { kind: 1, atD: 33.0, hp: 16200 },
    ],
    dMax: 65,
    finalHp: 37000,
    powers: [{ atD: 9.0, kind: 'missile' }, { atD: 15.5, kind: 'reinforce' }, { atD: 31.0, kind: 'freeze' }],
  },
  // The finale: the biggest adds in the campaign, the tightest horde grid and
  // the largest damage-to-kill number waiting at the fortress.
  {
    name: 'RED HORIZON',
    theme: 'storm',
    squadSpeed: 1.45, beltSpeed: 9.2,
    horde: { x0: -6.5, x1: 3.1, d0: 28.5, d1: 54.0, spacing: 0.52, hpBase: 3, hpDiv: 11 },
    cage: { x: -5.0, d: 21.0, hp: 100 },
    chargeSpeed: 5.6, aggroRange: 5.2, aggroWidth: 2.8,
    bosses: [
      { kind: 0, atD: 9.0, hp: 8600 }, { kind: 1, atD: 17.0, hp: 11500 },
      { kind: 0, atD: 25.0, hp: 14400 }, { kind: 1, atD: 33.0, hp: 17000 },
    ],
    dMax: 66,
    finalHp: 40000,
    powers: [{ atD: 6.5, kind: 'rage' }, { atD: 16.0, kind: 'nuke' }, { atD: 32.5, kind: 'shield' }],
  },
];
