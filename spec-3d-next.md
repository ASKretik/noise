# NOISE 3D — the next round

Written Nov 18, 2026, revised the same day after N3 · **status: N0–N3, N8, N4 and N6.1 built;
N6.2 next** · follows 3D build 36

> A spec to pick up one phase at a time, whenever there is time. It describes what each
> phase builds, the numbers it uses, the files it touches, how it is checked and what it
> costs. The game as it stands is described in [spec-3d.md](spec-3d.md); this file
> describes where it goes next. When a phase lands, `spec-3d.md` is updated to describe it
> as built, and the phase's row in the progress table below is marked done in the same
> commit.

## How to use this file

1. Start at the first phase in the progress table not marked done, **in the table's
   order, not the numbering**. The numbers are kept so links and `decisions.md` rounds
   stay valid. Big maps (N8) move to the front because the art, the story, the objectives
   and the floors are all laid out on the map, so its size and shape are settled first.
   After N8 the user's order (decisions.md R59): art (N4), items (N6), floors (N9),
   objectives (N7), and the story (N5) last. The art comes before floors, which then patch
   it for stairs, slabs and interiors. Objectives follow floors so they are built on them
   once, and the story is written against the finished game.
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
| N1 | Fewer bolts deeper into each belt | ½ day | Low | **done** (3D build 12) |
| N2 | Comic-accurate aliens, all ten species | 3 days (+1½ per species) | Medium | **done** (3D builds 13–14): ten species, one per belt |
| N3 | Jumpscare and portal ascension | 3–3½ days | Low–medium | **done** (3D builds 15–20; capture reworked after review into a 7 s attack; build 20 found that a saved "mild" setting had been hiding it) |
| N8.1 | Big maps: the size curve, the city builder with named places, the `next` ruleset | 4–5 days | High | **done** (3D build 21) |
| N8.2 | Aliens: arrival cap, hunting / patrol / travel speeds, arrivals near you; route-planning spread out so it never hitches | 3–4 days | Medium | **done** (3D build 23; build 22 before it: Tab map key beacons and the user's tier speeds) |
| N8.3 | Keys (4 → 10) and portal placement; Tab map zoom, pan and place names; run length measured | 2–3 days | Medium | **done** (3D build 24) |
| N8.4 | Chunks, a shadow box that follows you, the frame-rate setting; frame budget re-measured | 2–3 days | Medium | **done** (3D build 26; build 25 before it: a held Tab keeps the map up) |
| N8.5 | Behaviour-first Dispatch: new traits, tactics, bots, 3D constants | 5–7 days | High | **done** (3D build 28; build 27 before it: developer mode) |
| N4.1 | Art: sky, lighting and weather, and the first three belts (RUST, TIDE, MOSS) | ~3 days | Medium | **done** (3D build 29) |
| N4.2 | Art per place (R63): each of the eight kinds of place its own walls, floor, height and fittings, a shade per place, name signs at the gates, wall art without story; on RUST, TIDE and MOSS | 2–3 days | Medium | **done** (3D build 31) |
| **N4.3** | Art: the other seven belts, places built in from the start; a centrepiece per landmark, bloom and colour grade | 5–6 days | Medium | **done** (3D builds 32-34: the seven belts; landmarks, avenue plates, building fronts; bloom and grade) |
| N4.4 | Art prototype. Builds 38–40: smog, torch, grime, drawn buildings (district 1). Build 41: Halo daylight and Amnesia alleys from CC0 models (Poly Haven kits, props, ground, photo sky), sun shadows, ACES, AO; the user: "the art style now looks perfect". Build 42: sombre, and the first district of every belt in a style of its own (a different light source each), plus stumbling over small obstacles | — | Medium | **done** (3D build 47: each belt's style on all ten of its districts, at the user's word, and a near-fall stumble). Before it: build 43, district 1 at 2K, GPU-compressed, with ground relief and weathering; build 44, its real enamel signs, minted coins and edge markers; build 45, every district: the user's scale, 2.5 m cells, 5 and 10 m/s; build 46, all ten first districts at district 1's finish. Changes the user suggests to a belt now apply to the whole belt |
| N6.1 | Items: the 3D inventory, noise maker, dampers, EMP (the rules layer itself is built in N8.1) | 3–4 days | Medium | **done** (3D build 36; the inventory is a Space wheel picked with the mouse, R66) |
| **N6.2** | Items: portable black box, intel chip, noise generator; balance measured | 3–5 days | Medium | **next** |
| N9.1 | Floors prototype: enterable two-floor buildings in belt 4; stairs for you, vents for them; the N4 art and N6 items patched for floors here | ~1½ weeks (+1–2 days of patching) | High | not started |
| N9.2 | Floors everywhere: three floors from belt 8, belts 4–10 | 2–3½ weeks | High | not started |
| N7.1 | Objectives, no new rules: sabotage (relays), silent run, stay noise; built on floors, with its own per-district objective table until N5 | 2–4 days | Medium | not started |
| N7.2 | Objectives with new rules (optional): hold to sabotage, sealed portal, rescue | 2–4 days | Medium | not started |
| N5.1 | Story system: briefings, debriefs from your dossier, transcripts placed in named places, the story save; last, so it is written against the finished game | 3–5 days | Medium | not started |
| N5.2 | Story writing: ten chapters, about 30 transcripts, the three endings | 3–5 days | Medium | not started |
| | **Total remaining** | **~10–15 weeks** | | |

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
- **Nothing pops in.** A district is built completely, geometry, textures and shaders,
  while it loads. Nothing is created or streamed in while you play (criterion 3D-28).
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
| D1 | **The rules split.** From N8 on (big maps), the 3D game stops being the same game as 2D. | N8.1 | **Decided: lands in N8.1.** Introduce a ruleset: `classic` (today's rules, still bit-for-bit with 2D under criterion 3D-3) and `next` (items, objectives, sizes, floors). Districts play `next`; the classic ruleset stays as the parity reference. |
| D2 | **Textures.** Keep everything procedural, or allow a small set of CC0 image textures. | N4 | Stay procedural. It keeps the repository text-only and every texture seeded; the cost is a day or two more art work. |
| D3 | **Bigger maps need a generator that works at 38,000 cells.** | N8.1 | **Decided (user, Nov 18):** a new city builder in `sim3d/next/city.js`. `sim/gen.js` may be changed wherever the city builder reuses a piece of it (the user allowed this), but with its defaults it must keep producing byte-identical 2D levels (3D-20). |
| D4 | **Predictor constants for the `next` ruleset.** Regenerate them for 3D, or keep the 2D ones. | N8.5 | **Decided (user, Nov 18): recalibrate, behaviour first.** The 3D Dispatch learns how you play (hiding, trouble at corners, getting lost, standing still over the map) rather than which room you favour. Its constants are generated by `npm run priors3d` / `couplings3d` into `sim3d/dispatch/`; `sim/predictor/` is never touched. See N8. |
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

**Per district.** On N8's city maps, art is built per chunk, and each landmark place
gets its own centrepiece rather than one per district.

- One **centrepiece**, chosen and placed by seed in the largest room, on wall or building
  cells only so walkability never changes: a crashed ship, a broadcast tower, a statue,
  a fountain.
- **Signs** with the district number, drawn into canvas textures.
- **Building tiles become ruined facades:** window grids, some windows lit (emissive),
  some broken.
- **Wall art (added after N4.1, R62):** a decal layer on street-facing wall faces, placed
  like the props (seeded, never on a walkable cell), drawn into a canvas atlas per belt.
  N4.2 fills it with what needs no story: faded pre-invasion posters and adverts, graffiti
  tags and stencils, warning and street signs, peeling paint, more of it deeper into a
  belt. The decals are data (atlas tile, size, which walls), so N5 can add its own
  without new code.

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

**N4.3 as built (3D builds 32–34).** `spec-3d.md` has the belt table, "Landmarks,
avenue signs and building fronts" and "Glow and grade". Differences from the plan:

- **No red skies.** EMBER's "smoke-red" is a dark maroon and CORAL's "pink sunset" a
  rose-magenta, because a large red area would sit on the aliens' red (3D-16).
- **Signs with the district number** are the avenue plates: each avenue's name over
  "DISTRICT n".
- **Ruined facades** are the biggest block of each rubble heap, drawn as a building's
  ground storey. They are not taller walls, because a front taller than the heap would
  block shots the sim allows.
- **Bloom and grade are written here** (`post.js`, five small shaders), not vendored
  from three's EffectComposer. So the addon vendoring and its 3D-0 hashes were not
  needed.
- **The cost is real:** about 3–4 ms a frame at 1080p Medium on an M3. It is on at
  Medium and High; Low draws without it.
- **Centrepieces** are on plazas (statues, obelisks, fountains), plus one skyline
  landmark per district (a mast or a crashed ship) rather than one per landmark place.

**N4.2 as built (3D build 31).** Asked after N4.1: places should look different, "else
there is no point in naming the buildings" (R63). `spec-3d.md`, "Places", has the
details. In short:

- **Belt, then kind of place, then place.** The belt gives the colours, the kind of place
  the pattern (brick and windows, shutters, hedges...), each place a shade of its own.
  Streets keep the belt's plain look.
- **One texture array per surface** holds the street's and every kind of place's
  textures, picked per instance. Draw calls did not grow (143 at most).
- **Heights:** tenements 5.4 m, depots 4.4 m. The sim treats every wall as solid at any
  height (`solid.js`), so the taller drawing changes nothing it decides.
- **Fittings:** yards' rubble is containers and crates, markets' is kiosks, each exactly as
  tall as the heap the sim knows; a park's lone wall cells are trees.
- **Names** on plates at the gates; **wall art** without story (posters, tags, stencils,
  warnings, peeling paint). The story's wall art is still N5's.
- **Still N4.3's:** the ruined facades of rubble cells, signs with the district number,
  landmark centrepieces, bloom, the colour grade, and all of it for belts 4–10.

**N4.1 as built (3D build 29).** `spec-3d.md`, "Belt art", has the details.
Differences from the plan:

- **Dusk to midnight is two ends per belt.** Each belt has a dusk sky and light and a
  midnight one; `artFor` mixes them by depth. The sun sets by mid-belt and the moon
  rises, and the key light follows whichever is up.
- **The other seven belts already change with depth.** `fallbackArt` in `world.js` gives
  them the same sky, light and fog progression from their 2D palettes until N4.2 directs
  them.
- **The lint ignores the weather and small accents.** Dust (RUST) is close in hue to the
  copper coin, but is made of tiny faint motes, not an area. Valve wheels and buoys are
  small. The rule covers walls, floors, rubble, water, props, sky, clouds and fog.
- **Left for N4.2:** growth decals rising with depth, centrepieces, signs, facades,
  bloom and the colour grade (so `post.js` and the vendored addons are not in yet).
- **Measured cost** is small: districts 20, 30 and 100 at 1080p Medium all average under
  7 ms, at most 141 draw calls.

---

## N5 · Story frame

> **Order (R59):** last in the round, so the briefings, transcripts and endings are
> written against the finished game: the places, the art's landmarks, the items, the
> floors, the objectives and the Dispatch's learned habits.

No rule changes in this phase: briefings, debriefs, collectible transcripts and the
chapter structure. Objective variety is N7.

**Wall art that tells the story** goes on N4.2's decal layer (R62): survivor messages
and tally marks, Static's courier sign marking the way to a transcript, the occupation's
propaganda, and murals at named places that point at what happened there. It is written
with the story, so it lands here and not in N4.2.

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

**The rules layer (decision D1)** is now built in N8.1, because big maps already need it.
N6 adds the items on top of it. As designed: `sim3d/rules.js` exports
`RULESET = 'classic' | 'next'`.

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

**Items.** Times in **sim ticks**; at 2 Hz (since 3D build 45; 4 Hz before), 2 ticks are one real second. Distances in cells, 2.5 m each.

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

> **Order (R59):** N7 now comes after floors (N9) and before the story (N5). So it is
> built across floors from the start, and until N5 exists, each district's objective
> comes from N7's own table (`web3d/objectives3d.js`). N5 later moves that table into
> the chapter data.

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

## N8 · Big maps that grow every district

**Built first** (revised Nov 18, after N3). The user judged today's 32 × 20 districts far
too small ("it is very easy to go around the entire map very quickly"). This replaces the
earlier proposal, which grew maps per belt only, from 32 × 20 to 68 × 38.

### Sizes

Area as a multiple of today's 640 cells, along a straight line between five fixed points.
Every district is larger than the one before it, inside a belt and across belts. **The
sizes are the user's and are not tuned.** Everything else in this phase is tuned to fit them.

```
A(d) = piecewise linear through (1, ×5) (10, ×10) (50, ×30) (75, ×45) (100, ×60)
w = round(32 · √A)   h = round(20 · √A)        today's 8 : 5 shape is kept
```

| District | Area | Cells | Metres | Walking straight across the long side |
|---|---|---|---|---|
| 1 | ×5 | 72 × 45 | 108 × 67 | 18 s |
| 10 | ×10 | 101 × 63 | 152 × 95 | 25 s |
| 50 | ×30 | 175 × 110 | 263 × 164 | 44 s |
| 75 | ×45 | 215 × 134 | 322 × 201 | 54 s |
| 100 | ×60 | 248 × 155 | 372 × 232 | 62 s |

You walk at 4 cells (6 m) a second; a bolt doubles that while it lasts.

### The map builder: a city, not rooms

`sim3d/next/city.js` (new, pure). The 2D generator places 6–10 rooms on 640 cells and
was never meant for 38,000, so big maps are built as a city:

1. **Streets.** Two to four avenues cross the map, side streets run between them, and
   alleys cut through blocks. Avenues are 3–4 cells wide, streets 2, alleys 1.
2. **Neighbourhoods.** Each block between streets gets a type by seed, which decides its
   cover, water, rubble and black boxes. The types are plaza, market, yards, depot,
   park, canal and tenements.
3. **Places.** Every map carries a list of named neighbourhoods and landmarks with their
   bounds (`{id, name, type, x, y, w, h}`). The story (N5), the art's centrepieces (N4)
   and the objectives (N7) are written against places, not coordinates. This is what
   makes big maps convenient for the story.
4. **Checked like every map.** Every key and the portal are reachable for the human,
   every street is reachable for the aliens, and the spawn distance is respected.

`sim/gen.js` may be changed wherever the city builder reuses a piece of it (decision D3).
With its defaults it must keep producing byte-identical 2D levels (3D-20).

**The ruleset split lands here (decision D1).** A big map is no longer the 2D game, so
districts play the `next` ruleset. `classic` keeps today's 32 × 20 rules and is still
checked bit-for-bit against 2D by 3D-3.

### Aliens: few, and fast where you cannot see them

The user's direction: not many aliens, but faster, so a big map stays tense.

| | Rule | Why |
|---|---|---|
| **Arrival cap** | Grows with √area: `round(4·√A)`, so 9 at district 1, 13 at 10, 22 at 50, 27 at 75 and 31 at 100 | Six to ten times sparser than today, which is the user's "not many" |
| **Divisions** | As now: one alien splits every 10–15 s. Ceiling of twice the arrival cap (`MAX_ALIENS` 48 → 64) | Divisions are the game's clock: the longer you take, the more there are |
| **Hunting speed** (alerted, chasing you) | Today's speed for the tier × a district factor from 1.0 (district 1) to 1.4 (district 100). Never above **70 % of your walking speed** | Above 70 %, a 5 s alert can no longer be outrun past the detection radius, and breaking contact stops being a mechanic. HARD reaches the 70 % ceiling at district 100 |
| **Patrol speed** | Rises in step with hunting speed | |
| **Travel speed** (more than 40 m from you and out of your line of sight) | Up to **2× your walking speed** | A few aliens can cross a big map to where the Dispatch expects you. They slow down before they reach view distance, so you never see one move unfairly fast. The Tab map does show a distant alien closing in fast, which is intended |
| **Arrivals** | Out of sight, 25–60 m away, weighted toward the Dispatch's prediction | Pressure follows you instead of being spread evenly over the map |

### Keys, the portal and run length

- **Keys:** `round(4 + 6·(d − 1)/99)`, so 4 at district 1, 5 at 10, 7 at 50, 8 at 75 and
  10 at 100.
- **Spread:** at least 25 m apart, at most one per place, and at least one in each half
  of the map.
- **Portal:** placed in a place far from the keys' centre, so the last stretch is a
  real crossing.
- **Run length:** keys show through walls, so this is not a search. Walking the route
  straight takes about 1 minute at district 1, 2 at district 50 and 3½ at district 100.
  If about half your time goes to hiding and waiting, a run lasts roughly twice that.
  N8.3 measures this with the bots.

### Smoothness, and why nothing pops in

**Measured before planning** (Apple M3, Chrome, 1080p, shadows on):

- **Rendering.** The test map was today's district tiled 8 × 8, about district 100's size:
  470,000 world triangles, drawn with no culling at all. It built in 18 ms and drew in
  3.2 ms a frame; today's map draws in 3.8 ms. At today's look, rendering is not the
  bottleneck.
- **Path searches.** One full-map distance field at district 100's size takes 1.7 ms;
  today it takes 0.03 ms. The squad re-plans every alien on the same tick, every 6 ticks.
  With 25 aliens that is about 43 ms on one frame every 1.5 s, a visible hitch. On a weak
  laptop it would be three to five times worse. **This is the real stutter risk.**

**What N8 does about it:**

1. **Everything is built while the district loads**, including shader compilation
   (`renderer.compile`). No part of the map is ever created while you play.
2. **Chunks.** The world is cut into 16 × 16-cell chunks (24 m), each with its own
   instanced meshes. Chunks outside the view are skipped, and so are chunks beyond the
   fog's end; the fog is solid there, so skipping them changes no pixel. The camera's far
   plane matches the fog. Showing or hiding a chunk is a flag on geometry that is already
   on the GPU, so there is no frame in which a place is missing. Today's look does not
   need chunks; N4's art will.
3. **The shadow box follows you**, about 60 m across. One shadow map stretched over
   district 100 would blur every shadow to 0.2 m per texel.
4. **Sim work is spread out.** Re-plans are staggered so only a few aliens re-plan each
   tick, path searches stop once they reach their target, and aliens heading to the same
   place share a field. If the worst tick still costs more than 4 ms on the reference
   laptop, the sim moves to a Web Worker. It is pure and deterministic, so it moves
   unchanged.
5. **Frame rate setting:** Auto (the default, the display's own rate), 60 or 30. A cap
   does not make anything appear sooner. It gives each frame twice the time, which can
   turn an uneven 40–60 fps into a steady 30 on a weak laptop. It is off by default
   because 30 fps makes mouse-look feel heavy.

**The Tab map** zooms (mouse wheel) and pans (drag), opens centred on you and names the
places.

### The Dispatch reads behaviour, not rooms (decision D4)

Today the Dispatch combines two tiers:

- **Tier 1** counts which region you move to next ("room 6, then room 5").
- **Tier 2** is the dossier: 20 traits that do not depend on the map, such as wall
  hugging, time in cover, pauses and doubling back.

On a big map tier 1 says less and less, and the user wants the Dispatch to learn the
player, not the room. So in 3D:

- **Tier 1 shrinks to geometry only:** where you can physically be in the next few
  seconds, from where you were last heard. It learns no room preference.
- **Tier 2 leads,** with new 3D traits measured from the input record:

| Behaviour | Measured as | What the aliens do about it |
|---|---|---|
| **Likes to hide** | Time in cover and black boxes; going to ground when an alien appears | Sweep the cover along your route; wait outside the black box you went into |
| **Trouble at corners** | Slowing or stopping before a corner; being caught within 2 cells of one | Wait just round the corners on your route to the next key |
| **Gets lost** | Doubling back, retracing streets, walking away from the nearest key, opening the map often | Cut you off between where you are and the key you need |
| **Stops to read the map** | Standing still with the Tab map open | While you stand still over the map, the nearest aliens close in |
| **Runs for it** | Sprinting when seen; rarely hiding | Flank: come from the side you run toward |
| Today's 20 traits | As now | As now |

- **Strength.** Each tactic is as strong as your dossier is far from the population on
  that trait (its z-score). A player who never hides gets no hiding sweeps.
- **Memory.** The dossier is kept per profile and carries across districts, as now. The
  Dispatch's lines quote what it has learned ("You stop at corners."), which N5's story
  uses.
- **Recording.** Whether the Tab map is open goes into the input record, so replays stay
  deterministic.
- **Constants.** They live in `sim3d/dispatch/`, generated by `npm run priors3d` and
  `couplings3d` from 3D bot runs on big maps. `sim/predictor/` is not touched, so the 2D
  Dispatch is unchanged.
- **New bots** for calibration, alongside the existing five: a hider, a walker who
  hesitates at corners, a wanderer who gets lost, a map-checker and a runner.

### Steps, each pushed as its own build

| Step | What | Estimate |
|---|---|---|
| N8.1 | Size curve, city builder with places, `next` ruleset. Districts play big maps with today's rendering | 4–5 days |
| N8.2 | Alien population, the three speeds, arrivals. Sim work staggered and bounded | 3–4 days |
| N8.3 | Keys and portal placement. Tab map zoom, pan and place names. Run length measured | 2–3 days |
| N8.4 | Chunks, the shadow box, far plane, the frame-rate setting. 3D-11 re-measured | 2–3 days |
| N8.5 | Behaviour-first Dispatch: new traits, tactics, bots and 3D constants | 5–7 days |

**Total:** about 3–4 weeks. **Difficulty:** high.

**N8.1 as built (3D build 21).** `spec-3d.md`, "Districts are cities", has the full
description. Where it differs from or adds to the plan above:

- **Gated walls.** Yards, markets and parks are walled with gates. Without walls, open
  lots merged with the streets into open fields, which is bad for a stealth game.
- **Black boxes and regions.** There are `round(3·√A)` black boxes, and
  `min(48, max(12, round(12·√(A/5))))` predictor regions (12 at district 1, 42 at 100).
- **Time limit.** The run limit now scales with `√A`. The 2D limit is six real minutes in
  3D, which a careful run on a big map could hit.
- **Bots.** They had a 640-cell path buffer and never found a key on a city map.
  `bots/policies.js` now sizes it to the map; 2D maps get the same buffer as before.
- **3D-21 runs smaller than planned:** 500 cities (five at every district 1–100) and 60
  episodes, so the suite stays under a minute.
- **Unchanged for now:** aliens and keys are as in 2D until N8.2 and N8.3.

**N8.2 as built (3D builds 22–23).** `spec-3d.md`, "Aliens on city maps", has the
details. The differences from the plan above:

- **Tier speeds** are the user's 0.5 / 0.75 / 1 / 1.3 (build 22). The 2D game holds
  EASY to HARD at three-quarters of their names.
- **The hunting ceiling scales with the tier**, so the tier ratios hold at every depth:
  70 % of walking on HARD, 91 % on ULTRA. With the new tier speeds, HARD reaches its
  ceiling by district 13, so depth mostly raises patrol and travel speed.
- **Travel scales with the tier too:** 2× walking on HARD, 2.6× on ULTRA, 1× on EASY.
- **Arrivals** are drawn over the band of cells round you, out of sight and weighted by
  the prediction. The 2D spawner's region-first draw missed the band on city maps and
  fell back to uniform. The aliens there at the start are placed 60–120 m out.
- **Performance** was solved mostly by FastFields: the same BFS, 12–15× faster. Without
  it, ticks reached 11.7 ms. Two other fixes helped: a patrolling alien keeps its
  destination for 6 s, and par is computed on FastFields (2D recomputes it at every
  division). With all three, the tick p99 is 2.5 ms.
- **3D-28 is machine-relative.** It counts ticks in units of one full-map search on the
  same machine, so it means the same on CI. The "nothing created after loading" half
  was checked in the browser (geometry, texture and program counts constant over 40 s of
  play), not in Node.
- **3D-27 walks the route** to the alien. On a city, a straight line finds a wall.

**N8.3 as built (3D build 24).** The plan held: keys `round(4 + 6·(d−1)/99)`, 25 m
apart, both halves, one per place. The details:

- **Portal sites** are listed by walking distance from the nearest key.
  `Game3DNext._choosePortal` draws from the furthest quarter.
- **Run length, measured with bots:**

  | District | Walk with no aliens | Par |
  |---|---|---|
  | 1 | 0.9 min | 1.2 min |
  | 10 | 1.3 min | 1.7 min |
  | 50 | 2.6 min | 3.5 min |
  | 100 | 4.4 min | 6.0 min |

  With aliens on MEDIUM, the bots win 1–4 of 12 runs, close to those times. They rush
  rather than hide.
- **The time limit was tightened** from N8.1's `√A` formula (13–46 min) to
  `max(6 min, 6 × par)` per run, with a last-minute countdown.
- **The Tab map** zooms (wheel, closing in on you), pans (drag) and names places and
  avenues. Off-screen keys are pinned to the edge.
- **New criterion 3D-30** checks the keys, the portal and the time limit.

**N8.4 as built (3D build 26).** As planned, with these differences:

- **Chunks are 32 cells (48 m), not 16.** That keeps draw calls near 130 at district 100.
- **The minimap was the biggest cost.** It copied the whole 2232 × 1395 board every frame,
  about 7 ms at district 100, and now draws only a 16-cell window. It was found by timing
  the HUD separately, after chunking had cut triangles by more than half without moving
  the mean as much as expected.
- **Buried wall bodies are skipped**, which wasn't in the plan.
- **The shadow box is 90 m across, not 60**, so its edge falls well into the fog.
- **The result:** district 100 on Medium went from a 12.4 ms mean and 17.0 ms p95 to
  5.3–8.4 ms and about 11 ms. 3D-11 is re-recorded at build 26.

**N8.5 as built (3D build 28).** `spec-3d.md`, "The Dispatch learns habits, not
rooms", has the details. Differences from the plan:

- **The habit file is separate from the dossier.** It is `profile.habits3d`; the 20
  traits are unchanged and keep their 2D couplings. The "couplings3d" step was not
  needed: the tactics carry the behaviour, and prediction beats uniform 7× or more on
  geometry alone.
- **The baseline is the five ordinary bots only.** The habit bots are what it has to
  tell apart from ordinary play. The spread floor is 0.05, so a habit no ordinary bot
  has (reading the map) still needs a clear amount of it.
- **Measuring the habits took three passes** (decisions.md R60):
  - the map state was not on the game's view at first;
  - corner hesitation happens on the approach, so the zone is two cells, not one;
  - "under threat" has to be judged before the step, or escapes don't count;
  - a step toward the key isn't fleeing.
- **The hide tactic was changed after measurement.** Sending aliens to water on a calm
  hider's route made it *harder* to catch (15 of 20 caught against 19). It now acts only
  once you have gone to ground. The runner's flank point moved to 5–11 cells so it can
  be reached in time.

### Criteria

- **3D-20 (new), 2D unchanged.** 10,000 2D levels generated with the defaults hash
  byte-identical to before the change.
- **3D-21 (new), big maps sound.** 500 generations, five at every district 1–100, must
  pass all of these (as built; 6,000 would take four minutes):
  - sizes follow the curve and grow every district;
  - every key and the portal are reachable for the human, and every street for the aliens;
  - places do not overlap;
  - the spawn distance holds over 60 episodes at districts 1–100, divisions included.
- **3D-22 (reworded), the Dispatch learns behaviour.** At district 100's size:
  - prediction beats uniform for every bot;
  - each behaviour tactic raises interception against the bot that has that behaviour,
    and not against the bots that do not.
- **3D-28 (new), smooth on big maps.** On a district-100 map with the full alien
  population, no tick's sim work exceeds 4 ms. Geometry, texture and shader-program
  counts stay constant during play: nothing is created after loading.
- **3D-29 (new), fair speed.** Across 1,000 episodes:
  - no alien moves faster than its hunting speed while within 40 m of the player and in
    their line of sight;
  - hunting speed never exceeds 70 % of walking speed.
- **3D-11** re-measured on district-100 maps.

**Files:**

- `sim3d/next/` (new: `size.js`, `city.js`, `rules.js`)
- `sim3d/dispatch/` (new)
- `sim/gen.js` (only where reused; 2D output unchanged)
- `web3d/runner.js`
- `web3d/world.js` (chunks)
- `web3d/hud3d.js` (Tab map)
- `web3d/settings3d.js` (frame rate)
- `web3d/alien.js` (`MAX_ALIENS`)
- `bench3d/criteria/maps.js` and `bench3d/criteria/dispatch.js` (new)
- `bench3d/bots3d.js`

---

## N9 · Buildings with floors

> **Re-scope after N8.** This section was written for 32 × 20 districts, where the whole
> district is one building. On N8's city maps, floors belong to individual buildings
> inside the city: a few enterable buildings per district, each stored as the strip
> below. The mechanics (stairs for you, vents for them, the sound rule) carry over; the
> estimate is revisited when N8 is done.

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
| 3D-15 | N3 | Sequences: at most 3 flashes per second, skippable but not before 0.5 s, within length, mild/off variants present (built, passing) |
| 3D-16 | N4 | Belt art palettes keep clear of the entity colours |
| 3D-17 | N6 | Each item does exactly what its rule says and nothing else |
| 3D-18 | N7 | Objective completion, determinism, chapter assignment |
| 3D-19 | N5 | Story writes are per-profile and never touch the 2D database |
| 3D-20 | N8 | Default-size 2D generation byte-identical after any generator change |
| 3D-21 | N8 | Big maps: sizes follow the curve; connectivity, places and spawn distance at districts 1–100 |
| 3D-22 | N8 | The Dispatch beats uniform at district 100's size, and each behaviour tactic works on the matching bot only |
| 3D-23 | N9 | Multi-floor connectivity for humans and aliens; spawn distance over vents |
| 3D-24 | N9 | Leash and smoothness on multi-floor maps |
| 3D-25 | N9 | Predictor beats uniform on multi-floor maps |
| 3D-26 | N2 | Species table: one distinct species per belt, threat-red glow, known features (built, passing) |
| 3D-27 | N3 | Contact: awake aliens are solid to the body, walking at one ends in a capture (built, passing) |
| 3D-28 | N8 | Smooth on big maps: no tick's sim work over 4 ms; nothing created after loading |
| 3D-29 | N8 | Fair speed: no alien faster than hunting speed within 40 m and in sight; hunting at most 70 % of walking (× tier as built) |
| 3D-30 | N8 | Keys and portal: count by district, spacing, both halves, portal far from the keys, time limit from par |

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
4. Whether waypoints should keep showing every key through walls on big maps. They make
   a run a route-finding problem rather than a search, and make "gets lost" rarer. Kept
   for N8; worth revisiting with the story (N5).
