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
sim/        The authoritative rules for both games, unchanged in behaviour. Since N8.1,
            gen.js exports scatterBolts and scatterCoins for the city builder; 3D-20
            proves 2D levels are byte-identical.
sim3d/      pure, Node-runnable, imports only sim/ and sim3d/
  units.js      CELL_M 1.5, TICK_HZ_3D 4, conversions (realSeconds, simSecondsToReal)
  body.js       continuous body: circle (r 0.2 cell) sliding against blocked tiles
  leash.js      continuous body -> four-direction sim input
  raycast.js    Amanatides-Woo grid march; lineOfSight for the stun gun
  game3d.js     class Game3D extends Game -- overrides step() and fireStun() only
  record.js     per-tick input record { dir, sprint, stunTarget } and replay()
  session.js    one district in real time: body every frame, sim every 1/TICK_HZ_3D s
  next/         the `next` ruleset (N8 onward): what districts play from 3D build 21
    size.js       the size curve, x5 (district 1) to x60 (district 100) the 2D area
    city.js       the city builder: avenues, streets, lots, neighbourhoods, places
    rules.js      ruleset ids, generateDistrict(), paramsFor() (tier speeds, alien numbers
                  and rates), the run time limit
    game.js       Game3DNext extends Game3D: populations, travel, route budget (N8.2)
    spawn.js      arrivals: in a band round you, out of sight, weighted by the prediction
    field.js      FastFields: the same BFS numbers as sim/pathfind.js, 12-15x faster
web3d/      browser leaves, plus two DOM-free modules
  runner.js     DOM-free: level, predictor system, Game3D, Session3D for one district
  career3d.js   DOM-free: difficulty, attempts, scoring, payout, unlocks from /sim
  play3d.js     the district page: frame loop, camera, overlays, killcam, benchmark()
  scene.js world.js entities.js gun.js hud3d.js controls.js touch3d.js audio3d.js
  hub3d.js persist3d.js settings3d.js quality.js banner.js build3d.js changes3d.js
  beltcheck.js  dev page: all ten belts side by side
