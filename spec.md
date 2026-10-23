# NOISE — build spec

Originally written Oct 6, 2026 · **revised Oct 23, 2026 to describe the system as built**

> This file is no longer the plan; it is the description. The original spec is in git
> history (`git log --follow spec.md`), and the reasoning for every departure from it is
> recorded in [dna.md](dna.md) for the first build and [decisions.md](decisions.md) for the
> four rounds of changes after it. Where this document and those two disagree about *why*
> something is the way it is, those two are the record.

NOISE is a browser stealth game whose aliens learn where you are going and are waiting
there when you arrive. It deploys as static files to GitHub Pages, has no backend, no build
step and no dependencies, and **no model is trained anywhere in the project**.

## Scope and non-goals

Ships: a top-down grid stealth game, procedurally generated districts, an alien spawner
driven by a two-tier predictive model that learns the player across districts, a coin
economy with a shop, four permanent difficulty tiers, two local save profiles, and a small
language model that narrates the system's reasoning.

Explicitly out of scope, and each line is a decision rather than an oversight:

- **No model training.** Both predictor tiers are online counting and sufficient-statistic
  updates. No gradient descent, no datasets, no checkpoints, no GPU. Two constant tables
  (`priors.js`, `couplings.js`) *are* selected by measurement, offline, by a developer
  running a script — the same category of act as choosing k = 20. See "Generated constants".
- **No backend, no auth.** Two profiles in IndexedDB on one machine.
- **No line-of-sight.** Detection is radius plus terrain state.
- **No combat.** One touch from an active alien ends the run. The stun gun disables; it
  does not kill.
- **No art assets.** Everything is a path, a rectangle or an arc drawn from the tile grid.
- **No formal A/B study.** Sanity benchmarks, enough to show the predictor beats random.

## Architecture

```
sim/        pure core — zero DOM, imports nothing outside /sim, runs under Node
predictor/    tier 1 (chain), tier 2 (dossier), traits, generated constants, combination
spawner/      rejection sampling from a truncated distribution
squad/        joint role assignment across the aliens
web/        browser-only leaves — canvas, input, HUD, IndexedDB, dispatch, ambience
bots/       five scripted policies spanning the legibility axis
bench/      Node harness, acceptance suite, DOM shim, constant generators
```

Arrows run one way. The sim core knows nothing about a canvas, a profile or a model. The
predictor reads tick logs and writes a distribution; the spawner and the squad consume that
distribution and return cells; persistence and the language model are leaves, so a missing
IndexedDB or an absent GPU degrades those leaves and nothing else.

Two rules fixed in the first session, both miserable to retrofit: **nothing calls
`Math.random`** — every stochastic decision draws from a seeded `Rng` — and **the sim core
is a pure ES module with no DOM access**, which is what lets the same files run headless at
~400 episodes/second for the benchmarks and at 8 Hz in a browser for play.

## Game rules

You are a human in a district that models its couriers. Find every key, open the portal,
and get out.

| Element | Rule |
|---|---|
| Grid | 32 × 20 tiles; 55–65% open floor |
| Tick rate | 8 ticks per second, fixed timestep, rendering decoupled and interpolated |
| Movement | One cell per tick, four-directional, no diagonals; two while sprinting |
| Objectives | 3 to 5 keys, then the portal opens |
| Loss | An **active** alien enters your cell. A stunned one is inert and can be walked over |
| Win | Reach the portal with every key collected |

### Terrain

| Tile | Human | Alien | Effect |
|---|---|---|---|
| Floor | ✓ | ✓ | — |
| Wall | ✗ | ✗ | — |
| **Water** | ✓ | ✓ | Halves the radius at which you can be seen |
| **Building** | ✗ | **✓** | Rubble you walk around and they walk through |
| **Black box** | ✓ | **✗** | Nothing sees in; the alert clears and your last-known cell is erased |

Buildings and black boxes are deliberate inverses, and between them they are the reason
every distance field in the project has to declare *whose* distance it is measuring
(`HUMAN` or `ALIEN` in `sim/pathfind.js`). An alien that refuses to cut through rubble is
just a slow human; a player routed along an alien field walks into a wall.

### Items

