# decisions.md — the seven requested changes

Companion to [dna.md](dna.md), which logs the original build. This file covers the change
round requested after the first playable version: what was asked, what I built, the
assumptions I had to make, what the measurements said afterwards, and the decisions that
are yours.

Same three markers as dna.md: **[YOU]** is a decision I need from you, **[ASSUMED]** is a
gap I filled, **[FOUND]** is something a measurement said that I did not expect.

> **Read first:** one of the project's headline results regressed as a direct consequence
> of these changes. It is written up in full under C7 and is not buried. Nothing is
> hidden; the acceptance suite reports it as NOT DEMONSTRATED rather than quietly passing.

---

## C1 · Retrying a district must not make it harder

**Asked:** "the difficulty of the same level should not get harder every time one restarts
it, the difficulty of the next and next levels must be tuned according to the movement of
the user."

**Built.** Two separate changes, because the request has two halves.

*Freezing.* Difficulty is now settled **once per district**, the first time you walk into
it, and stored on the profile (`difficultyByLevel`). Every retry of that district reuses
the stored numbers verbatim. The knobs panel says which state you are in — `set on first
entry` or `locked for this district` — and the loss overlay now says so in words.

*Tuning on movement.* The controller previously read one signal: how long you survived.
It now reads two, and they do different jobs:

| signal | what it moves | why |
|---|---|---|
| survival time (right-censored for wins) | arrival rate λ | how much pressure you can take |
| **your own visit entropy** | temperature τ | how legible you have been |

Temperature is the knob that exploits legibility, so entropy is the right input for it: a
player who walks the same three districts every run gets a system that commits hard to the
modal guess, and a genuine wanderer gets one that admits it does not know. Measured at
district 5 (base τ = 1.02):

| last five runs | τ | λ |
|---|---|---|
| dying fast, very predictable | 0.98 | ×0.78 |
| dying fast, very noisy | 1.50 | ×0.78 |
| winning, very predictable | **0.25** | ×1.64 |
| winning, very noisy | 0.63 | ×1.64 |

**[ASSUMED]** Entropy target is 0.55 of maximum (`ENTROPY_TARGET`), and the gain on it is
0.40 against 0.45 for survival — so movement and survival have comparable authority. Both
are constants at the top of `sim/difficulty.js`.

**[ASSUMED]** Resetting a profile also clears its settled difficulties. Keeping them would
mean a wiped profile still carried the old judgement of the player.

---

## C2 · The game moved to its own page

**Asked:** "change the playing page to a different page, when it is in the same page, it
creates some trouble using the arrow keys."

**Built.** `index.html` is now the profile picker only; the game lives at
`play.html?p=main`. `web/main.js` split into `web/launch.js` and `web/play.js`.

The fix is structural rather than another `preventDefault`. The play page sets
`height: 100vh; overflow: hidden` and scrolls the side panels internally, so there is no
document scroll for the arrow keys to compete with — which matters because once focus
lands on the spawner dropdown or a button, the browser hands arrow keys to that control no
matter what the key handler says.

**[ASSUMED]** The profile is passed in the query string rather than in storage, so the URL
is shareable and a reload keeps you in the same slot. An unrecognised value falls back to
`main` rather than erroring.

**[ASSUMED]** Below 1040px wide the page becomes scrollable again, because on a phone the
panels cannot fit beside the board and a locked viewport would hide them entirely.

---

## C3 · Human, aliens, keys, and a keys tab

**Asked:** "the user is a human, and the chasers (the red ones) are aliens. keep the yellow
dots as the keys. keep a tab at the top that says how many keys one needs to open the
portal to the next district."

**Built.** The player is drawn as a figure — head, shoulders, legs. The hunters are drawn
as three-eyed bodies with trailing tendrils that wobble as they move, and their eyes go
dark when they are actively hunting you. The yellow dots are now drawn as keys: round bow
with the hole punched through, shaft, two teeth.

