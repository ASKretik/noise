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
  raycast.js    Amanatides-Woo grid march; lineOfSight, and shotClear (with heights) for the stun gun
  solid.js      what stops a shot and how tall: walls, and each rubble heap's seeded height
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
  dispatch/     the 3D Dispatch (N8.5): habits, not rooms
    habits.js     five habit measures, the per-profile habit file, tactic strengths
    priors3d.js   GENERATED (npm run priors3d): the bot population's habit baseline
    geometry.js   GeometryChain: tier 1 as "where you can reach in k ticks", nothing learned
    tactics.js    the targets each habit's tactic sends aliens to
web3d/      browser leaves, plus two DOM-free modules
  runner.js     DOM-free: level, predictor system, Game3D, Session3D for one district
  career3d.js   DOM-free: difficulty, attempts, scoring, payout, unlocks from /sim
  play3d.js     the district page: frame loop, camera, overlays, killcam, benchmark()
  scene.js world.js entities.js gun.js hud3d.js controls.js touch3d.js audio3d.js
  hub3d.js persist3d.js settings3d.js quality.js banner.js build3d.js changes3d.js
  beltcheck.js  dev page: all ten belts side by side
  art/          belt art direction (N4)
    belts.js      PURE data: each belt's surfaces, props, weather, dusk and midnight sky
                  and light; artFor(district); the palette lint 3D-16 runs on it
    textures.js   canvas albedo + Sobel normal map (+ roughness) per surface style
    props.js      instanced wall props: pipes, harbour posts and buoys, vines
    weather.js    one Points cloud, moved and wrapped round the camera in its shader
    sky.js        the sky dome shader: gradient, sun or moon, stars, clouds, canopy, beam
    places.js     each kind of place's wall and floor patterns (N4.2)
    layered.js    texture arrays and the material that reads a slice per instance
    signs.js      name plates at the gates and along the avenues, and the wall art
    beltstyles.js belts 4-10's surfaces, registered into textures.js STYLES
    landmarks.js  plaza centrepieces and each district's skyline landmark
  post.js       bloom and the belt's colour grade (Medium and High)
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
| Range | Your effective radius | **72 m** (`STUN_RANGE_M`), about as far as the fog lets you make one out (until build 30: its detection radius, 7–8.4 m) |
| Line of sight | Not needed | **What you see**: the line from your eye to the point the crosshair is on clears every wall and every rubble heap's top; water and black boxes do not block |
| No valid target | Nothing spent | Nothing spent — a dry click |

The renderer finds every alien body along the crosshair ray and takes the nearest one you
can see. It sends the shot's **aim** with it: the eye and the struck point, in 1/32 of a
cell and of a metre (`aimOf`). The sim re-checks that exact line with `shotClear`
(`raycast.js`), against the same heights the renderer draws (`solid.js`: walls 3.2 m, a
rubble heap as tall as its biggest block, from the same seeded draw). An aim is refused
if its eye is more than 5 cells from your cell (the leash lets the body lead by 3) or
inside a wall, or its point is more than 2.5 cells from the alien's cell. A shot without
an aim (headless runs) flies from your cell's centre at eye height to the alien's centre
at 1.2 m.

The crosshair shows red brackets only when `Game3D.canStun()` would accept the shot. A
locked shot always lands, so six charges are still six stuns. Grey brackets mean visible
but not shootable: stunned already, out of charges, or 72–82 m away. An alien you cannot
see gets no bracket, so the crosshair cannot find aliens through walls (before build 30
it did). A shot exactly through the corner where two blocks meet touches both. The
trigger pull enters the sim on the next tick (up to 250 ms), with its aim in the input
record, so replays stay exact; the beam (to the struck point) and the sound are immediate.
A pull before your first move does nothing: the opening freeze holds everything.

On touch only, a 0.14 rad cone locks the visible, shootable alien nearest the centre of
the screen, aimed at its mid-body.

## Items and the inventory wheel (N6.1, 3D build 36)

On the `next` ruleset (districts), three items, bought in the hub
(`sim3d/shop3d.js`). They are carried as `inventory.items3d`, written through the
store's single active-id path (`persist3d.js buyItem3d`, `returnItems3d`). Whatever a
run does not use comes home.

| Item | Price | Carry | Per district | Rule (`Game3DNext`) |
|---|---|---|---|---|
| Noise maker | 60 | 3 | 3 | Thrown where you aim, no range limit (build 37; see Throws below). Ends a hunt with its last-known cell on the decoy, the game's own "search there" path. Hunters, and patrols within 14 cells, are sent to it, and for 40 ticks (10 s) the squad re-plan leaves them on it unless they arrive. Being seen again starts the hunt again |
| Dampers | 120 | 1 | 1 | `effectiveRadius` × 0.75 for the rest of the district; the stun gun's reach is unchanged |
| EMP | 150 | 2 | 1 | Thrown where you aim, no range limit. Stuns every awake alien within 3 cells of the blast with no wall between, for `stunTicks` |

- **A use** is `{ id, x, y }` in the input record, hashed only when present, and resolves
  at the start of the next tick before movement, like a stun. Replays reproduce it
  (3D-17).
