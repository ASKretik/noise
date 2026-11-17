# NOISE 3D — build spec

Written Nov 17, 2026 · **status: proposed, nothing built yet**

> This is a plan-stage spec, the way `spec.md` started. When the 3D build lands, this
> document gets rewritten to describe the system *as built*, and every departure from it
> goes into `decisions.md` with the measurement that forced it. The phased build order is
> in [plan-3d.md](plan-3d.md).

NOISE 3D is the same game as NOISE — same districts, same aliens, same predictor, same
rules — played in **first person**, with the camera, controls and HUD conventions of a
modern shooter (mouse look, WASD, a minimap, a crosshair, objective markers, a weapon
viewmodel). It is built as a **separate page** of the same site, at `/noise/3d/`, reached
from day one by a **"3D · in development"** link in the main page's header. It is
reviewed live after every update while it is built (see "Development preview"). A
deliberate integration step at the end replaces that link with a proper 2D / 3D switch.

## The one constraint above all others

**The 2D game stays exactly as it is.** Concretely, until the integration phase:

- No file under `sim/`, `web/`, `bots/` or `bench/`, and none of `play.html`,
  `districts.html`, `tools/stamp-build.mjs` or `web/build.js`, is modified. `index.html`
  gets exactly one change: the header link to the 3D page (below).
- `npm test` stays **12 passed / 1 not demonstrated / 0 failed** and `npm run webcheck`
  stays green, on every commit.
- **3D work never bumps the 2D build stamp.** The stamp namespaces the 2D save database,
  so bumping it for a 3D-only commit would wipe every 2D player's save for a change they
  cannot see. The 3D build has its own stamp (see "Persistence").
- Nothing in `sim/` or `web/` imports anything 3D. The arrows run one way: 3D code imports
  the 2D core; the 2D core never knows 3D exists. This is checked by a test.

The only existing files the 3D work may touch before integration are **additive** edits to
`index.html` (one header link), `package.json` (new scripts), the two workflow files (new
steps), `CLAUDE.md` (the 3D working loop) and `decisions.md` (the change log). Each is
listed in the plan.

## Development preview

The 3D game is public while it is built, labelled as unfinished, so it can be played and
corrected after every update rather than judged once at the end.

**The link.** One `<a>` in `index.html`'s `.site-nav`, before Benchmarks, reading
**3D · in development** and pointing at `3d/`. It uses the existing `.site-nav a` style
unchanged. That restraint is what keeps it cheap: a new style would mean editing
`web/style.css`, which means `npm run stamp`, which wipes every 2D save. An HTML-only edit
needs no stamp, and the stylesheet's `?v=` stays exactly where it was. It is the only
place the 2D site mentions 3D before integration; `districts.html` and `play.html` do not
change.

**The build banner.** Every 3D page carries a thin strip, dismissible per session:

> 3D · in development · build 7 · *what changed* ▾

Expanded, it lists the latest entries from `web3d/changes3d.js` — a plain data module, one
entry per build: `{ build, date, changed, tryThis, unverified }`. Two jobs:

1. **Proving you are on the newest build.** GitHub Pages caches pages and modules for
   about ten minutes, so "I don't see the change" is usually a stale cache. If the number
   in the banner is not the number in the update note, that is the answer; a hard reload
   fixes it.
2. **Telling you what to look at.** `tryThis` names the district, the tier and the thing
   to try, so a review takes two minutes instead of a hunt. `unverified` says what has not
   been checked — the same honesty `spec.md` keeps about the 2D game.

`npm run stamp3d` refuses to bump the build without a `changes3d.js` entry for the new
number, so the banner can never be blank or behind.

**The review loop.** Every update ends with: the live link, the build number, what
changed, what to try, and what is unverified. Suggestions come back in conversation; each
one is either done in the next update or written down in `decisions.md` with the reason it
was not. A phase that changes what the game looks or feels like is not closed until it
has been played on the live site — the plan marks each such checkpoint.

