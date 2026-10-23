# NOISE

A browser stealth game whose aliens learn where you are going and are waiting there when
you arrive.

**[Play it](https://example.github.io/noise/)** · **[Benchmarks](docs/bench.html)** ·
no install, no backend, no build step

Find every key, open the portal, get out. Water halves how far you can be seen and every
alien's detection ring visibly shrinks when you step into it; lightning gives you double
speed; rubble stops you but not them; black boxes erase what they knew about where you
went. Every ten to fifteen seconds one alien splits in two, and they hunt as a squad — one
runs you down while the others post themselves on the routes you might break toward.

A hundred districts in ten belts, four difficulty tiers picked once per save file and
permanent. On the hardest, the aliens are told which keys you have already taken; below it
they model how you move and nothing else. Coins off the floor buy a stun gun and banked
lightning from the shop.

Your score is the Shannon entropy of your own movement: the system wins by turning you
into signal, and you win by staying noise.

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
`E` stun everything that can currently see you · `L` toggle banked lightning ·
`H` prediction heatmap · `V` visited cells · `I` alien targets · `Space` pause ·
`R` restart the district.

Profile → district hub (and shop) → district. The game runs on its own page
(`play.html`) so the arrow keys never fight the document for scroll.

---

## What the measurements say

Everything below is produced by `npm run bench`, not asserted. Numbers move a little with
seeds; the shape does not.

| top-1 district accuracy, 20 ticks ahead | uniform | chain (tier 1) | chain + dossier | full |
|---|---|---|---|---|
| drunk | 12.7% | 66.8% | — | **64.8%** |
| beeline | 10.2% | 17.4% | — | **20.6%** |
| wallHugger | 12.0% | 20.2% | — | **18.8%** |
| coverCrawler | 11.9% | 24.1% | — | **27.1%** |
| evader | 10.2% | 26.7% | — | **24.2%** |

Chance is 1 in 12. Time-to-first-encounter is lower under the full spawner than under
uniform for **all five** bot policies — the clearest single result in the project, and the
one a player can actually feel.

`npm test` reports **12 passed · 1 not demonstrated · 0 failed**. The suite has three
verdicts rather than two, and the one that is not demonstrated says why: whether an
adaptive spawner pushes a player toward unpredictability cannot be settled with
fixed-policy bots, because a fixed policy cannot respond to pressure at all. That is a
human's question. The full history of what moved and why — including a regression that
broken buildings caused and how it was diagnosed — is in **[decisions.md](decisions.md)**.

---

## Layout

```
sim/        the pure core. Zero DOM, zero imports outside /sim, runs under Node
  prng      mulberry32 + hashing; nothing in this project calls Math.random
  grid      32x20, four tile types, one flat typed array
  gen       BSP level generator: rooms, corridors, connectivity, cover, objectives
  regions   the 12-district partition tier 1 reasons over
  game      the tick loop: movement, keys, coins, aliens, stun, alert, division, win/lose
  score     the score equation and what it pays out in coins
  shop      what coins buy, and whether a purchase is legal
  poisson   alien arrivals and departures as a birth-death process
  spawner   rejection sampling from a truncated distribution
  squad     the aliens decide together: roles, and one district each
  profile   profiles and the isolation rule, backend-agnostic so it is testable
  system    the composition root: wires predictor + spawner into the game by injection
  predictor/
    chain      tier 1: a counting Markov chain over districts
    traits     the 21 map-agnostic behavioural traits
    dossier    tier 2: one EW {mean, var, n} per trait, persisted per profile
    priors     GENERATED -- population reference values for z-scoring
    couplings  GENERATED -- which trait pulls on which piece of geometry
    combine    how the two tiers become one distribution
web/        browser-only leaves: canvas, input, HUD, IndexedDB, dispatch, ambience
              launch.js → index.html · districts.js → districts.html · play.js → play.html
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

- **[decisions.md](decisions.md)** — the change round after the first playable version:
  retry difficulty, the separate play page, the theme, water and bolts, the hidden portal,
  alien division and broken buildings. Includes the criterion-6 regression in full.
- **[dna.md](dna.md)** — the original build: every assumption, every deviation from the
  spec and why, and the decisions that are yours rather than mine.
- **[spec.md](spec.md)** — the build spec, revised to describe the system as built. The
  original is in git history; the distance between the two is tabulated at the end of it.
- **[docs/bench.html](docs/bench.html)** — the figures, each with its data table.