| Item | Effect |
|---|---|
| **Key** (gold) | 3–5 per district. All of them open the portal |
| **Coin** (1 / 2 / 5 / 10, colour-coded) | Currency. Total value per district is 10–15× the district number |
| **Lightning bolt** | +3 seconds of sprint charge |

### Difficulty tiers

Chosen once when a save file is created, and **never editable**. Every logged score, the
settled per-district difficulty and the dossier itself are measured under the tier, so
allowing a mid-save change would quietly corrupt all three.

| Tier | Alien speed | Chase period, D1 → D10 | Cells/tick at D10 | Told which keys you took | Score |
|---|---|---|---|---|---|
| EASY | 37.5% | 4.67 → 4.00 | 0.25 | no | ×0.75 |
| MEDIUM | 56.25% | 3.11 → 2.67 | 0.38 | no | ×1.00 |
| HARD | 75% | 2.33 → 2.00 | 0.50 | no | ×1.30 |
| ULTRA | **100%** | 1.75 → 1.50 | 0.67 | **yes** | **×3.00** |

`ALIEN_SPEED_CAP = 0.75` multiplies the speed factor of the three ordinary tiers, which are
defined relative to each other — EASY stays half of HARD, MEDIUM three-quarters. **ULTRA is
exempt.** That exemption is the clearest statement of what the tier is: not "HARD but they
also know things", but the only setting where nothing is held back. It pays triple to match.

Because an alien's tick period is the base period divided by its speed factor, the cap
cascades to every district automatically — there is no second table of per-district speeds
to keep in sync. Even at ULTRA district 10 an alien covers 0.67 cells per tick against the
player's 1.00, so breaking contact and outrunning an alert remains possible at every tier.

Measured win rate for the competent-player bot across districts 1–6: **EASY 63%, MEDIUM 53%,
HARD 40%, ULTRA 20%.**

Below ULTRA the predictor is handed a frozen belief in which no key is ever collected and
the portal never reads as open. They model how you *move* and nothing else.

### Sprinting

**Hold Shift.** Two cells per tick while held, one the instant it is released, charge
remaining or not. On a phone the RUN button latches instead, because holding a thumb on it
while steering with the other is awkward.

Charge comes from two pools, spent field-first: bolts picked up in this district (3s each,
not carried out of it) and lightning bought in the shop (10 coins a second, persisted).

This replaces an automatic boost, and the replacement is the point. A bolt used to grant
three seconds of double speed outright, so for those three seconds a single tap moved you
**two** cells. In a game about threading a one-cell gap past something hunting you, losing
the ability to move exactly one square is not a power-up — the player wants one box and
gets two, usually into the alien they were avoiding.

### Starting a district

**Nothing moves until the player presses a direction.** The clock, arrivals, division,
alien movement and detection are all frozen, and a beacon — expanding rings, corner
brackets and a `YOU` label — marks the player until they do.

A district opens with a fresh map, a hidden portal and three to five keys scattered across
it, and the player's own figure is a dozen pixels wide somewhere in the middle. Asking
them to find themselves while a clock runs and aliens close in is a test of eyesight, not
of play. Frozen rather than merely paused: the tick counter does not advance either, so
thinking time costs nothing against par or against the survival band.

The freeze is **opt-in and off by default** (`freezeUntilFirstMove`). It is a presentation
affordance, and a scripted policy has no eyes to orient. Subjecting one to it is actively
dangerous: a frozen world never changes, so a bot that answers STAY once answers STAY
forever and the episode spins. The browser opts in; everything headless does not.

### Aliens

- **Detection:** radius 4.6 (district 1) to 5.6 (district 10), halved in water, zero in a
  black box. No line of sight.
- **Alert:** on detection every alien receives your live position for 20 ticks, then falls
  back to your last known cell. Entering a black box erases both.
- **Speed:** a base of 1.75 ticks per move at district 1 tightening to 1.50 at district 10,
  divided by the tier's speed factor (which carries `ALIEN_SPEED_CAP`). **Deliberately
  slower than the player** — at parity a hunting alien that gets adjacent has won, because
  the distance never changes and running stops being a strategy.
- **Division:** every 10–15 seconds (seeded, so runs stay reproducible) one alien splits in
  two. The child is held to the same minimum arrival distance as a spawn; a division that
  cannot be placed fairly is deferred rather than dropped next to you.