The keys tab sits in the top bar and is the most prominent thing on it:

```
🔑  2 / 4   keys — 2 more to open the portal
```

and switches to a teal **portal open — get to it** the instant the last key is taken.

**[ASSUMED]** The code still calls them `caches` internally (`game.caches`,
`params.caches`, the `cacheOrdering` trait). Renaming through the sim, the predictor, the
trait registry, the generated priors and the benchmarks would touch roughly sixty call
sites to change a noun the player never sees. The UI says "keys" everywhere; the source
says `caches` and says why. Tell me if you want them renamed and I will do it as its own
commit.

---

## C4 · Water, ground, visible halved radius, lightning bolts

**Asked:** "when we stand in the safe spots, the radius of view of alien becomes half. make
this visibly seen by the user. then, add some dots, which looks like lightning bolts, with
about one or two per district, that makes you go twice as fast for three seconds. make the
safe spots design look like small patches of water, while the area to run as ground (ground
brown colour)."

**Built.**

*Visibility.* Each alien's ring is drawn at its **effective** radius rather than its
nominal one. Step into water and every ring on screen visibly contracts at the same
instant, the rings turn blue, the player turns blue, and the status readout changes from
`unseen` to `HIDDEN`. This was the cleanest way to make the rule legible: the number was
always in the sim, it was just never on screen.

*Terrain.* Ground is brown with deterministic speckle. Water is a shallow pool with a
darker centre and two glints. Both are drawn once into an offscreen layer and blitted.

*Bolts.* Three seconds (24 ticks) at two cells per tick. Picking up a second bolt refreshes
the timer rather than stacking it — two bolts give six seconds of double speed, not three
seconds of quadruple. While boosted the player leaves a yellow arc and the HUD counts the
remaining time down.

**[YOU] — bolt density.** "One or two per district" is implemented literally, and with
twelve districts that is **20–22 bolts on a ~370-cell map**, one every 17 cells. That is
much denser than it sounds, and I suspect you were thinking of the 6–10 visible rooms
rather than the 12 invisible districts the predictor uses. Measured, it is less dominant
than I feared — bots pick up 1–4 per run because runs are short — but a human who learns
the map could stay boosted most of the time. It is one line:
`boltsPerDistrict: [1, 2]` in `sim/difficulty.js`. Say the word and I will take it to
`[0, 1]`, which gives 6–8 per map.

**[ASSUMED]** Boosted movement is two cells per tick in the same direction, resolved as two
sub-steps so keys, bolts, collisions and the portal are all checked on **every cell
crossed**, not just the one you end on. The alternative — halving alien speed — would have
been invisible.

---

## C5 · The portal is hidden, and moves between attempts

**Asked:** "don't reveal where the portal is going to open at the start of the game, it
should only be revealed after all the keys are collected. and make the portal generation
location random even when one restarts the level."

**Built.** The portal is no longer part of the generated level at all. The generator
produces a list of legal sites; the portal is drawn from that list at the **start of each
run**, weighted toward the far half of the district, and is not drawn on screen until the
last key is collected. The predictor's drop-proximity feature is gated on the same flag, so
the system does not know where you will have to run either.

**[FOUND] — the first version of this silently did nothing.** The portal is chosen from the
run's RNG stream, and the browser was not passing a run seed, so every attempt defaulted to
the *level* seed and produced the same portal every time. The headless harness caught it:
*"portal never moved across 12 restarts"*. Each attempt now derives a fresh seed from
`hash(profile, district, runs logged, attempt index)` — still seeded, still reproducible,
no `Math.random` anywhere — and the same check now reports 3 distinct sites across 12
restarts.

**[ASSUMED]** Site weighting is proportional to path distance from the spawn, over the
furthest half of the room centres. The exit is never adjacent to where you start, but it is
not always the single furthest room either.

---

## C6 · Division, and hunting as a squad

