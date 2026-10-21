# dna.md — decisions, assumptions, and what the measurements changed

A running log kept while building NOISE from `spec.md`. Three kinds of entry:

- **[YOU]** — a decision that is yours, not mine. Most need about a minute; a few need
  you to click something on github.com that I cannot click.
- **[ASSUMED]** — something the spec left open, or a place I deviated from it. Each says
  what the spec asked for, what I did, why, and what it costs to reverse.
- **[FOUND]** — something a measurement said that changed the design. These are the ones
  worth reading before a viva, because several of them are the interesting answer to
  "what went wrong".

Nothing has been pushed to GitHub. The repository is initialised, committed and
configured for Pages, but creating the remote and pushing is yours — see D1.

---

## Part 1 — Decisions for you

### D1 · Creating the repo and going live  **[YOU — required]**

The code is ready to push. You need to do three things:

```sh
gh repo create noise --public --source=. --remote=origin --push
# or, without the gh CLI: create an empty repo on github.com, then
#   git remote add origin https://github.com/<you>/<repo>.git
#   git push -u origin main
```

Then, **on github.com**: `Settings → Pages → Build and deployment → Source: GitHub
Actions`. That is the one step I cannot do for you, and nothing is published until it is
done. The next push to `main` runs `.github/workflows/pages.yml`, which executes the
acceptance suite and then publishes. Your URL will be
`https://<username>.github.io/<repo>/` and also appears in the workflow summary.

Finally, replace the placeholder Play link at the top of `README.md` with that URL.

**Why Actions rather than the spec's `/docs`:** the spec says "`/docs` for the Pages
build", but there is no build — the game is plain ES modules. Publishing from `/docs`
under those conditions means committing a byte-for-byte second copy of `sim/`, `web/` and
`bots/`, which then drifts. Uploading the repository root publishes the real files at the
paths `index.html` already references. The `/docs` route still works if you want it:
`npm run build:docs`, delete the four `docs/` lines at the bottom of `.gitignore`, commit,
and set the Pages source to "Deploy from a branch → /docs".

### D2 · The language model's first-load weight  **[YOU — recommend: keep]**

`web/dispatch.js` loads `HuggingFaceTB/SmolLM2-360M-Instruct` quantised to q4, roughly
200–250 MB on a visitor's **first** load, then browser-cached forever. It is lazy-loaded
2.5 s after the first level is already playable, and the game never waits for it.

The spec offers an escape hatch: "Drop to the 135M variant if the first-load weight proves
painful." Both are wired; switch by passing `{ small: true }` to `dispatcher.load()` in
`web/main.js`. I have kept 360M because the spec's own open question 3 flags 135M as
likely too incoherent at 40 tokens with a structured prompt, and because the templated
fallback is good enough that a slow model is the lesser risk.

**I could not test the model path.** There is no browser in this toolchain, so the
WebGPU + CDN path is written to the documented API but never executed. The fallback path
is tested and is what every non-Chrome visitor gets anyway. Budget the 30 minutes the spec
suggests to try it yourself: open the page in Chrome, watch the dispatch panel's status
line go `loading … % → model online`, and if the output rambles, switch to 135M or set
`dispatchEnabled: false` and ship the templates.

### D3 · Difficulty: caches cap at 5, not the spec's 6  **[YOU — recommend: keep]**

Run length is exposure, and exposure is by far the strongest difficulty term in this game
— stronger than patrol count, detection radius, or temperature. At the spec's six caches,
level 10 was not hard, it was a wall: **all five bot policies scored 2% win rate, with
most deaths inside thirty ticks.** The curve now tops out at five.

Reverse it in one character: `sim/difficulty.js`, `caches: Math.round(lerp(3, 5, t))`.
`npm run bench` prints win rate per level, so the cost of changing it is visible
immediately.

### D4 · Region resolution stays at 12  **[YOU — recommend: measure before changing]**

The spec's open question 1 asks whether 12 districts is enough resolution for interception
to feel targeted rather than vaguely directional. It is one constant —
`REGION_COUNT` in `sim/regions.js` — and the matrix, the heatmap, the spawner and the
benchmarks all follow it. At 12, districts average about 30 cells on a 32×20 map, which is
roughly half a room.