- **They never leave.** Arrivals stop at the concurrent cap; only division takes the count
  past it. An earlier birth-death process retired aliens when "off-screen", which on a map
  that is entirely on screen meant they vanished in plain sight.
- **Stun:** 5 seconds, during which an alien cannot see, move or catch you.

### The squad

Aliens do not act independently. Each time the squad re-plans (every 6 ticks) roles are
assigned jointly:

- **Hunting** — the nearest one or two run you down along the live field; the rest are
  posted on your escape routes, ranked by the predictor but assigned **without
  replacement**, including unlikely routes. Covering an unlikely route is not a bet that
  you will take it; it is how the net closes.
- **Calm** — each alien gets its own district, highest probability first, so they spread
  instead of converging on one guess.

Coordination is off in `uniform` mode, so the dev dropdown stays an honest A/B.

## Districts and progression

**One hundred districts in ten belts of ten.** Each belt has its own terrain palette —
RUST, TIDE, MOSS, EMBER, VIOLET, ASH, CORAL, JADE, SOLAR, COBALT — so where you are in the
city is legible without reading the number. Entities (keys, coins, lightning, aliens, the
player, the portal) keep one colour everywhere: those are the game's vocabulary, and
repainting them per belt would mean relearning the board every ten districts.

Districts are generated, not authored, seeded from `hash(profileId, districtNumber)`.
Generation runs in passes, each one gated:

1. **BSP partition** into rooms, connected by an MST of corridors plus two or three extra
   links for loops. BSP rather than free placement because the spec's constants — radius 5,
   an 8-cell spawn floor, 3–5 aliens — only make sense on a map that is mostly open; free
   placement produced 25%-walkable corridor mazes where contact was unavoidable inside
   twenty ticks no matter how well anyone played.
2. **Connectivity** by flood fill; regenerate on failure, with an area floor and a
   best-effort fallback so a cramped district beats a thrown exception.
3. **Water** at a target density, biased toward walls.
4. **Buildings**, each cluster provisional and rolled back if it stranded an objective.
5. **Black boxes**, likewise provisional — but checked against **alien** connectivity,
   since a box across the only corridor would leave half the district unreachable by
   anything hunting you.
6. **Keys** in distinct rooms; **bolts** 1–2 per district; **coins** drawn to fill the
   district's value budget.
7. **The portal is not placed here.** The generator emits legal sites; the portal is drawn
   from the run's own stream at the start of every attempt and stays hidden until the last
   key is taken. Restarting re-rolls it, so a failed run teaches you the map but not the
   route.

The difficulty curve caps at district 10. Districts 11–100 are all distinct maps at full
pressure but do not get progressively harder. **What keeps changing is the file on you.**

| | district 1 | district 10 |
|---|---|---|
| keys | 3 | 5 |
| concurrent alien cap | 3 | 5 |
| arrival rate λ (per tick) | 0.0075 | 0.0115 |
| detection radius | 4.6 | 5.6 |
| chase period (HARD) | 1.75 | 1.50 |
| temperature τ | 1.40 | 0.55 |
| buildings | 3 | 7 |
| coin value | 10–15 | 100–150 |

## The predictor

Two tiers, because one cannot do both jobs. A transition matrix over a district's regions
learns geometry fast and means nothing on a new map. A profile of behavioural traits
transfers anywhere and knows nothing about this particular layout.

### Tier 1 — the district chain

A 12 × 12 transition count matrix over the district's regions, incremented **per tick** so
the diagonal carries dwell time. The k-step-ahead distribution is row *i* of P^k with
k = 20, computed by repeated vector-matrix multiply.

Two departures from the original spec, both measured:

- **Per-tick rather than change-only.** The original said "incremented on every region
  change" and also "k around 20 ticks". Those only agree if a matrix step is one tick.
- **Laplace smoothing follows the region adjacency graph**, not every cell. A flat prior
  asserts that a one-tick jump to the far side of the map is as likely as a step next door.
  It is not unlikely; it is impossible.

Tier 1 resets at each new **district**, but not at each new run — a retry faces a chain
that remembers your last attempt. The original "converges within about a minute of play"
is only reachable that way: a single run lasts five to twenty seconds.

### Tier 2 — the dossier