- **Dev mode** carries every item, unlimited and with no per-district cap.
- **The wheel.** Hold Space and a wheel opens round the crosshair: the stun gun at the
  top, the items clockwise.
  - While it is open, the mouse moves a pointer, not the view.
  - The slot nearest the pointer's direction (past a small dead zone) is highlighted,
    and letting go of Space takes it in hand. Losing focus cancels.
  - The middle says what the slot does; slots with nothing left are dimmed.
- **In hand.**
  - With an item in hand, the gun's viewmodel and lock are hidden.
  - A ring on the ground shows where a throw would land: pale if it can, grey if not,
    with the reason in the line under the crosshair. An EMP also shows its blast ring.
  - Click throws (or puts the dampers on).
  - A decoy pulses and rattles for 10 seconds; an EMP flashes out to its radius.
  - When an item runs out, the gun comes back to hand.
- **Throws (build 37) are ray-traced.**
  - The page sends the throw's ray: the eye in 1/32 of a cell and of a metre, and the
    view direction × 4096.
  - The sim traces it over the grid with heights (`raycast.js throwLanding`): walls are
    solid at any height, a rubble heap up to its top.
  - The item lands where the ray meets the ground. If it meets a wall or a heap first,
    it drops in the last open cell before it. Off the map, or at the sky, nothing lands.
  - No range limit. The eye must be within the leash's slack of your cell.
  - The page draws its landing ring from the same function, so ring and landing agree.
  - A dotted arc runs from the hand to the ring, and the item flies along it.
- **Phones** have no wheel yet.

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

### The Dispatch learns habits, not rooms (N8.5, 3D build 28)

On `next`, the predictor keeps the 2D game's arithmetic (`sim/predictor/combine.js`) and
its 20-trait dossier, with two changes. Both are 3D-only; nothing under `sim/predictor/`
changed.

- **Tier 1 is geometry only.** `GeometryChain` gives each region's share of the cells
  you could reach in k = 20 ticks (5 s) from where you are now, with a 3 % floor. It
  learns nothing, so the "which room do you favour" part of the Dispatch is gone.
  Measured top-1 accuracy is 39–100 % across the ten bots, at least 7× a uniform guess.
- **The habit file.** Five habits are measured each run from the tick samples, plus
  whether the Tab map was open. That is now part of the input record, hashed only when
  true, so classic records hash as before. Each habit is folded into an exponentially
  weighted file kept on the profile as `habits3d`, written through the store's
  active-profile path:

  | Habit | Measured as |
  |---|---|
  | hide | under threat, the share of time in a black box or standing still in water |
  | corner | the stop rate within two cells of a convex wall corner, minus the stop rate elsewhere (calm, map closed) |
  | lost | walking away from the nearest key, retreading ground, opening the map |
  | map | the share of the run standing still with the map open |
  | run | under threat (judged before the step), moving away from the alien without moving toward the key; sprinting counts half |

- **Scoring a habit.** Each habit is z-scored against the five ordinary bots
  (`npm run priors3d`, 120 runs). A tactic's strength is 0 at z ≤ 0.5 and reaches 1 at
  z = 2, times the confidence `n / (n + 1.5)`.
- **Tactics.** At each squad re-plan, `round(3 × strength)` aliens (at least one, never
  a chaser, never the last plan alien) are sent to the tactic's targets
  (`tactics.js`):
  - **hide:** the water nearest your last-known position once you have gone to ground,
    and the exit of your black box;
  - **corner:** just round the corners on your route;
  - **lost:** halfway along your route to the next key;
  - **run:** during a chase, the open ground 5–11 cells away that is furthest from every
    alien;
  - **map:** standing still with the map open for `6 / strength` ticks sends the
    nearest aliens to you.

  All of them use the ordinary movement rules (3D-29).
- **The chatter** appends "File note: subject …. Units, …" for the strongest habit.

Measured against the habit bots over 20 paired runs (3D-22):

| Tactic | Effect |
|---|---|
| hide | first seen 48 s → 36 s |
| corner | first seen 39 s → 22 s |
| lost | first seen 39 s → 23 s |
| map | first seen 46 s → 26 s |
| run | detections 21.1 → 24.4 |

Bots with no habit: 24 of 24 paired runs identical, tick for tick.

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

### Belt art (N4.1, 3D build 29)

Each belt is described in `web3d/art/belts.js` as plain data, with two ends: **dusk**
(depth k = 0, its first district) and **midnight** (k = 9, its tenth). `artFor(district)`
mixes the two by `t = k / 9`: sky and fog colours, cloud cover, stars, light colours and
strengths, and weather density. The sun sinks from its dusk elevation to just under the
horizon over the first half of a belt; from k = 5 the moon is up and climbing. The key
light comes from whichever is in the sky (never lower than 6°), so shadows on High
point away from it.

