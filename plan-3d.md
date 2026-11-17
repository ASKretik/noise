# NOISE 3D — build plan

Written Nov 17, 2026 · companion to [spec-3d.md](spec-3d.md)

The spec says *what*; this says *in what order*, what each step must prove before the next
one starts, and exactly which files it touches. Phases are ordered by risk, not by
visibility: the thing most likely to sink the project — whether a four-direction grid sim
can feel like a shooter — is answered in phase 2, before a single texture exists.

## Progress

Updated in the same commit that completes each phase, so an interrupted build resumes
from the last row marked done. Everything marked done is on `origin/main` and live.

| Phase | Status | 3D build | Commit notes |
|---|---|---|---|
| 0 · Scaffolding and guardrails | **done** | 1 | link, banner, vendored three.js, stamp3d, test3d |
| 1 · Pure 3D core | **done** | 1 | body, leash, raycast, Game3D, record, session; 3D-3…3D-7 pass |
| 2 · Graybox feel prototype | **done — provisional go** | 2 | playable graybox, tuning panel; feel not yet judged by a person |
| 3 · The world, properly | **done** | 3 | belt materials, procedural textures, rubble, water, black boxes, sky, quality tiers; belt check page |
| 4 · Entities and feedback | **done** | 4 | instanced aliens, rings, pickups, capture/win sequences, positional audio; 3D-12 recorded |
| 5 · The HUD | **done** | 5 | minimap + tactical map via the 2D Renderer, compass, waypoints, threat arcs, noise meter, dispatch subtitles, settings |
| 6 · The stun gun | not started | | |
| 7 · The meta loop | not started | | |
| 8 · Phones and performance | not started | | |
| 9 · Playtest and polish | not started | | |

## Ground rules for every phase

1. **The 2D game is not touched.** No edits to `sim/`, `web/`, `bots/`, `bench/`,
   `play.html`, `districts.html`, `tools/stamp-build.mjs` or `web/build.js` until phase 10,
   and only the one header link in `index.html` (phase 0). If a phase seems to need more,
   that is a design problem to solve in 3D code (subclass, wrap, duplicate) — not a reason
   to edit.
2. **Never run `npm run stamp` for a 3D-only change.** It wipes every 2D save. 3D changes
   run `npm run stamp3d`, which only resets 3D saves.
3. **The working loop for a 3D change**, replacing the 2D loop in `CLAUDE.md` for these
   commits only (phase 0 writes this into `CLAUDE.md`):

   ```sh
   npm run stamp3d   # only if 3D runtime files changed
   npm test          # must stay 12 passed / 1 ND / 0 failed
   npm run webcheck  # must stay green
   npm run test3d    # the 3D suite
   git add <the files you changed>     # not -A: the working tree has unrelated untracked files
   git commit && git push origin main
   gh run watch <id> --exit-status
   ```

4. **Every update ends live and reviewed.** The 3D page deploys with the rest of the site
   at `https://askretik.github.io/noise/3d/`, reached from the main page's
   **3D · in development** link. Every pushed update — not just every phase — ends with a
   review note: the live link, the build number, what changed, what to try (district,
   tier, action), and what is unverified. The same text goes into that build's
   `web3d/changes3d.js` entry, so the banner on the page says it too. Suggestions that come
   back are either done in the next update or logged in `decisions.md` with the reason
   they were not.
   Phases marked **🔍 review checkpoint** below are not closed until the game has been
   played on the live site and the feedback has been dealt with.
5. **Look at it.** This session has a built-in browser pane, which no earlier session had.
   Every visual exit criterion is a screenshot actually taken and looked at, and any
   phase that changes pixels records what was checked and what was not in `decisions.md`.
6. **`/sim` rules extend to `/sim3d`.** Pure, no DOM, nothing calls `Math.random` — and
   that includes `web3d/`: procedural rubble, alien gait jitter and wall wear all draw from
   a seeded `Rng`.

## Files outside the new directories, and when each is touched