I have left it at 12 because I cannot judge "feels mushy" without playing it, and that is
your call to make with hands on the keyboard. If you do change it to 24, re-run
`npm run bench` first and last: halving the cells per district also halves the counts per
district, and the chain's convergence is the thing that will pay for it.

### D5 · Things I added that the spec does not mention  **[YOU — recommend: keep]**

Say the word and any of these comes out:

- `tools/serve.mjs` — a dependency-free static server, because ES modules will not load
  over `file://` and adding a dependency to serve five file types would have been the only
  dependency in the project.
- `bench/domshim.js` + `bench/webcheck.js` — a minimal DOM that runs `web/main.js` under
  Node. I had no browser available, and "it parsed" is not the same claim as "it runs".
  It found two real bugs (see F6).
- `.github/workflows/ci.yml` — tests on every push, on Node 18 and 20.
- On-screen touch controls, so the deployed link is usable on a phone.

### D6 · Licence

`package.json` says MIT. If this is coursework with an institutional policy, change it.

---

## Part 2 — Assumptions and deviations from the spec

### Map generation

**A1 · Maps are 55–65% open floor, not 25%. [ASSUMED — significant]**
The spec specifies a room-and-corridor generator and, separately, detection radius 5, a
spawn band of 8–18 cells, and 3–5 concurrent patrols. My first generator — free room
placement with rejection sampling, which is the obvious reading — produced maps that were
about 25% walkable. On those maps the spec's constants do not describe the game it
describes: a radius-5 circle covers a third of every corridor, the 8-to-18 band is
*the entire level*, and contact is unavailable to avoid within twenty ticks no matter how
well anyone plays. Measured win rates were 0–20% at level 1 and 0% from level 6.

The generator is now a binary space partition. Rooms are large, spread by construction,
and total open area stays near constant as the room count rises — which is what lets the
difficulty curve change room count without silently changing how lethal detection is. It
also gives each of the 12 districts a couple of dozen cells instead of nine, which tier 1
needs to have anything to count. `sim/gen.js` carries the full reasoning.

**A2 · A minimum-area gate with a fallback, not a hard retry. [ASSUMED]**
Levels below 150 walkable cells are regenerated, up to 40 attempts, each attempt its own
deterministic stream. If no attempt clears the floor, the largest connected layout is used
rather than an exception being thrown mid-run. Verified over 10,000 generations: zero
failures, zero unreachable objectives.

**A3 · Rooms are 6–10 as specified; cover is biased toward walls. [ASSUMED — minor]**
Cover scatter is weighted toward wall-adjacent cells, because that is where cover reads
visually. The spec says only "scatter cover tiles at a target density".

### Game rules

**A4 · Patrols leave as well as arrive. [ASSUMED — significant, not in the spec]**
The spec describes arrivals only, and caps concurrent patrols at 3–5. With arrivals and no
departures, that cap is not a ceiling the game occasionally touches — it is a floor the
game reaches in the first minute and never leaves again. Every patrol ever spawned is
still on the map at minute three.

Each patrol now has an exponential shift length (mean 260–300 ticks), and retires only
when calm and off-screen, so none ever evaporates in front of you. The population is a
birth-death process with steady state λ × lifetime ≈ 2.0 at level 1 rising to 3.5 at level
10, deliberately below the cap so the cap binds only during a bad stretch.

**A5 · Hunting patrols move slower than the player. [ASSUMED — significant]**
This is the single most important balance number in the project and the spec does not set
it. At parity, a hunting patrol that gets adjacent has won: you step, it steps into the
cell you left, the distance stays at one forever, and only a corner ever ends the chase.
Running is not a strategy, cover does not help at distance one, and every capture reads as
scripted. I traced exactly this and it is in `sim/difficulty.js` as a comment.

Patrols now take 1.75 ticks per move while hunting at level 1, tightening to 1.5 by level
10 (2.5 while walking an intercept). A fleeing player gains about six cells over a
twenty-tick alert — just past the detection radius, which is what makes "break contact and
the alert lapses" a real mechanic instead of a sentence in a design document.