| Belt | Walls | Floors | Props | Weather | Sky |
|---|---|---|---|---|---|
| RUST (1–10) | Riveted steel panels, rust running from the rivets | Tread plates, oil stains | Pipe runs along whole wall lines, drops, valve wheels | Dust drifting on the wind | Low orange sun, thin cloud; moon and stars by midnight |
| TIDE (11–20) | Wet concrete, form-work seams, a wet foot | The same, with puddles (a roughness map: wet shines) | Mooring bollards at wall feet, buoys in open water | Slanted rain | Overcast; a lighthouse beam sweeping the horizon, stronger by night |
| MOSS (21–30) | Coursed stone, moss in the joints | Uneven flagstones | Vines hanging from wall tops | Pale spores floating up (additive) | A canopy of leaves overhead; green-grey light |
| EMBER (31–40) | Soot-black brick, smouldering cracks (emission) | Cinders, clinker | Burnt beams leaning on walls | Sparks rising | Smoky maroon; moon by midnight |
| VIOLET (41–50) | Dark glossy tile (roughness map) | The same | Neon frames and bars, blue and magenta | Drizzle | Always night; an aurora growing to midnight |
| ASH (51–60) | Board-marked concrete, tie holes | Concrete | Street lamps, most dead | Falling ash | Pale white overcast |
| CORAL (61–70) | Art-deco plaster, fluted pilasters, stepped frieze | Terrazzo | Small balconies with balusters | — | Rose sunset |
| JADE (71–80) | Carved stone, roundels and key bands | Flagstones | Hanging lanterns | Low mist | Two moons by midnight |
| SOLAR (81–90) | Bedded sandstone, sand at the foot | Paving | Canvas awnings | Warm haze | A giant sun |
| COBALT (91–100) | Alloy panels, vents, hatches | Deck plates | Masts and dishes, a light at each tip | — | Always night; the mothership overhead |

(Belts 4–10: N4.3, 3D build 32. A red sky would sit on the aliens' red, so EMBER's is a
dark maroon and CORAL's sunset a rose-magenta; 3D-16 checks all 100 districts. Prop
layers are drawn whole, one call each, which kept COBALT at 134 calls rather than 167.)

- **Surfaces** (`textures.js`) are canvas-drawn from the seed, as before: a colour canvas
  and a height canvas, the normal map being the height's Sobel gradient. Floor and water
  cells get a seeded quarter turn, so one texture never reads as a repeating grid.
- **Props** (`props.js`) sit only on the street-facing faces of walls or float in open
  water, so walkability is untouched. Each kind is one `InstancedMesh`, chunked with the
  rest of the world. Choices are keyed on the cell or wall line, so a district always
  looks the same.
- **Weather** (`weather.js`) is one `Points` cloud whose vertex shader moves each
  particle and wraps it into a box round the camera: no CPU work per frame. Sizes are in
  metres (scaled by the canvas height). Counts: dust up to 1,800 × rate, rain 5,200 ×
  rate, spores 1,100 × rate.
- **Sky** (`sky.js`): one shader on a dome inside the far plane, following the camera.
  Its horizon colour is the fog colour, so the city fades into the sky.
- **Belts 4–10** have no art yet (N4.2): `fallbackArt` in `world.js` derives the sky,
  light, fog and dusk-to-midnight progression from the 2D palette, with no props or
  weather.
- **Legibility** (3D-16): no large-area colour (walls, floors, rubble, water, props, sky,
  clouds, fog) may sit within 25° of hue and 0.25 of lightness of an entity colour. A
  colour with saturation under 0.15 has no hue to clash.

**Measured** (Medium, 1080p, M3, hidden pane, two runs each): district 20 (TIDE,
midnight rain) mean 3.7 ms, p95 7.1–9.6 ms, 141 calls; district 30 (MOSS) mean 2.9–6.3
ms, p95 3.5–11.5 ms, 122 calls; district 100 (fallback art) mean 4.7–6.5 ms, p95
7.9–10.4 ms, 132 calls.

### Places (N4.2, 3D build 31)