21 map-agnostic traits, each an exponentially weighted `{mean, var, n}`, persisted per
profile and folded once per run. Wall affinity, cover dwell, heading persistence, objective
directness, backtrack rate, threat response, open-ground tolerance, pause distribution,
key ordering, post-alert behaviour, and others. All computable from the tick log with no
reference to absolute coordinates — that is the whole requirement, because a trait that
mentions x = 14 cannot transfer to the next district.

### Combination

```
p   = tier 1's k-step distribution over regions
s_r = exp(beta × confidence × gate × Σ sign × w × z_trait × z_feature(r))
q   = normalise(p × s)
out = softmax(ln q / tau)   ==   q^(1/tau) / Σ q^(1/tau)
```

Tier 2 **modulates** tier 1 rather than replacing it, and speaks in proportion to tier 1's
own uncertainty (`gate` = normalised entropy of its projection). Measured without that
gate, the dossier helped exactly the players it was designed for and hurt the two whose
chain was already sharp — for a player who mostly stays put, "still there" is correct and
reweighting by geometry can only move the mode off a right answer.

τ is the single difficulty knob: near 0 it always intercepts at the modal region; large it
is uniform, and **uniform is a mode of this same code path** rather than separate code.

### Generated constants

`sim/predictor/priors.js` and `couplings.js` are produced by scripts, not written by hand:

- **`npm run priors`** — population mean and sd per trait, from the five bot policies
  across the curve. Tier 2 reweights on *deviation*, so a prior on the wrong side of the
  real mean does not weaken a coupling, it reverses its sign for every player. The
  hand-guessed values were wrong by a lot (wall affinity 0.85 guessed, 0.46 measured).
- **`npm run couplings`** — greedy forward selection over 35 candidate trait→geometry
  couplings, scored on a recorded corpus, macro-averaged across the bots with a penalty for
  leaving any single bot worse off. Currently keeps **8 of 35**. Selection runs on one set
  of seeds and is reported on a disjoint set.

These are build artefacts of the game as it stands. **Changing the game invalidates them**
as surely as changing the code, and a prediction result moving for no visible reason is the
first thing they explain.

## Spawning and difficulty

**When.** A non-homogeneous Poisson process; the next inter-arrival is `-ln(U)/λ(t)` with λ
frozen at the current tick (the piecewise-constant approximation — exact thinning is one
flag away in `sim/poisson.js`). No arrivals for the first 40 ticks. Exactly one alien is
already in the district when you arrive; two was tested and is a cliff, not a step.

**Where.** Rejection sampling from a truncated distribution: draw a region from the
predictor, a cell within it, then accept or reject against four constraints — shared ground
(somewhere both can stand), **alien** BFS distance from the player at least 11, outside your
detection range, and at most 20. Thirty tries, then fall back to uniform over all cells
satisfying the same constraints.

The minimum distance is not a detail. Without it the system occasionally spawns on top of
you, the death reads as arbitrary rather than earned, and the player concludes the game
cheats. It is measured as the **alien** travels, because the honest question is how many
ticks until it can reach you — and it cuts through buildings.

**How hard.** A proportional controller on two signals, settled **once per district** and
reused on every retry:

| signal | moves | why |
|---|---|---|
| survival time over the last 5 runs, wins right-censored | arrival rate λ | how much pressure you can take |
| your own normalised visit entropy | temperature τ | how legible you have been |

Freezing per district matters: re-tuning on each attempt makes a district get harder every
time you lose it, which reads as the game punishing failure. What your movement tunes is
the districts you have not reached yet.

A win is **right-censored** survival, not a short one. Taken literally, a player who wins
in forty ticks has survived forty ticks, so the controller would relax for the strongest
players. A won run never ended in a capture; its survival time is a lower bound.

All four spawner modes — uniform, chain-only, chain-plus-dossier, full-with-controller —
are selectable live from a dev dropdown and switch **in place** without restarting the run.

## The economy

Coins are a currency; the score is a judgement of the run. They are deliberately not the
same number.

```
speed = 400 × clamp(par ÷ ticks, 0, 2)      zero unless you finished
coins = coin VALUE collected × 8
stuns = aliens stunned × 120
keys  = keys collected × 50                 partial credit on a loss

score = (speed + coins + stuns + keys)
        × (1 + 0.15 × (district − 1))
        × 1 ÷ (1 + 0.35 × (attempts − 1))   1.00, 0.74, 0.59, 0.49 …
        × tier multiplier
        × (won ? 1 : 0.25)

coins paid = floor(score ÷ 60)
```