| File | Phase | Change |
|---|---|---|
| `index.html` | 0 | One `<a href="3d/">3D · in development</a>` in `.site-nav`, existing style, no stamp |
| `package.json` | 0 | Add `test3d`, `stamp3d` scripts. No dependencies |
| `.github/workflows/ci.yml` | 0 | Add a `npm run test3d` step |
| `.github/workflows/pages.yml` | 0 | Add `npm run test3d` to the deploy gate |
| `CLAUDE.md` | 0 | A "3D work" section: the loop above, rule 1, rule 2 |
| `decisions.md` | every phase | One round entry per phase, as the project already does |
| everything else existing | 10 | Integration only |

Everything else is new: `sim3d/`, `web3d/`, `3d/`, `vendor/three/`, `bench3d/`,
`tools/stamp3d.mjs`.

---

## Phase 0 — Scaffolding and guardrails

**Goal:** the empty 3D project exists, deploys, and cannot hurt the 2D one.

- Create the directory layout from the spec.
- Vendor three.js: download the current stable release's `three.module.min.js` (and the
  `addons` used later: `EffectComposer`, `RenderPass`, `UnrealBloomPass`), plus `LICENSE`,
  into `vendor/three/<version>/`. Record the version and SHA-256 of every file in
  `vendor/three/VERSION.md`. Unmodified upstream files only.
- `web3d/build3d.js` (`BUILD3D = 1`) and `tools/stamp3d.mjs`, which bumps it, rewrites
  `?v=` on the stylesheet links of `3d/*.html` only, and refuses to run without a
  `web3d/changes3d.js` entry for the new build number.
- `3d/index.html`: a placeholder that boots three.js through an import map and renders a
  spinning cube in a belt colour, under the **in-development banner** (build number plus
  the expandable "what changed" list). Proves the vendor path, the import map, the banner
  and the deploy.
- The **3D · in development** link in `index.html`'s header, using the existing
  `.site-nav a` style. HTML only — no stylesheet edit, so no 2D stamp and no 2D save
  reset.
- `bench3d/acceptance3d.js` with the first two criteria live:
  - **3D-1**: spawns `npm test` and `npm run webcheck`, asserts 12 / 1 / 0 and green.
  - **3D-2**: static import scan in both directions.
  Every other criterion reports NOT DEMONSTRATED.
- `package.json` scripts, workflow steps, `CLAUDE.md` section, `decisions.md` entry.

**Exit:** the main page's header shows **3D · in development**, and clicking it opens
`/noise/3d/` with the cube and a banner reading build 1. The 2D game's build stamp is
unchanged (`web/build.js` still reads the same number) and an existing 2D save survives
the deploy. `npm run test3d` reports 2 passed, the rest ND.

🔍 **Review checkpoint:** the link is where you expect it and reads right, and the banner is
visible on desktop and phone.

---

## Phase 1 — The pure 3D core

**Goal:** everything the 3D game decides, decided in Node, before anything is drawn.

- `sim3d/units.js` — `CELL_M`, `TICK_HZ_3D`, conversions, `realSeconds(ticks)`.
- `sim3d/body.js` — continuous body: circle (r = 0.3 m) vs human-blocked tiles, axis-
  separated sliding, acceleration/deceleration. Pure function of (state, input, dt, map).
- `sim3d/leash.js` — the spec's four leash rules: clamp, per-tick direction emission,
  tie-breaking, stationary catch-up.
- `sim3d/raycast.js` — Amanatides–Woo grid DDA; opacity predicate passed in (walls and
  buildings opaque for aim).
- `sim3d/game3d.js` — `class Game3D extends Game`, overriding `fireStun()` to consume a
  target id from the tick's action record, validated by range, inertness and
  `raycast.js`. Nothing else overridden.
- `sim3d/record.js` — the per-tick input record `{dir, sprint, stunTarget}` and its hash.

**Tests that go live:** 3D-3 parity, 3D-4 determinism, 3D-5 leash fuzz, 3D-6 stun fuzz,
3D-7 raycast fuzz.

