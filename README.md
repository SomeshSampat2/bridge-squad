# Bridge Squad — Three.js

A browser clone of the Voodoo-style crowd-runner **Bridge Squad**: steer a squad of
blue soldiers across a bridge, read the two maths walls of every gate row, shoot the
cage to free the hero, grab the ATK crate, and melt the horde and its bosses.

Every boss walks in carrying a big **DAMAGE TO KILL** number over its head. That
number is the exact amount of damage the squad has to land to kill it — it ticks
down with every hit and the boss dies when it reaches zero. Your own output is on
the HUD (`SQUAD DMG x/s`), so the number is something you can actually read and
plan against: grow the crowd, free the hero for the ATK crate, and stack power-ups
when the number is bigger than your damage.

Everything is procedural — no image, model or audio assets. Textures are painted
into canvases at boot, every unit is built from primitives, and all sounds are
synthesised with WebAudio.

Rendering: physically based materials with clearcoat armour, PMREM environment
reflections, ACES tone mapping, and a selective **UnrealBloom** pass so gates,
lasers, visors and torches glow. Units are drawn with instanced meshes; the
quality button (Q) swaps resolution scale and bloom strength.

Units are built from smooth rounded forms (spheres and capsules) so the squads
read as glossy blobs, and every soldier/enemy animates per instance: a walk
cycle swings legs and arms around hip/shoulder pivots with a matching body bob
and squash. All of it runs on instanced meshes — a 150-strong squad plus the
full horde still holds 60 fps.

## Run

The game uses ES modules, so it needs to be served over HTTP (opening
`index.html` from disk will not work):

```bash
cd threeJSGame
python3 -m http.server 8137
# then open http://localhost:8137/
```

Any static server works (`npx serve`, `php -S`, nginx, …).

## Layout

The window shape drives the camera and the world framing:

- **Chase camera (default)** — a low, wide follow cam that sits just behind the
  crowd so the bridge runs to a vanishing point instead of reading as a map. It
  lags the squad laterally, rolls a couple of degrees into a hard steer and
  eases back and up as the formation grows, so a full 150-strong squad still fits.
  Portrait phones pull it further back and widen the lens so both gate choices
  stay in view.
- **Classic camera** — the original high top-down framing, kept as a second
  option. Press `C` (or the ◉ button) to swap at any time.
- **PC / landscape windows** fill the whole screen. **Phones in portrait** keep
  a tall 9:16 stage fitted to the screen.

## Controls

| Input | Action |
| --- | --- |
| Drag / mouse move | Steer the squad |
| `A` / `D`, `←` / `→` | Steer with the keyboard |
| `C` / ◉ button | Switch camera (CHASE / CLASSIC) |
| `R` | Restart |
| `M` | Mute |
| `H` | Hide the UI |
| `Q` | Cycle quality (LOW / MED / HIGH) |
| `1` / `2` / `3` | Jump to stage 1 / 2 / 3 |
| `Space` / click | Start, retry |

## Stages

Twelve stages, each defined as data (`src/levels.js` plus `src/levels-extra.js`):
gate timetable, horde density and durability, cage position, boss list, speed,
length, theme, power placements.

| # | Stage | Theme | Twist |
| --- | --- | --- | --- |
| 1 | Sunrise Bridge | bright day | the baseline run |
| 2 | Iron Gauntlet | sunset | denser horde, faster belt, 3 mid-bosses |
| 3 | Stormbreak | storm | toughest horde so far, 3 mid-bosses |
| 4 | Crosswind | sunset | wider horde lanes, faster belt, tougher cage |
| 5 | The Long Span | day | four mid-bosses, products on the ladder |
| 6 | Last Stand | storm | products and divisions inside one lane window, four mid-bosses |
| 7 | Iron Tide | day | nine uneven rungs; divisions land while the squad is small |
| 8 | Breakwater | sunset | longer tail, four-term sums on a mid-size squad |
| 9 | Black Surge | storm | first four-boss stage, hpDiv drops to 13 |
| 10 | Deadlock | day | late divisions on a grown squad, rungs up to 130 |
| 11 | Gravebelt | sunset | 0.3 s rungs, horde spacing 0.61 |
| 12 | Red Horizon | storm | two product rows four seconds apart, 140 rungs |

Win a stage and the overlay offers **NEXT STAGE**; finish the last one for
**PLAY AGAIN**. Keys `1` / `2` / `3` jump straight to a stage.

## Boss damage numbers

- Every boss in `levels.js` / `levels-extra.js` carries a fixed `hp`; the
  printed number is that value scaled by `BOSS_HP_SCALE` in `main.js`. The live
  squad cap dropped from 480 to 150, so the numbers were scaled to keep a boss
  fight in the same window. The fortress boss uses `finalHp`.
- The label reads **DAMAGE TO KILL** + the remaining number, with a bar that
  drains as the squad lands hits and the maximum printed on the right.
- A boss is live the moment it walks onto the bridge: the squad opens fire from
  `30` units away, so the number starts falling while the boss is still walking
  in. Shots committed to a boss fly over the horde — focus fire means you are
  always burning the number you can see. The exception is a charger already on
  top of the formation: the squad shoots that down first.
- A boss that survives the approach closes in and starts smashing the formation,
  so the number is a race: kill it before it reaches you. While it is still
  closing, it lobs shells at the crowd — slow, big, and dodgeable with a hard
  lane change.
- Bosses arrive one at a time, in the order they walked in; the fortress boss
  only wakes once every mid-boss has been killed.
- Nothing rescales the number: the ATK crate (2.6×) and the RAGE power-up (2×)
  are what shorten a fight. A run without the crate is survivable but tight,
  which is the point of freeing the hero.

## Incoming fire