## Scope and non-goals

Ships: a first-person, mouse-and-keyboard (and later touch) version of NOISE in WebGL,
running on the **unmodified** sim core, with its own launch page, hub, shop and save files.

"Like COD" means the **camera, controls, HUD language and feel**. It does not mean combat.
Each line below is a decision, not an oversight:

- **No lethal weapons, no health bar.** One touch from an active alien still ends the run.
  The stun gun is still the only weapon and it still only disables. A shooter's HUD and
  controls are borrowed; a shooter's damage model is not, because it would be a different
  game with a different balance that none of the existing measurements describe.
- **No jumping, crouching, prone or vertical levels.** The sim is a 2D grid. A jump that
  the sim cannot express is either fake (does nothing) or a new rule (and then every
  balance number and both generated predictor tables are stale). Neither ships in v1.
- **No line of sight for the aliens.** Detection stays radius plus terrain, unchanged.
  In first person this is presented as what it plausibly is: **they hear you**. Walls do
  not stop sound, water dampens it (half radius), a black box is soundproof (zero). The
  game is called NOISE; the fiction was always available.
- **No imported art.** No model files, no texture images, no audio files. Every mesh is
  built from primitives in code and every texture is drawn into a canvas at load, the same
  rule as the 2D board. The site stays a static upload of text files.
- **No multiplayer, no backend, no accounts.** Unchanged.
- **No language model on the 3D page in v1.** The dispatch layer runs on its templated
  path only. A 3D scene and a 200 MB model on the same GPU is exactly the device-crash
  class `modelAdvisable()` exists to prevent, and the templated path already passes
  criteria 12 and 13.

## Architecture

```
sim/        UNCHANGED. The authoritative rules for both games.
sim3d/      pure, Node-runnable, imports only sim/ and sim3d/. No DOM, no WebGL.
  units.js      CELL_M, TICK_HZ_3D, metre <-> cell <-> tick conversions
  body.js       the continuous player body: circle-vs-tile collision and sliding
  leash.js      turns a continuous body position into the sim's 4-direction input
  raycast.js    grid DDA ray march, for aim validation and the stun gun
  game3d.js     class Game3D extends Game -- targeted stun, nothing else
  record.js     the per-tick 3D input record, for replay and determinism
web3d/      browser-only leaves for the 3D page
  play3d.js     orchestration -- the 3D counterpart of web/play.js
  scene.js      three.js scene, camera, lights, fog, quality tier
  world.js      level -> meshes (instanced walls, floor, water, rubble, black boxes)
  entities.js   aliens, keys, coins, bolts, portal; interpolation
  controls.js   pointer lock, mouse look, WASD, sprint, fire, settings
  touch3d.js    analog stick + look pad + RUN/STUN for phones
  hud3d.js      crosshair, minimap, compass, waypoints, threat arcs, meters, subtitles
  audio3d.js    positional alien audio on top of web/sound.js
  persist3d.js  IndexedDB under the noise3d-<build> namespace
  build3d.js    the 3D build stamp
  changes3d.js  one entry per build, shown in the in-development banner
  style3d.css
3d/         the pages: index.html (launch + hub + shop), play.html
vendor/three/   one pinned, unmodified three.js ES module build + its LICENSE
bench3d/    the 3D acceptance suite (`npm run test3d`)
tools/stamp3d.mjs
```

### Why the sim is not forked

The thing this project is *about* is the predictor, and the predictor is calibrated
against this exact sim: the trait priors and the coupling table are generated from it,
the difficulty controller is tuned on it, and 13 acceptance criteria measure it. A 3D
game on a forked, continuous-space sim would inherit none of that — every generated
constant would be stale on day one, and "the same game in 3D" would quietly become a
different game with a familiar name.

