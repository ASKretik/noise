# NOISE 3D — build spec

Written Nov 17, 2026 as a plan · **rewritten the same day to describe the system as built**
(3D build 16: plan phases 0–9, the R39 movement fix, and next-round phases N0–N3)

> This is the description, not the plan. The plan-stage version is in git history
> (`git log --follow spec-3d.md`); the phased build order and its progress table are in
> [plan-3d.md](plan-3d.md); the reasoning for every departure is in
> [decisions.md](decisions.md), rounds R29–R39. Where this document and those disagree
> about *why*, those are the record.

NOISE 3D is the same game as NOISE — same districts, same aliens, same predictor, same
rules — played in **first person**, with a shooter's camera, controls and HUD: mouse look,
WASD, a minimap, a compass, objective waypoints, a crosshair, a weapon in hand, a killcam.
It lives at `/noise/3d/`, reached from the main page's **3D · in development** link.

## The constraint that shaped everything: the 2D game stays exactly as it is

- No file under `sim/`, `web/`, `bots/` or `bench/`, and none of `play.html`,
  `districts.html`, `tools/stamp-build.mjs` or `web/build.js`, was modified. `index.html`
  has exactly one change: the header link.
- `npm test` stays **12 passed / 1 not demonstrated / 0 failed** and `npm run webcheck`
  **39/39**, checked by criterion 3D-1.
- **3D work never bumps the 2D build stamp**, so no 3D update resets a 2D save. The 3D game
  has its own stamp and its own databases.
- Nothing in `sim/` or `web/` imports anything 3D (criterion 3D-2). 3D code imports the 2D
  core and leaves it as it is.

Outside the new directories, the 3D build touched only: `index.html` (one link),
`package.json` (`test3d`, `stamp3d`), both workflows (a `test3d` step), `CLAUDE.md` (the 3D
working loop) and `decisions.md`.

## Scope and non-goals

"Like COD" means the camera, controls, HUD language and feel. It does not mean combat.

- **No lethal weapons, no health.** One touch from an active alien ends the run. The stun
  gun disables; it does not kill.
- **No jumping, crouching or vertical levels.** The sim is a 2D grid; a jump it cannot
  express is either fake or a new rule.
- **No line of sight for the aliens.** Detection is radius plus terrain, unchanged, and
  presented as what it plausibly is: **they hear you**. Walls do not stop sound, water
  muffles it (half radius), a black box is soundproof (zero).
- **No imported art or audio.** Every mesh is built from primitives and every texture is
  drawn into a canvas at load. Every sound is synthesised.
- **No language model on the 3D page.** Dispatch runs on its templated path only
  (criterion 3D-10).

## Architecture

```
sim/        UNCHANGED. The authoritative rules for both games.
sim3d/      pure, Node-runnable, imports only sim/ and sim3d/
  units.js      CELL_M 1.5, TICK_HZ_3D 4, conversions (realSeconds, simSecondsToReal)
  body.js       continuous body: circle (r 0.2 cell) sliding against blocked tiles
  leash.js      continuous body -> four-direction sim input
  raycast.js    Amanatides-Woo grid march; lineOfSight for the stun gun
  game3d.js     class Game3D extends Game -- overrides step() and fireStun() only
  record.js     per-tick input record { dir, sprint, stunTarget } and replay()
  session.js    one district in real time: body every frame, sim every 1/TICK_HZ_3D s
web3d/      browser leaves, plus two DOM-free modules
  runner.js     DOM-free: level, predictor system, Game3D, Session3D for one district
  career3d.js   DOM-free: difficulty, attempts, scoring, payout, unlocks from /sim
  play3d.js     the district page: frame loop, camera, overlays, killcam, benchmark()
  scene.js world.js entities.js gun.js hud3d.js controls.js touch3d.js audio3d.js
  hub3d.js persist3d.js settings3d.js quality.js banner.js build3d.js changes3d.js
  beltcheck.js  dev page: all ten belts side by side
3d/         index.html (hub), play.html (district), belts.html (dev)
vendor/three/0.185.1/   three.js, unmodified, hash-checked (VERSION.md)
bench3d/    acceptance3d.js, criteria/{core,meta,measured}.js, fakeidb.js, measured.json
tools/stamp3d.mjs
```