On an art-directed belt's city map, every place looks like what it is. Three levels: the
**belt** gives the colours (`belts.js placeLook`: the belt's wall and floor colours pulled
toward the kind's tint), the **kind of place** gives the pattern (`places.js`), and each
**place** a few per cent of its own shade and warmth. Streets, avenues and alleys
outside places keep the belt's plain surfaces, so places stand out against them.

| Kind | Walls (height) | Floor | Fittings |
|---|---|---|---|
| Tenements | Brick, two storeys of windows, some lit at night; doors on 30 % of cells (5.4 m) | Cobbles | — |
| Plaza | Dressed stone (monuments, fountain plinths) | Large paving flags | — |
| Market | Signboard over a roll-down shutter | Chequered tiles | Stalls as kiosks with an awning |
| Yards | Corrugated fencing | Gravel with ruts | Containers and crates |
| Park | Clipped hedge | Grass | Lone wall cells are trees, with a crown |
| Canal | Dressed stone | Granite setts | — |
| Depot | Ribbed metal, hazard band; loading doors on 30 % (4.4 m) | Concrete, saw cuts, oil | — |
| Ruins | The belt's wall, burnt and cracked | Ash and brick chips | Rubble darkened |

- **One material per surface.** The street's texture and every kind's are slices of one
  `DataArrayTexture` each (colour, normal, roughness and metalness, emission), and each
  wall and floor instance carries `aLayer`, the slice it shows (`layered.js`). The
  material is a `MeshStandardMaterial` with its map lookups swapped for array lookups.
  Draw calls did not grow; the arrays take about 26 MB of graphics memory.
- **Heights are drawn, not simulated.** `solid.js` treats a wall as solid at any height. A
  wall's face is hidden only by a neighbour at least as tall.
- **Fittings keep the heap's height.** A yard's containers and a market's kiosks stand
  exactly as tall as the rubble heap `solid.js` knows, so the stun gun still agrees with
  what you see. They are drawn whole (one call each), like the tree crowns.
- **Name plates** (`signs.js`): every place's name, in serif capitals on an enamel plate
  coloured by its kind. They hang on the wall beside a gate or alley mouth, facing the
  street, at most two per place on different sides; plazas and canals have a post. At
  district 20: 48 places, 193 quads.
- **Wall art** on walls that face open ground: posters, graffiti, stencils, warning plates
  and peeling paint, from a 64-tile atlas. The chance per face depends on the kind of
  place (markets 30 %, tenements 20 %, parks none) and rises 0.7× to 1.3× through the
  belt. No story content. One merged mesh each for signs and wall art: two draw calls.
- **Belt props** (pipes, harbour posts, vines) skip hedges and monuments, and vines hang
  from each wall's real top.
- **Measured** (Medium, 1080p, M3, same session): districts 20 and 30 mean 6.4–8.5 ms,
  at most 143 calls; the unchanged district 100 5.9–7.5 ms. About 1 ms for the place art.

### Landmarks, avenue signs and building fronts (N4.3, 3D build 33)

- **One skyline landmark per district** (`landmarks.js`), on the roof of its biggest
  tenement block, at the wall cell nearest the block's middle with walls all round.
  By seed:
  - 60 %: a broadcast mast, 24 m above the roof (about 30 m up), with a white light
    at the top;
  - 40 %: a crashed ship half buried in the roof, its vents lit pale blue.

  It shows over the roofs from most of a district.
- **A centrepiece on every plaza.** The plaza's lone monument cell carries a statue (60 %,
  one arm raised, turned along the plaza) or an obelisk. Its 2 × 2 fountain plinth
  carries tiered basins and a spout.
- **Avenue plates.** Every avenue's name, with the district number below ("QUILL
  AVENUE / DISTRICT 30"), on the walls along it every 18 cells (27 m), alternating sides,
  in the same sign atlas as the places.
- **Building fronts in the rubble.** On a city map, each rubble heap's biggest block
  shows the ground storey of a tenement (a window or a door), or a burnt shell in the
  ruins, from the wall texture array. It is exactly the heap's height, as `solid.js`
  knows it.
- **Shots.** Everything stands on wall cells or keeps the heap's height, so no shot
  changes.
- **Draw calls.** Landmarks are two merged meshes (solid and lights); fronts are one
  layer drawn whole.

### Glow and grade (N4.3, 3D build 34)

`post.js`, set by **Settings › Glow and colour grade** (build 35): automatic (the default) is on at Medium and High and off at Low; on and off override the quality tier. It switches live (`Play3D.applyGlow`) and is saved with the other settings.

1. **The scene** is drawn into a half-float target, multisampled 2× on Medium and 4× on
   High, so anything brighter than white keeps its excess. Glowing props and landmark
   lights are drawn at 2.4–3× white for that.
2. **The bloom pass:**
   - a soft threshold (0.92, knee 0.3) keeps what is bright;
   - it is blurred at a half and a quarter of the screen on High, a quarter and an
     eighth on Medium, with a 9-tap separable Gaussian twice per level;
   - the result is added back.
3. **The grade, per belt** (`belts.js grade`), then a soft vignette and the conversion
   to sRGB. Tints stay within a few per cent of white so entity colours hold:

   | Belt | Grade |
   |---|---|
   | RUST, SOLAR | Warm, saturation 1.05 |
   | TIDE | Cool, saturation 0.88 |
   | ASH | Saturation 0.8 |
   | VIOLET | Saturation 1.1, bloom 1.2 |
   | COBALT | Cool, bloom 1.1 |
4. **The gun's viewmodel** is drawn afterwards, straight to the screen.
5. **Draw-call counts** in readouts and `benchmark()` come from the scene pass alone
   (`view.sceneInfo`).

**Measured** (Medium, 1080p, M3):

| | Mean | p95 |
|---|---|---|
| Districts 20–100, with glow | 9.2–13.9 ms | 14.2–19.3 ms |
| District 40, Low (no glow) | 7.2–8.5 ms | 12.6–13.1 ms |

Glow and grade cost about 3–4 ms.

### District 1 horror prototype (N4.4, 3D build 38)

The user asked for the look of Amnesia and Silent Hill at about ten times the detail, on
district 1 alone first (`belts.js HD_DISTRICTS`). The open choices were made with the
antialgorithm skill (installed in `~/.claude/skills`): name the default, then move away
for a reason from NOISE (decisions.md R68).

- **Light** (`RUST_HD`).
  - Foundry smog instead of a sky: the fog runs from 2 m to 38 m, the camera's far plane
    sits at 46 m, and the sky dome shows only the smog.
  - A torch is a spot light carried with the camera; on High it casts the one shadow,
    because the sun's shadow pass is dropped here.
  - Street lamps: the nearest four burning ones get point lights, with a hashed flicker.
- **Grade.** Saturation 0.58, grain 0.11 (stronger in the shadows), chromatic fringe
  0.0022, vignette 0.62 (`post.js`).