**Exit:** all seven criteria so far pass. In particular 3D-3 — the 3D front end, fed the
cell paths of recorded bot runs, reproduces those runs' tick logs bit for bit. That is the
proof that "same game in 3D" is literally true.

**Risk:** `Game` internals the subclass leans on (`patrols`, `_isInert`, `loadout`,
`stunnedUntil`, `effectiveRadius`) are not a public API. Mitigation: 3D-3 and 3D-6 fail
loudly if a 2D change moves them, and the 2D change's author sees it in the deploy gate.

---

## Phase 2 — Graybox feel prototype  ⟵ go / no-go

**Goal:** answer the biggest question in the project with the cheapest possible pictures.

- `3d/play.html` + `web3d/scene.js` + `web3d/controls.js` + a minimal `web3d/play3d.js`.
- Graybox world: walls as grey boxes, floor as a grid, rubble as brown boxes, water as a
  blue plane, black boxes as dark translucent cubes. Aliens as red capsules. Keys as gold
  cubes. No HUD beyond a crosshair and a debug readout (body cell, sim cell, emitted
  direction, tick).
- Pointer lock, mouse look, WASD, Shift sprint, Esc pause, R restart, the opening freeze.
- The full sim running underneath at `TICK_HZ_3D`, with the 2D spawner, squad and
  predictor exactly as `web/play.js` wires them.
- A debug panel with live sliders for `CELL_M`, `TICK_HZ_3D`, body acceleration and leash
  softness.

**Play it, by hand, in the browser pane and on the deployed page.** Try districts 1, 5 and
10 at MEDIUM and HARD. Settle the constants. Record in `decisions.md`: the values chosen,
what was tried, what each felt like, and win/loss over a handful of honest attempts.

🔍 **Review checkpoint — and the go/no-go is yours, not mine.** Feel is the one thing a
test cannot judge and a bot cannot play. The debug sliders ship on the live page for this
phase precisely so you can try values yourself and say which felt right.

**Go/no-go:**

- **Go** if movement feels responsive (no perceptible lag between key and camera), sliding
  along walls is smooth, diagonals feel like a known cost rather than a bug, and deaths
  read as earned.
- **No-go** if the leash reads as rubber-banding. Then stop and choose between: tuning the
  leash shape (lead allowance, softness), or the spec's fallback — a sub-cell sim in
  `sim3d/`. The fallback is a re-plan, not a patch: it re-opens phase 1 and adds
  regenerating both predictor tables against the new sim.

**Exit:** a recorded go decision with the settled constants.

---

## Phase 3 — The world, properly

**Goal:** districts look like places.

- `web3d/world.js`: level → instanced meshes. Walls with bevelled tops and seeded wear;
  floor with cell seams; water with animated normals (procedural, canvas-drawn); rubble
  heaps from seeded primitive clusters per cell; black boxes with scanline shader and a
  dark tint when the camera is inside; portal light column on reveal.
- Belt materials: the ten `web/themes.js` palettes mapped to floor/wall/rubble tints, fog
  colour and sky gradient. Read from `web/themes.js`, not copied.
- Lighting: hemisphere + one directional; shadow map at High only.
- Quality tiers (spec table), auto-selected, overridable, stored in `localStorage`.

**Exit (3D-12, first pass):** a screenshot of one district from each of the ten belts,
same camera position, looked at, and what each showed written into the phase's
`decisions.md` entry. The images themselves are not committed — the repository stays
binary-free. Draw-call count logged per district and under 150.

🔍 **Review checkpoint:** the look of the ten belts.

---

## Phase 4 — Entities and feedback

**Goal:** everything that moves or can be picked up is readable at a glance.

- `web3d/entities.js`: procedural alien (body, limbs, head, emissive eyes, seeded gait),
  interpolated with `prevX/prevY`, `moveAcc` and the move period; head tracks its target;
  stunned pose. Keys, coins by value, bolts, all instanced where possible.
- Floor-projected detection rings per alien, radius from `effectiveRadius`, red when they
  contain you, visibly shrinking when you step into water.
- Pickup magnet animation; capture sequence (camera snaps to the alien, red fade, the
  outcome overlay); win sequence (portal flare).