**The sim is not forked.** The predictor's generated constants and all thirteen 2D criteria
describe this exact sim; a continuous-space fork would have made every one of them stale.
3D is a new front end on the same core, and the cost of that is reconciling a free body
with a sim that moves one cell per tick in four directions. That is the leash.

**three.js 0.185.1, vendored.** The newest release that still ships minified builds
(0.186 onwards publish only unminified files, about 2.1 MB against 0.75 MB). Loaded through
an import map from the repository, never a CDN; criterion 3D-0 checks the hashes.

## Scale and time

| Constant | Value | Meaning |
|---|---|---|
| `CELL_M` | 1.5 m | One sim cell |
| `TICK_HZ_3D` | 4 | Sim ticks per real second (2D runs at 8) |
| Walls / eye / body | 3.2 m / 1.65 m / 0.3 m radius | |

Walking is 6 m/s and sprinting 12 m/s; a district is 48 × 30 m. Everything is unchanged
**in ticks** — chase periods, alert length, stun length, division, par, the score — so
the 3D city is the 2D city at half speed. The 3D HUD converts ticks with `TICK_HZ_3D` and
never shows a sim-computed "seconds". One visible consequence: a bought second of
lightning (8 ticks) lasts two real seconds in 3D, and the 3D shop says so.

Both constants are adjustable live from the tuning panel (backquote) so they can be
settled by feel; the defaults have not yet been confirmed by a person playing.

## The player

### The leash: continuous body, grid truth

1. **The sim cell is the truth.** Pickups, the portal, detection and capture happen where
   the sim says.
2. **The body may lead but never escape:** its cell is always reachable from the sim's
   cell in at most 2 steps walking, 3 sprinting, over human-walkable tiles. That is
   slack, not a speed limit: cells beyond it act as walls for the body, and normal
   movement never reaches them.
3. **The speed limit is the grid's own.** The body's speed is capped in Manhattan terms
   to what the sim can follow (one cell per tick across-plus-along, two when sprinting),
   with a little spare capacity off-axis so a missed step can be made up
   (`WALK_DIAGONAL_HEADROOM` 0.10, `SPRINT_DIAGONAL_HEADROOM` 0.25).
4. **Each tick the leash emits one direction**: the first step of a shortest walkable path
   to the body's cell, preferring the axis the body has moved along most; when
   sprinting, a straight double step along any direction that stays on a shortest path.
5. **A stopped body and the sim agree within the slack** (measured worst case: two ticks).

A pure diagonal runs at about 64% of straight speed walking and 53% sprinting — the price of a sim that cannot step diagonally. Builds 2–9 had no grid-metric cap and one step of slack, and stuttered off-axis (frozen on an exact diagonal); criterion 3D-13 now guards against that (decisions R39). Criterion 3D-3: fed the
cell paths of 54 recorded 2D runs, a `Game3D` driven only by the leash reproduces every
tick log bit for bit. **To the sim and the predictor, a 3D player is a player.**

### Controls

