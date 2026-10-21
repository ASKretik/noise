# NOISE

A browser stealth game whose enemy spawner learns where you are going and is waiting
there when you arrive.

**[Play it](https://example.github.io/noise/)** · **[Benchmarks](docs/bench.html)** ·
no install, no backend, no build step

You are a courier moving data through a city that models its couriers. Collect every
cache, reach the dead drop, and try not to become legible. Your score is the Shannon
entropy of your own movement: the system wins by turning you into signal, and you win by
staying noise.

The part worth looking at is that **the file on you follows you between levels**. A
transition matrix over the current map's districts is wiped every time you leave; a
dossier of twenty behavioural traits — how closely you hug walls, how long you pause, how
directly you go for a cache — persists across every level the profile has ever played and
reweights where patrols are sent. Level 1 faces a system that knows nothing about you.
Level 6 faces one that has watched five levels of your habits.

**No model is trained anywhere in this project.** Both predictor tiers are online counting
and sufficient-statistic updates — no gradients, no loss function, no checkpoints, no GPU.
The only neural network is a pretrained instruct model downloaded at runtime to narrate
what the predictor is thinking.

---

## Run it

```sh
npm run serve     # http://localhost:8123
```

No dependencies to install — `package.json` has none. Node 18+ for the tooling; any
modern browser for the game.

```sh
npm test          # the spec's 13 acceptance criteria, pass / fail / not demonstrated
npm run webcheck  # runs the browser layer under Node against a DOM shim
npm run bench     # the full measurement report
npm run plots     # regenerate docs/plots/*.svg and docs/bench.html
npm run priors    # regenerate trait priors from the bot population
npm run couplings # re-select the trait-to-geometry couplings by measurement
```

### Controls

Arrow keys or WASD, one cell per tick, eight ticks a second.
`H` prediction heatmap · `V` visited cells · `I` patrol intercepts · `Space` pause ·
`R` restart the district.

---

## What the measurements say

Everything below is produced by `npm run bench`, not asserted. Numbers move a little with
seeds; the shape does not.

| | uniform | chain (tier 1) | chain + dossier | full |
|---|---|---|---|---|
| top-1 district accuracy, 20 ticks ahead (macro mean over 5 bots) | 10% | 26% | **39%** | 38% |
| mean ticks to first encounter, drunk bot | 109 | 45 | 46 | **44** |
| mean ticks to first encounter, evader bot | 68 | 54 | 44 | **47** |

Chance is 1 in 12. Time-to-first-encounter is lower under the full spawner than under
uniform for all five bot policies.

**Cross-level transfer**, with tier 1 given exactly one attempt per level so it is cold on
every new map and only the dossier carries over:

| bot | chain only | chain + dossier | |
|---|---|---|---|
| beeline | 5.6% | **21.5%** | +15.9pp, t = 4.8 |
| wallHugger | 5.4% | **27.5%** | +22.2pp, t = 6.0 |
| coverCrawler | 7.2% | **21.2%** | +13.9pp, t = 3.8 |
| drunk | 82.7% | 79.3% | −3.5pp, t = −0.6 |
| evader | 26.8% | 24.8% | −2.0pp, t = −0.7 |

The two bots the dossier does not help are the two whose chain is already sharp — a player
who barely changes district is best predicted by "still there", and tier 2 is deliberately
gated by tier 1's own uncertainty so it cannot override a confident chain. That gate is
why those rows are flat instead of negative.

Two of the thirteen acceptance criteria come back **NOT DEMONSTRATED** rather than passed,
and the suite says so in those words. See [dna.md](dna.md).

---

## Layout

```
sim/        the pure core. Zero DOM, zero imports outside /sim, runs under Node
  prng      mulberry32 + hashing; nothing in this project calls Math.random
  grid      32x20, four tile types, one flat typed array
  gen       BSP level generator: rooms, corridors, connectivity, cover, objectives
  regions   the 12-district partition tier 1 reasons over
  game      the tick loop: movement, objectives, patrols, detection, alert, win/lose
  poisson   patrol arrivals and departures as a birth-death process
  spawner   rejection sampling from a truncated distribution
  profile   profiles and the isolation rule, backend-agnostic so it is testable
  system    the composition root: wires predictor + spawner into the game by injection
  predictor/
    chain      tier 1: a counting Markov chain over districts
    traits     the 21 map-agnostic behavioural traits
    dossier    tier 2: one EW {mean, var, n} per trait, persisted per profile
    priors     GENERATED -- population reference values for z-scoring
    couplings  GENERATED -- which trait pulls on which piece of geometry
    combine    how the two tiers become one distribution
web/        browser-only leaves: canvas, input, HUD, IndexedDB, dispatch
bots/       five scripted policies spanning the legibility axis
bench/      the Node harness, the acceptance suite, and the two generators
docs/       the benchmark report and its figures
```

Arrows run one way. The sim core imports nothing and knows nothing about a canvas, a
profile or a model; the predictor reads tick logs and writes a distribution; the spawner
consumes that distribution and returns cells. Persistence and the language model are
leaves, so a missing IndexedDB or an absent GPU degrades those leaves and nothing else.

---

## The dispatch layer

A pretrained instruct model (`HuggingFaceTB/SmolLM2-360M-Instruct`, ~200 MB quantised)
loads from a CDN a couple of seconds after the first level is playable and writes the
surveillance system's internal monologue from live predictor state. Generation is
fire-and-forget; the game loop never awaits it.

Without WebGPU it falls back to templated strings assembled from the same state object.
The templates are written in confidence tiers so the fallback passes the same honesty test
the model does — **if the text would read identically with the predictor deleted, it has
failed**:

> *cold profile:* "New subject, no file. Projection is geometry only: district 2 at 60
> percent, and at 2.3 bits of spread that is barely a guess."
>
> *after six levels:* "File on MAIN runs 6 districts deep and it is consistent: subject
> holds a heading, never doubles back. District 11, 15 percent. Unit already posted."

---

## Deploying

`Settings → Pages → Source: GitHub Actions`, then push to `main`.
`.github/workflows/pages.yml` runs the acceptance suite and uploads the repository root —
plain ES modules, served as they are. The fallback (`Deploy from a branch → /docs`) is
documented in `tools/build-docs.mjs`.

Update the Play link at the top of this file once you know your Pages URL.

---

## Reading further

- **[dna.md](dna.md)** — every assumption, every deviation from the spec and why, and the
  decisions that are yours rather than mine.
- **[spec.md](spec.md)** — the original build spec.
- **[docs/bench.html](docs/bench.html)** — the figures, each with its data table.