- `web3d/audio3d.js`: `web/sound.js`'s `Ambience` unchanged, plus a `PannerNode` per alien
  and footsteps keyed to the detection radius. Audio starts on the first gesture.

**Exit:** a recorded play session in which a capture and a win both happen, with
screenshots of each sequence. The 2D principle checked by eye: a red alien, a gold key
and a coin of each value readable on every belt (3D-12, second pass).

🔍 **Review checkpoint:** aliens, rings, pickups, and whether deaths read as fair.

---

## Phase 5 — The HUD

**Goal:** a player who has never seen the 2D game can play the 3D one.

- `web3d/hud3d.js`, DOM overlay over the canvas, styled from `web/style.css` tokens:
  crosshair, compass strip, key and portal waypoints with distance, threat arcs, noise
  meter, objective line, sprint/lightning meter in real seconds, district/tier/score.
- **Minimap and tactical map via `web/render.js`'s `Renderer`, unchanged**, drawn into an
  offscreen canvas and composited — cropped and rotated for the minimap, full for Tab/M.
  If `Renderer` turns out to assume something about its canvas that a 3D page cannot
  provide, wrap it in 3D code; do not edit it.
- Dispatch as subtitles: `web/dispatch.js`'s `buildState` and `templated`, unchanged; the
  model path is not started on this page (spec: no language model in v1).
- Dev overlays H / V / I: prediction tint on the floor per region, visited cells, alien
  targets.
- Pause menu: resume, restart, settings (sensitivity, invert Y, FOV, reduce motion,
  quality, ambience), back to hub.

**Exit:** screenshots of the HUD at 1080p and at a small laptop size; every HUD element
cross-checked against the live sim values it claims to show (a debug assertion pass in
the browser console, not just a look).

🔍 **Review checkpoint:** can you play without the tactical map, and is anything on screen
noise rather than information.

---

## Phase 6 — The stun gun

**Goal:** the one rule that changes in 3D, done properly.

- Procedural viewmodel bottom-right, charge count on the gun body, idle sway, fire recoil.
  Absent until the gun is owned.
- Lock-on: each frame, raycast the meshes under the crosshair for an alien; validate with
  `sim3d/raycast.js` and range; show the lock on the crosshair.
- Left click: with a lock, queue `stunTarget` into the next tick's action record; without
  one, a dry click, nothing spent.
- Stun effects: muzzle flash, beam, crackle on the alien, its ring vanishing for the stun
  duration.

**Exit:** 3D-6 still green; a recorded session stunning aliens through a doorway, failing
to lock one behind rubble, and failing to lock one out of range.

🔍 **Review checkpoint:** does the gun feel like a gun.

---

## Phase 7 — The meta loop

**Goal:** the 3D game is a complete game: profiles, tiers, hub, shop, progress, scores.

- `web3d/persist3d.js`: `web/persist.js` duplicated with DB name `noise3d-<BUILD3D>` and
  sweep pattern `/^noise3d(-\d+)?$/`. Same wrapping, same degrade-to-memory behaviour.
- `3d/index.html` + `web3d/launch3d.js`: profile cards (MAIN continue / start fresh,
  GUEST), permanent tier chooser, district grid by belt, shop. Imports `sim/shop.js`,
  `sim/score.js`, `sim/difficulty.js`, `sim/profile.js` — copies nothing.
- `web3d/play3d.js` grows to the full `web/play.js` orchestration: chains per district,
  difficulty settled once per district, attempts counted at run start, scoring, payout,
  run recording, dossier folding, next-district flow.
- Renderer, input and HUD injected, so a null implementation runs the loop under Node.
- `bench3d/webcheck3d.js` on top of `bench/domshim.js` (imported, not edited).

**Tests that go live:** 3D-8 save isolation (including both sweep patterns), 3D-9 headless
meta loop, 3D-10 playable without optional loads.

**Exit:** all criteria but 3D-11 and 3D-12 pass. A 2D save created before this phase
deploys is still present after it.

---