So 3D is a **new front end on the same core**. The cost of that choice is that a
first-person body moving in continuous space has to be reconciled with a sim that only
understands one cell per tick in four directions. That reconciliation is the leash, below,
and it is the single biggest design risk in the project — which is why the plan builds and
judges it before any art.

### Rendering technology

**three.js, one pinned release, vendored** into `vendor/three/` as the unmodified upstream
ES module build plus its MIT licence, imported through an import map on the 3D pages.

- Not raw WebGL: the world is boxes and planes, but fog, lighting, shadows, instancing,
  raycasting against meshes and a post-processing chain are each days of work that
  three.js has already debugged.
- Vendored rather than loaded from a CDN: the dispatch model comes from a CDN because it
  is an optional leaf that degrades; the renderer is not optional. A CDN outage must not
  take the page down, and a pinned file in the repo cannot change underneath the build.
- Still no npm dependency and no build step. The 3D pages are plain ES modules exactly
  like the 2D ones. `package.json` keeps zero dependencies.

## The world

### Scale

Two constants in `sim3d/units.js`, both placeholders until the feel prototype settles
them (plan, phase 2):

| Constant | Starting value | Meaning |
|---|---|---|
| `CELL_M` | 1.5 m | Width of one sim cell in the world |
| `TICK_HZ_3D` | 4 | Sim ticks per real second on the 3D page |

The 2D game runs at 8 ticks a second. At first-person scale that is unplayable: with
1.5 m cells it is 12 m/s walking, about twice a shooter's sprint. Shrinking cells instead
gives 0.75 m corridors. So **the 3D page runs the same sim more slowly**:

- 4 Hz × 1.5 m = **6 m/s walking, 12 m/s sprinting**, which is quick but in the range
  shooters use.
- Everything is unchanged **in ticks** — alien chase periods, alert duration, stun
  length, division interval, arrival rate. The game is the same game at half speed in
  wall-clock time. Determinism, par and the score equation are all defined in ticks and
  need nothing.
- The sim converts ticks to seconds with its own `TICKS_PER_SECOND = 8` in a few labels
  (sprint seconds, shop lightning seconds, the run summary). The 3D HUD **does its own
  conversion with `TICK_HZ_3D`** and never displays a sim-computed "seconds" value. One
  consequence to state plainly: a "second" of lightning bought in the 3D shop is 8 ticks,
  which is 2 real seconds at 4 Hz. The 3D shop labels it in real seconds.

A district is 32 × 20 cells, so **48 × 30 m** — a compact map with five to eight rooms of
roughly 8–12 m. Walls are 3.2 m tall, eye height 1.65 m. There is no ceiling: districts
are outdoor city blocks under a belt-tinted sky with fog.

### Terrain in 3D

| Tile | Looks like | Human | Alien | Notes |
|---|---|---|---|---|
| Floor | Paved ground, belt-tinted, faint grid seams every cell | walk | walk | Seams keep the cell legible without drawing a board |
| Wall | Solid 3.2 m blocks, instanced | blocked | blocked | Bevelled top edge catches the light |
| Water | Shallow sheet, 10 cm deep, animated normals | walk | walk | Footsteps go quiet; HUD noise meter halves |
| Building | Rubble heaps 1.2–2.2 m, irregular, seeded per cell | blocked | **walk through** | Aliens wade through it; you cannot climb it |
| Black box | Translucent dark cube, full wall height, faint scanlines | walk in | **blocked** | Inside, the view tints dark and the world goes muffled |
| Portal | Hidden; on reveal, a light column visible over every wall | — | — | Also a HUD waypoint |

Every irregular shape (rubble heaps, wall wear) is generated from a seeded `Rng` keyed on
the cell, so a district looks identical every time it is entered. **Nothing calls
`Math.random`**, including the renderer.

### Belts

The ten belt palettes (`web/themes.js`) map to 3D materials: floor, wall and rubble tints,
fog colour and sky gradient. Entities keep one colour everywhere, exactly as in 2D —
aliens red, keys gold, coins by value, bolts electric — because those are the game's
vocabulary. Light/dark mode changes the page chrome only, never the scene; the same reason
the 2D board does not change.