- **Grime** (`layered.js`). A 512² value-noise map, sampled by world position from the
  axis each surface faces, at about 1.7 m and 11 m a repeat:
  - dirt at the foot of walls, stains and rain streaks;
  - glossy wet patches on the ground.

  It no longer repeats with the cell grid.
- **Detail** (`art/hd.js`), merged into seven meshes:
  - window frames, sills and lintels round the brick texture's windows. Behind each:
    dark glass, a mattress, foam, boards, a broken pane, or a lit curtain;
  - door frames and steps, with shoes left in pairs on some;
  - cornices, chimneys and drainpipes;
  - wall plinths;
  - cables sagging across the streets;
  - street lamps, most dead, about 45 % burning;
  - a ground-clutter atlas: leaves, grit, paper, oil, rags, drains, manholes, glass.

  All of it stands on wall cells or lies flat on the ground: no rule, sight line or shot
  changes.
- **Measured** at 1080p:

  | | Mean | p95 |
  |---|---|---|
  | Medium, district 1 | 9.4–12.4 ms | up to 17.6 ms |
  | Medium, district 2 (unchanged, the control) | 9.5–9.9 ms | 13.0–13.4 ms |
  | High, district 1 | 11.6–13.5 ms | up to 22 ms |
- **Before it can go everywhere:** the merged meshes cover a whole district (fine at
  district 1's size), so they need cutting into chunks for the big cities.

### District 1's buildings (N4.4, 3D build 40)

`web3d/art/buildings.js`: each solid block is cut into buildings along its street front
(3–6 cells each), and each building gets a purpose of twelve. Neighbours never share a
purpose or a wall material. Each has its own height, storeys, real CC0 material
(ambientCG, `assets3d/`), purpose-specific ground floor and entrance, upper-floor window
style, roof, sign and damage. See decisions.md R70 for the details.

### District 1's new art style: models, daylight, dark alleys (N4.4, 3D build 41)

Build 41 replaces the smog and the code-drawn buildings of builds 38–40 in district 1.
The style is the user's mix of their two references: **daylight in the open streets**
(Halo concept art) and **black alleys with warm lamplight** (Amnesia). Other districts are
unchanged. See decisions.md R71.

- **Assets** (`assets3d/`, all CC0 from Poly Haven, credited in `assets3d/CREDITS.md`):
  14 models (65 MB: two modular facade kits and street props), 6 ground textures (12 MB),
  and a sky (1.4 MB HDR for the light; a 0.36 MB JPEG of the 4K sky's upper half for the
  dome). Loaded with three's GLTFLoader and HDRLoader, vendored unmodified under
  `vendor/three/0.185.1/addons/` and hash-checked by 3D-0.
- **Loading** (`web3d/art/kit.js`). `boot()` waits for the models before district 1 is
  first built, with a percentage on the start screen. Without them (Node, or a failed
  download) `buildWorld` falls back to build 40's drawn buildings.
  - The kits' flat walls come as 6 cm grids (4,608 triangles a blank bay). Their UVs are
    planar, so `simplifyPlanar` re-meshes each flat part into the rectangles that cover
    it, keeping the UVs exactly: a blank bay becomes 2 triangles.
  - Every placement goes into one `BatchedMesh` per material: geometry stored once,
    instances culled one by one for the camera and the sun's shadow box. Opaque batches
    are not sorted.
  - The wall lamp's glass asks for transmission, which re-renders the scene every frame
    (17 ms); it is drawn as plain transparent glass.
- **Buildings** (`web3d/art/kitbuild.js`). `planBuildings` now cuts every place but the
  parks into buildings (`allPlaces`): tenements as before; markets and plazas into
  stalls; yards, depots and canal sides into warehouses; ruins into burnt shells; blocks
  one cell thick into brick yard walls. `planKit` gives each building a kit (plaster or
  brick), a window family, a facade colour and a joinery colour, none matching a
  neighbour's, and pilasters on some. Storeys and bays are the kits' 3 m.
  - Each face of a building is a run of 3 m bays (scaled to fit). Ground floors by
    purpose: doors (panelled, double, offset, recessed), shopfronts or roller shutters
    (some sprayed), garage roller doors across two bays. Upper storeys in the family's
    windows, a smaller attic row on top, French windows with railings on the hotel.
  - Trim: a sill band at the top of every storey, a string course over the ground floor,
    a crown on flat roofs, plinths under ground-floor windows, end caps.
  - Behind every window and door, an unlit "room" card (dark, or warm in about one in
    twenty). Glass is missing, or boarded over, by the building's damage; soot over some
    windows of burnt ones; air conditioners under one window in fourteen; downpipes on
    two fronts in five.
  - Signs, awnings, canopies, steps and roofs are drawn as in build 40.
- **Street dressing.** Modelled bins and bags near doors, crates, barrels and tyres in
  yards and markets, benches in squares and parks, utility boxes, manholes in the road.
  Wall lamps hang in narrow places (two cells or less across), at least 5 cells apart;
  three in four burn, and the nearest four of those are real point lights.
- **Ground** (`web3d/art/ground.js`). Photographed surfaces at their real size, one merged
  mesh each: asphalt roads, slab pavements along every wall with a kerb stone where
  pavement meets road, cobbles in squares and markets, grass in parks, cracked concrete
  in yards and depots, dirt in ruins. Cover cells (water) are dark, glossy mirrors of the
  sky.
- **Light** (`web3d/art/daylight.js`, `belts.js` `RUST_HD.day`):
  - the photographed sky as the dome, its horizon fading into haze;
  - its HDR, prefiltered by PMREM, as `scene.environment` on every PBR surface;
  - the sun where the photo has it (47.9° up) with soft shadows in a 64 m box that
    follows you; at Medium as well as High in this district;
  - linear haze from 22 m to 230 m in the photo's horizon colour; the far plane follows;
  - the darkness map is now a sky-view factor: in 16 directions, the steepest wall within
    14 cells, `cos²` of it averaged. Squares see nearly all the sky, a street between
    four-storey fronts about half, a 1.5 m alley almost none. It scales the sky's light,
    so alleys go black and the torch (F) is for them.
- **Grade** (`post.js`): three's ACES filmic fit with exposure 0.85, then the grade
  (saturation 1.08, grain 0.035, vignette 0.28, light bloom). Ambient occlusion from
  depth at half resolution (12 taps, a depth-aware blur), strength 0.85. Low quality
  has no post pass, so the renderer's own ACES does the tone mapping there.
- **Measured** at 1080p on the development Mac:

  | | Mean | p95 |
  |---|---|---|
  | Medium, district 1 | 17–22 ms | up to 28 ms |
  | High, district 1 | 21–26 ms | up to 33 ms |

  The district's own geometry is 3.6 M triangles. The sun's shadows cost about 6 ms of the
  frame at Medium, ambient occlusion 0.7 ms.
- **Not done:** the parks keep the old hedges and round trees (the free vegetation models
  are 50,000–280,000 triangles each); no interiors; roofs still drawn; only district 1.

### Every belt's first district in its own style (N4.4, 3D build 42)

Districts 1, 11, 21 … 91 (`HD_DISTRICTS`) are built from the model kit, each in a style
of its own from `web3d/art/hdstyles.js` (pure data, linted by 3D-16). The user asked for
a sombre look that changes completely from belt to belt, not a recolour. So each style
picks a different **light source**, tied to the belt's alien and character. With it come
its own sky, fog, grade, weather, ground, town (kit mix, heights, colours, damage,
shutters, balconies, awnings, pitched roofs), lamps and effects. See decisions.md R72.

| Belt | District | Light | Sky | Signature |
|---|---|---|---|---|
| RUST | 1 | the sun 5° up, warm, under cloud | photo (Belfast sunset) | brick terraces, soot, candles |
| TIDE | 11 | none: overcast | photo (overcast soil) | rain, wet streets (wetness 0.85), storm shutters |
| MOSS | 21 | sun through a canopy | photo (Kloofendal 48d) | a leaf canopy at 15.5 m, alpha-tested so its shadow is dappled light |
| EMBER | 31 | fires inside 14 % of buildings | drawn smoke | burning rooms, real fire lights that flicker, embers |
| VIOLET | 41 | the aurora (sky light ×5) and a moon | drawn aurora | no neon; tall blocks; wet granite |
| ASH | 51 | none: white overcast | photo (Kloofendal overcast) | `mono`: black and white except entity hues; ash falling |
| CORAL | 61 | sun through mist (soft shadows) | photo (Kloofendal 28d misty) | pastel fronts, balconies with railings, checkered pavements |
| JADE | 71 | two moons, two shadow maps | drawn, two moons | crossing double shadows; mossy cobbles; ground mist |
| SOLAR | 81 | a dull sun in dust (soft shadows) | photo under a dust veil with a sun disc | `shimmer`: heat haze; sand; fog from 3 m to 52 m |
| COBALT | 91 | the ship's searchlight | drawn hull | a 60,000 cd spot sweeping a figure of eight, with a visible beam |

- **Light from a drawn sky** (`daylight.js envFromSky`): the dome is rendered into a cube
  and prefiltered (PMREM), once per district.
- **Wall colour** (`kit.js wallColour`): the plaster photo averages terracotta. Plaster
  and the apartments' stone trim keep only the photo's luminance (normalised), so a
  building's colour is the colour seen; brick keeps its own colour, desaturated by
  `town.brickSat`.
- **Grade** (`post.js`): `mono` keeps a colour only where it is vivid, lit, and in an entity
  hue band (red to gold, teal, violet); `shimmer` ripples the middle of the view.
- **Parks:** blocks of park wall are hedges (2.4 m, never lower than the eye: walls block
  shots and sight at any height) textured with a leaf photo; lone park cells stay trees.
  Rubble heaps in kit districts are photographed concrete.
- **Cost controls:**
  - kit batches are chunked by 64 m of map;
  - window and door joinery, glass and props are hidden beyond 55 m (re-checked every
    3 m walked);
  - only walls, trim and garage doors cast shadows;
  - the night belts' fog ends at 80–90 m.
- **Stumbling** (`Play3D.stumble`): the kit builder records every small thing on the
  pavement: stoops, bank steps, bins, bags, crates, barrels, tyres, benches, utility
  boxes, rubble, canopy poles. Walking at over 0.9 cells/s into one (0.22 m of foot
  reach) pitches the view up to about 0.15 rad and drops it 9 cm, rolls it toward the
  side you hit, and recovers in 0.75 s. Once per obstacle; Reduce motion keeps a third
  of it and no roll. A scuff and a heavy step play, plus a ring or knock for metal or
  wood. Camera only: speed, the sim and the noise you make are unchanged.
- **Measured** at 1080p Medium:

  | Districts | Mean |
  |---|---|
  | RUST, TIDE, MOSS, EMBER, ASH, CORAL, SOLAR | 12–21 ms |
  | VIOLET, JADE, COBALT (night) | 25–29 ms |

### District 1 at 2K (N4.4, 3D build 43)

A test of a higher-fidelity set on district 1 only (`RUST.res = '2k'` in `hdstyles.js`);
the other first districts stay at 1K. See decisions.md R73.

- **Assets.**
  - `assets3d/models2k/`: the same 14 Poly Haven models at 2K (133 MB).
  - `assets3d/textures2k/`: district 1's 7 ground surfaces at 2K, each with a height
    map (46 MB).
  - All textures are KTX2: colour and packed maps in ETC1S, normal maps in UASTC with
    Zstandard.
- **Decoding.** `kit.js initKtx2(renderer)` makes three's `KTX2Loader` (vendored,
  hash-checked by 3D-0), which transcodes each texture to the GPU's own compressed
  format. That is ASTC or ETC2 on the development Mac: 0.5–1 byte a pixel instead of 4.