**A6 · Exactly one patrol is already on the map when you arrive. [ASSUMED]**
Without it, a competent player clears level 1 in about seventy ticks — inside the 40-tick
arrival grace plus one mean inter-arrival time — and wins having never seen a patrol. The
initial patrol is placed through the ordinary spawner, so the 8-cell minimum still holds.
**Two** was tested and is a cliff, not a step: a pair converging from different sides
leaves no escape direction, and win rates fell from roughly a quarter to two per cent
between levels 3 and 6.

**A7 · Detection is Euclidean distance, halved in cover. [ASSUMED — minor]**
The spec says "within radius r"; I read radius as Euclidean. No line-of-sight, which is
the spec's own explicit decision.

**A8 · The alert timer refreshes on each new detection. [ASSUMED]**
"Every patrol gets your position for 20 ticks" — each fresh sighting restarts the twenty.
The alternative (a hard twenty from first contact) makes breaking line of sight pointless.

**A9 · Reaching the drop wins before patrols move that tick. [ASSUMED — minor]**
Deliberately generous. Dying *on* the dead drop tile reads as a bug to a player whether or
not it is one.

**A10 · Trading cells with a patrol counts as caught. [ASSUMED]**
Otherwise you can walk through a patrol head-on in a one-wide corridor.

**A11 · Runs time out at 1,440 ticks (3 minutes). [ASSUMED — not in the spec]**
Needed so the headless harness terminates. A timeout is a loss and is recorded as such.

### The predictor

**A12 · Tier 1 is a per-tick chain, not a change-only chain. [ASSUMED — significant]**
The spec says the matrix is "incremented on every region change" and, one paragraph later,
that the k-step distribution uses "k around 20 ticks". Those two only agree if a matrix
step is one tick. The shipping chain is therefore per-tick, with self-transitions on the
diagonal — which also means the diagonal carries dwell time, information the change-only
reading throws away. `perTick: false` gives you the literal reading, and `npm run bench`
section 5 measures both.

**A13 · Laplace smoothing follows the district adjacency graph. [ASSUMED]**
The spec says add 1 to every cell at init. A flat prior asserts that a one-tick jump to a
district on the far side of the map is exactly as likely as a step into the next room. It
is not merely unlikely; it is impossible. The prior is now 1 on self-transitions and
genuine neighbours and 0.02 elsewhere, which turns the cold chain into a diffusion over
the map's real topology — a strictly better opening guess than uniform, converging to the
same place once counts arrive.

**A14 · Tier 1 survives replays of the same level. [ASSUMED — significant]**
The spec says tier 1 "resets at each new level". I read that as *level*, not *run* — a
retry of level 4 faces a chain that remembers your last attempt at level 4. This matters
enormously and is not a detail (see F2): the spec also says the chain "converges within
about a minute of play", and a single run lasts five to twenty seconds. Reset per run, it
never gets its minute.

**A15 · Tier 2 is gated by tier 1's uncertainty. [ASSUMED — not in the spec]**
The spec has tier 2 modulate tier 1 at fixed strength. Measured, that helped exactly the
players it was designed for and actively hurt the others — see F4. Tier 2 now speaks in
proportion to the normalised entropy of tier 1's own projection: a confident chain is left
alone, a vague one gets steered. It is a precision-weighted combination and still only
arithmetic over counts.

**A16 · Trait priors are generated, not guessed. [ASSUMED — see F3]**
`npm run priors`. Tier 2 reweights on *deviation* from a population, so every coupling's
sign depends on the population mean being roughly right.

**A17 · Trait-to-geometry couplings are selected by measurement. [ASSUMED — see F5]**
`npm run couplings`. The spec's open question 2 expects the list to be cut "after seeing
which actually move"; this is that, done with a greedy forward search on one set of seeds
and reported on a disjoint set. **This is not model training**: no gradients, no loss,
nothing updated at runtime. It is offline constant selection by a developer, the same
category of decision as choosing k = 20, and the result is checked into source as a
literal table.

**A18 · 21 traits, of which 12 drive the reweighting. [ASSUMED]**
The spec says "roughly 20". The other nine are measured and shown — they are what the
dossier panel displays and what the dispatch layer speaks from — they just have no clean
geometric counterpart to pull on.

**A19 · Threat distance in the trait layer is Euclidean, not BFS. [ASSUMED — minor]**
Consistent with the radius-based detection model, and it avoids a BFS on every tick of
every episode.

### Spawning and difficulty