The horde is not a passive wall. Roughly a third of it breaks ranks and charges;
the rest hold position and shoot:

- **Riflemen** fire in small front-rank volleys at whatever soldier they can see.
  A bolt that lands kills one soldier, so the squad bleeds while the gates are
  still coming. Fire only starts once the squad is engaged and has at least six
  soldiers — a one-soldier run cannot be sniped off the bridge.
- **Chargers** still close to the formation ring. A charge is a threat rather
  than a guaranteed trade: the squad often shoots the charger down on its last
  step.
- **Boss shells** are slower and bigger: they kill a handful of soldiers in the
  blast and leave a trail of embers. They are aimed at where the crowd stands,
  so moving sideways lets the squad slide out from under one.
- SHIELD blocks all of it; FREEZE stops the horde from firing at all.

## Gate rows — two walls, one sum

Every gate row lays **two walls across the whole width of the bridge**. They meet
on the centre line, so there is no gap to slip through: the squad always commits
to the half it is steering toward and the other wall shatters. Every row is a
decision, and it is taken the moment the row reaches the squad.

Each wall prints an arithmetic expression instead of a bare number, and that
expression is how many soldiers the wall hands over (or takes):

| Wall | Meaning |
| --- | --- |
| `3+2×5` | the squad gains `3 + 2×5 = 13` soldiers |
| `7-1+15` | the squad gains `21` |
| `1-4×6` | the squad loses `23` |
| `20÷4+6` | the squad gains `11` |
| `2×4+3×5` | the squad gains `23` |

Normal precedence applies (× and ÷ bind tighter than + and −), so a pair is a real
sum to work out rather than a colour to chase: both walls wear the same glass, and
only the maths says which side is worth taking. After the pick the wall pops its
result (`3+2×5` → `+13`), so the working is readable.

Expressions come from `src/gateplan.js`. Stage 1 opens on short sums and mixes
products in almost immediately; later stages stack divisions and four-term sums on
top, and every stage ramps from the simpler shapes to the harder ones as the
ladder climbs. The row order is shuffled, the good side of a pair is random, and
the values are calibrated so a player who always solves the pair lands around the
squad cap when the horde starts.

A row that crosses the prison lifts over the cage and settles back onto the deck,
so the walls never slice through it.

## Power-ups

Six pickup crates sit on the bridge, one lane-change away from the gate
conveyor, so grabbing one is always a trade. Kinds live in `src/powers.js`:

| Power | Effect | Duration |
| --- | --- | --- |
| RAGE | squad damage ×2 | 10 s |
| SHIELD | soldiers cannot die | 8 s |
| FREEZE | horde and bosses lock in place | 6 s |
| NUKE | wipes the road ahead and hits bosses for 2200 | instant |
| REINFORCE | +40 soldiers | instant |
| MISSILE | permanent homing missile battery | rest of the run |

Active powers show as chips under the HUD with a countdown.

The **missile battery** auto-fires a homing rocket every 2.2 s at the nearest
target ahead: 320 damage on impact plus splash. Missiles fly with a smoke trail
and detonate with a ring + flash; against a boss they are a visible chunk off the
damage-to-kill number.

## How the level works

- The squad advances slowly (`1.2 m/s`); the gate belt rolls toward it at `7 m/s`,
  so rows arrive on a fixed timetable.
- Gate walls come from `src/gateplan.js`: each row is a pair of full-width walls
  printed with arithmetic expressions, the ladder is randomised per stage rather
  than repeating one value, and a perfect picker ends the run near the
  150-soldier cap.
- The cage (`HP 30` on stage 1) sits on the **left**; steer into its lane and
  shoot it to free the hero. He joins the squad and fires heavy rounds.
- Freeing the hero launches the **ATK crate**; pick it up for `ATK+150%` (the
  squad turns white and fires laser bolts).
- The horde guards the road to the fortress. Enemies aggro and charge; chargers
  trade blows with the squad at the formation ring.
- Bosses spawn 22 units ahead — visible at the top of the view — and the squad
  shoots them from 30 units out, so their number drains during the walk-in.
- Win by melting the final boss. The squad turns to the player, jumps and waves
  its arms while confetti and fireworks fill the bridge, then the victory panel
  appears. Stars are awarded at `150` and `300` surviving soldiers.

## Structure

```
index.html          HUD, overlays, loader, styling
src/main.js         game state, simulation, combat, camera, effects, post FX
src/levels.js       stage registry (1-6) + campaign tail
src/levels-extra.js stages 7-12
src/gateplan.js     deterministic gate-ladder generator + balance probe
src/powers.js       power table, canvas icons, crate visual
src/missile.js      pooled homing missiles (flight, homing, exhaust glow)
src/world.js        bridge deck, water shader, fortress, clouds
src/units.js        instanced soldier/enemy renderers, hero and boss rigs
src/audio.js        WebAudio synth (shots, gates, roars, explosions, missiles)
vendor/three.module.js      Three.js r160 (MIT)
vendor/addons/              Bloom post-processing + RoundedBox geometry (MIT)
```

Performance: soldiers and enemies are drawn with `InstancedMesh` (one draw call per
body part), particles are a single `Points` cloud, bullets and missiles are one
`InstancedMesh` each. The full horde plus a 150-strong squad runs at 60 fps on a
laptop GPU.

## Dev hooks

`window.__bs` exposes the smoke-test surface: `startLevel(i)`, `next()`, `steer(x)`,
`camMode(name)`, state getters (`D`, `N`, `bossList`, `dps`, `powers`, `gateInfo`,
`camState`), `cam(...)` for a one-off camera override, and `sim(seconds)` which
advances the simulation without waiting for frames — used for balance runs.

## License

MIT — see [LICENSE](LICENSE). Three.js and the bundled addons are MIT as well.