`par` is computed per run from a greedy nearest-key route plus the run to *that run's*
portal, ×1.35 for slack. Attempts are counted when a run **starts**, so quitting out of a
bad run cannot dodge the decay.

Farming is allowed and expected — it is the only way to afford a gun. Coins off the floor
and the clear bonus (5× the district number) pay in full every time; only the score share
decays. What farming cannot inflate is the recorded best score.

### Shop

| Item | Price | Notes |
|---|---|---|
| Stun gun | 500 | The frame only. **Arrives empty** |
| Stun charge | 100 | Up to 6. Refused until the gun is owned |
| Lightning | 10 / second | Banked up to 60s, toggled with `L`, drains only while on |

`E` stuns every alien whose detection range currently contains you — one charge each,
nearest first — not every alien in the district. A full kit is 1,100 coins, roughly one
pass through districts 1 to 10.

## Profiles and persistence

Two slots in IndexedDB under one object store keyed by profile id. No passwords, no
accounts, no server, no cross-device sync.

**Every published update starts every save fresh.** The database is namespaced by a build
stamp (`web/build.js`, bumped by `npm run stamp`), and databases from earlier builds are
swept on load. This is deliberate for a project still changing shape: the schema, the
tiers, the economy and the scoring have each moved between deploys, and a best score set
under a different score equation is not a score, it is a number. The same stamp drives the
stylesheet cache-buster, so the two cannot drift.

**MAIN is persistent and is asked about on arrival.** If a file exists, the launch screen
offers *continue* and *start fresh* side by side. Starting fresh erases the file
completely — progress, wallet, inventory, attempt counts, settled difficulties, the tier,
and the dossier, which is the only thing in the project that takes real time to build. It
confirms first, naming how many districts of learning are about to go.

**GUEST is scoped to the browser session.** Closing the tab forgets it entirely: tier,
progress and dossier. It survives reloads and navigation between the three pages — a guest
is not wiped halfway through their own run — because the marker is `sessionStorage`, which
the browser clears exactly when the tab closes and not before. This reverses the original
spec, which made guest a persistent second save so a friend could come back next week; the
slot exists for the hand-the-laptop-over demo, and that demo is strongest when it starts
blind every single time.

```
profile {
  id            'main' | 'guest'
  difficulty    tier, set once at creation, never editable
  level         highest unlocked
  dossier       { trait: {mean, var, n} }      ~21 traits, the persistent tier
  wallet        { coins }
  inventory     { stunGun, bullets, boltSeconds }
  plays         { district: attempts }          feeds the score's replay decay
  bestScores    { district: score }
  difficultyByLevel { district: {tau, lambdaScale} }   settled on first entry
  runs          last 50
  settings      { spawnerMode, dispatchEnabled, showHeatmap }
  schema        4
}
```

**The isolation rule, which is the one thing not to get wrong:** the active profile id is a
single module-level value in `sim/profile.js`, read by the only write path. Every mutator
goes through it and none takes an id, so a guest run cannot touch the main dossier. That
module lives in `/sim` rather than `/web` precisely so the rule is testable under Node.

Writes happen on run end, not every tick, and every IndexedDB call is wrapped — private
browsing throws, and a thrown write must cost a save, not the run.

Records below the current schema are **discarded rather than migrated**: a file written
before tiers existed has no honest answer to which tier produced its scores.

## The dispatch layer

A pretrained instruct model (`HuggingFaceTB/SmolLM2-360M-Instruct`, ~200 MB quantised)
loads from a CDN a couple of seconds after the first district is playable and writes the
surveillance system's internal monologue from live predictor state. Downloaded, never
trained.

Four constraints, all of which bite: **lazy load** (nothing fetched until the game is
already playable), **never block the loop** (generation is fire-and-forget; a request
arriving while one is in flight is dropped, because stale commentary is worse than none),
**degrade cleanly** (without WebGPU it falls back to templated strings assembled from the
same state object), and **never load on a device that cannot survive it**.

That last one is not the same as the WebGPU check and learning the difference cost a round
of crashes. Chrome on Android exposes `navigator.gpu`, so a capability test alone cleared
phones to download a quarter of a gigabyte of weights, and the tab died. `modelAdvisable()`
additionally refuses a coarse pointer, a `saveData` connection, or under 4 GB of reported
device memory.