**A20 · Arrival times use λ frozen at the current tick. [ASSUMED]**
`-ln(U)/λ(t)`, exactly as the spec writes it. That is the piecewise-constant
approximation, not an exact non-homogeneous Poisson process. Exact sampling by thinning is
implemented and one flag away (`exact: true` in `sim/poisson.js`); I kept the spec's
formula as the default and wrote down that it is an approximation rather than letting it
look like an oversight.

**A21 · A win is right-censored survival. [ASSUMED — significant]**
The controller targets a survival-time band over the last 5 runs. Taken literally, a
player who wins level 1 in forty ticks has a *short* survival time, so the controller would
make the game easier for the strongest players. That is backwards. A won run never ended
in a capture, so its survival time is a lower bound, not a measurement; wins are therefore
censored at the horizon (2× the band ceiling). The effect: the controller targets roughly a
17–45% win rate, and `npm run bench` section 7 shows it easing, holding and tightening
correctly.

**A22 · The controller runs only in `full` mode. [ASSUMED]**
Otherwise the dev dropdown is four labels over the same behaviour instead of an A/B.

### Persistence and the browser

**A23 · Schema 2, with a migration from schema 1. [ASSUMED]**
The dossier moved under a `traits` key. Old records upgrade field by field rather than
being discarded — throwing away someone's dossier because a field was added is the worst
possible failure for the one piece of state this project is about.

**A24 · The isolation rule is enforced at the storage boundary too. [ASSUMED]**
The active profile id is a single module-level value in `sim/profile.js`, read by the only
write path; every mutator goes through it and none takes an id. The IndexedDB adapter
re-stamps the key from that same value, so a stray record cannot land on the wrong
profile. `sim/profile.js` is in `/sim` rather than `/web` precisely so this is testable
under Node — which is criterion 9, and it passes.

**A25 · The browser keeps only a position log, the bench keeps a full one. [ASSUMED]**
`logLevel: 'player'` in the browser (no patrol coordinates), `'full'` where the
determinism hash is taken. Memory, not principle.

**A26 · Rendering interpolates between ticks. [ASSUMED — minor]**
Fixed 8 Hz simulation, rendering decoupled per the spec; positions are lerped between the
previous and current tick so 8 Hz movement does not look like 8 Hz movement.

**A27 · The transformers CDN build is pinned to 3.5.1. [ASSUMED]**
An unpinned CDN import is a remote dependency that can change under you between a test and
a demo.

---

## Part 3 — What the measurements changed

### F1 · The chain alone is *worse than chance* for players who move in a straight line

Measured against the goal-driven bots, tier 1 scored 3–5% top-1 against uniform's 8%.
Not merely weak — actively worse than guessing.

The cause is real and worth being able to explain: a count-based Markov chain fitted to a
single short, non-recurrent trajectory converges on the **occupancy** distribution, which
is where the player *has been*. Twenty ticks ahead of someone crossing the map, that is
behind them. I traced it tick by tick: at tick 24 the player had moved into district 3 and
the chain's top prediction was district 5 at 28% — the district they had just left, where
they had spent seventeen ticks.

Three things fixed it, in order of effect: giving the chain the warm-up the game actually
gives it (F2), restricting the prior to the adjacency graph (A13), and tier 2 (F5).

### F2 · My first benchmark was starving the chain, and that was a bug in the benchmark

I was generating a fresh level every episode. The spec says the chain "converges within
about a minute of play" — 480 ticks — and a single run lasts 40 to 160. Measured the way
the game actually uses it, with the chain persisting across replays of one level, the same
code went from **below uniform to 22%** against uniform's 9%.

The lesson generalises: the first job of a benchmark is to measure the thing that ships.

### F3 · Nearly every hand-written trait prior was wrong, and in a way that inverted the model

Tier 2 reweights on deviation from a population. I seeded the priors by hand and then
generated them from 600 bot runs. The guesses were not close:

| trait | guessed | measured |
|---|---|---|
| wall affinity | 0.85 | 0.46 |
| junction affinity | 0.50 | 0.84 |
| corridor preference | 0.50 | 0.16 |
| region dwell | 6.0 | 13.7 |
| post-alert freeze | 0.15 | 0.002 |

