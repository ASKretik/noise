# NOISE 3D — the next round

Written Nov 18, 2026 · **status: proposed, nothing built** · follows 3D build 10

> A spec to pick up one phase at a time, whenever there is time. It describes what each
> phase builds, the numbers it uses, the files it touches, how it is checked and what it
> costs. The game as it stands is described in [spec-3d.md](spec-3d.md); this file
> describes where it goes next. When a phase lands, `spec-3d.md` is updated to describe it
> as built, and the phase's row in the progress table below is marked done in the same
> commit.

## How to use this file

1. Start at the first phase in the progress table not marked done. Phases are ordered so
   each one is useful on its own, and so the cheap, visible ones come first.
2. Every phase follows the 3D working loop in `CLAUDE.md`: a `web3d/changes3d.js` entry,
   `npm run stamp3d` (never `npm run stamp`), `npm test`, `npm run webcheck`,
   `npm run test3d -- --skip-2d`, stage named files, push, watch the deploy.
3. A phase is pushed when it completes, with its progress row updated, so stopping
   halfway through the list never loses finished work.
4. Every phase ends with a review note (live link, build number, what changed, what to
   try, what is unverified) and a `decisions.md` round.

## Progress

| Phase | What | Estimate | Difficulty | Status |
|---|---|---|---|---|
| N0 | Audio stops when paused | ½ day | Low | **done** (3D build 11) |
| N1 | Fewer bolts deeper into each belt | ½ day | Low | not started |
| N2 | Comic-accurate aliens (first species) | 3 days (+1½ per species) | Medium | not started |
| N3 | Jumpscare and portal ascension | 3–3½ days | Low–medium | not started |
| N4 | Belt art direction | 8–9 days | Medium | not started |
| N5 | Story frame | 6–10 days | Medium | not started |
| N6 | The rules layer and the new shop items | 8–12 days | Medium | not started |
| N7 | Objective variety | 4–8 days | Medium | not started |
| N8 | Maps that grow every belt | 4–5 days | Medium | not started |
| N9 | Buildings with floors | 3½–5 weeks | High | not started |
| | **Total** | **~11–15 weeks** | | |

Estimates are focused working days for one developer. With Claude implementing, the
coding compresses a great deal (the first round, phases 0–9, took about one long
session); playtesting and art-direction feedback do not.

## Assumptions for this round

- **Desktop first. Phones may break.** Existing touch controls keep working for what
  exists today; new features get keyboard and mouse only. On a coarse pointer the hub and
  district show a one-line "best on a computer" notice instead of failing silently. The
  phone tier is no longer tested, and nothing new is designed around phone limits.
- **The frame budget still holds:** at least 60 fps on average at 1080p Medium on an
  integrated-GPU laptop (criterion 3D-11, re-measured whenever a phase changes rendering).
- **The 2D game stays as it is.** No 2D file is edited unless a phase names the edit and
  the reason, and criterion 3D-1 (2D suites 12 / 1 / 0, webcheck green) passes on every
  commit. The 2D build stamp is never bumped by this round.
- **Nothing calls `Math.random`**, including art, particles and audio; every procedural
  choice is seeded from the district.
- **No combat.** The "Struggle" escape mechanic was considered and dropped. One touch from
  an active alien still ends the run.

## Decisions to make before the phases that need them