### Entities

| Entity | Form | Behaviour in view |
|---|---|---|
| Alien | Procedural low-poly creature built from primitives, ~1.9 m, two emissive eyes | Glides between cells over its move period; head turns toward its target |
| Stunned alien | Same, slumped, eyes dark, crackle effect | Can be walked through, exactly as in 2D |
| Key | Floating gold key, slow spin, point glow | Collected on the tick the sim says so |
| Coin | Small spinning disc, colour by value | Ditto |
| Bolt | Spinning lightning glyph | Ditto |
| Detection ring | Floor-projected ring per alien, radius = its effective radius on you | Red when it contains you, shrinks when you step into water |

Alien motion is interpolated from `prevX/prevY` to `x/y` using `moveAcc` and the alien's
move period, so an alien with a 2.33-tick period glides continuously instead of hopping
every 580 ms. Interpolation is presentation only; the sim position is the truth.

The detection ring survives into 3D on purpose. In 2D it is the main thing that makes the
game readable, and "the radius you can be heard in" is not something a first-person player
can otherwise infer.

## The player

### Controls (mouse and keyboard)

| Input | Action |
|---|---|
| Mouse | Look (pointer lock). Sensitivity and invert-Y in settings |
| WASD / arrows | Move, camera-relative |
| Shift (hold) | Sprint — same rule as 2D: held, never latched, field charge first |
| Left click | Fire the stun gun at the locked target |
| L | Toggle banked lightning |
| Tab / M (hold) | Tactical map: the full 2D board, overlaid |
| Esc | Release the pointer and pause |
| R | Restart the district |
| H / V / I | Dev overlays: prediction tint on the floor, visited cells, alien targets |

Losing pointer lock (Esc, alt-tab) **pauses the sim**. A first-person player who cannot
see the screen must not be hunted.

### The leash: continuous body, grid truth

The player moves a continuous **body** — a 0.3 m-radius circle with smooth acceleration,
sliding along walls and rubble. The sim moves a **cell**. The leash keeps them in
agreement:

1. **The sim cell is the truth.** Pickups, the portal, detection and capture all happen
   when the *sim* says so, as they do in 2D. The camera follows the body.
2. **The body may lead the cell but never escape it.** The body's cell must always be
   reachable from the sim's cell in at most `speed` four-direction steps over
   human-walkable tiles (1 walking, 2 sprinting). Motion that would break this is clamped,
   softly, at the boundary.
3. **Each tick the leash emits one sim direction** — the one that most reduces the
   body–cell gap along the axis with the larger displacement (ties go to the axis the body
   crossed first). When the body is in the sim's cell, it emits `STAY`.
4. **When the player stops, the sim catches up** within at most two ticks, so a stationary
   player is never standing in a cell the sim does not think they are in.

The consequences are stated rather than hidden:

- **Diagonal movement is slower than straight movement**, by the 1/√2 a four-direction
  grid always charges for it. The 2D spec already refused to manufacture eight-direction
  input the sim cannot express; first person does not get an exemption.
- A pickup can trail your body by up to one tick (250 ms). A short "magnet" animation
  covers it.
- An alien can catch your *cell* while your body is half a cell ahead of it. The capture
  animation snaps the camera to face it, so the death is never ambiguous about who did it.

The leash's output is an ordinary four-direction input stream. To the sim, the predictor,
the dossier and the difficulty controller, a 3D player is a player.

**Fallback if the leash does not feel right** (decided at the end of plan phase 2): a
sub-cell sim in `sim3d/` with continuous positions, sampled onto the grid for the
predictor. It is listed so the decision is a choice and not a surprise — and it is the
expensive path: the generated constants would have to be regenerated against it and the
acceptance criteria re-validated against a sim that is no longer the 2D one.