| Mouse and keyboard | Phone (landscape) | Action |
|---|---|---|
| Mouse (pointer lock) | Right half: drag | Look |
| WASD / arrows | Left half: floating analog stick | Move, camera-relative |
| Shift (hold) | RUN (latches) | Sprint, when there is charge |
| Left click | STUN, with an aim-assist cone | Fire at the locked alien |
| Tab / M (hold) | MAP | Tactical map |
| Esc | II | Pause (losing the pointer pauses too) |
| R | — | Restart the district |
| H / V / I | — | Heatmap, visited cells, alien targets on the maps |
| \` | — | Tuning panel |

Mouse look is allowed during the opening freeze; the first step starts the clock. The
district opens facing its most open corridor. Head bob follows distance walked and a +5°
FOV kick follows sprinting; both are off under "reduce motion", which defaults to the
system's `prefers-reduced-motion`.

## The stun gun — the one rule that changes

| | 2D | 3D |
|---|---|---|
| Targets | Every alien whose range contains you | **The one under the crosshair** |
| Range | Your effective radius | Its detection radius (unhalved) |
| Line of sight | Not needed | **Required**: walls and rubble block, water does not |
| No valid target | Nothing spent | Nothing spent — a dry click |

The crosshair shows red brackets only when `Game3D.canStun()` would accept the shot, and
a locked shot always lands, so six charges are still six stuns. The renderer picks an
alien body; the sim re-validates. A shot exactly through the corner where two blocks meet
touches both and is blocked if either is solid. The trigger pull enters the sim on the
next tick (up to 250 ms), so replays stay exact; the beam and the sound are immediate.

On touch only, a 0.14 rad cone locks the valid alien nearest the centre of the screen.

## The world

**Bolts thin out deeper into each belt** (`sim3d/bolts.js`): the generator's bolts are
kept in full in a belt's first district and cut to `max(1, round(n × (1 − 2k/27)))` at
depth `k` (0–9), about a third by its tenth; the next belt starts full again. The kept set
is a seeded choice, applied by the runner to its own copy of the level, so nothing the 2D
game generates changes.

Each belt's palette from `web/themes.js`, lifted **in sRGB** to a floor lightness (the 2D
grounds are dark enough to read as black under 3D lighting): ground and an alternate
shade per cell, walls with a lighter cap, rubble, water, fog and a sky dome. Canvas-drawn
textures: paving with a seam on every cell edge, weathered wall panels, a scrolling ripple
normal map, scanlines on black boxes. Rubble is a seeded heap of 5–8 tumbled blocks per
cell. Inside a black box the view dims. Entity colours never change with the belt.

| Tier | Selected when | Pixel ratio | Shadows |
|---|---|---|---|
| High | Fine pointer and ≥ 8 GB | ≤ 2 | Directional shadow map |
| Medium | Default | ≤ 1.5 | Off |
| Low | Coarse pointer, `saveData`, < 4 GB (forced on phones) | 1 | Off, no antialiasing |

### Entities

Aliens are a **different species in each belt** (`web3d/alien.js` posing,
`web3d/species.js` parameters): Greys (RUST), Deep ones (TIDE: wide wet heads, gills,
webbed hands), Sporelings (MOSS: fungal caps, a slow sway), Cinders (EMBER: cracked
charcoal lit from inside, flickering), Watchers (VIOLET: a third eye, a long neck), Husks
(ASH: pale, emaciated, moving in jerks), Choristers (CORAL: a frilled ruff that fans open
when hunting), Wardens (JADE: a crown of horns, armour plates), Mirages (SOLAR:
translucent, shimmering) and Architects (COBALT: metal bands, segmented limbs, circuit
markings). One skeleton: a lathe cranium, almond eyes with red cat-slits, a hinged jaw,
a lathe ribcage, three-fingered hands, digitigrade legs, posed by forward kinematics and
drawn **by part across all aliens** (7–9 draw calls per species for any number). Every
species carries the threat colour in its eye slits, glowing markings and a red fresnel
rim light, scaled per alien: dim when calm, bright when hunting, dark when stunned
(criterion 3D-26 checks the table). When an alien can hear you its head turns to you
and tilts 18° within a quarter second; idle aliens twitch on a seeded schedule; a stun
is a 0.6 s convulsion, then a collapse with the eyes dark. They glide toward their sim
cell at the speed their move period implies. A floor ring per alien shows the radius at which it hears you — red when it does, easing
smaller when you step into water. Keys glow; coins are coloured and sized by value and
instanced by value; bolts are extruded glyphs; the open portal is a beam visible over
every wall. Pickups fly to the camera. **Awake aliens are solid to your body** (stunned ones are not), so the body can no
longer lead the sim through an alien before the next tick registers the capture. **Capture
is a jumpscare** (`web3d/sequences.js` data, `web3d/fx3d.js` playback, 2.2 s): when a
hunting alien comes within two cells a heartbeat swells and the drone ducks; on the frame
you are caught the alien that got you is simply there, 0.7 m in front of wherever you were
looking (no turn, no travel), and pushes in to 0.54 m. In the same instant the district's
light drains to 6%, fog closes to a red-black 0.6-5.5 m, a flickering red light comes on
under its chin with a cold edge light behind; its jaw tears open over a ring of 18 needle
teeth, its slits pinch to burning needles and turn to stare straight at you; a sub-bass
hit, a white-red flash, a scream (a distorted formant choir and a vibrato screech, over
silence -- the ambience is cut under it), violent shake, a 16-22 degree zoom punch and
colour-split tearing. A second spasm at 0.62 s; a hard cut to black and silence at 1.42 s,
held to the end card. Nothing skips it before 1.0 s (the ascension: 0.8 s), and a key
held down auto-repeating never skips either -- only a fresh press of Space, Enter or
Escape, or a click. **The portal is an ascension:** you rise from eye height to 40 m on an ease-in,
turning 90°, the view widening 15° and tilting down over the district, motes streaming
upward and the beam brightening, into a teal-white whiteout (2.4 s). Both are skippable after that floor;
Settings → Jumpscares picks full, mild or off, and reduce motion turns full into mild.
Criterion 3D-15 holds both to WCAG 2.3.1 (at most three flashes a second). A **killcam**
can replay the last three seconds of a capture from above and behind.

## The HUD

The 3D player is never shown more than the 2D player sees, and never less.

| Element | Shows |
|---|---|
| Minimap (rotating) and tactical map (Tab/M) | **The 2D game's own `Renderer`, unchanged**, drawn offscreen |
| Compass strip | Heading, key bearings, portal bearing |
| Waypoints | Every uncollected key and the open portal, with distance, through walls |
| Threat arcs | One per alien that can hear you, pointing at it |
| Noise meter | How deep inside the nearest radius you are; water and black boxes named |
| Objective, alert line, time, tier, belt | |
| Sprint bar, stun charges | Real seconds; charges also lit on the gun |
| Dispatch | The predictor's state as intercepted radio, templated |

H draws the prediction heatmap on the two maps rather than tinting the floor: one
drawing of it in the project, exact parity with 2D.

## Audio

`web/sound.js`'s ambience unchanged (the pulse rate is still the information), plus an
HRTF-panned growl per alien so one can be heard behind a wall, footsteps that go quiet in
water and silent in a black box, a zap and a dry click. **The sound stops when the game
does:** pausing, a hidden tab and the end card suspend the audio clock; the moment of
capture keeps its sound. **Never listened to** — checked for errors and through the
audio clock's state only.

## Persistence and the meta loop

| | 2D | 3D |
|---|---|---|
| Database | `noise-<BUILD>` | `noise3d-<BUILD3D>` |
| Stamp | `npm run stamp` | `npm run stamp3d` (refuses without a `changes3d.js` entry) |
| Sweep | `/^noise(-\d+)?$/` | `/^noise3d(-\d+)?$/` |
| Guest marker | `noise.guestSession` | `noise3d.guestSession` |

`persist3d.js` duplicates `web/persist.js` rather than parameterising it, so the 2D file
stays untouched until integration. Profiles, the isolation rule, guest-per-tab and
"every published update starts every save fresh" are the 2D game's — per game, so a 3D
update resets only 3D saves. MAIN's 3D districts are the same maps as 2D MAIN.

`3d/index.html` is the hub: MAIN and GUEST slots, the permanent tier chooser, a district
grid by belt, and the shop (2D prices; lightning sold in blocks of ten). `career3d.js`
applies the 2D game's rules — difficulty settled once per district, attempts counted at
run start, tier 1 carried across retries, tier 2 folded per run, `scoreRun`, payout,
unlock. A district link without a profile is an unsaved **sandbox**; `?kit=1` equips it.

## Development preview

Every 3D page carries a banner with the build number and the latest `changes3d.js`
entry: what changed, what to try, what is not verified. GitHub Pages caches for about ten
minutes; if the banner's number is behind the update note, reload.

## Acceptance criteria

`npm run test3d` (CI runs it with `--skip-2d`, the 2D suites having just run).
**18 passed · 0 not demonstrated · 0 failed** at 3D build 16.

| # | Criterion | Result |
|---|---|---|
| 3D-0 | Build hygiene: vendor hashes, stylesheet `?v=` = BUILD3D, banner entry exists | PASS |
| 3D-1 | 2D suites untouched: 12/1/0 and webcheck green | PASS (39/39) |
| 3D-2 | Arrows one way; `sim3d` pure; nothing 3D calls `Math.random` | PASS |
| 3D-3 | Parity: leash-driven `Game3D` reproduces 54 recorded 2D runs bit for bit | PASS |
| 3D-4 | Determinism: same seed and controls → same run; the input record replays it | PASS |
| 3D-5 | Leash invariants over 10,000 random control sequences (~494k frames), slack 2 / 3 | PASS |
| 3D-6 | Aimed stun matches an independent reference on 4,000 trigger pulls | PASS |
| 3D-7 | Ray march = exhaustive segment–cell test (10,000 random + centre-to-centre rays) | PASS |
| 3D-8 | Save isolation, both sweeps run against each other, guest leaves MAIN byte-identical | PASS |
| 3D-9 | Headless career: win, score, payout, dossier, unlock, purchase, kit carried on | PASS |
| 3D-10 | Nothing optional or off-site loads; templated dispatch narrates live 3D state | PASS |
| 3D-11 | Frame budget, 1080p Medium (recorded at build 14: M3, heaviest belt mean 11.9–13.3 ms, p95 at the 16.7 ms line) | PASS, by hand |
| 3D-12 | All ten belts legible (recorded screenshot review) | PASS, by hand |
| 3D-13 | Movement never stutters: no frame under half its heading's speed, walking and sprinting, 0–45° | PASS |
| 3D-14 | Bolt thinning matches its formula on all 100 districts, deterministic, reachable, applied by the runner | PASS |
| 3D-15 | Jumpscare and ascension: at most 3 flashes a second, skippable but not before 0.5 s, within length, full/mild/off, reduce motion never full | PASS |
| 3D-26 | Species table: ten distinct species, threat-red glow, known features and markings | PASS |
| 3D-27 | Contact: the body never enters an awake alien; walking at one ends in a capture; stunned ones are passable | PASS |

3D-11 and 3D-12 pass only on an entry in `bench3d/measured.json` naming the build, the
date and who measured — in both cases Claude in the browser pane, not a human.

## Departures from the plan-stage spec

| Plan | Built | Why |
|---|---|---|
| `index.html` untouched until integration | One header link from phase 0 | Requested: a visible, reviewable "in development" tab |
| Bloom and vignette at High | Shadows only | Not needed for legibility; no post-processing addons vendored |
| H tints the floor | H tints the maps | The 2D renderer already draws it; one implementation, exact parity |
| Ray march picks a side at an exact corner | Both side cells count | Corner-to-corner blocks read as a solid seam |
| Coins one mesh each | Instanced by value | 97 → 59 draw calls at district 10 |
| "Dense point sampling" for 3D-7 | Exhaustive segment–cell test | Exact, and catches corner cases sampling misses |
| One stun gun rule for both pages | As specified, plus a touch-only aim cone | A thumb is not a mouse |
| — | Killcam | Plan-9 stretch goal, built; the foresight overlay was not |

## Open questions and known gaps

1. **Nobody has played it.** Every check was a test, a script or a screenshot. Whether the
   leash feels like a shooter or a dungeon crawler with smoothing — the phase-2 go/no-go —
   is still open, and it is a person's call.
2. **Is 4 Hz right?** Half speed gives a human twice the reaction time; losing the god view
   takes much of it back. Bots cannot answer this: they have perfect information.
3. **Full radar or hear-only?** v1 shows every alien on the minimap for parity with what
   the balance was measured against.
4. **One dossier or two?** Separate for now; the same person's trait profile in 2D and 3D
   is the evidence that would settle it.
5. **Audio unheard; no real phone.** Touch was tested in an emulated 740×360 viewport.
   iPhone Safari allows neither full screen nor an orientation lock for a page.
6. **Is 48 × 30 m too small?** Larger 3D maps would need the generator parameterised and
   both generated predictor tables regenerated.
7. **Not built:** the foresight overlay (each alien's predicted path on the floor).

## Integration (a separate decision, plan phase 10)

The "3D · in development" link becomes a styled 2D / 3D switch on every page (a
`web/style.css` change, so that update bumps the 2D stamp and resets 2D saves — say so in
its note); the banner and tuning panel come off; save sharing is decided; `persist3d.js`
folds into a parameterised `web/persist.js`; `README.md` and `spec.md` describe both games.