A prior on the wrong side of the real mean does not weaken a coupling, it **reverses its
sign for every player**. This is why `npm run priors` exists and why `priors.js` is a
generated file.

### F4 · Tier 2 at fixed strength helped three bots and wrecked two

Before the uncertainty gate: the three goal-driven bots gained 8–10 points of top-1
accuracy, while the drunk bot fell 70% → 64% and the evader 37% → 25%. For a player who
mostly stays put, tier 1's "still there" is already sharp and correct, and reweighting it
by geometry can only move the mode off a right answer. Hence A15.

The gate has a cost, stated plainly: those two bots now show *no gain* from tier 2 rather
than a loss. That is the trade, and it is the honest reading of criterion 6.

### F5 · Selecting the couplings by measurement was worth 17 points

The hand-authored couplings were plausible sentences, and plausible sentences are not
evidence. "Sits in cover" was coupled to a global ranking of cover density when its real
counterpart is "the cell they are already standing in" — that one coupling alone cost the
cover-dwelling bot 18 points.

Greedy forward selection over 32 candidates, scored on a recorded corpus, macro-averaged
over the five bots, with a penalty for leaving any single bot worse off than chain-only.
On **held-out seeds the weights were never chosen on**: macro top-1 23.5% → 40.4%, with
beeline +35.8pp, coverCrawler +27.8pp, wallHugger +26.1pp, drunk −0.4pp, evader −4.5pp.
It kept 12 couplings and discarded 20.

### F6 · The headless browser harness earned its keep immediately

With no browser available I built a DOM shim that runs `web/main.js` under Node. It caught
a prediction panel that stayed empty until the first tick, and a `navigator` assignment
that throws on modern Node. It now runs 15 checks across both storage paths — including
the isolation rule exercised through the real UI, not just the store — and all pass.

**What it does not prove:** nothing is drawn, no CSS is laid out, and the WebGPU model path
never executes. Open the page before you demo it.

---

## Part 4 — Acceptance criteria

`npm test` — **11 passed, 2 not demonstrated, 0 failed.** The suite reports three verdicts
rather than two, because recording a criterion as passed when it is not decidable would
defeat the point of having written it down.

Both non-passes are honest, and both have a stated reason:

**#8 · "Player visit entropy rises under the adaptive spawner relative to uniform."**
End-of-run entropy is confounded: a sharper spawner ends runs sooner, a shorter run visits
fewer districts, and entropy over fewer districts is lower — so the naive measurement says
the *better* predictor makes players *more* predictable, which is backwards. Measured
length-matched at tick 40 the effect is indistinguishable from zero (|t| < 0.5 on every
bot). The deeper problem is that four of the five bots are **fixed policies**: they cannot
become less predictable under pressure because they do not perceive pressure at all. This
criterion is about a human player, and a bot population can only bound it, not settle it.

**#10 · "Progress survives a browser restart and a tab close."**
The store round-trips through a fresh instance over the same backend, and a schema-1 record
migrates without data loss — both asserted. The IndexedDB adapter itself cannot be
exercised under Node. Verify by hand in a minute: play a level, close the tab, reopen the
link.

Criterion 5 is worth one note. "Top-1 accuracy beats uniform against all five bot
policies" passes for the shipping spawner on all five, by 1.5× or far more. **Tier 1
alone** beats uniform on four or five depending on seeds, and only narrowly for the
straight-line bots — for the reason in F1. The criterion is reported against the full
predictor, which is what the game actually runs.

---

## Part 5 — Not built, and what I would do next

- **The foresight overlay.** The spec's own dropped item: each patrol's predicted path
  back to you, using the prediction function pointed the other way. Still the first thing
  to add, and the groundwork is there — `I` already draws intercept targets.
- **The model path is untested.** D2. This is the largest unverified surface in the
  project.
- **Thompson sampling over spawn strategies**, the spec's listed alternative to the
  proportional controller. Roughly two hours and a stronger story; the mode plumbing and
  the benchmark harness that would judge it both already exist.
- **A human playtest.** Every balance number here is tuned against five scripted bots, and
  the bots do not dodge the way a person does. Expect to retune `chaseMovePeriod` and
  `detectRadius` after twenty minutes with real hands on it, and note that criterion 8
  cannot be settled without exactly this.