### Camera

Horizontal FOV 90° by default (settings: 65–110). Subtle head bob and a +5° FOV kick while
sprinting, both off under "reduce motion", which is also honoured from
`prefers-reduced-motion`. Mouse look is allowed during the opening freeze: you can turn
around to orient yourself before your first step starts the clock.

### The opening freeze

Unchanged in rule, translated in presentation. The Game is created with
`freezeUntilFirstMove: true`. Until the first movement key, nothing ticks; the HUD shows
"MOVE TO BEGIN", every key's waypoint is visible, and looking around is free.

## The stun gun

The one rule that changes, because in first person you **aim**.

| | 2D | 3D |
|---|---|---|
| Trigger | `E` | Left click |
| Targets | Every alien whose detection range contains you, nearest first, one charge each | **The one alien under the crosshair** |
| Range | Your effective detection radius | The alien's detection radius on you (unhalved) |
| Line of sight | None needed | **Required** — walls and rubble block the shot, water does not |
| No valid target | Nothing happens, nothing spent | Nothing happens, nothing spent ("no lock" click) |

There are **no misses**: the crosshair shows a lock when the target under it is valid, and
a locked shot always lands. The skill is acquiring the lock, not the shot. This preserves
the economy — six charges are still six stuns — while making the gun feel like a gun.

It is implemented as `Game3D extends Game`, overriding `fireStun()` only, with the target
id passed through the per-tick action record so a replay reproduces it. The renderer picks
a candidate by raycasting meshes; `sim3d/raycast.js` re-validates it against the tile grid
(walls and buildings opaque) before the sim accepts it. The renderer proposes, the core
disposes.

Before the gun is owned, there is no viewmodel and left click does nothing. The viewmodel
is procedural, sits bottom-right, and shows its charge count on the body of the gun.

## The HUD

Shooter conventions, mapped one-to-one onto information the 2D game already shows. **The
3D player is never shown more than the 2D player sees**, and in v1 is never shown less —
the balance numbers were measured against full information.

| Element | Where | Shows | 2D equivalent |
|---|---|---|---|
| Crosshair | Centre | Dot; brackets and red when a stun target is locked | — |
| Minimap | Top-left, rotates with heading | The 2D renderer's own drawing, cropped around you: walls, water, rubble, boxes, every alien, its ring, pickups | The board |
| Tactical map | Tab / M, full screen | The full 2D board | The board |
| Compass strip | Top-centre | Heading, plus markers for keys and the revealed portal | — |
| Waypoints | In world | A diamond over each uncollected key with its distance in metres; a column over the portal once revealed | Visible keys |
| Threat arcs | Around crosshair | One red arc per alien that currently detects you, pointing at it | Red ring |
| Noise meter | Bottom-left | How deep inside the nearest detection radius you are | Ring proximity |
| Objective | Under minimap | KEYS 2 / 4 → REACH THE PORTAL | Status strip |
| Sprint / lightning | Bottom-centre | Charge in real seconds; lit while draining | Status strip |
| Stun charges | On the gun, bottom-right | Charges left | Status strip |
| Dispatch | Bottom-left, subtitle style | The surveillance system's monologue as intercepted radio | Dispatch panel |
| District, tier, score | Top-right | — | Top bar |

**The minimap and tactical map reuse `web/render.js`'s `Renderer` unchanged**, drawn into
an offscreen canvas. That guarantees information parity by construction and means there
is exactly one drawing of the board in the project.

The H overlay — the predictor's distribution tinted onto the floor of each region — is the
3D answer to the 2D heatmap: the ground glows where the system thinks you are going.

## Audio

`web/sound.js`'s `Ambience` is reused unchanged for the drone and the threat-rate pulse.
`audio3d.js` adds, synthesised, no files:

- **Positional alien sound** through Web Audio `PannerNode`s, one per alien, so you can
  hear one behind a wall. The rule is symmetric with theirs: you hear what can hear you.
