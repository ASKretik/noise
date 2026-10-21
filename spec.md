# NOISE — build spec

Oct 6, 2026 · @Kretik

NOISE is a browser stealth game whose enemy spawner learns where you are going and is waiting there when you arrive. Target is roughly 23 hours over 9 to 11 days, deployed static to GitHub Pages, with no model training anywhere in the project.

## Scope and non-goals

Ships: a top-down grid stealth game in the browser, procedurally generated levels, an enemy spawner driven by a two-tier predictive model that learns the player across levels, two local save profiles, and a small language model that narrates the system's reasoning. Static deploy, no server.

Explicitly out of scope, and each line is a decision, not an oversight:

- **No model training.** Both predictor tiers are online counting and sufficient-statistic updates. No gradient descent, no datasets, no checkpoints, no GPU.
- **No backend, no auth.** Two profiles in IndexedDB on one machine. Cross-device sync is not a goal.
- **No line-of-sight.** Detection is radius plus cover state. Bresenham raycasting is a day of work for a marginal gain.
- **No combat.** One hit ends the run. No health, no weapons, no attack animations.
- **No art.** Coloured rectangles and circles. Every hour on sprites is an hour not spent on the thing you get quizzed about.
- **No formal A/B study.** Sanity benchmarks only, enough to prove the predictor beats random. The job-oriented brief rewards a working app over a research report.

## Architecture

&#91;embedded content: module dependencies · 5 modules, 2 runtimes\]

Arrows run toward what a module depends on. The sim core sits at the top because nothing below it is allowed to reach upward, and it imports nothing — that is what lets the same file run under Node for benchmarking and in the browser for play. The predictor reads tick logs and writes a distribution; the spawner consumes that distribution and returns cells; neither knows a canvas exists. Persistence and the language model are browser-only leaves, so a missing IndexedDB or an absent GPU degrades those leaves and nothing else.

## Game rules

You are a courier moving data through a city that models its couriers. Collect every cache on the level, then reach the dead drop before a patrol reaches you.

| Element | Rule |
| --- | --- |
| Grid | 32 x 20 tiles, four types: floor, wall, cover, drop |
| Tick rate | 8 ticks per second, fixed timestep, rendering decoupled |
| Movement | One cell per tick, four-directional, no diagonals |
| Objectives | 3 to 6 caches per level, then the dead drop unlocks |
| Cover | Standing on a cover tile halves your detection radius |
| Detection | A patrol sees you within radius r (default 5 cells), reduced in cover |
| Alert state | On detection, every patrol gets your position for 20 ticks, then your last known cell |
| Patrols | BFS chase while alert, otherwise walk toward their assigned intercept cell |
| Loss | A patrol enters your cell |
| Win | Reach the dead drop with all caches collected |

The objectives matter more than they look. Without a traversal goal the optimal strategy is to stand still in a corner, which leaves the predictor nothing to predict and collapses the premise. Caches force goal-driven movement, and goal-driven movement is what makes a player legible to a model.

**Scoring is entropy.** Your run score is the Shannon entropy of your own visit histogram over the level's regions, so you are rewarded for being unpredictable rather than fast. The evaluation metric and the win condition are deliberately the same quantity: the system wins by turning you into signal, and you win by staying noise.

## Levels and progression

Levels are generated, not authored. A room-and-corridor generator seeded from `hash(profileId, levelNumber)` gives you reproducible maps, infinite content, and a difficulty curve that is a parameter rather than drawn content. Authoring eight maps by hand costs the same hours and caps you at eight.

Generation runs in four passes: carve 6 to 10 rooms and connect them with corridors, verify full connectivity by flood fill and regenerate on failure, scatter cover tiles at a target density, then place caches in distinct rooms with the drop in the room furthest from spawn.

Clearing a level advances you to the next and the difficulty parameters step up: more caches, more concurrent patrols, a higher arrival rate, a slightly larger detection radius. Cap the curve around level 10 so it stays playable rather than becoming a wall.

The important part is what carries across the boundary. Your dossier — the persistent tier of the predictor — survives the level transition. Level 1 faces a system that knows nothing about you. Level 6 faces one that has watched five levels of your habits. Each level is a new district of the same city, and the file on you follows you between districts, which is exactly why this premise was worth keeping.

## The predictor

Two tiers, because one cannot do both jobs. A transition matrix over map regions learns geometry fast but means nothing on a new map. A profile of behavioural traits transfers anywhere but knows nothing about this particular layout. You need both.

### Tier 1: the level chain

Partition the level into 12 regions by room. Maintain a 12 x 12 transition count matrix with Laplace smoothing (add 1 to every cell at init), incremented on every region change. Normalise rows to get P. The k-step-ahead distribution is row `i` of `P^k`, with k around 20 ticks. Resets at each new level, converges within about a minute of play.

### Tier 2: the dossier

Roughly 20 map-agnostic traits, each an exponentially-weighted running statistic that persists across every level this profile has ever played. All are computable from the tick log with no reference to absolute coordinates:

- Wall affinity: fraction of ticks spent adjacent to a wall
- Cover dwell: mean ticks spent stationary on a cover tile
- Heading persistence: probability of continuing in the current direction
- Objective directness: path length taken to a cache over shortest path
- Backtrack rate: fraction of moves reversing the previous move
- Threat response: turn-away angle and distance when a patrol becomes visible
- Open-ground tolerance: fraction of ticks more than 3 cells from cover
- Pause distribution: mean and variance of stationary run lengths
- Cache ordering: nearest-first versus furthest-first tendency
- Post-alert behaviour: freeze, flee, or continue

These modulate the chain rather than replacing it. Concretely, reweight the k-step distribution by a trait-derived score per candidate region, then renormalise — a wall-hugger's corridor regions get lifted, an open-ground runner's get flattened.

### Combination and sampling

Final distribution is a temperature-controlled softmax over the reweighted k-step probabilities. Temperature τ is your single difficulty knob: τ near 0 always intercepts at the modal cell and is brutal, τ large is uniform and is the random baseline. τ comes from the difficulty controller.

Both tiers are counting. There is no loss function and no training step anywhere in this section, which is the sentence to have ready when someone asks whether this violates the no-training brief.

## Spawning and difficulty

**When patrols arrive.** A non-homogeneous Poisson process. Sample the next inter-arrival time as `-ln(U) / λ(t)` where U is uniform on (0,1). λ is set by the difficulty controller and the level number. Cap concurrent patrols at 3 to 5 by level, and suppress arrivals entirely for the first 40 ticks so a run never dies before it starts.

**Where they arrive.** Draw a candidate region from the predictor's final distribution, then a candidate cell within it, then accept or reject against four constraints: walkable, BFS distance from the player at least 8, outside the player's current view, and BFS distance at most 18. Resample up to 30 times, then fall back to uniform over all valid cells. This is rejection sampling from a truncated distribution, and saying so in those words costs nothing and reads well.

The minimum-distance constraint is not a detail. Without it the system occasionally spawns a patrol on top of you, the death feels arbitrary rather than earned, and players stop believing the model is intelligent — they just think the game cheats.

**How hard it gets.** A proportional controller targets a survival-time band rather than a fixed difficulty. Track survival time over the last 5 runs; if the mean sits above the band, lower τ and raise λ; below it, the reverse. Clamp both to sane ranges. This keeps a strong player challenged and a struggling guest able to finish a level, using one shared mechanism.

Keep all four spawner modes selectable from a dev dropdown — uniform, chain-only, chain-plus-dossier, and full with controller. Switching between them live in front of an examiner is the cheapest convincing demo in the project.

## Profiles and persistence

A launch screen offers two slots: a main profile and a guest profile. No passwords, no accounts, no server. Both persist in IndexedDB under one object store keyed by profile id.

```
profile {
  id          'main' | 'guest'
  displayName string
  level       number          // highest unlocked
  dossier     { trait: {mean, var, n} }  // ~20 traits, persistent tier
  runs        [{ level, ticks, entropy, won, at }]  // last 50, capped
  settings    { spawnerMode, dispatchEnabled }
  schema      number          // migration guard
}
```

**The isolation rule, which is the one thing not to get wrong:** every write to `dossier` and `runs` is scoped to the active profile id. A guest run must never touch the main dossier. Make the active profile a single module-level value read by the persistence layer, never a parameter threaded through call sites where one missed argument silently corrupts six levels of learning about you.

Guest is a persistent slot rather than an ephemeral session, so a friend who comes back next week keeps their levels. Add a visible reset-this-profile button, which doubles as the fastest way to demo a cold model beside a warm one.

Write on level completion and on run end, not every tick. Wrap every IndexedDB call in try/catch and degrade to in-memory state if the store is unavailable — private browsing mode will otherwise throw and take the whole game down.

The contrast between slots is the demo. Hand the laptop over on guest and the system spawns near-randomly; switch to main and it is waiting at the junction you always use. Same code, same seed, different dossier.

## The dispatch layer

A small instruct model runs in the browser and writes the surveillance system's internal monologue from live predictor state. This is the project's pretrained-model integration: downloaded, not trained.

```js
import { pipeline } from '@huggingface/transformers';  // v3.x, not @xenova
const scribe = await pipeline('text-generation',
  'HuggingFaceTB/SmolLM2-360M-Instruct', { device: 'webgpu' });
```

**Prompt contract.** The model receives a compact state object and returns two sentences in the voice of a dispatcher. Pass real numbers: current entropy score, the top predicted region and its probability, how many levels of dossier exist, the two strongest traits by deviation, and the last spawn decision with its reason. Constrain output to roughly 40 tokens and strip anything past the second sentence.

**The test that keeps it honest.** If the dispatch text would read identically with the predictor deleted, it has failed. The system's language must shift with its confidence — vague when the dossier is thin, specific and assured when it has six levels on you. Demonstrate this by playing predictably and letting the examiner watch the tone change.

Three engineering constraints, all of which bite:

- **Lazy load.** The quantised 360M weights are roughly 200 to 250 MB. Load after the first level is already playable, show a quiet indicator, and let the browser cache make every later visit instant. Drop to the 135M variant if the first-load weight proves painful.
- **Never block the loop.** Generation is async and fire-and-forget. The dispatch panel updates when it updates. The game loop must never await it.
- **Degrade cleanly.** WebGPU needs Chrome 113 or Edge; the WASM fallback is automatic but slow enough to feel broken. Detect WebGPU, and without it fall back to templated strings assembled from the same state object. The panel always says something.

## Build order

About 23 hours across 10 sessions. The order matters: the sim runs headless and testable before anything is drawn, so you can validate rules in Node rather than by playing.

| # | Session | Hours |
| --- | --- | --- |
| 1 | Spec, repo, seeded PRNG, map format, tick loop | 2.0 |
| 2 | Sim core: movement, objectives, collision, win and lose, Node-tested | 2.5 |
| 3 | Patrols, detection, alert states, Poisson arrivals, uniform spawner | 2.5 |
| 4 | Level generator, connectivity check, difficulty curve | 2.0 |
| 5 | Tier 1 chain, tier 2 dossier, combination and sampling | 3.0 |
| 6 | Canvas renderer, input, HUD, entropy score, heatmap overlay | 3.0 |
| 7 | Profile picker, IndexedDB layer, level unlock chain | 1.5 |
| 8 | Dispatch layer, lazy load, fallbacks | 2.5 |
| 9 | Bot policies, sanity benchmarks, two plots | 2.0 |
| 10 | Deploy, polish, writeup | 2.0 |

**Two rules to fix in session 1, both miserable to retrofit.** Replace `Math.random` everywhere with a seeded PRNG — mulberry32 is ten lines — or no result you produce is reproducible. And keep the sim core a pure ES module with zero DOM access, importable by both the browser and Node, or you lose the ability to run episodes faster than real time and the benchmark session becomes impossible.

|  |  |  |
| --- | --- | --- |
|  |  |  |
|  |  |  |

Repo layout: `/sim` for the pure core, `/web` for canvas and UI, `/bots` for scripted policies, `/bench` for the Node harness, `/docs` for the Pages build. Plain ES modules mean no build step and GitHub Pages serves them directly, matching your existing deploy.

## Acceptance criteria

Each is checkable, and each maps to a question you could be asked.

- [ ] Same seed and same input sequence produce an identical run, verified by hashing the tick log
- [ ] The headless harness runs 1,000 episodes in under 30 seconds in Node
- [ ] Every generated level is fully connected: 10,000 generations, zero unreachable caches
- [ ] No spawn ever lands within 8 cells of the player across 1,000 episodes
- [ ] Top-1 region accuracy beats uniform by a clear margin against all five bot policies
- [ ] Chain-plus-dossier beats chain-only on a bot played across 5 consecutive levels, which is the whole premise of progression
- [ ] Mean time-to-first-encounter is measurably lower under the full spawner than under uniform
- [ ] Player visit entropy rises under the adaptive spawner relative to uniform
- [ ] A guest run leaves the main dossier byte-identical, asserted in a test
- [ ] Progress survives a browser restart and a tab close
- [ ] The game is playable before the language model finishes loading
- [ ] With WebGPU disabled, the dispatch panel still shows text and the game still runs
- [ ] Dispatch output visibly changes between a cold guest profile and a warm main profile

The sixth line is the one to prioritise. If chain-plus-dossier does not beat chain-only across levels, the learning-across-levels claim is decorative, and you would rather discover that in session 9 than in the viva.

## Open questions and assumptions

Assumptions I made to protect the hour budget. Each is cheap to reverse now and expensive later.

| Assumption | Alternative | Cost to switch |
| --- | --- | --- |
| 12 regions, room-based | Per-cell prediction | Sparser counts, slower convergence, better resolution |
| Radius plus cover detection | Bresenham line-of-sight | About 1 hour, better stealth feel |
| Procedural levels | Hand-authored maps | Equal hours, 8 levels instead of infinite |
| k = 20 ticks ahead | Tuned per level | Needs the benchmark harness first |
| Difficulty controller is proportional | Thompson sampling over spawn strategies | About 2 hours, stronger ML story |

Three things I genuinely do not know yet:

1. **Whether 12 regions is enough resolution** for interception to feel targeted rather than vaguely directional. If it feels mushy in session 6, subdividing to 24 is a one-line change but halves your per-cell counts.
2. **Whether the dossier traits transfer as cleanly as claimed.** Several are correlated — wall affinity and open-ground tolerance are close to inverses. Expect to cut the list to 12 or so after seeing which actually move.
3. **Whether SmolLM2-360M is coherent enough** at 40 tokens with a structured prompt. It is near the floor of model capability for this task. Budget 30 minutes in session 8 to test it early, and fall back to templated text without regret if it rambles.

One dropped item worth recording: the foresight overlay, which would show each patrol's own predicted path back to the player using the same prediction function pointed the other way. It is about an hour and makes the game meaningfully better as a game. It is the first thing to add if you finish early, and the first stretch goal to mention when asked what you would do next.