**The test that keeps it honest:** if the text would read identically with the predictor
deleted, it has failed. Both paths are driven from the same state object and both shift
with confidence:

> *cold:* "New subject, no file. Projection is geometry only: district 2 at 60 percent, and
> at 2.3 bits of spread that is barely a guess."
>
> *six districts in:* "File on MAIN runs 6 districts deep and it is consistent: subject
> holds a heading, never doubles back. District 11, 15 percent. Unit already posted."

## Look and feel

**Light and dark**, toggled in the header and remembered in `localStorage` — a property of
the person at the keyboard rather than of the save file, so switching profiles does not
relight the room. It follows the system preference until an explicit choice is made.

The **board does not change**. A district is a rendered scene with ten belt palettes tuned
so a red alien, a gold key and a white figure all read against the ground; a light version
would need ten more palettes and would wash out every entity on them. The chrome adapts and
the board stays as drawn, framed like a screen. Every light-mode ink colour clears WCAG AA
(4.5:1) against the page background.

Two typefaces doing two jobs: **Inter** for anything read as prose or a label, and a
monospace for anything that is a number or an identifier. Keeping data in mono is not
decoration — it is what makes a column of scores or coordinates scannable, and it preserves
the terminal character the game is built around.

The launch screen is a product page: a hero with the wordmark, the two save files as
elevated cards, and a six-card grid explaining the mechanics. The hub, the shop and the
district chrome share one token set — a surface ramp from `--bg` to `--bg-4`, a radius
scale, two shadow levels, and a single `.btn.primary` style for the one action a screen
wants you to take.

## Playing on a phone

The board is 32 × 20 and wants landscape; portrait shows a rotate hint rather than a strip.

- **Movement** is a floating virtual stick in the left half: its base appears wherever your
  thumb lands, and it resolves to one of four headings by dominant axis with a 16px
  deadzone. Four, not 360, because the sim is four-directional and anything else
  manufactures inputs it cannot express.
- **RUN** (banked lightning) and **STUN** are translucent circles stacked under the right
  thumb. RUN lights while draining; STUN carries its charge count and dims when empty.
- The readout panels collapse into a slide-up sheet, and in landscape the status strip is
  dropped entirely — everything on it is already in the top bar, and on a phone height is
  the only scarce resource.
- Sized against `visualViewport` and `100dvh`, not `innerHeight` and `100vh`: on a phone
  `vh` includes the collapsible address bar, so a `100vh` layout is taller than the screen
  and the board slides off the bottom.

The outcome overlay is fixed to the viewport rather than to the board, and puts its buttons
above the score breakdown on a small screen. Positioned inside the board's wrapper it was
clipped by that element's `overflow: hidden`, which painted "enter district N" outside the
visible box and soft-locked the game after a win.

None of it engages for a mouse — the controls are behind
`(hover: none) and (pointer: coarse)`.

## Ambience

Entirely synthesised — two detuned sawtooths through a wobbling lowpass, plus a pulse whose
**rate** carries the information: 46 bpm calm, 104 when an alien has you, 168 when you are
well inside its radius. A toggle sits in the district's top bar and the choice is stored on
the profile, because someone who turns the ambience off means it and having it return at
the next district would be obnoxious. Audio cannot start without a user gesture, so the
first keypress or tap is what starts it. No audio files: the tempo has to be continuous with the threat, and
crossfading three loops at 8 Hz is heavier, worse, and would put binaries in a repository
that deploys as a static upload.

## Acceptance criteria

`npm test` — **12 passed · 1 not demonstrated · 0 failed.** The suite reports three
verdicts, because recording a criterion as passed when it is not decidable would defeat the
point of having written it down.