- Footsteps whose loudness tracks your detection radius — full on floor, muffled in water,
  silent in a black box — so the noise mechanic is audible.

## Persistence and builds

The 3D game has **its own save files**, separate from the 2D game's, for two reasons:

1. The isolation rule. Until integration is decided, a 3D session must not be able to
   alter a 2D dossier, wallet or progress — the same reasoning as criterion 9, one level up.
2. The dossier measures *how you move*. Movement through a mouse-look first-person camera
   with partial visibility is plausibly different behaviour from a top-down god view.
   Whether one dossier should describe both is a question for measurement, not a default.

| | 2D | 3D |
|---|---|---|
| Database | `noise-<BUILD>` | `noise3d-<BUILD3D>` |
| Stamp | `web/build.js`, `npm run stamp` | `web3d/build3d.js`, `npm run stamp3d` |
| Sweep | `/^noise(-\d+)?$/` | `/^noise3d(-\d+)?$/` |
| Profiles | main, guest | main, guest |

The 2D sweep pattern does not match `noise3d-*` and the 3D one does not match `noise-*`;
a test pins both. The profile model, the isolation mechanism (`sim/profile.js`'s single
active id), guest-is-session-scoped, discard-below-schema and "every published update
starts every save fresh" are all reused as-is — the last one now per game, so a 3D deploy
resets 3D saves and leaves 2D saves alone.

`persist3d.js` duplicates `web/persist.js` with a different name and pattern rather than
parameterising it, because parameterising it means editing the 2D file. Integration is
where that duplication gets folded back.

## Meta loop

`3d/index.html` combines the 2D launch, hub and shop into one page — profile cards, the
permanent tier chooser, the district grid and the shop — using `web/style.css`'s tokens
plus `web3d/style3d.css`. `3d/play.html?p=&d=` is the district. Scoring, the economy, the
shop's prices, tier multipliers, attempt decay, settled per-district difficulty and the
100 districts in 10 belts are all the 2D game's, imported from `sim/`, not copied.

`web3d/play3d.js` mirrors `web/play.js`'s orchestration — system, chains per district,
difficulty settlement, run recording, scoring, persistence — with the renderer, input and
HUD **injected**, so the whole loop also runs under Node against a null renderer and the
existing DOM shim. That is how the meta loop gets tested without a GPU.

## Phones

Supported, second-class, and built last (plan, phase 8).

- Left half: a floating **analog** stick. Unlike the 2D stick it is not quantised to four
  headings — it drives the body, and the leash does the quantising, as for a keyboard.
- Right half: drag to look.
- **RUN** latches (as in 2D) and **STUN** fires at the current lock, with a generous
  aim-assist cone on touch only.
- Landscape only, `visualViewport` / `100dvh` sizing, controls behind
  `(hover: none) and (pointer: coarse)` — all lessons already paid for in 2D.
- The low quality tier (below) is forced on coarse pointers.

## Performance and quality

| Tier | Selected when | Pixel ratio | Shadows | Post-processing |
|---|---|---|---|---|
| High | Fine pointer and ≥ 8 GB reported memory | up to 2 | One directional shadow map | Bloom, vignette |
| Medium | Default | up to 1.5 | Off | Vignette |
| Low | Coarse pointer, `saveData`, or < 4 GB | 1 | Off | None |

Selectable in settings, remembered in `localStorage` (a property of the device, like the
theme). Budgets: **60 fps at 1080p** on an integrated-GPU laptop at Medium; **30 fps** on a
mid-range phone at Low; under **150 draw calls** in any district (walls, rubble, coins are
instanced — a district has 640 cells, so this is comfortable).

## Acceptance criteria

`npm run test3d`, same three verdicts as the 2D suite.