- **Loading.**
  - `loadKit(onProgress, res)` and `kitReady(res)` keep one kit per resolution.
  - `loadGround2k()` loads the ground sets.
  - `boot()` waits for both when the first district's style asks for 2K, and falls back
    to 1K if they fail.
  - A district builds with its own resolution's kit, or any loaded one.
- **Ground relief** (`ground.js addParallax`): parallax occlusion, 8–24 steps of the
  height map along the view ray, only on faces that point up. Relief depths run from
  8 mm (asphalt) to 45 mm (cobbles).
- **Weathering** (`kit.js wallColour`, `setWallLook({ weather })`):
  - on the kit's plaster, stone trim and brick, by world position: dirt up the foot of
    each wall, rain streaks stretched down it, broad damp patches;
  - `town.plasterSat` lets plaster keep part of its photo's colour (RUST 0.3);
  - RUST's hemisphere ground colour is a warm bounce from the street.
- **Every kit district:**
  - a park's lone cells are hedge blocks (no more drawn trees);
  - hedges carry two layers of alpha-tested leaf cards on every open face and the top;
  - puddles have an uneven, soft outline and a dark, rough sheen (no ripple map).
- **Fixed:** the darkness map's position on batched kit pieces (`batchingMatrix`
  was missing in `patchDark`).