## Phase 8 — Phones and performance

**Goal:** it runs on a phone without crashing the tab, and on a laptop without stutter.

- `web3d/touch3d.js`: floating analog stick (left), drag-to-look (right), RUN latch and
  STUN with a touch-only aim-assist cone. Landscape only, `visualViewport` / `100dvh`.
- Low tier forced on coarse pointers; texture sizes and pixel ratio capped; no shadows, no
  post.
- Frame-time instrumentation (dev overlay): fps, frame time p95, draw calls, triangles.
- Measure **3D-11** at Medium/1080p in the browser pane and on the deployed site; measure
  the phone figure on a real device if one is available, and say so plainly if not.

**Exit:** 3D-11 recorded in `decisions.md` with the numbers. Phone support either measured
or explicitly listed as unverified.

🔍 **Review checkpoint:** played on your own phone — the one real device this build is
likely to get.

---

## Phase 9 — Playtest and polish

**Goal:** the open questions in the spec get answers, or get honestly left open.

- Play districts 1–10 at every tier. Record win rates and how deaths happened alongside
  the bot numbers in `spec.md`, and say clearly that the two are not comparable (bots have
  perfect information and no reaction time).
- Open question 2 (is 4 Hz right) and 3 (full radar or hear-only) decided from that play.
- Compare a player's 3D dossier with their 2D dossier, trait by trait, as the first
  evidence for open question 4.
- Stretch, in this order: a killcam (third-person replay of the last few seconds from the
  tick log, which already contains everything needed); the foresight overlay from the 2D
  spec's stretch list, drawn as each alien's predicted path on the floor.
- Rewrite `spec-3d.md` to describe the 3D game **as built**, the way `spec.md` was.

**Exit:** `npm run test3d` has every criterion PASS or recorded; `spec-3d.md` is true.

---

## Phase 10 — Integration (a separate decision, not part of this build)

Starts only when phase 9 is done and the integration questions in the spec are answered.
It is the first phase allowed to edit existing 2D files beyond phase 0's one header link,
and it does so deliberately:

- The **3D · in development** link becomes a styled 2D / 3D switch in the header of
  `index.html`, `districts.html`, `play.html` and the 3D pages; the build banner and the
  phase-2 debug sliders come off. The new styling edits `web/style.css`, so this is the
  update that bumps the 2D stamp — say so in the release note, because it resets 2D saves.
- Save sharing decided and implemented; `persist3d.js` folded into a parameterised
  `web/persist.js`; one stamp or two decided.
- `README.md`, `spec.md` and the launch page's mechanics grid describe both games.
- The 2D suites, the 3D suite and the deploy gate all green before the merge lands.

---

## Risk register

| Risk | Likelihood | Impact | Answered by |
|---|---|---|---|
| The leash feels like rubber-banding | Medium | Project-shaping | Phase 2 go/no-go, before any art |
| 4 Hz + first person is too hard or too easy | Medium | Balance | Phase 9 playtests; `TICK_HZ_3D` is one constant |
| A 2D change breaks `Game3D`'s reliance on `Game` internals | Low per change | 3D broken | 3D-3 and 3D-6 in the deploy gate |
| three.js on phones crashes or crawls | Medium | Phone support | Low tier forced on coarse pointers; phase 8 measurement |
| A 3D commit accidentally bumps the 2D stamp | Low | Every 2D save wiped | Rule 2; the 3D loop never calls `npm run stamp` |
| `git add -A` sweeps unrelated untracked files into a commit | Medium | Noise in history | The 3D loop stages named files only |
| Information parity makes 3D feel like a 2D game with a window | Medium | Feel | Open question 3; hear-only radar as a mode |
| Visitors find an unfinished game through the public link | Certain | Low | Labelled "in development" in the link and on every 3D page; a broken 3D page cannot affect the 2D pages |
| A review sees a stale cached build | Medium | Wasted review | Build number in the banner and in every review note; hard reload |
| Vendored three.js goes stale | Low | Maintenance | Pinned and checksummed; upgrading is a deliberate phase-level change |