| # | Decision | Needed by | Recommendation |
|---|---|---|---|
| D1 | **The rules split.** From N6 on, the 3D game stops being the same game as 2D. | N6 | Introduce a ruleset: `classic` (today's rules, still bit-for-bit with 2D under criterion 3D-3) and `next` (items, objectives, sizes, floors). Districts play `next`; the classic ruleset stays as the parity reference. |
| D2 | **Textures.** Keep everything procedural, or allow a small set of CC0 image textures. | N4 | Stay procedural. It keeps the repository text-only and every texture seeded; the cost is a day or two more art work. |
| D3 | **Bigger maps need the generator to take a size.** That means editing `sim/gen.js` (a 2D file) or copying it. | N8 | Edit `sim/gen.js`, adding an optional `size` argument whose default is exactly today's 32×20. A new criterion hashes 10,000 generated 2D levels before and after and requires them byte-identical. A copy of a 559-line generator would drift. |
| D4 | **Predictor constants for the `next` ruleset.** Regenerate them for 3D, or keep the 2D ones. | N8 | Keep the 2D ones until a criterion shows they no longer beat uniform on big maps; then add `npm run priors3d` / `couplings3d` writing `sim3d/predictor/`, never touching `sim/predictor/`. |
| D5 | **The language model on the 3D page.** It was kept off to protect phones. | N5 (optional) | Allow it on desktops that pass `modelAdvisable()`, lazily, exactly as the 2D page does. Criterion 3D-10 is reworded accordingly. |

---

## N0 · Audio stops when paused

**Problem.** Pausing (Esc, losing the pointer, switching tabs) freezes the game but the
ambience drone and every alien voice keep playing, because Web Audio oscillators run
independently of the frame loop. A hidden tab with the game in it drones on indefinitely.

**Build.**

- `Audio3D.pause()` / `resume()` in `web3d/audio3d.js`: `ctx.suspend()` / `ctx.resume()`,
  both safe before `start()`.
- `play3d.js` calls `pause()` in `onLock(false)`, on `visibilitychange` to hidden, and
  when the end card shows after the capture or win sequence finishes; `resume()` on
  `onLock(true)`.

**Check.** By hand: pause, switch tabs, finish a run; each goes silent. Record in the
phase's `decisions.md` round.

**Files:** `web3d/audio3d.js`, `web3d/play3d.js`. **Estimate:** ½ day. **Difficulty:** low.

---

## N1 · Fewer bolts deeper into each belt

**Rule.** Let `k = (district − 1) mod 10` (0 for the first district of a belt, 9 for the
last). The generator places bolts as today (one or two per map region). The 3D runner then
keeps

```
keep(k) = max(1, round(n × (1 − (2/3) × k / 9)))
```

of the `n` generated bolts: all of them in district 1 of a belt, about a third in district
10, and back to all of them at the start of the next belt. The bolts kept are chosen by a
seeded shuffle, `Rng(hashString("bolts:" + profileId + ":" + district))`, so a district
always keeps the same ones.

**Optional second lever.** Per-bolt charge shortens with depth:
`boltPickupSeconds × (1 − 0.3 × k / 9)`. Off by default; decide after playing.

**Build.** In `web3d/runner.js`, after `generateLevel`, replace `level.bolts` with the
kept subset (the level object is fresh per call, so cached 2D levels are untouched). Pure
helper `sim3d/bolts.js` exporting `boltKeepCount(n, district)` and
`thinBolts(level, profileId)`.

**Criterion 3D-14.** For every district 1–100 and 3 profile ids: the kept count matches
`keep(k)`, the kept set is a subset of the generated set, every kept bolt is reachable,
and two calls give the same set.

**Balance check.** Win rates for the five bots on EASY–ULTRA across districts 1–10,
driven through the real session (`bench3d/criteria/meta.js`'s `playRunner`), before and
after. Record the numbers; there is no pass threshold, it is a measurement.

**Files:** `sim3d/bolts.js` (new), `web3d/runner.js`, `bench3d/criteria/items.js` (new).
**Estimate:** ½ day. **Difficulty:** low.

---

## N2 · Comic-accurate aliens

**The design.** The classic big-headed alien from comics and pulp covers, built from
primitives, with the threat colour kept:

| Part | Form |
|---|---|
| Head | A `LatheGeometry` profile: a bulbous cranium about 1.6× the current head, tapering to a narrow chin |
| Eyes | Enormous almond eyes, glossy black (`MeshPhysicalMaterial`, clearcoat 1), set at a 20° slant, each with a **red** glowing slit so "red = threat" survives |
| Jaw | A separate lower-jaw part, hinged, closed at rest; N3 opens it |
| Neck and torso | A thin neck, a narrow hunched torso |
| Arms | Two segments each (upper arm, forearm) and three long fingers |
| Legs | Digitigrade, two segments |
| Skin | Grey-green, with red bioluminescent markings from a seeded canvas texture |

**Behaviour, all presentation (no rule changes):**

- **Head tilt when it hears you:** when an alien's ring contains you, its head turns
  toward you and tilts 18° over 0.25 s. This is the most useful one: it tells the player
  which alien has them before the HUD does.
- **Idle twitch:** a seeded jerk of the head every 2–5 s.
- **Stun:** a 0.6 s convulsion, then limp, eyes dark.

**Species per belt.** One shared skeleton, with parameters per belt; ship the first
species in this phase and add others when there is time:

| Belt | Species | Distinguishing parameters |
|---|---|---|
| RUST | Greys | The reference design above |
| TIDE | Deep ones | Gill slits, webbed fingers, glossy wet skin |
| MOSS | Sporelings | Fungal growths on the cranium, slow idle sway |
| EMBER | Cinders | Cracked skin glowing from inside |
| VIOLET | Watchers | A third eye, longer neck |
| ASH | Husks | Pale, emaciated, jerky motion |
| CORAL | Choristers | Frilled collar that flares when hunting |
| JADE | Wardens | Crested head, armoured plates |
| SOLAR | Mirages | Translucent, shimmering edges |
| COBALT | Architects | Mechanical augments, segmented limbs |

**Rendering.** Keep drawing by part across all aliens (`InstancedMesh` per part type), so
any number of aliens costs a fixed number of draw calls (about ten). Up to about 4,000
triangles per alien is fine on desktop.

**Checks.**

- The belt check page (`3d/belts.html`) shows the new species on all ten belts; the
  screenshot review is redone and recorded against criterion 3D-12.
- A close-up review of front, side and back, recorded in `decisions.md`. Look at it; the
  first alien in this project read as a red pill until it was looked at.

**Files:** `web3d/entities.js` (alien parts), `web3d/species.js` (new, the parameter
table). **Estimate:** 3 days for the first species, about 1½ days for each additional one.
**Difficulty:** medium (art iteration).

---

## N3 · Jumpscare and portal ascension

Both are timelines of keyframes kept as data in a pure module, `web3d/sequences.js`, so
the safety rules can be checked in Node.

### Capture jumpscare (1.1 s, then the end card)

| Time | Event |
|---|---|
| −0.4 s | When a hunting alien is within 2 cells: heartbeat swells, ambience ducks to silence |
| 0 | Capture. Game input stops; the alien that caught you is moved to 0.55 m in front of the camera at eye height |
| 0–0.12 s | Camera snaps to its face (the existing turn, shortened); one red flash |
| 0.12–0.6 s | Jaw unhinges; camera shake (amplitude 0.04 → 0); glitch layer: the frame drawn three times, offset and tinted red, green and blue, plus 4–6 horizontal slice displacements |
| 0.1–1.0 s | Shriek: a sawtooth gliding 220 → 1400 Hz with a noise burst, through a waveshaper, 0.9 s |
| 0.6–1.1 s | Fade to black, then the end card (and the killcam button, as now) |

**Safety.** A setting **Jumpscares: full / mild / off**. Mild drops the lunge, the shake
and the shriek's peak; off is today's sequence. "Reduce motion" forces mild. No sequence
ever flashes more than 3 times in any one second (WCAG 2.3.1).

### Portal ascension (2.4 s, then the end card)

| Time | Event |
|---|---|
| 0–0.4 s | Beam brightens, low rumble rises |
| 0.4–2.0 s | Camera lifts from eye height to 40 m on an ease-in curve, yaw turns 90°, field of view widens 15°; fog thickens below; instanced particles stream upward around you |
| 2.0–2.4 s | White-out in the portal's teal-white, then the next district's card |

Both sequences can be skipped with a click or a key.

**Criterion 3D-15.** Every timeline in `sequences.js`: no more than 3 flashes in any
1-second window, skippable, total length within its stated bound, and mild/off variants
present.

**Files:** `web3d/sequences.js` (new), `web3d/play3d.js`, `web3d/audio3d.js`,
`web3d/entities.js` (jaw), `3d/play.html` (setting), `web3d/settings3d.js`.
**Estimate:** 3–3½ days. **Difficulty:** low–medium.

---

## N4 · Belt art direction

**Goal.** Each belt becomes a recognisable place, and districts within a belt change as
you go deeper. Data-driven: one entry per belt in `web3d/art/belts.js`.

| Belt | Walls and surfaces | Props on walls | Weather | Sky |
|---|---|---|---|---|
| RUST | Rusted riveted panels | Pipes, valves | Dust haze | Orange dusk, low sun |
| TIDE | Wet concrete, puddles | Mooring posts, buoys | Rain | Grey overcast, distant lighthouse beam |
| MOSS | Mossy stone | Hanging vines | Floating spores | Green-grey canopy light |
| EMBER | Scorched brick, glowing cracks | Burnt beams | Embers | Smoke-red sky |
| VIOLET | Dark tile | Neon signs, holo adverts | Light drizzle | Night, aurora |
| ASH | Brutalist concrete | Broken lamps | Falling ash | Pale white overcast |
| CORAL | Art-deco plaster | Ornamental railings | — | Pink sunset |
| JADE | Carved stone | Lanterns | Mist | Twin moons |
| SOLAR | Sandstone | Awnings | Heat shimmer | Giant sun |
| COBALT | Panelled alloy | Antennas | — | Night, the mothership overhead |

**Within a belt** (`k` as in N1): sun elevation and sky colour go from dusk (k = 0) to
midnight (k = 9); weather intensity and alien growth decals on walls rise with `k`.

**Per district.**

- One **centrepiece**, chosen and placed by seed in the largest room, on wall or building
  cells only so walkability never changes: a crashed ship, a broadcast tower, a statue,
  a fountain.
- **Signs** with the district number, drawn into canvas textures.
- **Building tiles become ruined facades:** window grids, some windows lit (emissive),
  some broken.

**Techniques.** Canvas-generated albedo plus a normal map derived from a height canvas
(Sobel filter); instanced props; an instanced-points particle system with a small shader
for rain, ash, embers and spores; a sky shader per belt (gradient, fbm clouds or nebula,
sun or moon discs, aurora bands) with the mothership as a distant mesh. Post-processing:
bloom on neon and eyes and a per-belt colour grade, using three.js's `EffectComposer`,
`RenderPass`, `UnrealBloomPass`, `OutputPass` and `ShaderPass` (plus the shaders they
import), vendored under `vendor/three/0.185.1/addons/` and hash-checked by 3D-0.

**Legibility rule.** Entity colours remain the game's vocabulary: red aliens, gold keys,
coins by value, teal portal. Belt art may not use large areas of those hues.

**Criteria.**

- **3D-16 (new), palette lint:** for every belt, the art palette's large-area colours stay
  at least 25° of hue (or 0.25 lightness) away from the entity colours. Computed in Node
  from `belts.js`.
- 3D-12 re-reviewed (ten belts, screenshots) and 3D-11 re-measured (1080p Medium, mean at
  least 60 fps), both recorded in `bench3d/measured.json`. Draw calls stay under 150.

**Files:** `web3d/art/` (new: `belts.js`, `textures.js`, `props.js`, `weather.js`,
`sky.js`, `post.js`), `web3d/world.js`, `vendor/three/0.185.1/addons/`.
**Estimate:** 8–9 days (a first pass on sky, lighting and three belts in about 3).
**Difficulty:** medium (art direction more than engineering). **Risk:** laptop GPUs with
weather and bloom together; measure.

---

## N5 · Story frame

No rule changes in this phase: briefings, debriefs, collectible transcripts and the
chapter structure. Objective variety is N7.

**Premise.** The aliens took the city and hunt by sound. Their predictive intelligence,
the **Dispatch** (the narrator the game already has), is the antagonist, and it speaks to
you about you, from your actual dossier. You are a courier. The keys are fragments of a
broadcast that could wake the city. Your handler, **Static**, talks to you over the
radio.

**Structure.**

| Act | Belts | Arc |
|---|---|---|
| I | RUST, TIDE, MOSS | The courier network, the first broadcast fragment, learning that the Dispatch learns |
| II | EMBER, VIOLET, ASH, CORAL | The city fighting back and losing; Static compromised; the Dispatch starts quoting your habits |
| III | JADE, SOLAR, COBALT | The transmitter; the mothership; the last district |

Each belt is a chapter with an intro (before district 1 of the belt), a midpoint beat
(district 5) and a finale (district 10), and its alien species from N2.

**The ending depends on you.** At district 100, the career-wide normalised visit entropy
(the game's own measure of how unpredictable you were) picks one of three endings:
**Signal** (predictable: the broadcast goes out, and you are absorbed into the model),
**Static** (in between) and **Noise** (unpredictable: you vanish into the static and the
city wakes). The thresholds are set from the distribution of the five bots, so a
deliberately varied player can reach Noise.

**Per district.**

- **Briefing** (a card before the district): Static's lines from the chapter data, plus a
  templated line built from the dossier's strongest trait.
- **Transcripts:** one or two collectible documents per district, placed by seed on floor
  cells. Picking one up is presentation only: collected when the sim's player cell
  equals its cell, read from the pause menu, no score effect.
- **Debrief:** after the run, the Dispatch updates its file on you aloud, from the same
  state object the dispatch layer already uses.

**Data.** `web3d/story/chapters.js`: `{ belt, title, species, intro: [], beats: { 5: [],
10: [] }, outro: [], transcripts: [] }`. Hand-written: 10 chapters × (intro, midpoint,
finale, outro) plus about 30 transcripts. Per-district lines are templated, not
hand-written.

**Persistence.** Story progress (transcripts found, chapters seen) gets its own object
store, `story`, in the 3D database, written only for the active profile through the same
single-id rule as everything else. Add the store to `persist3d.js`'s upgrade handler
rather than bumping the database version: that handler deletes and recreates the
`profiles` store on upgrade, and every 3D build already opens a fresh
`noise3d-<build>` database, so no version change is needed.

**Criterion 3D-19 (new).** A 3D guest run that collects transcripts leaves the 3D MAIN
story record byte-identical, and 3D story writes never touch the 2D database.

**Optional (decision D5).** The language model narrates debriefs on desktops that pass
`modelAdvisable()`, loaded lazily after the district is playable; the templated text
remains the fallback.

**Files:** `web3d/story/` (new), `web3d/persist3d.js` (the `story` store), `web3d/hub3d.js`,
`web3d/play3d.js`, `3d/play.html`. **Estimate:** writing 3–5 days, system 3–5 days.
**Difficulty:** medium.

---

## N6 · The rules layer and the new shop items

**The rules layer (decision D1).** `sim3d/rules.js` exports `RULESET = 'classic' | 'next'`.

- `classic` is `Game3D` as it is today. Criterion 3D-3 (parity with the 2D sim) is scoped
  to it and keeps passing.
- `next` is `Game3DNext extends Game3D`, in `sim3d/next/game.js`, carrying every rule
  change from here on. Districts play `next`.
- Every new action is part of the per-tick input record, so a replay of (seed, record)
  still reproduces the run. `record.js` rows gain an optional `item: { id, x, y }`, and
  `replay()` gains an `onRow` hook for effects applied outside the `Game` object (the
  noise generator's mode switch).

**3D inventory.** The 2D shop (`sim/shop.js`) and profile store stay untouched.
`web3d/profile3d.js` adds `ProfileStore3D extends ProfileStore`, whose `buy3d()` and
`useItem()` go through the inherited single write path (`_commit`, the active id only),
storing counts in `inventory.items3d`. `sim3d/shop3d.js` holds the item table and
`canBuy3d` / `applyPurchase3d`, in the same shape as `sim/shop.js`.

**Items.** Times in **sim ticks**; at 4 Hz, 4 ticks are one real second.

| Item | Key | Price | Carry | Effect | Implementation |
|---|---|---|---|---|---|
| Noise maker (decoy) | 1 | 60 | 3 | Thrown to the cell under the crosshair (within 6 cells, clear line). Hunting aliens drop the chase and search there | `alertTicks = 0`, `lastKnown = target`: the game's existing "alert lapsed, search the last known cell" path. Re-detection overrides it, as it should |
| Dampers | 2 | 120 | 1 per district | Your hearing radius ×0.75 for the rest of the district | `Game3DNext` overrides `effectiveRadius`; stun range is unaffected |
| EMP | 3 | 150 | 2 | Thrown like the decoy; stuns every awake alien within 3 cells of impact for `stunTicks` | Same validation as the stun gun (line of sight, range) |
| Portable black box | 4 | 200 | 1 | Turns your current cell into a black box for 40 ticks | Swap the tile, invalidate the memoised distance fields, restore afterwards; only your own cell, which no alien can occupy |
| Intel chip | 5 | 80 | 1 | Reveals where the portal will open | **Presentation only:** a waypoint and map marker; the sim's portal flag and the predictor's portal feature stay gated on the keys |
| Noise generator | 6 | 250 | 1 | For 40 ticks the predictor guesses uniformly | The runner sets `system.mode = 'uniform'` and restores it; recorded so replay re-applies it at the same tick |

The in-game item bar shows keys 1–6 with counts; the hub shop lists the items with their
3D descriptions.

**Criteria.**

- **3D-17 (new), item effects:** for each item, a Node test against a reference: the decoy
  moves the search target and nothing else; dampers scale the radius by exactly 0.75; EMP
  stuns exactly the awake aliens in range with line of sight; the box blocks aliens for
  exactly 40 ticks, then restores the tile and fields; the intel chip changes no sim
  state; the noise generator changes `system.mode` for exactly 40 ticks.
- **3D-4 extended:** determinism and replay with items used.
- **3D-3** passes unchanged for the `classic` ruleset.

**Balance.** Bot win rates with and without each item, through `playRunner`, recorded.
Every escape makes the predictor matter less, so items are capped per district (one use
each, decoys three) and priced so a full kit is several districts of coins.

**Files:** `sim3d/rules.js`, `sim3d/next/game.js`, `sim3d/shop3d.js`, `sim3d/record.js`
(new or changed); `web3d/profile3d.js`, `web3d/career3d.js`, `web3d/hub3d.js`,
`web3d/play3d.js`, `web3d/hud3d.js`, `web3d/controls.js`. **Estimate:** 2–3 days for the
rules layer, 6–9 days for the six items. **Difficulty:** medium.

---

## N7 · Objective variety

Each district's objective comes from the chapter data. Objectives that change how a
district is won are expressed as **caches underneath** wherever possible, so the
predictor's objective features (directness, ordering, the portal leg) keep meaning
something.

| Objective | v1 (no new rule) | v2 (a rule change in `next`) |
|---|---|---|
| Sabotage | Keys re-skinned as relays; collecting one disables it | Disabling takes holding still on the relay for 6 ticks |
| Silent run | The stun gun is not carried in (loadout) | — |
| Stay noise | Bonus coins if visit entropy at the portal is above a threshold | The portal stays sealed until entropy is above the threshold |
| Rescue | — | A captured courier follows you once found; if an alien reaches them, the district fails |

Ship v1 of three objectives first; v2 objectives each need their own determinism test and
balance measurement.

**Criterion 3D-18 (new).** Each objective type: completion is detected exactly when its
rule says, the run is reproducible from its record, and a district always gets the
objective its chapter data names.

**Files:** `web3d/story/chapters.js` (objective per district), `sim3d/next/objectives.js`
(new), `web3d/entities.js` (re-skins), `web3d/hud3d.js`. **Estimate:** 4–8 days for two
or three objective types. **Difficulty:** medium.

---

## N8 · Maps that grow every belt

**Sizes.** For belt `b` (0 = RUST, 9 = COBALT):

```
width  = 32 + 4b        32, 36, 40 ... 68
height = 20 + 2b        20, 22, 24 ... 38
```

Belt 10 is about 4× the area of belt 1 (68 × 38 cells, 102 × 57 m).

**What scales with area** (`a = area / 640`, so `a = 1` in belt 1):

| Quantity | Rule | Why |
|---|---|---|
| Alien cap | `round(cap × a)` | Same density of aliens; otherwise a bigger map is just easier |
| Arrival rate λ | `λ × a` | Same |
| Keys | `base + floor(b / 3)` | More ground to cover, but not proportionally more keys |
| Predictor regions | `round(12 × a)`, at most 48 | Regions keep their size, so predictions stay as specific |
| Rooms | The generator's room count × `a` | Same room density |
| Detection radius, speeds, spawn distances | Unchanged | They are about the player's experience, not the map |

**Generator (decision D3).** `sim/gen.js` gains an optional size argument defaulting to
32×20. Two runtime places assume 32×20 and change: `sim/gen.js` (`GRID_W`, `GRID_H`) and
`web3d/runner.js` (the `FieldPool` size).

**Criteria.**

- **3D-20 (new), 2D unchanged:** 10,000 2D levels generated with the default size hash
  byte-identical to before the change.
- **3D-21 (new), big maps sound:** 10,000 generations at each belt size, all objectives
  reachable, the minimum spawn distance respected across 1,000 episodes, divisions
  included (the 2D criteria 3 and 4, at the new sizes).
- **3D-22 (new), predictor still works:** at the largest size, top-1 region accuracy beats
  uniform for all five bots, and chain-plus-dossier beats chain-only (the 2D criteria 5
  and 6). If this fails, decision D4: regenerate the predictor constants for 3D.

The HUD needs no change: the minimap is cropped around you, and the tactical map fits
any size.

**Files:** `sim/gen.js` (one optional argument, under decision D3), `web3d/runner.js`,
`sim3d/scale.js` (new: the table above), `bench3d/criteria/maps.js` (new).
**Estimate:** 4–5 days. **Difficulty:** medium.

---

## N9 · Buildings with floors

**The design.**

- Two floors from belt 4 (EMBER), three from belt 8 (SOLAR). Floors are 3.6 m apart.
- Keys are spread across floors (at least one per floor); the portal opens on the top
  floor.
- **Stairs are for you; vents are for them.** Stairs are human-only; vents (grates on the
  floor) are alien-only. This mirrors the existing asymmetry, where rubble stops you but
  not them and black boxes stop them but not you.
- **Sound between floors:** within your floor, the radius as now; one floor away, half the
  radius (planar distance); two floors away, nothing.
- Compass and waypoints mark keys on other floors with ▲ / ▼; the minimap shows your
  floor; the tactical map shows every floor side by side.

**Representation: floors as a strip.** A building of `F` floors of `w × h` is stored as
one 2D grid `F·w + (F − 1)` cells wide, floors side by side, separated by a wall column,
plus a list of **links**: each stair connects a cell on floor `f` to the cell at the same
position on floor `f + 1`, and so does each vent. This keeps almost everything working
unchanged:

- The generator runs per floor, then places stairs and vents and checks connectivity
  across links.
- Regions, the chain, the dossier and the spawner all work on a 2D map.
- The 2D renderer draws the strip as-is, which is exactly the tactical map.
- The bots follow distance fields, so if the fields include links, the bots use stairs
  with no change.

**What has to change (in `sim3d/next/`, never in `/sim`):**

| Piece | Change |
|---|---|
| Distance fields | A BFS with link edges: stairs in the HUMAN field, vents in the ALIEN field |
| Player movement | Stepping onto a stair moves you to its linked cell on the next tick |
| Alien movement | Downhill steps consider vent links |
| Detection | Planar distance with the floor rule above, replacing straight Euclidean distance |
| Spawner constraints | Distances measured over the alien field with vents |
| Leash and body | A linked cell counts as one step; climbing is a 0.6 s camera move with input locked, then the body is placed on the linked cell |
| World rendering | Each floor at its height, slabs with stairwell openings, stair ramps, vent grates |

**Prototype first.** Two floors in belt 4 only (about 1½ weeks), played and judged, then
generalised to three floors and belts 8–10.

**Criteria.**

- **3D-23 (new):** across 10,000 generations, every key reachable over stairs, every
  floor reachable by aliens over vents, the minimum spawn distance respected over the
  alien field with vents.
- **3D-24 (new):** the leash fuzz (3D-5) and the smoothness check (3D-13) on multi-floor
  maps, including stair climbs.
- **3D-25 (new):** the predictor on multi-floor maps beats uniform for all five bots.
- **3D-4 extended:** determinism and replay across stairs.

**Files:** `sim3d/next/` (fields, movement, detection, generator wrapper),
`sim3d/leash.js`, `web3d/world.js`, `web3d/hud3d.js`, `bench3d/criteria/floors.js`.
**Estimate:** 3½–5 weeks. **Difficulty:** high, the largest item in this round.

---

## New acceptance criteria, all phases

| # | Phase | Criterion |
|---|---|---|
| 3D-14 | N1 | Bolt thinning matches the formula, is deterministic, keeps only reachable bolts |
| 3D-15 | N3 | Sequences: at most 3 flashes per second, skippable, within length, mild/off variants present |
| 3D-16 | N4 | Belt art palettes keep clear of the entity colours |
| 3D-17 | N6 | Each item does exactly what its rule says and nothing else |
| 3D-18 | N7 | Objective completion, determinism, chapter assignment |
| 3D-19 | N5 | Story writes are per-profile and never touch the 2D database |
| 3D-20 | N8 | Default-size 2D generation byte-identical after the generator change |
| 3D-21 | N8 | Big maps: connectivity and spawn distance at every belt size |
| 3D-22 | N8 | Predictor beats uniform, and the dossier helps, at the largest size |
| 3D-23 | N9 | Multi-floor connectivity for humans and aliens; spawn distance over vents |
| 3D-24 | N9 | Leash and smoothness on multi-floor maps |
| 3D-25 | N9 | Predictor beats uniform on multi-floor maps |

Re-checked as phases change rendering: 3D-11 (frame budget) and 3D-12 (legibility),
recorded in `bench3d/measured.json`. Unchanged throughout: 3D-1 (the 2D suites) and 3D-3
(parity, `classic` ruleset).

## Open questions this round does not settle

1. Whether diagonal movement should match straight speed, like a shooter. That needs a
   sub-cell sim instead of the leash (spec-3d.md, open question 1), and is not part of
   this round.
2. Whether the minimap should keep showing every alien once the art and sound carry more
   of the information (a "hear-only" mode).
3. Whether one dossier should describe both the 2D and 3D games (plan-3d.md, phase 10).