- **Measured** in district 1 at 1080p: Medium 19–20 ms, High 19–21 ms, about 1 ms over
  1K. 471 textures resident.

### District 1's signs, coins and edge markers (N4.4, 3D build 44)

Turned on by `RUST.proto` in `hdstyles.js` (`signs`, `coins`, `edgeMarkers`), district 1
first, the rest once approved. See decisions.md R74.

- **Place-name plates** (`signs.js realPlates`, `realBuffer`):
  - 512 × 128 vitreous enamel plates: the place's colour, a white border, condensed white
    lettering, rounded corners (alpha), four fixing holes;
  - wear seeded by the name: chips to black iron with rust halos, mostly at edges and
    holes; rust runs from the fixings; scratches; grime along the bottom; a bleached
    top;
  - colour, relief (normal) and roughness maps, no glow;
  - each plate has a front and an iron back, stands 2.8 cm off a wall (12.5 cm on the
    model kit's fronts, clear of their bands), and hangs on four modelled bolts;
  - posts are round steel tubes with a cap, a collar and two clamps.
- **Where plates go.** `kitbuild.js` records each face that carries a door, a brick
  shop's tall glazing, a garage door, a downpipe, a wall lamp, an awning or a hedge
  (`faceUse`). `buildSigns` (now built after the buildings) skips those faces. A gate
  with no clear wall gets a post. On the kit's fronts a plate hangs on the band over the
  ground floor (2.76 m); on a yard wall, below its coping.
- **Coins** (`entities.js mintedCoin`, `mintedCoinGeometry`):
  - the value struck large on both faces (each face re-mapped so it reads upright, and
    not mirrored on the back), "CITY · TOKEN" round the top, a beaded ring, a raised
    rim, a reeded edge;
  - copper 1, nickel 2 (struck darker than its flat colour), brass 5, and a bimetallic
    10 with a violet core in a nickel ring;
  - frosted field, polished relief, tarnish in the recesses;
  - a faint glow of their own colour, weaker on the pale metals; the 5 and 10 keep their
    halos.
- **Edge markers** (`hud3d.js`): a key or the revealed portal that is behind you or off
  the side of the screen is drawn at the left or right edge, on the side you would turn
  to face it. It has an arrow and its distance, at mid-height when behind you.
- **Every kit district:** a puddle's alpha now fills its cell with a frayed edge, so
  neighbouring water cells merge into one sheet.

**Bolts thin out deeper into each belt** (`sim3d/bolts.js`): the generator's bolts are
kept in full in a belt's first district and cut to `max(1, round(n × (1 − 2k/27)))` at
depth `k` (0–9), about a third by its tenth; the next belt starts full again. The kept set
is a seeded choice, applied by the runner to its own copy of the level, so nothing the 2D
game generates changes.

Belts without art yet (4–10 until N4.2) take their palette from `web/themes.js`, lifted **in sRGB** to a floor lightness (the 2D
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
**25 passed · 0 not demonstrated · 0 failed** at 3D build 28 (3D-1 by the 2D suites run
alongside: `npm test` 12/1/0, `npm run webcheck` green).

| # | Criterion | Result |
|---|---|---|
| 3D-0 | Build hygiene: vendor hashes, stylesheet `?v=` = BUILD3D, banner entry exists | PASS |
| 3D-1 | 2D suites untouched: 12/1/0 and webcheck green | PASS (39/39) |
| 3D-2 | Arrows one way; `sim3d` pure; nothing 3D calls `Math.random` | PASS |
| 3D-3 | Parity: leash-driven `Game3D` reproduces 54 recorded 2D runs bit for bit | PASS |
| 3D-4 | Determinism: same seed and controls → same run; the input record replays it | PASS |
| 3D-5 | Leash invariants over 10,000 random control sequences (~494k frames), slack 2 / 3 | PASS |
| 3D-6 | Aimed stun matches an independent height-aware reference on 6,000 trigger pulls (half with an aim, some off target); reach 47 cells yes, 49 no on a district-100 street | PASS |
| 3D-7 | Ray march = exhaustive segment–cell test (10,000 random + centre-to-centre rays); `shotClear` = reference on 10,000 rays with heights | PASS |
| 3D-8 | Save isolation, both sweeps run against each other, guest leaves MAIN byte-identical | PASS |
| 3D-9 | Headless career: win, score, payout, dossier, unlock, purchase, kit carried on | PASS |
| 3D-10 | Nothing optional or off-site loads; templated dispatch narrates live 3D state | PASS |
| 3D-11 | Frame budget, 1080p Medium (re-recorded at build 34 with all ten belts, landmarks, bloom and grade: M3, districts 20–100, means 9.2–13.9 ms, p95 14.2–19.3 ms, at most 139 draw calls) | PASS, by hand |
| 3D-12 | All ten belts legible (recorded screenshot review; re-reviewed at build 29 at dusk and midnight) | PASS, by hand |
| 3D-16 | Belt art palettes keep clear of the entity colours: no large-area colour (streets and every kind of place) and no sign or wall-art ink within 25° of hue and 0.25 of lightness, every district of every art-directed belt; horizons darken dusk to midnight | PASS |
| 3D-13 | Movement never stutters: no frame under half its heading's speed, walking and sprinting, 0–45° | PASS |
| 3D-14 | Bolt thinning matches its formula on all 100 districts, deterministic, reachable, applied by the runner | PASS |
| 3D-15 | Jumpscare and ascension: at most 3 flashes a second, skippable but not before 0.5 s, within length, full/mild/off, the variant is the Jumpscares setting alone | PASS |
| 3D-17 | Items do exactly what their rules say (4000 throw rays against an independent trace, page ray = sim landing; dampers 0.75×; EMP against a reference on 160 placements; decoy ends the hunt, holds through re-plans, leaves aliens beyond the pull alone; caps; item runs replay) | PASS |
| 3D-20 | 2D unchanged: 10,000 2D levels hash byte-identical to before N8.1 touched `sim/gen.js` | PASS |
| 3D-21 | Big maps: the agreed size curve, growing every district; 500 cities reachable for the human and aliens, places distinct; no arrival or division within the minimum distance over 60 episodes | PASS |
| 3D-22 | The Dispatch learns habits, not rooms: geometry-only prediction ≥ 3× uniform for ten bots; habit bots recognised; habit-free runs unchanged; each tactic helps against its bot; map-open runs replay | PASS |
| 3D-26 | Species table: ten distinct species, threat-red glow, known features and markings | PASS |
| 3D-27 | Contact: the body never enters an awake alien; walking at one (along its route, since build 23) ends in a capture; stunned ones are passable | PASS |
| 3D-28 | Smooth on big maps: at district 100 with the city filling, new routes per tick within twice the budget; tick p99 under 32 and p99.9 under 64 full-map searches (machine-relative) | PASS |
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
   N8.5 replaced the room chain with geometry and added the habit file; the dossier's 20
   traits still use the 2D couplings.
8. **The Dispatch's opening line** (`web/dispatch.js`, a 2D file) says "barely a guess"
   for any new subject, even when the projection is sharp, as it is in 3D. Left as is
   with the 2D game.
7. **Not built:** the foresight overlay (each alien's predicted path on the floor).

## Integration (a separate decision, plan phase 10)

The "3D · in development" link becomes a styled 2D / 3D switch on every page (a
`web/style.css` change, so that update bumps the 2D stamp and resets 2D saves — say so in
its note); the banner and tuning panel come off; save sharing is decided; `persist3d.js`
folds into a parameterised `web/persist.js`; `README.md` and `spec.md` describe both games.