| # | Criterion | How |
|---|---|---|
| 3D-1 | The 2D suites are untouched: `npm test` 12 / 1 / 0, `npm run webcheck` green | Run both, every commit |
| 3D-2 | Arrows run one way: nothing in `sim/` or `web/` imports `sim3d/`, `web3d/`, `3d/` or `vendor/`; `sim3d/` imports only `sim/` and `sim3d/` and references no DOM global | Static scan |
| 3D-3 | **Parity**: driving `Game3D` through the leash with the cell paths of recorded 2D runs reproduces those runs' tick-log hashes exactly (runs with no stun fired, since that one rule differs by design) | Recorded corpus, 5 bots × several seeds |
| 3D-4 | Determinism: same seed and same 3D input record → identical tick-log hash | Hash twice |
| 3D-5 | Leash invariants hold over 10,000 random continuous control sequences: body never inside a human-blocked tile; body cell always reachable from the sim cell within `speed` steps; a stopped body and the sim cell agree within 2 ticks | Fuzz |
| 3D-6 | Targeted stun never stuns an inert, out-of-range or occluded alien, and never spends a charge without a stun | Fuzz against brute force |
| 3D-7 | Grid raycast agrees with dense point sampling on 10,000 random rays | Fuzz |
| 3D-8 | Save isolation: 3D writes never touch the 2D database; each sweep pattern spares the other game; a 3D guest run leaves the 3D main dossier byte-identical | DOM shim + in-process IndexedDB |
| 3D-9 | The full meta loop — launch, tier, hub, district, win, score, payout, shop — runs headless with a null renderer | DOM shim |
| 3D-10 | The page is playable with the dispatch on its templated path and nothing optional loaded | DOM shim |
| 3D-11 | Frame budget met at Medium, 1080p | Measured in a real browser, recorded in `decisions.md` |
| 3D-12 | Every belt renders legibly: aliens, keys, coins and rings readable against all ten palettes | Screenshot set, reviewed, recorded |

3D-11 and 3D-12 are measured by hand in a browser and recorded, not asserted by the suite;
the suite reports them as NOT DEMONSTRATED until a recorded measurement exists, rather than
passing them on faith.

## Integration (later, not part of this build)

When the 3D game is complete on its own page, integrating it is a separate change with its
own decisions:

- The "3D · in development" link becomes a proper **2D / 3D switch** (with its own
  styling, so this is where the stamp is bumped) in the headers of every page, 2D and 3D,
  and the build banner is removed.
- **Shared or separate saves.** Recommended starting point: separate dossiers, because they
  measure different behaviour, with the question settled by comparing trait distributions
  of the same people in both. Wallet and progress could reasonably be shared.
- One stamp or two. Two independent stamps were chosen precisely so the games could deploy
  without resetting each other; merging them is only right if the saves merge.
- Folding `persist3d.js` back into a parameterised `web/persist.js`.
- `spec.md`, `README.md` and the launch page's mechanics grid describe both.

## Open questions

1. **Does the leash feel like a shooter, or like a dungeon crawler with smoothing?** The
   biggest risk in the project; answered by a graybox prototype before any art.
2. **Is 4 Hz right?** Halving the tick rate gives a human twice the reaction time; losing
   the god view takes most of that back. Whether those cancel is a playtest question. The
   bot benchmarks are blind to it: bots have perfect information and no reaction time.
3. **Should the minimap show every alien?** v1 says yes, for parity with what the balance
   was measured against. A "hear-only" radar (aliens shown only within twice their
   detection radius, as you hear them) is the obvious harder mode, and would want its own
   score multiplier.
4. **Does first-person play produce a different dossier?** If the same person's traits
   differ sharply between 2D and 3D, separate dossiers are right at integration; if not, a
   shared one is better, because it has twice the data.
5. **Is 48 × 30 m too small?** A 32 × 20 grid was sized for a whole-board view. Larger
   3D-only maps would need the generator's size parameterised and both generated constant
   tables regenerated against them — out of scope for v1, and listed so it is a choice.