3d/         index.html (hub), play.html (district), belts.html (dev)
vendor/three/0.185.1/   three.js, unmodified, hash-checked (VERSION.md)
bench3d/    acceptance3d.js, criteria/*.js, hash2d.js, fakeidb.js, measured.json
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

Walking is 6 m/s and sprinting 12 m/s. A district is a city from 108 × 67 m (district 1)
to 372 × 232 m (district 100); see "Districts are cities" below. The `classic` ruleset
keeps the 2D game's 48 × 30 m. Everything is unchanged **in ticks** — chase periods, alert
length, stun length, division, par, the score — so the 3D game runs the 2D rules at half
speed. The 3D HUD converts ticks with `TICK_HZ_3D` and
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

### Districts are cities (N8.1, 3D build 21)

Every district plays the `next` ruleset (`sim3d/next/rules.js`). Its map comes from
`sim3d/next/city.js`, not the 2D generator. The area is the user's curve: a multiple of
the 2D board's 640 cells, along straight lines through ×5 (district 1), ×10 (10), ×30
(50), ×45 (75) and ×60 (100). The 8 : 5 shape is kept, so the map is
`round(32·√A) × round(20·√A)` cells:

| District | Cells | Metres |
|---|---|---|
| 1 | 72 × 45 | 108 × 67 |
| 10 | 101 × 63 | 152 × 95 |
| 50 | 175 × 110 | 263 × 164 |
| 100 | 248 × 155 | 372 × 232 |

**How a city is built:**

1. **Avenues.** One to five vertical and one to four horizontal avenues, 3 cells wide,
   are placed evenly with jitter.
2. **Streets and alleys.** Each block between the avenues is split by streets (2 wide)
   or alleys (1 wide, 30 % of cuts) until no lot is larger than 22 × 16.
3. **Neighbourhoods.** Each lot gets a type by seed:

   | Type | Weight | What it is |
   |---|---|---|
   | Tenements | 28 | Solid blocks threaded with edge-to-edge alleys and a courtyard |
   | Yards | 14 | Fenced, with gates, stacked with wrecks (rubble) |
   | Market | 12 | Walled arcade with many gates and rows of stalls (wall or rubble) |
   | Plaza | 10 | Open, with a fountain (plinth in a ring of water) or a monument, and wrecks |
   | Park | 10 | Railed garden with gates, a pond and single-cell trees |
   | Depot | 10 | Walled hall with two or three doors and a grid of columns |
   | Ruins | 10 | Rubble with standing wall stubs and a cross of cleared paths |
   | Canal | 6 | A 2–3-wide water channel running through |

4. **Places.** Every lot is a named place (`{id, name, type, x, y, w, h, centre}`, for
   example "Pike Market" or "Cobble Courts"), and every avenue is named too. They are
   for the story, the art and the objectives. Nothing displays them yet.
5. **Spawn and keys.** The spawn is the centre of a random open place. Each key goes in
   its own place, chosen among the 15 % of places furthest by walking from the spawn and
   from the keys already placed. Since N8.3:
   - there are `round(4 + 6·(d−1)/99)` keys: 4 at district 1, 10 at 100;
   - keys are at least 17 cells (25 m) apart in a straight line;
   - if every key so far is in one half of the map, the last one goes in the other.
6. **Black boxes and water.** There are `round(3·√A)` black boxes, in open places. Water
   is topped up to the 2D density with puddles by the walls.
7. **Regions, bolts and coins.** There are `min(48, max(12, round(12·√(A/5))))` predictor
   regions. Bolts and coins are placed by the 2D game's own `scatterBolts` and
   `scatterCoins`. Portal sites are every place's centre without a key, listed furthest
   from the nearest key first (N8.3). `Game3DNext` draws the run's portal from the
   furthest quarter, weighted by that distance; 2D uses the half furthest from the spawn.
   It ends up about 50 m from the nearest key at district 1 and 100 m at district 100.

**Connectivity is safe by construction.** Every lot touches a street. Every obstacle
dropped into open ground must have a ring of open ground all round it, which a later
obstacle may not touch, so it can always be walked round. A final flood fill walls up any
pocket the human cannot reach. 3D-21 checks 500 cities. Generation takes 9 ms at
district 1 and about 90 ms at district 100.

**What else changed with the size:**

- **Time limit (N8.3).** The limit is set per run: `max(6 min, 6 × par)`, about 7 min
  at district 1 and 36 at district 100. Par is the greedy key route plus the portal,
  times 1.35. It is shown only in its last minute, when the clock turns red and counts
  down.
  - Measured with no aliens, walking the route takes 0.9 min at district 1 and 4.4 at
    district 100.
  - N8.1 had used `180 s × 8 ticks × √A`, set before anything was measured.
- **HUD board.** The board the 2D renderer redraws each frame uses
  `max(6, min(16, floor(2400 / w)))` px per cell, 9 px at district 100.
- **Sky.** The sky dome follows the camera.
- **Bots.** They size their path buffers to the map (`bots/policies.js`). Before this,
  they silently wrote past a 640-cell buffer on a city map and never found a key.

**Measured** (M3, 1080p, High with shadows, whole frame including the HUD):

| | Mean frame | Triangles |
|---|---|---|
| District 1 | 11.2 ms | — |
| District 100 | 12.8 ms (p95 17.3) | 0.94 M |

The worst sim tick at district 100 was 6 ms, with one alien. Culling and staggered
re-planning come in N8.2 and N8.4.

### Aliens on city maps (N8.2, 3D build 23)

Districts on `next` run `Game3DNext` (`sim3d/next/game.js`), which overrides parts of
`Game3D`. Its parameters come from `paramsFor()` in `sim3d/next/rules.js`.
`classic` is untouched.

**Tier speeds (3D build 22).** Aliens move at 0.5× (EASY), 0.75× (MEDIUM), 1× (HARD)
and 1.3× (ULTRA) the sim's base speed, as the user asked. The 2D game holds the first
three to three-quarters of that. The hub's tier picker shows these values.

| | Rule |
|---|---|
| Hunting speed | base rate × tier × a district factor rising from 1.0 at district 1 to 1.4 at district 100, capped at 0.70 × tier of your walking speed. That is 70 % on HARD, so a 5 s alert can still be outrun past the detection radius, and 91 % on ULTRA, where you hide rather than run. |
| Patrol speed | base × tier × district factor; never faster than hunting |
| Travel speed | 2 × tier walking speeds (2× on HARD), only when more than 40 m from you **and** out of your line of sight. A rate above 1 lets an alien take two or three steps in a tick. |
| Arrival cap | `round(4·√A)`: 9 at district 1, 13 at 10, 22 at 50, 31 at 100 |
| Divisions | as in 2D, every 10–15 s, but stopping at twice the cap (`MAX_ALIENS` is 64) |
| Arrival rate | the 2D λ × cap / 2D cap, so the city fills over about two minutes |
| Already there | `max(1, round(cap/8))`, placed 60–120 m away |
| Arrivals | 25–60 m away as the alien walks, out of your line of sight, weighted by the prediction (`sim3d/next/spawn.js`) |

The aliens live on the same pure sim as 2D, so these are all overrides. The rest of the
rules are the 2D game's: detection, alerts, the squad's roles and the black box.

**Keeping the tick small:**

- **FastFields.** `sim3d/next/field.js` computes the same distances as `bfsFrom`
  (checked cell for cell), 12–15× faster: 0.125 ms for a full district-100 field.
- **Route cache.** Route fields are cached by target cell, keeping 80, so every searcher
  heading for your last known position shares one.
- **Route budget.** At most `round(400000 / cells)` new routes are built per tick (10 at
  district 100). An alien with no route at all may overdraw this to twice.
- **Commitment.** A patrolling alien keeps its destination for 6 s unless it gets there.
  The squad re-deals regions every 1.5 s, and without this, aliens re-routed several
  times a second.
- **Par and objective legs.** Par was recomputed at every division in 2D. Both now use
  FastFields.

**Measured** (M3, district 100, bots, the city filling to 35 aliens):

| Measure | Result |
|---|---|
| Sim tick | p99 2.5 ms, worst 3.9 ms (11.7 ms before the fixes above) |
| Whole frame | 10.8 ms mean at 1080p High |
| During play | geometry, texture and shader-program counts constant: nothing is created |

**The Tab map zooms and pans (N8.3, 3D build 24).** The wheel zooms from the whole
district up to 2.5 screen px per board px; zooming closes in on you. Dragging pans the
map, with the mouse button held, since the pointer is locked. It opens centred on you, at
the zoom it was left at. While it is open, a click does not fire and a drag does not turn
you. Place names are drawn wherever they fit, and avenue names from ×1.5. A key off the
edge of a zoomed map is pinned to the edge with its distance, and pinned labels stack
rather than overprint.

**The Tab map's beacons (3D build 22).** Every uncollected key gets a gold beacon at a
fixed screen size. It has rings pulsing out about once a second (under the 3-flash
limit), a breathing marker and its distance. The portal gets a teal one. The player's
arrow no longer shrinks with the map.

### Drawing a city (N8.4, 3D build 26)

- **Chunks.** Every instanced layer (floor, walls, caps, rubble, water, black boxes) is
  cut into 32 × 32-cell chunks (48 m), each its own `InstancedMesh` with its own bounding
  sphere. District 100 has 218 chunks. three.js frustum-culls by one sphere per mesh, so a
  single mesh per tile type for the whole city was never culled at all.
- **Far plane = fog.** The camera's far plane is 100 m and the fog is solid from 90 m
  (`FOG_FAR`). Both work by view depth, so chunks the frustum drops were already
  invisible. The sky dome has a radius of `FOG_FAR` and follows the camera.
- **Nothing streams.** The whole district is built during loading. During play,
  geometry, texture and shader-program counts stay constant.
- **Buried walls.** A wall cell with wall on all four sides gets a cap but no body: it
  shows no face at street level, and the killcam looks down on the caps.
- **Shadows (High).** The shadow box is 45 m either side of a point 20 m ahead of the
  camera, moved every frame and snapped to whole shadow-map texels so it does not
  shimmer. Before this, one 2048 map over district 100 put 0.22 m in each texel.
- **The minimap's own board.** A second 2D renderer draws a 16-cell window around you,
  offset by its context transform; the whole-district board is drawn only while the Tab
  map is open. Copying the whole 2232 × 1395 board into the minimap every frame had cost
  about 7 ms at district 100, more than the entire 3D world.
- **Frame-rate setting.** Automatic, 60 or 30. Frames are due on a fixed schedule, so
  the average holds on any display (60 on a 144 Hz screen, not 48).

**Measured** (district 100, Medium, 1080p, M3, hidden pane):

| | Mean | p95 | Triangles |
|---|---|---|---|
| Before (build 23) | 12.4 ms | 17.0 ms | 609k |
| After (build 26) | 5.3–8.4 ms | 10.7–12.2 ms | 272k at most |
| High, after | 5.3 ms | 7.8 ms | — |

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
| High | Fine pointer and ≥ 8 GB | ≤ 2 | Directional shadow map: a 90 m box following you since N8.4 |
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
is an attack** (`web3d/sequences.js` data, `web3d/fx3d.js` playback, 7.0 s: about 6 s of
scene, then black). The variant is the Settings -> Jumpscares choice alone (full, mild,
off); reduce motion does not change it, and the end card says when the capture was not
the full one. When a hunting alien comes within two cells a heartbeat swells and the
drone ducks. On capture: the lights die in two flickers with a buzz (district lights to
1.5%, sky dome hidden, then the whole world hidden once dark -- the attack happens in a
void, so no wall can stand between you and it). It stands 2.6 m off in front of wherever
you were looking, lit only by a cold spot from above (skin darkened, wetter) and a dim
red under the jaw, eyes burning, and comes at you in jerks (lurch, stop) while you back
away 0.25 m and your heart beats; it rears at arm's length with claws spread, hissing
(2.2 s); lunges with a smeared motion trail (2.6 s); and at 2.75 s, impact: flash, bass
hit, scream, three ragged claw gashes torn across the screen that then bleed, and you are
knocked flat -- the view falls 1.08 m, back 0.45 m, rolls -0.34 and looks up at it
leaning 0.62 rad over you. It bites at your face three times (3.35, 3.8, 4.4 s), head
thrashing, screaming between bites; two rows of eleven wet teeth with fangs at the
corners and four strands of saliva fill its mouth. At 5.3 s it draws back -- stillness,
silence, its breath -- the jaw stretched wide; at 5.8 s a last lunge into the lens; at
6.0 s a hard cut to black and silence, and a crunch in the black. Its face is pinned to a
point in your view (`Entities` hangs the body off the face's position in the body
frame), so it frames the same on every species. The HUD and the leash readout are off
for the whole sequence and return with the end card. Nothing skips it before 2.5 s (the
ascension: 0.8 s), and a key held down auto-repeating never skips it -- only a fresh
press of Space, Enter or Escape, or a click. The mild variant keeps the earlier gentle
approach. **The portal is an ascension:** you rise from eye height to 40 m on an ease-in,
turning 90°, the view widening 15° and tilting down over the district, motes streaming
upward and the beam brightening, into a teal-white whiteout (2.4 s). Both are skippable after that floor;
Settings → Jumpscares picks full, mild or off.
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

## Developer mode (temporary, 3D build 27)

For testing every district while the game is built, and to be removed when it is done.

- **Unlocking.** On the hub (Dev pages → Developer mode), the developer code unlocks it
  in that browser. `web3d/devhash.js` holds only `SHA-256(salt + ":" + code)`; the code
  lives in the git-ignored `DEV-MODE-CODE.txt`. `npm run devcode -- "code"` sets a new
  one, and `npm run devcode` invents one.
- **The panel** links every district 1–100 as `play.html?d=N&t=TIER&dev=1`, plus
  `rules=classic`, `god=1` (they cannot catch you) and `empty=1` (no aliens).
- **Dev runs** are the unsaved sandbox; a career URL is never a dev run. The kit is the
  stun gun, kept at 6 charges, and 999 s of lightning, both topped up every tick.
  `[` and `]` change district. A gold strip at the bottom marks the run.
- **Not security.** It is a convenience lock: the site is static, so anyone who reads the
  source can switch it on, for their own browser only.
- **Removal.** Everything is in `web3d/dev3d.js`, `web3d/devhash.js`,
  `tools/devcode.mjs`, `tools/remove-devmode.mjs` and `bench3d/criteria/devmode.js`, plus
  lines tagged `DEV-MODE` in `hub3d.js`, `play3d.js`, `3d/index.html`, `style3d.css` and
  `.gitignore`. `npm run remove-devmode` deletes and strips all of it, plus the two npm
  scripts, and 3D-31 dry-runs that on every test run. Remove this section in the same
  commit.

## Acceptance criteria

`npm run test3d` (CI runs it with `--skip-2d`, the 2D suites having just run).
**24 passed · 0 not demonstrated · 0 failed** at 3D build 27 (3D-1 by the 2D suites run
alongside: `npm test` 12/1/0, `npm run webcheck` green).

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
| 3D-11 | Frame budget, 1080p Medium (re-recorded at build 26 on district 100, the heaviest city: M3, mean 5.3–8.4 ms, p95 10.7–12.2 ms) | PASS, by hand |
| 3D-12 | All ten belts legible (recorded screenshot review) | PASS, by hand |
| 3D-13 | Movement never stutters: no frame under half its heading's speed, walking and sprinting, 0–45° | PASS |
| 3D-14 | Bolt thinning matches its formula on all 100 districts, deterministic, reachable, applied by the runner | PASS |
| 3D-15 | Jumpscare and ascension: at most 3 flashes a second, skippable but not before 0.5 s, within length, full/mild/off, the variant is the Jumpscares setting alone | PASS |
| 3D-20 | 2D unchanged: 10,000 2D levels hash byte-identical to before N8.1 touched `sim/gen.js` | PASS |
| 3D-21 | Big maps: the agreed size curve, growing every district; 500 cities reachable for the human and aliens, places distinct; no arrival or division within the minimum distance over 60 episodes | PASS |
| 3D-26 | Species table: ten distinct species, threat-red glow, known features and markings | PASS |
| 3D-27 | Contact: the body never enters an awake alien; walking at one (along its route, since build 23) ends in a capture; stunned ones are passable | PASS |
| 3D-28 | Smooth on big maps: at district 100 with the city filling, new routes per tick within twice the budget; tick p99 under 32 and worst under 64 full-map searches (machine-relative) | PASS |
| 3D-29 | Fair speed: tiers 0.5 : 0.75 : 1 : 1.3 at every district, hunting under its ceiling; no two-step move near you or in sight; no arrival in sight | PASS |
| 3D-30 | Keys and portal: 4–10 keys by district, own places, ≥ 17 cells apart, both halves; portal from the quarter furthest from the keys; time limit max(6 min, 6 × par) | PASS |
| 3D-31 | Developer mode removable in one step: a dry run of `npm run remove-devmode` leaves no references, rewritten scripts parse; the code stored only as a salted digest | PASS |

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
6. ~~**Is 48 × 30 m too small?**~~ Yes, said the user. Settled by N8.1's cities, ×5 to ×60.
   The predictor still uses the 2D constants; N8.5 recalibrates them for behaviour.
7. **Not built:** the foresight overlay (each alien's predicted path on the floor).

## Integration (a separate decision, plan phase 10)

The "3D · in development" link becomes a styled 2D / 3D switch on every page (a
`web/style.css` change, so that update bumps the 2D stamp and resets 2D saves — say so in
its note); the banner and tuning panel come off; save sharing is decided; `persist3d.js`
folds into a parameterised `web/persist.js`; `README.md` and `spec.md` describe both games.