**Asked:** "for every 10 seconds in the game, the number of alien count increases by one
(one of the aliens randomly chosen is divided into two)" — later amended to a random
10–15 seconds — "and all the aliens don't act independently, they act collectively... one
alien takes the left one (which is the high probability one) and the other one takes the
right one (even if it is of low probability, because that would mean all paths are
exhausted and the human (user) is trapped)."

**Built — division.** A randomly chosen alien splits in two somewhere in a window of
10–15 seconds, redrawn after each split, seeded so runs stay reproducible. The child
appears beside its parent and **inherits the parent's shift clock**, so dividing does not
buy immortality.

**[FOUND] — division broke the game's fairness guarantee, and the acceptance suite caught
it immediately.** Placing the child on any free neighbouring cell meant **128 of 1,425
placements landed inside the 8-cell floor, one of them directly adjacent to the player**.
That is exactly the failure the spawner's minimum distance exists to prevent: an alien
silently becomes two, the second is on top of you, and the death reads as the game
cheating. Divisions are now held to the same floor as arrivals, the child is placed on the
legal cell *furthest* from the player, and a division that cannot be placed fairly is
deferred two seconds instead. During a close chase this means the squad does not get to
double while it already has you cornered. Criterion 4 passes again at 1,369 placements,
closest 11 cells.

**Built — the squad.** `sim/squad.js`. Independent pursuers are a surprisingly weak threat:
each one separately descends the same field toward the same player, so they arrive in
single file along one corridor, and each one separately samples the predictor, so they all
pile into the modal district and leave every other route open. The squad now assigns
**roles and distinct districts**:

- While hunting, the nearest one or two run you down directly; the rest are posted on your
  escape routes, ranked by the predictor but assigned **without replacement** — which is
  precisely your "one takes the left, the other takes the right even if it is unlikely".
  Covering an unlikely route is not a bet that you will take it; it is how the net closes.
- While calm, each alien gets its own district, highest-probability first, so the squad
  spreads instead of converging on one guess.
- Re-planned every 6 ticks rather than every tick, because each cutoff role costs a BFS and
  a plan that changes eight times a second produces aliens that jitter instead of
  committing.

**[ASSUMED]** Coordination is **off in `uniform` mode**, so the spawner dropdown stays an
honest A/B rather than four labels over the same behaviour.

**[ASSUMED]** Division ignores the concurrent-alien cap. The cap governs *arrivals*, and a
division is not an arrival.

**[YOU] — nothing bounds the population.** At one division per 10–15 seconds with no
ceiling, a 60-second run ends with 4–5 extra aliens on top of arrivals. I have left it
unbounded because that is what you asked for and because it creates a real "get out before
the swarm" clock. If it turns out to be oppressive in play, the fix is a cap in
`_maybeSplit`, and I would suggest 8.

**[FOUND] — bots almost never experience this feature.** An efficient bot finishes a
district in about 40 ticks, or five seconds, so it never reaches the division window at
all. Measured divisions per run: beeline 0.00, wallHugger 0.00, coverCrawler 0.03, drunk
0.00, **evader 0.68** — and evader is the only bot that wanders rather than beelining. A
human exploring an unfamiliar map will be far closer to evader. This means the bot
benchmarks **cannot** tell you whether division is well tuned; only playing it can.

---

## C7 · Broken buildings

**Asked:** "add some buildings in the districts, make them look broken (design), and human
cannot go through them, but the alien can."

**Built.** `TILE.BUILDING`, drawn as a slab with a chipped top edge and a crack. 3 to 7
clusters per district by level.

This is the first thing in the project where the two agent types do not share a movement
rule, and it propagated further than anything else in this round. Every distance field now
has to declare **whose** distance it measures (`HUMAN` or `ALIEN` in `sim/pathfind.js`),
because an alien that refuses to cut through rubble is just a slow human, and a player
routed along an alien field walks into a wall.