| # | Criterion | |
|---|---|---|
| 1 | Same seed and inputs produce an identical run, verified by hashing the tick log | PASS |
| 2 | 1,000 episodes in under 30 seconds in Node | PASS (~2.5s) |
| 3 | Every district fully connected: 10,000 generations, zero unreachable objectives | PASS |
| 4 | No placement within the minimum distance across 1,000 episodes — **divisions included** | PASS |
| 5 | Top-1 region accuracy beats uniform against all five bot policies | PASS |
| 6 | Chain-plus-dossier beats chain-only across 5 consecutive districts | PASS |
| 7 | Mean time-to-first-encounter lower under the full spawner than uniform | PASS (5/5 bots) |
| 8 | Player visit entropy rises under the adaptive spawner | **NOT DEMONSTRATED** |
| 9 | A guest run leaves the main dossier byte-identical | PASS |
| 10 | Progress survives a browser restart and a tab close | PASS |
| 11 | The game is playable before the language model finishes loading | PASS |
| 12 | With WebGPU disabled, the dispatch panel still shows text and the game runs | PASS |
| 13 | Dispatch output visibly changes between a cold guest and a warm main profile | PASS |

**Criterion 8 cannot be settled by this harness and says so.** Four of the five bots are
fixed policies: they cannot become less predictable under pressure because they cannot
perceive pressure at all. Measured length-matched at tick 40 — end-of-run entropy is
confounded, since a sharper spawner ends runs sooner and a shorter run visits fewer
districts — the effect is indistinguishable from zero. This is a question about a human
player.

`npm run webcheck` additionally runs the whole browser layer under Node against a DOM shim
with a working in-process IndexedDB: 29 checks covering the tier chooser, the hub, the
shop's arithmetic, the loadout crossing into a district, E and L, black boxes, the score
payout and the per-belt terrain. It draws no pixels and lays out no CSS.

## Departures from the original spec worth naming

| Original | Now | Why |
|---|---|---|
| Score **is** visit entropy | Score is a compound equation; entropy survives as the "noise index" and as the controller's movement signal | The economy needed a score that responds to speed, collection and stuns. The original's elegant "evaluation metric and win condition are the same quantity" is weakened, and that is a real loss |
| 3–6 caches | 3–5 keys | At six, district 10 was unwinnable for all five bot policies — 2% win rate, most deaths inside thirty ticks |
| Patrols arrive | Aliens arrive and **never leave** | Retirement on a fully visible map means vanishing in plain sight |
| Flat Laplace prior | Prior follows the region adjacency graph | A flat prior spends mass on physically impossible transitions |
| Tier 1 resets per level | Resets per **district**, not per run | Otherwise it never gets the minute of play it needs to converge |
| Tier 2 modulates at fixed strength | Gated by tier 1's uncertainty | Fixed strength wrecked the two bots whose chain was already sharp |
| Hand-written trait priors and couplings | Generated by measurement | The hand-written ones were wrong, and measurably so |
| One page | Launch → hub → district | Arrow keys fight the document for scroll on a page that scrolls |
| Guest is a persistent second save | Guest is wiped when the tab closes | The slot exists for the hand-it-over demo, which is strongest starting blind every time |
| Alien speed = player speed at HARD | Capped at 0.75× via one constant; ULTRA exempt at 100% and paying ×3 | At parity a hunting alien that gets adjacent has already won |

## Open questions and known gaps

1. **Nothing has ever been opened in a browser.** No browser tooling has been available in
   any session. The headless harness proves the wiring runs; it draws no pixels, lays out
   no CSS, and the ambience has never made a sound. The art and the audio are the least
   verified parts of the project.
2. **The WebGPU model path is untested.** It is written to the documented API and never
   executed. The templated fallback is tested and is what every non-Chrome visitor gets.
3. **Whether 12 regions is enough resolution** for interception to feel targeted rather
   than vaguely directional. One constant; subdividing to 24 halves the counts per region.
4. **Balance is tuned against five scripted bots**, and bots do not dodge the way a person
   does. An efficient bot finishes a district in about five seconds and therefore never
   reaches the 10–15 second division window at all — only a wandering bot does, and so will
   a human. The bot benchmarks cannot tell you whether division is well tuned.
5. **The alien population is unbounded.** Arrivals cap, divisions do not. A sixty-second
   run ends with four or five extra aliens. Left that way deliberately; a cap would go in
   `_maybeSplit`.
6. **Bolt density is 1–2 per district × 12 districts ≈ 20 per map**, which is denser than
   it sounds now that lightning is also purchasable by the second.

The first stretch goal remains the **foresight overlay**: each alien's predicted path back
to you, using the prediction function pointed the other way. `I` already draws intercept
targets, so the groundwork is there.