**[ASSUMED]** Buildings are placed *after* the connectivity gate and each cluster is
**provisional**: it is written, the human's connectivity to every key and every portal site
is re-checked, and the cluster is rolled back if it sealed anything off. Placing obstacles
that can disconnect a level and not re-running the connectivity check is the obvious way to
ship a level with an unreachable key. Criterion 3 still passes at 10,000 generations, zero
failures.

**[ASSUMED]** Districts are painted over alien-passable ground so a building cell still
belongs to one — an alien standing in rubble has to report a district every tick — but a
district's *cells* and *features* are human-walkable only, so aliens never materialise
inside a building.

**[ASSUMED]** The spawner's minimum distance is now measured **as the alien travels**,
through rubble, because the honest question behind "at least 8 cells away" is how many
ticks until it can reach you.

### [FOUND] Buildings made tier 1 much better and tier 2 much less necessary

This is the significant one, and it is a regression in the project's headline claim.

Forcing the human to detour around rubble makes their position far more constrained by
geometry. Tier 1 — which knows nothing but geometry — got substantially better at
predicting the goal-driven bots:

| bot | chain-only, before | chain-only, after |
|---|---|---|
| beeline | 4.4% | 17.4% |
| wallHugger | 6.6% | 20.2% |
| coverCrawler | 8.6% | 24.1% |

And because tier 2's whole job is to supply what tier 1 lacks, its marginal contribution
shrank. Re-running the coupling selector on the changed game kept **5 couplings of 35
candidates, where it previously kept 12**, and held-out macro accuracy rose 26.9% → 30.8%
where it previously rose 23.5% → 40.4%.

**Acceptance criterion 6 therefore moved from PASS to NOT DEMONSTRATED**: the dossier still
improves 3 of 5 bots, but by about 4 points each and none of it statistically significant
(|t| < 1.2, where it was 3.8–6.0 before).

I checked the obvious suspects before concluding this. The uncertainty gate is not shutting
tier 2 out — measured mean gate during transfer runs is 0.87–0.92, wide open. Loosening the
selector to 16 couplings does buy the goal-driven bots more (+4.5, +8.7, +10.5 points) but
costs the random-walk bot 12.6, which is a worse trade on the macro objective the selector
optimises. The shipped 5-coupling table is genuinely the better choice.

**[YOU] — how do you want this handled?** Three honest options:

1. **Accept it.** It is a real and interesting result: making the map more maze-like
   transferred predictive power from the behavioural model to the geometric one. For a
   viva that is a better story than a number that only ever went up, and the suite reports
   it as not demonstrated rather than fudging it.
2. **Fewer buildings.** `buildings: lerp(3, 7, t)` → `lerp(1, 3, t)` would partly restore
   the old separation at the cost of the mechanic mattering less.
3. **Re-weight the selector toward goal-driven bots.** Defensible — a human plays like
   `coverCrawler`, not like a uniform random walker, so optimising the dossier against
   `drunk` is optimising against something nobody does. But it is also choosing the
   answer I want, so I have not done it without you saying so.

My recommendation is **1**, with the finding written up.

---

## Current state

```
npm test          11 passed · 2 not demonstrated · 0 failed
npm run webcheck  19/19
```

The two not-demonstrated criteria are #8 (needs a human; fixed-policy bots cannot become
less predictable under pressure) and #10 (needs a real browser for IndexedDB) — both
unchanged from dna.md — plus #6 above, which moved. The suite prints all three with
reasons.

### Still not verified

**None of this has been opened in a browser.** No browser tooling is available in this
session. The headless harness runs `web/play.js` against a DOM shim and checks 19 things
including the new keys tab, the hidden portal, the per-district difficulty freeze and the
division schedule — but nothing here has drawn a pixel, laid out a line of CSS, or loaded
the language model. The art in C3 and C4 is the part most likely to need another pass, and
it is the part I am least able to check.
