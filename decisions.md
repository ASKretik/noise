# decisions.md — changes, assumptions, and what the measurements said

Every change requested after the first playable build, what I actually did about it, the
assumptions I had to make, and the decisions that are yours rather than mine. Companion to
[dna.md](dna.md), which covers the original build from the spec, and to
[spec.md](spec.md), which as of 23 Oct 2026 describes the system **as built** rather than
as planned.

Three markers throughout:

- **[YOU]** — a decision I need from you.
- **[ASSUMED]** — a gap I filled, with what it cost and how to reverse it.
- **[FOUND]** — something a measurement said that I did not expect, including the times it
  said I was wrong.

## Index

| Round | Changes | The interesting part |
|---|---|---|
| [One](#round-one) | retry difficulty · own page · human/aliens/keys · water, bolts · hidden portal · division & squad · buildings | Division broke the fairness floor in 128 of 1,425 placements, one directly adjacent to the player |
| [Two](#round-two--tiers-economy-shop-hub-black-boxes-sound) | four tiers · coins & score · shop · district hub · black boxes · ambience · saves scrapped | A harness bug was hiding a passing criterion; fixing it closed criterion 10 |
| [Three](#round-three--the-whole-city-and-aliens-that-stay) | 100 districts in ten belts · aliens stop vanishing | The generated constants had gone stale and were describing a game that no longer ran |
| [Four](#round-four--belts-you-can-see-a-person-you-can-see-and-a-gun-worth-buying) | per-belt terrain · detailed human · inert stunned aliens · empty gun | The palettes had only ever coloured the hub cards, never the game |
| [Five](#round-five--the-spec-caught-up) | spec rewritten to describe what exists | The original's "score IS entropy" is a real casualty of the economy, and the spec says so |
| [Six](#round-six) | sound toggle persisted · continue-or-fresh on MAIN · guest wiped on tab close · alien speed capped at 0.75x | Reverses the original spec's deliberate choice to make guest persistent |
| [Seven](#round-seven) | ULTRA exempt from the speed cap, score x3 | The one round where the regenerate-the-constants rule correctly did **not** apply |
| [Eight](#round-eight) | mobile layout · floating thumbstick · RUN and STUN buttons · landscape hint | `100vh` is a lie on a phone; four separate causes, none of them the obvious one |
| [Nine](#round-nine) | phone tab crashes fixed | Android Chrome has `navigator.gpu`, so phones were downloading 250MB of weights — and round eight's own resize fix was churning canvases |
| [Ten](#round-ten) | win overlay was a soft lock on phones | The card was clipped by the canvas wrapper, so "enter district N" was painted outside the visible box |
| [Eleven](#round-eleven) | product-grade visual pass · opening freeze · `YOU` beacon | The freeze hung the benchmark harness: a frozen world never changes, so a bot that answers STAY once answers it forever |
| [Twelve](#round-twelve) | Shift to sprint · light/dark · vibrancy · fresh saves per build | An automatic boost had removed the player's ability to move exactly one square |

## Where things stand

```
npm test          12 passed · 1 not demonstrated · 0 failed
npm run webcheck  39/39
npm run test3d    18 passed · 0 not demonstrated · 0 failed  (3D build 20)
```

The single not-demonstrated criterion is #8, and it is not demonstrable by this harness:
four of the five bots are fixed policies and cannot become less predictable under pressure,
because they cannot perceive pressure at all. That is a question about a human player.

**Still unverified, across every round:** nothing has ever been opened in a browser. No
browser tooling has been available in any session. The headless harness proves the wiring
runs; it draws no pixels, lays out no CSS, and the ambience has never made a sound.

**Still open for you:**

- The alien population is unbounded — arrivals cap, divisions do not. A sixty-second run
  ends with four or five extras. Left that way deliberately; the cap would go in
  `_maybeSplit` and I would suggest 8.
- Bolt density is 1–2 per district × 12 districts ≈ 20 per map, which is denser than it
  sounds now that lightning is purchasable by the second. `[0, 1]` would give 6–8.
- The code still says `caches` where the UI says `keys`. Renaming touches ~60 call sites
  through the sim, the predictor, the trait registry, the generated priors and the
  benchmarks, to change a noun the player never sees.

---

<a id="round-one"></a>
# Round one — the seven requested changes

> **Note:** one of the project's headline results regressed as a direct consequence of this
> round, written up in full under C7. It later recovered — see rounds two and three — but
> the sequence is left intact rather than tidied, because how it was diagnosed is the
> useful part.

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

---

# Round two — tiers, economy, shop, hub, black boxes, sound

The second change round. Same markers. The headline: **the acceptance suite went from
10 passed / 3 not demonstrated to 12 passed / 1 not demonstrated / 0 failed**, because two
of the three gaps closed — criterion 6 recovered on its own once the seed count was raised
enough to measure it, and criterion 10 is now genuinely demonstrated rather than deferred.

---

## R1 · Four difficulty tiers, fixed at creation

**Asked:** easy = half alien speed, medium = three quarters, hard = current; chosen at the
start of the save file and not changeable. Plus (R8) a fourth tier where the aliens are
told which keys you have taken.

**Built.** `DIFFICULTIES` in `sim/difficulty.js`. `speedFactor` divides the alien tick
period, so EASY genuinely halves their movement rather than fudging detection:

| tier | alien speed | chase period, D1 → D10 | knows which keys you took | score |
|---|---|---|---|---|
| EASY | 50% | 3.50 → 3.00 | no | ×0.75 |
| MEDIUM | 75% | 2.33 → 2.00 | no | ×1.00 |
| HARD | 100% | 1.75 → 1.50 | no | ×1.30 |
| ULTRA | 100% | 1.75 → 1.50 | **yes** | ×1.70 |

The tier is asked for once, on the launch screen, when a save file is created, and there
is no path to change it afterwards — `chooseDifficulty` returns the existing value if one
is already set, so even a double-click cannot reopen the question.

**[ASSUMED]** Harder tiers multiply the score. Without that, a permanent choice would be
a permanent penalty, and nobody would pick ULTRA.

**[ASSUMED]** The tier **survives a profile reset**. It is a property of the save file
rather than of progress — resetting wipes the dossier, wallet, attempts and unlocks, but
you stay on the tier you chose.

---

## R2 · What the aliens are allowed to know (the ULTRA tier)

**Asked:** "the aliens must not get notified that the user has taken the key... for the
other three levels, the aliens will only predict the movement, but does not know which key
has been taken."

**Built.** `Game#belief`. Below ULTRA the predictor is handed a *frozen* copy of the key
list in which nothing is ever collected, and `dropUnlocked` always reads false. The
movement model is untouched — the chain and the dossier still learn exactly how you move —
but the objective-shaped features (`cacheProximity`, `cacheRank`, `dropProximity`) are
computed against what the aliens believe rather than what is true. At ULTRA they get the
real state.

**[ASSUMED]** Below ULTRA they also never learn the portal has opened, since that is a
direct consequence of the last key being taken. Letting them infer it would be exactly the
notification the brief says they must not get.

---

## R3 · Coins, and a score that is not coins

**Asked:** coins on the map worth 1/2/5/10 in different colours, 10–15× the district number
in total value, 5× for clearing. Score = speed bonus + coins bonus + stun bonus, decaying
with replays.

**Built.** `sim/score.js`:

```
speed = 400 × clamp(par ÷ ticks, 0, 2)        0 unless you actually finished
coins = coin VALUE collected × 8
stuns = aliens stunned × 120
keys  = keys collected × 50                   partial credit on a loss

score = (speed + coins + stuns + keys)
        × (1 + 0.15 × (district − 1))          deeper is worth more
        × 1 ÷ (1 + 0.35 × (attempts − 1))      1.00, 0.74, 0.59, 0.49, 0.42 …
        × tier multiplier
        × (won ? 1 : 0.25)

coins paid = floor(score ÷ 60)
```

`par` is computed per run from a greedy nearest-key route plus the run to that run's
portal, ×1.35 for slack — so it is a fair target rather than a speedrun record, and it
moves with the portal.

**Measured economy**, first clear of each district at par with every coin collected:

| district | score | coins from score | + map | + clear | total |
|---|---|---|---|---|---|
| 1 | 850 | 14 | 13 | 5 | 32 |
| 5 | 2,296 | 38 | 63 | 25 | 126 |
| 10 | 5,041 | 84 | 125 | 50 | 259 |

Districts 1, 3, 5, 8 and 10 cleared once come to **698 coins** — about one stun gun. That
is the intended pace.

**[ASSUMED]** Attempts are counted when a run **starts**, not when it ends. Counting on
completion would make the replay decay trivially avoidable by quitting out of any run that
was going badly.

**[ASSUMED]** Only the score share decays with replays. Coins picked up off the floor and
the clear bonus pay in full every time, because you asked for farming to be possible — what
decays is the record, not the wage.

---

## R4 · The shop

**Asked:** stun gun 500 coins, 6 bullets, 100 per bullet, stuns for five seconds. Lightning
at 10 coins a second, used at will with **L**. Stun gun fires with **E** and stuns every
alien whose visible range you are in, one bullet each.

**Built.** `sim/shop.js` owns the rules; `districts.html` owns the buttons.

- **Stun gun, 500** — arrives loaded with all six charges, which is why it costs five
  bullets' worth rather than one.
- **Charge, 100 each** — reloads up to six. The shop refuses and says why when the gun is
  already full or not yet owned.
- **Lightning, 10 per second** — banked, up to 60s. `L` toggles it; it drains only while
  switched on, and the sim refuses the toggle when the bank is empty so the HUD can never
  claim lightning you do not have.

**E** stuns every alien **whose detection ring currently contains you**, nearest first, one
charge each — not every alien in the district. It refuses cleanly when nothing is in range
rather than wasting a charge.

**[ASSUMED]** The run spends from a **copy** of the inventory and the profile is debited
only when the run ends, so a closed tab mid-district does not silently eat someone's
charges.

**[ASSUMED]** A second bolt refreshes the timer rather than stacking it — two bolts are six
seconds of double speed, not three seconds of quadruple.

---

## R5 · The district hub

**Asked:** after choosing the save file, go to a district tab with all districts as widgets,
unlocked and locked visible, and a colour theme change every 10 districts.

**Built.** `districts.html`. Flow is now **profile → hub → district**, with the shop as a
tab on the hub. Four themes — RUST, TIDE, MOSS, EMBER — cycling every ten districts, each
block under its own heading, each card carrying its attempt count and best score.

**[ASSUMED]** Themes **cycle** through four hand-picked palettes rather than being
generated from the district number. A procedurally rotated hue reads as a bug by about
district 30; four deliberate schemes read as deliberate forever.

**[ASSUMED]** The grid shows every unlocked district plus the rest of the current block of
ten, so there is always something visibly locked ahead to aim at.

---

## R6 · Black boxes

**Asked:** two or three translucent black boxes per district; safe spots where the alien
forgets where the user went, and which aliens cannot enter.

**Built.** `TILE.SAFE`. Aliens cannot enter, and while you are inside: nothing can see you,
the alert drops to zero, and `lastKnown` is erased. It is not better cover — it is erasure,
which is what makes it a way *out* of a chase rather than a slightly better hiding place.
The board dims and your cell is outlined while you are in one.

**[ASSUMED]** Each box is placed provisionally and rolled back if it broke **alien**
connectivity. Buildings only had to preserve the human's connectivity; a black box blocks
aliens, so one laid across the single corridor between two halves of a map would leave half
the district permanently unreachable by anything hunting you. The rollback checks the other
side of the asymmetry.

**[ASSUMED]** Aliens never spawn inside one. `isSharedGround` is the new predicate: an
alien may only arrive where **both** can stand.

---

## R7 · The ambience

**Asked:** an ominous background sound at three speeds — slow normally, faster when an
alien spots you, very fast when you are inside half its visibility.

**Built.** `web/sound.js`, entirely synthesised: two detuned sawtooths through a wobbling
lowpass, plus a pulse whose **rate** is the actual information — 46 bpm calm, 104 when
seen, 168 when you are well inside the ring. The drone opens up and the filter widens with
each step, and the threat state is derived in one place from the same numbers the screen is
showing, so the audio cannot disagree with the picture.

**[ASSUMED]** No audio files. The tempo has to be continuous with the threat, and
crossfading three loops at 8 Hz is heavier, worse, and would put binaries in a repository
that currently deploys as a static upload with no dependencies.

**[ASSUMED]** Audio starts on the first keypress or tap, because browsers refuse to start
it any other way. There is a sound toggle in the top bar.

---

## R8 · Old saves were scrapped

**Asked:** "scrap the save files that are already present. just create a fresh file for both
main and guest."

**Built.** The IndexedDB version is bumped and the object store is dropped and recreated on
upgrade, and `migrate()` now **refuses** any record below the current schema rather than
upgrading it. Both slots show as new files and ask for a tier.

**[ASSUMED]** Refusal rather than migration is the right call beyond just doing as asked:
every score and every settled district in an old file was produced under rules that no
longer exist, and there is no honest answer to "which tier was this played on" for a file
written before tiers. Carrying it forward would attach real history to an invented tier.

---

## What the measurements say now

```
npm test          12 passed · 1 not demonstrated · 0 failed
npm run webcheck  27/27
```

**[FOUND] — criterion 6 recovered, and the earlier regression was partly a measurement
problem.** Last round it read NOT DEMONSTRATED at 6 seeds. At 14 seeds it passes: the
dossier improves 4 of 5 bots, beeline significantly (+5.4pp, t = 2.03). The per-bot margins
are genuinely noisy at low seed counts and criterion 5 flips on seed choice alone, so the
suite's default is now 14 rather than 10. The underlying finding from last round still
stands — buildings made tier 1 stronger and the margins narrower — but "not demonstrated"
was partly me under-sampling. The evader remains a real and reportable loss (−9.3pp,
t = −4.03): a deliberately noisy player is exactly what trait-based reweighting cannot help
with.

**[FOUND] — criterion 10 is no longer deferred.** The DOM shim now implements enough
IndexedDB to drive `web/persist.js` for real, shared across pages the way a browser origin
is. That started as a bug fix — each page was getting its own memory store, so every
cross-page check in the harness was meaningless — and ended up closing the one criterion
that had been waiting on a browser. The suite now writes a tier, a dossier, a wallet, an
inventory, an attempt count and a best score, reopens the store over the same storage, and
checks all nine survive.

**[YOU] — the alien population is still unbounded.** Unchanged from last round and now more
pressing, because EASY and MEDIUM make runs last long enough to actually reach several
divisions. A 60-second run ends with four or five extra aliens on top of arrivals. Still
left as asked; the cap would go in `_maybeSplit` and I would suggest 8.

**[YOU] — bolt density is still 1–2 per district × 12 districts ≈ 20 per map.** Unchanged
and still one line. Now that lightning is also purchasable by the second, the free ones on
the floor may be redundant enough to cut to `[0, 1]`.

### Still not verified

**Nothing in this round has been opened in a browser either.** The 27 headless checks cover
the tier chooser, the hub, the shop's arithmetic, the loadout crossing into a district, E
and L, black boxes and the score payout — but no pixel has been drawn, no CSS laid out, and
the ambience has never made a sound, because there is no AudioContext in Node. The audio
and the new art are the parts most likely to need another pass.

---

# Round three — the whole city, and aliens that stay

Two reported bugs, one of which had a clean root cause worth writing down.

## R9 · Aliens were vanishing and reappearing — fixed

**Reported:** "the aliens randomly vanish and reappear. why does this happen? fix that.
they need to stay on the map all the time."

**Cause, exactly.** Every alien drew an exponential shift length and retired through
`_retirePatrols()` once it was *calm* and *off-screen*, where off-screen meant more than a
detection radius or so from the player. That guard is nonsense in this game: the entire
32×20 district is on screen at all times, so **there is no off-screen**. Every retirement
happened in plain view. From the player's side an alien simply blinked out and another
blinked in somewhere else a few seconds later — which is exactly what was reported.

The mechanic itself was added for a real reason (see A4 in dna.md): a pure arrival process
saturates at the concurrent cap and stays there. But the cap already does that job on its
own — arrivals stop at `maxPatrols` — and a population pinned at its cap is a design
choice, not a bug. The guard was the mistake, not the cap.

**Built.** `_retirePatrols` is gone, along with `patrolLifetime` and the per-alien
`expiresAt`. Aliens now never leave. The population is: one at the start, arrivals up to
the cap, plus divisions, which deliberately ignore the cap. Verified over a long run —
**the alien count never decreases, at any point, for any reason**. The bench's old `E[N]`
column (λ × lifetime) is replaced by `fill`, the expected ticks for arrivals to take a
district from its first alien to the cap.

**[ASSUMED]** Arrivals still appear from nothing, at least 11 cells away and outside your
detection range. That is a deliberate constraint rather than an oversight — there is no map
edge for them to walk in from — and it is what acceptance criterion 4 checks.

---

## R10 · All 100 districts, ten belts of ten

**Asked:** "only 10 districts are visible, there needs to be 100 districts visible, 10 each
in same colour palette."

**Built.** `web/themes.js`: `TOTAL_DISTRICTS = 100`, ten palettes — RUST, TIDE, MOSS,
EMBER, VIOLET, ASH, CORAL, JADE, SOLAR, COBALT — one per belt of ten, each belt under its
own named heading. Everything is visible from the first run; districts past the furthest
you have opened render locked.

**[ASSUMED]** Ten hand-picked palettes rather than a hue rotated by block number. A
generated hue lands on muddy olive or near-black somewhere around belt seven and reads as a
bug. Each belt also names its palette in the heading, so the grouping never rests on colour
alone.

**[ASSUMED]** The themes moved out of `districts.js` into `web/themes.js`. The page
controller boots itself on import, so anything wanting just the constants — the harness,
for one — could not touch them without running a whole page. That was a real failure while
writing the test for this.

**Worth knowing:** the difficulty curve still caps at district 10, per the original spec's
"cap the curve so it stays playable rather than becoming a wall". Districts 11 through 100
are all generated at full pressure and are all different maps (the seed is the real district
number), but they do not get progressively harder. What does keep changing is the file on
you. The hub says this in as many words.

---

## [FOUND] The generated constants had gone stale, and that was the real regression

Criterion 6 read NOT DEMONSTRATED again after this round, and the honest first move was to
get more data rather than lower the bar. At 40 seeds the picture was clear and bad: the
dossier helped 4 of 5 bots but none significantly, while its *cost* on the evader was
strongly significant (−7.6pp, t = −3.41).

The cause was not the predictor. `sim/predictor/priors.js` and `couplings.js` are
**generated** from the bot population, and they had last been generated before black boxes,
coins, persistent aliens and the difficulty tiers existed. They were describing a game that
no longer ran. Regenerating both against the current game:

| bot | chain only | chain + dossier | before regeneration |
|---|---|---|---|
| beeline | 7.8% | **24.2%** (+16.4pp) | +4.5pp |
| wallHugger | 10.9% | **25.7%** (+14.9pp) | +1.4pp |
| coverCrawler | 13.7% | **19.7%** (+6.1pp) | +3.1pp |
| evader | 29.2% | 28.4% (−0.7pp) | **−7.6pp** |
| drunk | 83.8% | 83.5% (−0.3pp) | +2.7pp |

Held-out macro accuracy went 29.1% → 36.3%, and the evader's loss shrank from significant
to noise. Criterion 6 is back to **PASS**.

The lesson is about the project rather than the model: once constants are derived from
measurement, they are a build artefact of the game as it stood, and changing the game
invalidates them as surely as changing the code. `npm run priors && npm run couplings`
belongs in the routine after any mechanical change, and it is now the first thing to try
when a prediction result moves for no visible reason.

**[FOUND] — the benchmarks had quietly started measuring at MEDIUM.** `levelParams()`
defaults to MEDIUM because that is the right default for a new player, and the harness
inherited it the moment tiers were added — slowing every alien by 25% in every benchmark,
for a reason with nothing to do with prediction. All of `/bench` now pins `BENCH_TIER =
'hard'` explicitly. This did not turn out to be what moved criterion 6, but it was wrong
regardless and would have made every future comparison incomparable with every past one.

## Current state

```
npm test          12 passed · 1 not demonstrated · 0 failed
npm run webcheck  27/27
```

The single not-demonstrated criterion is #8, which needs a human: fixed-policy bots cannot
become less predictable under pressure because they cannot perceive pressure at all.

---

# Round four — belts you can see, a person you can see, and a gun worth buying

## R11 · The palettes never touched the game

**Reported:** "the colour palette for tide is not different from rust. it is the looks the
same brown tiles."

**Correct, and the diagnosis is embarrassing but simple: the themes only ever coloured the
hub cards.** `DISTRICT_THEMES` supplied an accent and a tint for the district widgets, and
the renderer painted terrain from a fixed set of constants that happened to be brown. Belt
eleven looked exactly like belt one because, in the district itself, it *was* belt one.

**Built.** Each belt now carries a full `terrain` scheme — ground, ground alternate, wall,
wall edge, water, deep water, building, building top — and the renderer takes the belt
through `setDistrict(level)`. The cached terrain layer keys on the theme name, so crossing
a belt boundary repaints it.

| belt | districts | ground |
|---|---|---|
| RUST | 1–10 | warm brown |
| TIDE | 11–20 | blue-grey stone, teal water |
| MOSS | 21–30 | olive green |
| EMBER | 31–40 | warm charcoal |
| VIOLET | 41–50 | purple-grey |
| ASH | 51–60 | neutral concrete |
| CORAL | 61–70 | dusty rose |
| JADE | 71–80 | deep green-teal |
| SOLAR | 81–90 | bleached sand |
| COBALT | 91–100 | deep blue steel |

**[ASSUMED]** Coins, lightning, keys, aliens, the portal and the player keep the same
colours in every belt, exactly as asked. Those are the game's vocabulary — gold means a
five, red means alien — and repainting them per belt would force the player to relearn the
board every ten districts. Only the *place* changes.

**[ASSUMED]** EMBER and CORAL are a warm charcoal and a dusty rose rather than the red
their names suggest. The aliens are red; a red floor would bury them.

**[ASSUMED]** Black boxes stay black in every belt, edged in the belt accent. The box reads
as a hole in the map, and a hole has no hue.

**[FOUND] — buildings were nearly invisible, in every belt.** Rendering six sample
districts to an image and looking at them turned up something the hex values alone did not:
the building fill sat one shade off the ground. That is unacceptable for the one piece of
terrain the player cannot cross and the aliens can — not seeing it means not understanding
why something reached you. Every belt's building colour is now pitched roughly halfway
between its ground and its wall, with a clearly lighter top edge.

---

## R12 · A person, not a token

**Asked:** "make the human look more human, there is very less amount of details on the
human's design."

**Built.** Head with a hair crown and eyes, a collar, a jacket in a dimmer tone, arms that
swing, legs that alternate, and the whole figure turns to face the way it is walking —
walking away from the camera shows the back of the head with no eyes, walking sideways
shows one.

**[ASSUMED]** Detail at a 20-to-26 pixel tile has to come from silhouette and two or three
tones, not linework — anything finer turns to mush. So the readable parts are a dark crown
against a bright body, a dimmer jacket separating the trunk from the limbs, and motion.

**[FOUND]** The first attempt put the hair cap low enough that it read as sunglasses: the
face had nowhere to be. Caught by rendering the real `_drawHuman` and looking at it (see
below), then fixed by raising the head and cutting the hair back to the crown.

### How both of these were checked without a browser

I still cannot open the game, so for this round I built two throwaway renderers in the
scratchpad: one that emits a sample district as SVG from the belt palettes, and one that
**records the actual `_drawHuman` canvas calls and replays them as SVG** — a tiny
transform-aware shim over `save`/`restore`/`translate`/`rotate`/`fillRect`/`arc`/`fill`. The
second matters because it renders the shipped code rather than a reimplementation of it.
That is how the sunglasses and the invisible buildings were caught. It still proves nothing
about CSS layout or the ambience.

---

## R13 · A stunned alien is inert

**Asked:** "if you run into a stunned alien, it should not end the game, the stunned alien
is void, it does nothing for the duration it is stunned."

**Built.** `_isInert()` now gates collision and the swap check as well as sight and
movement. For the full five seconds a stunned alien cannot see, cannot move, and cannot
catch you — walking over one is free.

This is what makes the gun worth 500 coins. Without it the charge bought a pause and
nothing else: you would still have had to go around something lying on the floor, which in
a one-wide corridor means the gun could not open the route it was fired to open.

---

## R14 · The gun arrives empty

**Asked:** "when you buy the gun, it should not come preloaded. it should be empty, even at
the first purchase. then only it makes sense to purchase the bullets."

**Built.** The 500 coins buy the frame. Charges are 100 each, up to six, and the shop
refuses them outright until the gun is owned. A full kit is now **1,100 coins** — gun plus
six charges — which is roughly a full pass through districts 1 to 10.

The old behaviour was mine, not yours, and it was wrong for exactly the reason you give:
shipping six free charges made the first magazine free and the charge price decorative.

## Current state

```
npm test          12 passed · 1 not demonstrated · 0 failed
npm run webcheck  29/29
```

---

<a id="round-five--the-spec-caught-up"></a>
# Round five — the spec caught up

**Asked:** "modify the spec file in accordance to the changes you have made so far."

**Built.** `spec.md` now describes the system as built rather than as planned. It keeps the
original's shape — scope and non-goals, architecture, rules, districts, predictor,
spawning, profiles, dispatch, acceptance criteria, open questions — and replaces its
contents with what is actually there: four tiers, the coin economy and the score equation,
the shop, 100 districts in ten belts, water and rubble and black boxes, division and the
squad, the two-signal controller, the generated constants, and the real acceptance table
with its one honest failure.

**[ASSUMED]** The original spec is **not** preserved as a separate file. It is in git
history (`git log --follow spec.md`), and every departure from it is recorded here and in
dna.md with the reasoning. Keeping a stale copy beside a current one invites reading the
wrong one; keeping the provenance in version control and the reasoning in two change logs
loses nothing.

**[ASSUMED]** The revised spec carries a `Departures from the original spec worth naming`
table — eight rows, each with the reason. The point of a spec that has been overtaken is
not to pretend it was always right; it is to make the distance between plan and result
legible.

### The departure worth arguing about

The original spec had one genuinely elegant idea that this project has partly given up:

> "Scoring is entropy. Your run score is the Shannon entropy of your own visit histogram…
> The evaluation metric and the win condition are deliberately the same quantity: the
> system wins by turning you into signal, and you win by staying noise."

The score is now a compound of speed, coins, stuns and keys, scaled by district, tier and
replay count, because the coin economy needed a score that responds to the things a player
actually does. Entropy survives in two places — the HUD's **noise index**, and as the
controller's movement signal, where it drives temperature — but it is no longer *the*
score, and the sentence above is no longer strictly true of the game.

That is a real loss and I have not papered over it in the spec. **[YOU]** If the
one-quantity claim matters more than the economy does, the fix is to make entropy a term in
the score equation rather than a separate readout — it would slot in beside `coins` and
`stuns` with a weight — and I would want you to pick the weight rather than invent it.

### What was already current

The four rounds above were written as each one landed, so nothing needed backfilling. The
only gap was the tail of round four: criterion 10's persistence check asserted six charges
after buying the gun, which was only true while the gun shipped loaded. I committed the
round-four changes **before** reading the test output and caught it one commit later. The
test was stale, not the code — but reading the suite before committing is the point of
having it.

---

<a id="round-six"></a>
# Round six — sound, save files, and a speed cap

The last round before the first public deploy.

## R15 · The sound toggle

**Asked:** a sound button in the top bar of the district.

**Already there, and now worth something.** The button has existed since round two but it
forgot the choice the moment you entered another district. It now stores `soundEnabled` on
the profile, carries a CSS-drawn speaker that is struck through when off, and sets
`aria-pressed` — so the state is not carried by colour alone.

**[ASSUMED]** The preference lives on the profile rather than in `localStorage`, so the
two slots can disagree. Guest handing the laptop back with the sound muted should not mute
it for the owner.

---

## R16 · Continue, or start fresh

**Asked:** "everytime when you open the main file path, ask the user whether he wants to
load the previous game or start a fresh file. If they start a fresh file then, it should
erase the previous file, forget the model weights and start from first."

**Built.** MAIN now shows both actions side by side whenever a file exists: **continue**
goes to the hub, **start fresh** erases and returns to the tier chooser.

"Forget the model weights" is `ProfileStore.eraseActive()`, and it is deliberately stronger
than the existing in-game reset: it clears the **tier** as well, so the next load is a new
save file and the tier is asked again. Gone with it: the dossier (every trait learned about
how this player moves), progress, wallet, inventory, attempt counts, best scores and the
settled per-district difficulties.

**[ASSUMED]** It confirms first, and the confirmation **names what is being destroyed** —
the district reached, the coin balance, and how many districts deep the dossier runs. The
dossier is the only thing in this project that takes real time to build, and a one-click
irreversible wipe of it with a generic "are you sure?" would be the single worst piece of
UX in the game.

**[ASSUMED]** Tier 1 needs no explicit clearing. The chain is held in memory per district
for the lifetime of a page session, so a fresh file is a fresh chain by construction.

---

## R17 · Guest resets when the tab closes

**Asked:** "the guest file should be from level one scratch every time the link is closed."

**Built.** `ensureGuestSession()` in `web/persist.js`, called from all three pages so a
direct link into the hub or a district cannot bypass it.

**[ASSUMED]** The marker is `sessionStorage`, not a timestamp or a flag in the save. The
browser clears it exactly when the tab closes and not before, which gives precisely the
behaviour asked for: a guest is wiped between sessions but **not** halfway through their
own run, and reloading or walking between launch, hub and district keeps their progress.
With storage blocked entirely, it falls back to treating every load as a new session —
erring toward wiping a slot that is meant to be disposable.

**This reverses an explicit decision in the original spec**, which argued guest should be a
persistent second save "so a friend who comes back next week keeps their levels". The slot
now exists purely for the hand-the-laptop-over contrast, and that demo is strongest when it
starts blind every single time. Recorded rather than quietly changed, because the original
reasoning was good and is now simply not what the game does.

---

## R18 · Alien speed capped at 0.75×

**Asked:** "cap the maximum speed of the alien speed to 0.75 times of whatever it is
currently. then update each of the levels speed according to this new capped speed."

**Built.** One constant, `ALIEN_SPEED_CAP = 0.75` in `sim/difficulty.js`, multiplying every
tier's speed factor.

| tier | was | now | chase period D1 → D10 |
|---|---|---|---|
| EASY | 0.500 | 0.375 | 4.67 → 4.00 |
| MEDIUM | 0.750 | 0.5625 | 3.11 → 2.67 |
| HARD | 1.000 | 0.750 | 2.33 → 2.00 |
| ULTRA | 1.000 | **1.000 — exempt, see R19** | 1.75 → 1.50 |

**[ASSUMED]** Capping the *maximum* and rescaling the others, rather than clamping each
tier independently. The tiers are defined relative to the fastest alien — EASY is half of
HARD, MEDIUM three-quarters — and clamping each one separately would have collapsed those
relationships. This reading keeps them exact.

**[ASSUMED]** "Update each of the levels" needs no second table. An alien's tick period is
the base period divided by its speed factor, so one constant cascades to all ten districts
and all four tiers automatically. A per-district speed table would be a second source of
truth to keep in sync, and it would drift.

The fastest alien in the game now covers **half a cell per tick** against the player's one.
Measured at HARD across districts 1–6, win rates moved to beeline 27%, wallHugger 24%,
evader 24%, coverCrawler 18% — a few points easier, as intended.

---

## [FOUND] The constants needed regenerating again, and this time I expected it

Round three's lesson applied immediately: changing alien speed changes trajectories, which
changes what the bots look like, which invalidates `priors.js` and `couplings.js`. Running
both generators before touching the acceptance suite:

| bot | chain only | chain + dossier |
|---|---|---|
| beeline | 9.0% | **23.0%** (+14.1pp) |
| coverCrawler | 16.3% | **27.0%** (+10.8pp) |
| wallHugger | 14.8% | **24.1%** (+9.3pp) |
| evader | 36.1% | 36.6% (+0.5pp) |
| drunk | 78.1% | 77.5% (−0.7pp) |

Held-out macro 30.8% → 37.6%, 4 of 5 bots improved, and the evader — a persistent small
loss for three rounds — is now neutral. Selection kept **12 couplings of 35 candidates**.

This is the routine working as intended rather than a discovery: `npm run priors &&
npm run couplings` after any mechanical change, before reading the suite.

## Current state

```
npm test          12 passed · 1 not demonstrated · 0 failed
npm run webcheck  32/32
```

---

<a id="round-seven"></a>
# Round seven — ULTRA stops being a footnote

## R19 · ULTRA runs uncapped, and pays triple

**Asked:** "make the speed at ultra as 100 percent, not at 0.75 percent, and also make the
score as x3."

**Built.** `ALIEN_SPEED_CAP` now applies to EASY, MEDIUM and HARD only. ULTRA keeps a speed
factor of 1.0 and its score multiplier goes from ×1.70 to ×3.00.

| tier | speed factor | chase period D1 → D10 | cells/tick at D10 | score |
|---|---|---|---|---|
| EASY | 0.3750 | 4.67 → 4.00 | 0.25 | ×0.75 |
| MEDIUM | 0.5625 | 3.11 → 2.67 | 0.38 | ×1.00 |
| HARD | 0.7500 | 2.33 → 2.00 | 0.50 | ×1.30 |
| **ULTRA** | **1.0000** | **1.75 → 1.50** | **0.67** | **×3.00** |

This is a better shape than what it replaces. Previously ULTRA was HARD with one extra
piece of information, which made it a footnote on another tier rather than a tier. Now the
cap is something the three ordinary settings sit under and ULTRA is the one that is exempt
— nothing held back, and the payout says so.

**[ASSUMED]** The exemption is written as an exemption rather than by giving ULTRA its own
number. `speedFactor: 1.0` with a comment beside the three that carry `* ALIEN_SPEED_CAP`
makes the asymmetry visible at the point it happens; a bare `0.75` next to a bare `1.0`
would read as an oversight within a month.

**Measured**, competent-player bot across districts 1–6:

| tier | win rate | mean survival |
|---|---|---|
| EASY | 63% | 64t |
| MEDIUM | 53% | 53t |
| HARD | 40% | 47t |
| ULTRA | 20% | 43t |

A clean monotone ladder, and **ULTRA is still winnable** — one run in five. That matters:
at a speed factor of 1.0 an alien covers 0.67 cells per tick at district 10 against the
player's 1.00, so it is fast but still slower than you, and breaking contact to outrun a
twenty-tick alert remains possible. The thing that must never happen is parity, where an
adjacent hunter has already won because the gap can never change.

**[FOUND] — nothing needed regenerating this time, and the reason is worth stating.** My
own rule from round three is to run `npm run priors && npm run couplings` after any
mechanical change. It did not apply here: every benchmark is pinned to `BENCH_TIER = 'hard'`
and HARD's speed factor is unchanged, so the recorded corpus the constants are selected
against is byte-for-byte the same game. Checking that the rule applies is part of following
it — regenerating anyway would have burned a minute and introduced seed churn into two
checked-in tables for no reason.

## Current state

```
npm test          12 passed · 1 not demonstrated · 0 failed
npm run webcheck  32/32
```

---

<a id="round-eight"></a>
# Round eight — playable on a phone

**Reported:** "while playing in phone, the game screen is not aligned properly."

## What was actually wrong

Four separate causes, none of them the one that is usually blamed:

1. **`height: 100vh`.** On a phone `vh` includes the collapsible address bar, so the layout
   was taller than what is on screen and the board slid off the bottom. `100dvh` with a
   `100vh` fallback fixes it, and the renderer now sizes against `visualViewport` rather
   than `innerHeight`.
2. **Below 1040px the layout reverted to `overflow: auto`.** The board, the status strip and
   five panels of diagnostics stacked into one scrolling column, so the board scrolled out
   of view the moment you touched anything.
3. **The canvas height was `innerHeight - 210`** — a desktop-shaped guess. It now measures
   the board's own top offset and the status bar's real height, because the top bar wraps
   to a different number of rows at different widths.
4. **No `touch-action: none`.** Dragging scrolled the page or triggered pull-to-refresh
   instead of moving.

## R20 · Thumb controls

**Asked:** "there should be two buttons, stun and run, as two translucent buttons one on
each side of screen. the movement should be via touch, similar to games like shadow fight,
call of duty."

**Built.** `web/touch.js`. Left zone is a **floating** virtual stick, right side carries
**RUN** (lightning) above **STUN**, both translucent circles.

**[ASSUMED]** The stick floats — its base appears wherever your thumb lands inside the left
zone — rather than being painted at a fixed spot. On a phone you cannot see your own thumb,
so a fixed pad means hunting for its edge; a floating one is always exactly where you put
it. This is what the games named in the request do.

**[ASSUMED]** The stick resolves to one of **four** headings by dominant axis, with a 16px
deadzone, rather than to a continuous angle. The sim is four-directional on a grid; mapping
360 degrees onto it any other way manufactures diagonal inputs the game cannot express,
which feel like dropped frames.

**[ASSUMED]** "Run" is mapped to banked lightning (the `L` toggle) rather than to a separate
sprint. There is no other run in the game, and the button lights up while it is draining so
the toggle is visible. STUN shows its remaining charge count and dims when empty.

**[ASSUMED]** The controls appear only behind `(hover: none) and (pointer: coarse)`. A mouse
never gets a thumbstick.

## R21 · The rest of the layout

**[ASSUMED]** On a phone the five readout panels become a **slide-up sheet** behind a
`readouts` button rather than a column under the board. They are diagnostics competing with
the board for the only scarce resource on a phone, which is height.

**[ASSUMED]** In **landscape** the status strip under the board is hidden entirely and the
top bar is slimmed. Everything on that strip that matters — district, tier, keys, wallet —
is already in the top bar, so it was charging height for a duplicate. Worth 2 tiles:

| device | tile size | board |
|---|---|---|
| iPhone 14 landscape | 14px (was 12) | 448 × 280 |
| Pixel 7 landscape | 15px | 480 × 300 |
| iPad landscape | 31px | 992 × 620 |

**[ASSUMED]** Portrait on a phone shows a **rotate hint** rather than rendering the board.
The district is 32 × 20 — 1.6:1 — and in portrait it is a strip about a third of the usable
height. Telling someone to turn the phone is better than handing them something unplayable.

**[ASSUMED]** Safe-area insets on all four edges, `overscroll-behavior: none` to kill
pull-to-refresh, and `touch-action: none` on the canvas and every control.

### Still unverified, and this is the round where it matters most

**I have never opened this on a phone, or in any browser.** The 33 headless checks confirm
the stick resolves to the right headings with a deadzone, that the buttons reach the same
handlers the keys do, and that none of it engages for a mouse — but no pixel has been
drawn and no CSS laid out. The tile sizes above are computed from the renderer's own
arithmetic against known viewport sizes, not observed.

The fastest way to check it properly is the live link on an actual phone. Chrome DevTools
device emulation will catch layout but **not** the `dvh` behaviour, because the address bar
it simulates does not collapse.

## Current state

```
npm test          12 passed · 1 not demonstrated · 0 failed
npm run webcheck  33/33
```

---

<a id="round-nine"></a>
# Round nine — why the phone kept reloading

**Reported:** "why does the webpage keep breaking and asking to reload in phone?"

That prompt — Safari's "a problem repeatedly occurred", Chrome's reload banner — is the
browser killing the tab for memory. Two causes, both introduced by me, and together they
are more than enough.

## [FOUND] Cause one: the phone was downloading a quarter of a gigabyte of model weights

`dispatch.js` gated the language model on one condition: `navigator.gpu` exists. **Chrome
on Android exposes `navigator.gpu`.** So the check passed on a phone, and 2.5 seconds into
the first district the page began pulling ~250 MB of SmolLM2 weights and handing them to a
mobile GPU. Mobile browsers kill a tab well below that.

The reasoning in the original spec was about *capability* — "WebGPU needs Chrome 113 or
Edge" — and I implemented exactly that check. Capability was never the whole question;
whether the device can survive the download is a separate one, and I did not ask it.

**Fixed** with `modelAdvisable()`, which refuses on any of: a coarse pointer, a `saveData`
connection, or `navigator.deviceMemory` under 4 GB. Everything refused gets the templated
dispatcher, which is instant, costs nothing and is written in confidence tiers so it still
tracks the predictor. `load({ force: true })` overrides for anyone who wants to try.

## [FOUND] Cause two: every address-bar twitch reallocated the canvas

Round eight wired `renderer.resize()` to `visualViewport`'s resize event so the board would
follow the real visible height. On a phone that event fires **continuously** while the
address bar collapses and expands — many times a second during ordinary play.

`resize()` had no early-out. Every one of those events:

- reallocated the main canvas backing store (~2 MB at dpr 2), and
- set `_mapKey = null`, forcing the next frame to build a **fresh offscreen terrain
  canvas**.

Hundreds of megabytes of garbage in seconds. The fix I shipped to make the board fit the
screen is what made the tab die.

**Fixed** three ways:

1. `resize()` is now **idempotent** — if the computed tile size, dpr and canvas width are
   unchanged it returns immediately, touching nothing.
2. The terrain layer is explicitly released when replaced (`width = height = 0`), because
   dropping the reference alone leaves GPU-backed memory pinned on Safari until a GC that
   may not arrive.
3. `refit()` in `play.js` is coalesced to one call per animation frame.

Regression test: 200 identical `resize()` calls must change no tile size, reallocate no
canvas and rebuild no terrain layer.

**[ASSUMED]** The touch-device model refusal is a flat rule rather than a memory
measurement at load time. `deviceMemory` is coarse (Chrome caps it at 8) and absent on
Safari entirely, so a measurement would be a guess dressed up as a number. A phone not
downloading a 250 MB model is the right default regardless of how much RAM it claims.

## Current state

```
npm test          12 passed · 1 not demonstrated · 0 failed
npm run webcheck  35/35
```

---

<a id="round-ten"></a>
# Round ten — the next district was unreachable on a phone

**Reported, with a screenshot:** "i am unable to go to the next level."

The screenshot showed the win overlay on a landscape phone: the headline **THROUGH THE
PORTAL** sliced off at the top, the score breakdown overflowing its card, the RUN and STUN
buttons floating on top of it — and no sign of *enter district 2*.

## [FOUND] The card was being clipped, not scrolled

`.overlay` was `position: absolute; inset: 0` **inside `.canvas-wrap`**, which carries
`overflow: hidden` to keep the board's rounded corners. On a landscape phone the card —
title, body, fifteen rows of score itemisation and two buttons — is far taller than the
board. So it was centred, it overflowed, and it was then **clipped**. The title was cut off
at the top and the primary button was rendered outside the visible box entirely.

Not a styling nitpick: it is a **soft lock**. Winning a district on a phone left no way to
advance, and the only escape was the browser back button.

**Fixed:**

1. **The overlay is `position: fixed` to the viewport**, out of that clip, with
   `overflow-y: auto` so a card taller than the screen scrolls instead of being silently
   truncated.
2. **The buttons come before the breakdown on small screens**, via flex `order`. Fifteen
   rows of itemisation is desktop content; on a phone it pushes the only two controls that
   matter off the bottom. Now "enter district N" is the first thing under the headline,
   every time, without scrolling.
3. **`white-space: nowrap` removed from stat values on small screens.** It is right on a
   wide screen and wrong here — these are phrases like "par 7s, took 7.4s", and forbidding
   them to wrap pushed them out of the card. That is the overflow visible in the shot.
4. **`body.overlay-open` hides the thumb controls**, which were sitting on top of the card
   and swallowing taps meant for its buttons.

## [FOUND] The landscape rule was missing by a hair

The status strip was still visible in the screenshot even though round eight was meant to
hide it in landscape. The rule was `(max-height: 540px) and (pointer: coarse)`, and a phone
reporting roughly 603 CSS pixels tall in landscape at dpr 2 falls just outside it.

Dropping the orientation requirement and raising the threshold to 700px fixes it. A short
viewport is a short viewport; the extra condition was only ever a guess about which devices
would be short.

**[ASSUMED]** The stylesheet link now carries `?v=<commit count>`. GitHub Pages serves CSS
with a cache lifetime, so a phone that already loaded the broken layout would keep it for
several minutes after the fix shipped — which looks exactly like the fix not working.

### What this round says about the process

Nine rounds of headless checks did not catch a soft lock on the win screen, and one
screenshot did in seconds. The harness verifies that the primary button **exists, is
enabled and is wired** — all true here. It cannot know the button was painted outside a
clipping container, because it draws nothing. That limitation has been stated every round;
this is the round where it cost something real.

## Current state

```
npm test          12 passed · 1 not demonstrated · 0 failed
npm run webcheck  35/35
```

---

<a id="round-eleven"></a>
# Round eleven — a product look, and a moment to find yourself

## R22 · Nothing moves until you do

**Asked:** "whenever the round starts, it is hard to find where the human is, so can the
alien wait to move until the player figures out where the human is? also can you keep an
indicator as to where the human is until the player moves."

**Built.** The whole simulation is frozen at the start of a district — clock, arrivals,
division, alien movement, detection — until a direction is pressed. A beacon marks the
player until then: three expanding rings, corner brackets, and a `YOU` label with a
chevron pointing down at the figure. A prompt under the board says so, with the right
wording for keyboard or touch.

**[ASSUMED]** Frozen rather than paused: **the tick counter does not advance either**.
Pausing a running clock would still charge thinking time against par and against the
survival band the difficulty controller steers by. Taking thirty seconds to get your
bearings should cost nothing.

**[ASSUMED]** The rings are animated because motion is what the eye catches. A static
marker on a board already full of static markers is one more thing to search through.

**[ASSUMED]** `Input.clear()` runs on every district start, so a key still held from the
previous district cannot skip the freeze. Without it, winning while holding right starts
the next district instantly — exactly when an unfamiliar map most needs the beat.

### [FOUND] The freeze hung the benchmark harness

Shipped as an unconditional rule, it took `npm test` from about a minute to not finishing
at all. The cause is a nasty little interaction:

> A frozen world never changes. A deterministic bot given an unchanging state returns the
> same answer forever. `coverCrawler` legitimately answers **STAY** when the nearest alien
> is far enough away — so on some maps it answered STAY, the world stayed frozen, and the
> episode span forever.

My first probe said all five bots start on the first call, which was true of the one map I
probed and false across a thousand episodes. The lesson is the probe, not the bug: a check
over a single seed cannot clear a claim about every seed.

**Fixed** by making the freeze `freezeUntilFirstMove`, **opt-in and off by default**. It is
a presentation affordance for a human who needs to orient; a scripted policy has no eyes.
The browser passes `true`; everything headless leaves it false and behaves exactly as
before, so no historical measurement moves.

(Some of the slowdown I first blamed on this was also self-inflicted: I had three test
suites running concurrently and was reading contention as a regression. The hang was real;
the first numbers were not.)

## R23 · Making it look like a product

**Asked:** "can you make the webpage look more like a business product, right now it looks
dull and not very appealing?"

**Built.** A design-token pass and a restructured launch page.

**[ASSUMED] Two typefaces, split by job.** Inter for anything read as prose or a label; a
monospace for anything that is a number or an identifier — scores, coordinates, trait
deviations, prices. Mono everywhere was the dull part: it flattens hierarchy, because when
every word has the same weight and width nothing can be more important than anything else.
Mono *only on data* keeps the terminal character the game is built around while letting
headings and copy breathe. It is also what current product UIs actually do.

**[ASSUMED] Tokens before components.** A surface ramp (`--bg` through `--bg-4`), a radius
scale, two shadow levels, a focus ring, and one `.btn.primary` with a gradient for the
single action a screen wants you to take. Polishing component by component without a token
set produces eleven slightly different greys, which is its own kind of dull.

**[ASSUMED] The launch page became a product page** — a hero with an eyebrow, the wordmark
in a gradient, four stat pills, the save files as elevated cards, and a six-card grid
explaining the mechanics. It replaces a wall of five paragraphs inside a `<details>`, which
nobody opens.

**[ASSUMED]** The identity is unchanged: still dark, still a surveillance console, still no
art assets. Making it look like a SaaS landing page would have fought the game.

### Verified the only way available

The beacon and the figure were checked by replaying the **real** `_drawHuman` and
`_drawBeacon` canvas calls through an SVG recorder — the shipped code, not a
reimplementation. The recorder gained text, alpha and stroke support for this round.

**The CSS is still unverified.** No browser, so no layout has been seen. The type scale,
the token ramp and the hero are reasoned, not observed.

## Current state

```
npm test          12 passed · 1 not demonstrated · 0 failed
npm run webcheck  36/36
```

---

<a id="round-twelve"></a>
# Round twelve — sprint on Shift, two themes, and a fresh link every build

## R24 · Sprinting is held, and a bolt no longer fires itself

**Reported:** "when you take a lightning bolt and run fast, a single tap makes you run two
boxes at the same time. that feature would be very counterproductive if the player wanted
to run only one box."

**That is a design bug, not a tuning one**, and the diagnosis is better than the symptom. A
bolt granted three seconds of double speed *outright*, so for those three seconds the
player could not move one square at all. In a game about threading a one-cell gap past
something hunting you, taking away single-cell movement is not a power-up — you want one
box, you get two, usually into the alien you were avoiding.

**Built.** One mechanic instead of two:

- A bolt picked up off the map **adds three seconds of charge** instead of firing.
- Sprint is **held**: `Shift` on a keyboard, two cells per tick while down, one the instant
  it comes up, charge remaining or not.
- Shop lightning feeds the same charge.

**[ASSUMED]** Two pools, drained field-first: bolts found in a district are spent there,
lightning bought in the shop persists and is written back at run end. Without the split,
farming bolts would quietly become free shop lightning.

**[ASSUMED]** The sim never latches sprint. `setSprint()` is resolved from the live control
state every tick, which is what guarantees that releasing Shift takes effect on the very
next tick rather than at the end of some interval.

**[ASSUMED]** On touch the RUN button still latches, as asked. Holding a thumb on it while
steering with the other is awkward, and the one-cell precision problem is less acute with a
stick than with a tapped key.

## R25 · Light and dark

**Asked:** "add a light and a dark mode feature."

**Built.** `web/theme.js`. A toggle in the header of all three pages, following the system
preference until an explicit choice is made, then remembered.

**[ASSUMED]** The preference lives in `localStorage`, **not** on the save profile. It is a
property of the person at the keyboard rather than of the file they are playing — switching
from MAIN to GUEST should not relight the room.

**[ASSUMED] The board does not change.** A district is a rendered scene with ten belt
palettes tuned so a red alien, a gold key and a white figure all read against the ground. A
light version would need ten more palettes and would wash out every entity on them. So the
chrome adapts and the board stays as drawn, framed like a screen — which is what virtually
every game with a UI around it does.

**[ASSUMED]** The light accents are darker values, not the dark ones reused. `#19e0c8` is a
good teal on near-black and unreadable on near-white.

**[FOUND] Three light-mode colours failed WCAG AA and I only knew because I measured.**
Secondary labels, shop prices and feature headings came out at 3.97, 4.08 and 4.26 against
the page background — under the 4.5:1 threshold for small text, and all three are used on
small text. Darkened to 4.64, 4.97 and 5.25. Contrast is arithmetic, which makes it one of
the few visual properties I can actually verify without a browser, so there is no excuse
for guessing at it.

## R26 · More vibrant

**Asked:** "make the page more vibrant."

**[ASSUMED]** Colour was added **structurally** rather than sprinkled. Each feature card
carries a `--tone` that drives its top rule, its icon, its tint and its hover glow; each
difficulty tier has its own hue (EASY green through ULTRA red); the wordmark and the save
cards use a four-stop gradient; the hero pills get coloured pips. One custom property per
card beats six one-off overrides and keeps both themes consistent.

The identity is unchanged: still dark by default, still a surveillance console, still no
art assets.

## R27 · The "0 models trained" pill is gone

**Asked:** "remove the zero models trained tag, that is uncessary."

Removed. The claim still lives where it belongs — in the spec's non-goals and in the
feature grid, which has room to say *why* it matters. As a bare stat pill beside "100
districts" it was a boast without a context.

## R28 · A fresh link on every update

**Asked:** "remove all the save file stored in the games, make the link fresh everytime you
make an update and push to github."

**Built.** `web/build.js` holds a build stamp; `npm run stamp` bumps it and rewrites the
stylesheet `?v=` from the same number. The IndexedDB database is named `noise-<BUILD>`, so
**every published update starts every save fresh**, and databases from earlier builds are
swept on load so they do not accumulate one per deploy in every player's browser.

**[ASSUMED]** One counter driving both the database namespace and the cache-buster. They
had already drifted once when the `?v=` was edited by hand; sharing a source makes that
impossible.

**[ASSUMED]** The theme preference and the guest session marker are **not** namespaced.
They are UI state rather than saves, and losing your theme on every deploy would be
annoying rather than principled.

A test now fails if the stylesheet `?v=` drifts from the build stamp, which turns "remember
to run `npm run stamp`" into something the suite enforces.

## R29 · NOISE in first person: spec, plan, and phase 0

**Asked:** make the game 3D and first person, "like how it does in games like COD", as a
separate page so nothing that is already there is hampered; then add it as a tab on the
main page marked in development, reviewable after every update; then build it phase by
phase, pushing after each phase so no completed phase can be lost.

**Written:** [spec-3d.md](spec-3d.md) and [plan-3d.md](plan-3d.md). The 3D game is a new
front end on the **unmodified** sim, because the predictor's generated constants and all
13 criteria describe this exact sim; a forked continuous-space core would have
invalidated every one of them.

**Built (phase 0):** `/3d/` placeholder page with the in-development banner; three.js
0.185.1 vendored and hash-checked; the 3D build stamp (`web3d/build3d.js`,
`npm run stamp3d`) independent of the 2D one; `npm run test3d` with criteria 3D-0 and
3D-2 live; a test3d step in both workflows; one header link in `index.html`.

**[ASSUMED]** three.js **0.185.1**, not the newest 0.187.0: 0.186 onwards publish only
unminified builds (2.1 MB against 0.75 MB). Nothing the plan needs arrived after 0.185.

**[ASSUMED]** The `index.html` link is HTML-only with the existing `.site-nav a` style, so
the 2D build stamp is **not** bumped and no 2D save is reset by this round.

**[ASSUMED]** CI runs `test3d -- --skip-2d`, because the two 2D suites already ran in the
steps before it; locally 3D-1 re-runs them so a 3D change cannot go in without them.

## R30 · 3D phase 1: the pure core

**Built:** `sim3d/` -- `units.js`, `body.js` (circle-vs-tile sliding), `leash.js`,
`raycast.js` (Amanatides–Woo), `game3d.js` (`Game3D extends Game`, overriding `step` and
`fireStun` only), `record.js`, `session.js` (one district in real time: body every frame,
sim every 1/`TICK_HZ_3D` s). Criteria 3D-3 to 3D-7 live and passing.

**The parity result is the one that matters.** Fed the cell paths of 54 recorded runs (the
five bots and a sprinting wanderer, three districts, three seeds), a `Game3D` whose only
input is the leash reproduces every tick log bit for bit. "The same game in 3D" is
literally true: a 3D player is, to the sim and the predictor, a player.

**Two things the tests caught.**

- *Parity, sprint cut short.* A double step that ends after one cell (caught, or on the
  portal) still went out as a sprint, so the tick log carries the BOOSTED flag. The test
  had been placing the body where the player **ended**; it now places it where the sprint
  was **aimed**, which is what a real body does. No core change.
- *Corner shots.* Centre-to-centre shots often pass exactly through a cell corner, which
  random rays never do. The ray march had been picking one of the two side cells
  arbitrarily. **[ASSUMED]** It now visits both and is blocked if either is opaque: two
  blocks meeting corner to corner look like a solid seam, and a shot through a zero-width
  gap would look like a bug. The fuzz now includes a sweep of centre-to-centre rays.

**Leash fuzz:** 10,000 random control sequences, ~494,000 frames at random frame rates
(30–144 Hz): no solid overlap, never more than two steps ahead, never snapped back, and a
stopped body and the sim agree within one tick (the bound is two).

**Not stamped.** Nothing on any page changed; the 3D build stays 1.

## R31 · 3D phase 2: the graybox, and a provisional go

**Built:** `3d/play.html` and `web3d/` -- `runner.js` (one district's game logic, no DOM:
level, system, `Game3D`, `Session3D`), `scene.js`, `controls.js` (pointer lock, mouse
look, WASD by physical key, Shift sprint), `world.js` and `entities.js` (graybox,
instanced per tile type), `play3d.js` (frame loop, overlays, the tuning panel). The 3D
launcher now picks a district and a tier. 3D build **2**.

**Checked in the browser pane** (the first time anything in this project has been looked
at rather than inferred):

- The first render was nearly black: three.js lights are physically based since r155 and
  the 2D-era intuition for intensities was off by about 2×. Hemisphere 2.6, sun 2.4, fog
  pushed out to 30–95 m. Walls, floor seams, water and rubble now read clearly.
- The banner sat in the middle of the screen: its class was `overlay`, which the 2D
  stylesheet already uses for the centred run-end card. Renamed `b3-floating`. A reminder
  that `web/style.css` is shared and its class names are taken.
- A scripted run end to end: the body moves under the leash, the opening freeze holds
  until the first move, an alien catches the player at tick 45 (11.3 s at 4 Hz), the end
  card appears, zero leash snaps.

**Not checkable here:** the pane throttles a background page to a few frames a second,
so real-time feel cannot be judged from it, and a script cannot judge feel anyway.

**[ASSUMED] Provisional go.** The plan makes the phase-2 go/no-go the player's call, and
the request for this round was to build phase after phase. So the build continues on a
*provisional* go resting on what can be measured -- 3D-3 parity, the 3D-5 leash fuzz,
zero snaps in the browser run -- and the feel verdict stays open. If it comes back as
rubber-banding, the fallback in the spec (a sub-cell sim) is still available; nothing in
phases 3–6 is specific to the leash beyond `Session3D`.

The tuning sliders ship live so the constants can be settled by feel rather than by me:
cell 1.5 m and 4 Hz stay the defaults until then.

## R32 · 3D phase 3: the world

**Built:** `web3d/world.js` rewritten -- per-belt materials, canvas-drawn textures
(paving with a seam on every cell edge, weathered wall panels, a scrolling ripple normal
map), seeded rubble heaps (5–8 tumbled blocks per building cell, 1.2–2.2 m), black boxes
with scanlines and edges, a belt-coloured sky dome and fog. `web3d/quality.js` (High /
Medium / Low, auto-selected, coarse pointers capped at Low). `3d/belts.html`, a dev page
rendering one district per belt in a single canvas with an alien, a key, every coin value
and a bolt in view. 3D build **3**.

**Draw calls: 14–17 per district** across all ten belts, against a budget of 150.

**What the belt check caught, in order:**

1. *Pastel cities.* The palettes came out washed out. three.js's `getHSL`/`setHSL` work in
   its **linear** working space by default, where these dark grounds have a lightness
   near 0.04, so lifting to "0.24" landed around 0.5 in sRGB. The lift now runs in sRGB,
   the space the palettes were picked in. Exactly the kind of bug that cannot be seen in
   the values and is obvious in one screenshot.
2. *A dead sky.* A `#include` inside a one-line shader string does not compile; the GLSL
   preprocessor needs it on its own line.
3. *Spawning into a rubble heap.* "Face the most open direction" checked for walls only.

**Reviewed (3D-12, first pass):** in all ten belts the red alien and the gold key read
clearly against ground, walls and sky. Coins are too small to judge at corridor distance;
that is phase 4's job. **Rubble** reads as tumbled concrete blocks rather than a heap --
acceptable, noted.

## R33 · 3D phase 4: aliens, rings, pickups, sound

**Built:** `web3d/entities.js` rewritten. Aliens are drawn **by part across all aliens**
(one instanced mesh for every torso, head, eye, limb, ring and ring fill), so twelve
aliens cost the same six draw calls as one. They glide toward their sim cell at the speed
their move period implies -- at 4 Hz a 2.33-tick period would otherwise be a hop every
580 ms. Floor-projected detection rings (additive, radius eased when you step into
water), keys with a glow, coins sized and haloed by value, extruded bolts, a portal beam
over every wall, pickups that fly to the camera, a capture sequence that turns the camera
to the alien that did it. `web3d/audio3d.js`: `web/sound.js` reused unchanged, plus an
HRTF-panned voice per alien and footsteps keyed to terrain. 3D build **4**.

**What looking caught:**

- *A red pill.* The first alien was a capsule with the arms hidden inside the torso. Now
  hunched, head pushed forward, eyes enlarged, arms splayed and longer: from the front
  it reads as the favicon's creature.
- *Invisible aliens in the belt check:* they scale in over their first third of a second,
  and the check rendered one frame. And with one-cell corridors the alien stood behind
  the key; the check now views from wall height, tilted down.

**3D-12 recorded as PASS** in `bench3d/measured.json`, with the reviewer named honestly:
a screenshot review by Claude in the browser pane, not a human. Rings read but are faint
on TIDE and SOLAR, flagged in the banner.

**Not verified:** the audio has been checked for errors only; nobody has listened to it.

## R34 · 3D phase 5: the HUD

**Built:** `web3d/hud3d.js` -- minimap and tactical map drawn by `web/render.js`'s
`Renderer`, **unchanged**, into an offscreen canvas (its `resize()` measures a page layout
the 3D page does not have, so the HUD sets the tile size and backing store directly
instead of calling it); a compass strip with key and portal bearings; waypoints projected
over every uncollected key and the open portal; threat arcs around the crosshair, one per
alien that can hear you; a noise meter; sprint bar; dispatch subtitles from
`web/dispatch.js`'s `buildState` + `templated`, unchanged. `web3d/settings3d.js` and a
settings section in the pause card. Head bob from distance walked, sprint FOV kick, both
off under reduce motion (default follows `prefers-reduced-motion`). 3D build **5**.

**[ASSUMED] The H overlay is on the maps, not on the floor.** The spec said the
prediction would be tinted onto the floor of each region. The 2D renderer already draws
the heatmap, so H turns it on in the minimap and the tactical map: one drawing, exact
parity with 2D, no second implementation of the same overlay. A floor tint can still be
added if the map version proves too indirect.

**Checked in the browser pane:** the minimap rotates with heading and shows the 2D board
with aliens and their rings; the compass carries the key bearing; the HUNTED line, threat
arc and noise meter light together when an alien has you; the narration appears as
intercepted radio; the tactical map with the heatmap on shows the predicted regions in red.

## R35 · 3D phase 6: the aimed stun gun

**Built:** `web3d/gun.js` -- a procedural viewmodel in its own render pass (depth cleared,
so it never clips into a wall), six charge cells along the top that are the magazine,
lock-on that raycasts the alien bodies and then asks `Game3D.canStun()`, recoil, a muzzle
light, a fading beam. `audio3d.js` gains a zap and a dry click. `?kit=1` gives the
graybox a full gun until the shop exists. 3D build **6**.

**Checked in the browser pane:** a lock on an alien four cells away reads `ok`; firing
queues the target, the next tick resolves it, the charge count goes 6 → 5, the alien is
stunned for exactly `stunTicks` (40) ticks and slumps grey on the floor.

**What looking caught:** the first lock attempt returned nothing with the crosshair
squarely on the alien. An `InstancedMesh` caches the bounding sphere of its instances on
the first raycast; the aliens move every frame, so every later ray was tested against
where they had been (in this case, against an empty set). The pick now recomputes the
bounds first -- a handful of instances, negligible cost.

**[ASSUMED]** The stun resolves on the next sim tick (up to 250 ms at 4 Hz), not
instantly, because a trigger pull is an input and inputs enter the sim on ticks -- that
is what keeps a run replayable from its record. The beam and the zap are immediate, so
the feedback is not delayed, only the effect.

## R36 · 3D phase 7: a whole game -- saves, tiers, hub, shop

**Built:** `web3d/persist3d.js` (a deliberate duplicate of `web/persist.js` with the
database, sweep pattern and guest marker renamed), `web3d/career3d.js` (DOM-free:
difficulty settled once per district, attempts counted at run start, tier 1 carried
across retries, tier 2 folded per run, `scoreRun`, payout, unlock -- all imported from
`/sim`), `web3d/hub3d.js` and a new `3d/index.html` (profile slots, the permanent tier
chooser, a district grid by belt, the shop). `3d/play.html?p=main&d=N` plays a real save;
links without a profile stay an unsaved sandbox. 3D build **7**.

**Criteria 3D-8, 3D-9, 3D-10 live and passing.** 3D-9 plays district 1 through the real
body, leash and sim with a bot steering the body, wins, is paid, buys lightning, and
carries it into district 2.

**What the isolation test caught -- in the test, not the game.** The 2D DOM shim's fake
IndexedDB keeps a single version counter for all databases, so the second database
opened in a run never gets `onupgradeneeded`, has no object store, and its writes vanish
silently. It never mattered for the 2D game, which opens one database. The 3D test opens
two side by side, so it brings its own small fake (`bench3d/fakeidb.js`) with per-database
versions plus `databases()` and `deleteDatabase()` -- which also let the test run **both
games' real sweeps** against one database list: each removed only its own stale builds.
`bench/domshim.js` is not edited.

**[ASSUMED]** MAIN's 3D districts are the same maps as 2D MAIN (the generator is seeded by
profile id and district), and the save files are separate. Whether one dossier should
describe both games is open question 4 in the spec, for integration.

**[ASSUMED]** The shop sells lightning in blocks of ten bought seconds and labels the 3D
duration in real seconds (×2 at 4 Hz). The price per sim second is the 2D game's.

## R37 · 3D phase 8: phones and the frame budget

**Built:** `web3d/touch3d.js` -- a floating analog stick on the left half (not quantised:
the leash quantises, as for a keyboard), drag-to-look on the right, RUN (latches, as in
2D), STUN and MAP buttons, a pause button; a touch-only aim-assist cone (0.14 rad) in
`gun.js`; a portrait "turn sideways" card; full-screen and landscape lock requested on
the first tap where allowed; a phone HUD layout. `play3d.js` gains `benchmark()`.
Coins are instanced by value. 3D build **8**.

**What measuring caught:**

1. *Counting the wrong pass.* `renderer.info` resets on every `render()`, and the gun is
   drawn in a second pass, so the first readings (11 draw calls, 536 triangles) were the
   gun's. The world pass's counters are now captured before the gun pass.
2. *Measuring a dead run.* A standing player is caught within seconds, and a finished run
   shows the camera pressed against an alien. The benchmark parks the player inside a
   black box -- the one place aliens cannot enter -- lets 90 s of sim run so aliens
   arrive and divide, and turns the camera through a full circle while timing.
3. *Coins were most of the draw calls.* 97 calls at district 10, two per coin (disc and
   halo). Instanced by value, with halos only on 5s and 10s: 59. The frame time barely
   moved, so draw calls were not the bottleneck on this machine -- the change is for
   phones, where they cost more.

**3D-11 recorded as PASS** in `bench3d/measured.json`, with the conditions: Apple M3
(integrated GPU) in the Claude desktop browser pane, 1080p at pixel ratio 1, GPU forced
to finish every frame, which is pessimistic. Medium: mean 10.9–12.2 ms over three runs,
p95 15.7–16.9 ms. High with shadows: 12.4 / 17.7 ms. The mean clears 60 fps with room to
spare; **the p95 sits right at the 16.7 ms line**, and that is said rather than rounded.

**Not verified: any real phone.** Touch was exercised in a 740×360 emulated touch
viewport, with the stick driven by script. The phone frame-rate target (30 fps at Low on a
mid-range phone) has no measurement and is not claimed.

## R38 · 3D phase 9: the killcam, and the spec made true

**Built:** a killcam -- after a capture, the end card offers a third-person replay of the
last three seconds from above and behind: your figure in its teal ring, the alien, its
detection ring, the sim's own positions from each of the last thirteen ticks. It is a
picture of what happened, not a re-run, so it costs nothing to the determinism story.
3D build **9**.

**`spec-3d.md` rewritten to describe the system as built**, the way `spec.md` was after
the first build, with a departures table and the open questions stated as open.

**What phase 9 could not do, said plainly.** The plan's phase 9 is a playtest: win rates
by tier from people, the 4 Hz question, full radar against hear-only, the same person's
dossier in 2D and 3D. None of that can be produced by a script, and none of it has been.
The bot numbers in `spec.md` apply to the 3D game unchanged in tick terms -- criterion
3D-3 is the proof -- and that is exactly why they say nothing about how first person
feels. **The phase is marked done for what was buildable, and the playtest is open.**

**Not built:** the foresight overlay. The minimap's I layer already shows where each alien
is heading, which covers the information if not the spectacle.

## R39 · The movement stuttered, and the tests could not see it

**Asked:** "the movements look laggy, unlike in the games of cod. why is the movement
looking so discrete?"

**Measured before touching anything.** The renderer was not the problem (82–92 fps,
R37), and straight-line walking was perfectly smooth: a constant 4.00 cells/s, frame
after frame. Off-axis it was not:

| heading | walking, stalled frames | sprinting, stalled frames |
|---|---|---|
| 0° | 0% | 11% * |
| 20° | 25% | 45% |
| 30° | 13% | 43% |
| 45° | **100% — frozen** | 55% |

\* in a small open patch; down long lanes straight sprinting was clean all along.

**Why.** Two flaws in the leash design (R30), both mine:

1. *No slack.* The body could lead the sim by 1 step walking, 2 sprinting. The cell
   diagonally ahead is 2 steps away, so on an exact diagonal the body met a forbidden
   corner while the sim, seeing the body still in its own cell, emitted STAY -- each
   waiting on the other forever. Off-axis, the body ground against that corner on a
   quarter of all frames.
2. *No speed limit the grid could honour.* The sim covers at most one cell per tick
   across-plus-along; a body moving at top speed on a diagonal asks for 41% more.

**Fixed:** the body's speed is capped in the grid's own (Manhattan) metric, with a little
spare capacity off-axis (`WALK_DIAGONAL_HEADROOM` 0.10, `SPRINT_DIAGONAL_HEADROOM` 0.25 --
each the smallest value with no stall at any heading), the leash's slack is now 2 / 3
steps, and a sprint tick takes a straight double step along *any* direction on a
shortest path rather than only the preferred one. After: **zero stalled frames** at every
heading from 0° to 45°, walking and sprinting, and down every long lane.

**The trade-off, stated rather than hidden.** A pure diagonal is now slower than a
straight line: about 64% of straight speed walking and 53% sprinting. A four-direction sim
cannot do better without overrunning; a shooter's equal-speed diagonals would need the
sub-cell sim the spec lists as the fallback, which re-opens the generated constants and
parity. That is the user's call, and the banner asks.

**Why no test caught it.** Every criterion asked whether the body ended up in the right
place; none asked how *smoothly* it got there. **3D-13** now does: it fails if the body
ever drops under half the speed its heading should have. It caught a remaining gap at a
25° sprint while this fix was being tuned, and an error in its own first version (it
judged diagonals against straight-line speed). 3D-5's bounds follow the new slack;
3D-3 parity still holds bit for bit.

## R40 · A spec for the next round

**Asked:** ideas to make the 3D game better -- livelier art per belt and district, a scarier
capture, a portal ascension, comic-accurate aliens, maps that grow and become multi-floor
buildings, fewer bolts deeper into each belt, more shop items, an escape by combat, a
story -- then the same ideas costed with phones allowed to break, then a spec for all of
them **except the combat escape**, to implement later.

**Written:** [spec-3d-next.md](spec-3d-next.md): ten phases, N0 (the audio still playing
while paused, found this round) to N9 (multi-floor buildings), each with its numbers,
files, criteria (3D-14 to 3D-25), estimate and difficulty, and a progress table to resume
from. About 11–15 weeks of focused work for one developer, desktop first.

**[ASSUMED]** Five decisions are recorded with recommendations rather than taken: the
rules split from N6 on (a `classic` ruleset keeps 2D parity, `next` carries the changes),
procedural textures over CC0 images, an optional size argument in `sim/gen.js` guarded by
a byte-identical test (the one 2D edit this round would make), keeping the 2D predictor
constants until a criterion says otherwise, and allowing the language model on capable
desktops.

**Dropped:** the "Struggle" combat escape, at the user's request. One touch from an
active alien still ends the run.

Nothing built, nothing deployed, no build stamp changed.

## R41 · N0: the sound stops when the game does

**Asked:** "why is the audio playing in the background? stop it" (R40's round), then
"implement N0 and N1".

**Built:** `Audio3D.pause()` / `resume()` suspend and resume the audio clock itself.
Web Audio oscillators run independently of the frame loop, so a paused game kept
droning, and a hidden tab droned indefinitely. Paused (Esc, lost pointer) is silent; a
hidden tab is silent and, on a phone, also paused; the end card is silent. The moment of
capture is deliberately **not** silenced -- `finish()` releases the pointer too, and N3's
jumpscare will need its sound. 3D build **11**.

**Checked in the browser pane** through `AudioContext.state`: running while playing,
suspended on Esc, running on resume, suspended with the tab hidden, running on return,
still running at the capture, suspended at the end card. Not listened to.

## R42 · N1: fewer bolts deeper into each belt

**Built:** `sim3d/bolts.js` -- `boltKeepCount(n, district) = max(1, round(n × (1 −
(2/3)·k/9)))` with `k` the depth in the belt (0–9), and `thinBolts()`, a seeded choice of
which to keep. `web3d/runner.js` applies it to its own copy of the level after
`generateLevel()`; `thinBolts: false` turns it off. Criterion **3D-14**. 3D build **12**.

**Measured, 300 districts (three profiles × districts 1–100), mean bolts kept of
generated by position in the belt:** 1st 18.3 of 18.3, 3rd 15.1, 5th 12.6, 7th 9.8, 10th
5.7 of 17.4. A bolt is 3 sim-seconds of sprint, 6 real seconds at 4 Hz, so the field
supply falls from about 110 s of sprint in a belt's first district to about 34 s in its
last. On the live page: D1 19 of 19, D5 12 of 17, D10 6 of 17, D11 15 of 15.

**The balance check in the spec could not be run as written, and says why.** It asked
for bot win rates before and after. None of the five bots ever sprints, so a bolt is
worth nothing to them and their win rates cannot move; reporting "no change" would be
true and meaningless. What fewer bolts does to a player is a playtest question, listed in
the banner.

**Parity untouched:** 3D-3 builds its levels directly from the generator, not through the
runner, and still matches the 2D game bit for bit. The optional second lever in the spec
(shorter charge per bolt) is not built; it stays off until someone has played this.

## R43 · N2: the aliens become Greys

**Asked:** "now start N2" -- the aliens "look like some red humans"; make them
comic-accurate.

**Built:** `web3d/alien.js` (the body) and `web3d/species.js` (the parameter table, one
species so far). A lathe cranium tipped back over a thin neck; almond eyes made by pinching
a sphere's height toward its ends, glossy black with clearcoat, slanted 20° and wrapped
round the face, each with a red cat-slit; a hinged jaw, closed (N3 opens it); a lathe
ribcage hunched forward; two-segment arms with three long fingers; digitigrade legs
(knee forward, ankle back, toes forward), all posed by forward kinematics each frame and
lifted so the toes touch the ground. Drawn by part across all aliens: cranium, jaw,
torso, bones (17 per alien), joints (12), eyes, slits -- seven draw calls for any number.
Skin is grey-green; the threat colour is carried by red markings and a red fresnel rim
light in an injected shader, scaled by a per-instance glow. 3D build **13**.

**Behaviour, all presentation:** the head turns to you and tilts 18° when the alien can
hear you (measured: the full turn in about 0.1 s, clamped at 66°); idle twitches on a
schedule from a hash of the alien's id (no `Math.random`); a stun is a 0.6 s convulsion,
then the existing slump, eye slits dark, glow off.

**What looking caught**, in order:

1. *A mannequin.* The first body was cylinders and oversized ball joints; it read as a
   wooden artist's figure. Now a shaped ribcage torso, joints only slightly wider than the
   bones.
2. *Eyes on the jaw.* The eyes sat at chin height, below the widest part of the head; a
   Grey's are at the widest part. Raised and set into the face.
3. *Invisible slits.* They sat inside the eye's surface. Now just in front of it.
4. *Stale screenshots.* Twice the pane showed the previous frame after a scripted
   render, once making the front look like the back. Every verdict above is from a
   screenshot taken after a deliberate wait.

**3D-12 re-recorded** (ten belts; the Greys read on all of them, as pale figures with a red
edge at distance -- less loud than the old red bodies, not harder to find) and **3D-11
re-measured**: 1080p Medium, mean 4.2–4.5 ms, p95 5.2–7.5 ms, 50 draw calls, ~41k
triangles. Build 8 measured 11 ms mean with the same recipe on the same machine; N1's
fewer bolts explain part of the draw-call drop, the rest is not attributed. Both are
within budget.

**Not built:** the other nine species. Every belt has Greys; the table in
`spec-3d-next.md` lists the rest.

## R44 · N2 completed: a species for every belt

**Asked:** "implement complete N2 before you move to N3, basically all the different
aliens."

**Built:** nine more species, each the Greys' parameter set with overrides
(`species()` in `web3d/species.js` merges them), and the rig in `web3d/alien.js` grew
three things to carry them: **marking styles** for the glow map (veins, cracks, spots,
stripes, ribs, circuits, sigils, rings), **motion styles** (sway, jerk, flicker, shimmer)
and **feature parts**, each one more instanced mesh only for the species that has it --
gills, webbing, growths, a collar ruff, a crest of horns, armour plates, metal bands and
panels; segmented limbs add mid-limb joints; the Watchers' third eye is a third entry in
the eye mesh. 7 to 9 draw calls per species however many aliens. `3d/species.html` shows
all ten (`?b=` one up close, `?d=` distance, `?pitch=`). Criterion **3D-26** checks the
table: ten distinct species, one per belt, every glow within 25° of red at high
saturation, only known features and marking styles. 3D build **14**.

**What looking caught**, which is most of what this round was:

1. *Red armour.* Feature parts used the skin's full red emission; the Wardens' plates
   read as red slabs. Features now keep the red rim and drop the all-over glow.
2. *A third eye inside the skull.* A hand-picked depth put it behind the brow of the
   taller Watchers head. It is now placed by measuring the cranium's front surface at
   that height; the Deep ones' gills, swallowed by their wider head, are placed the same
   way on its side surface.
3. *Fins seen edge-on.* The Choristers' collar radiated sideways and the Wardens' crest
   ran front to back, so both were invisible from the front -- the angle the player sees
   most. The collar is now a frilled-lizard ruff behind the head, facing forward, folded
   flat when calm and fanned open when hunting; the crest is a staggered crown of horns.
4. *Fungus that read as ears*, and a gallery panel looking through a black box: bigger,
   paler, more numerous caps; the gallery now frames across open floor or water only.
5. *A Mirage you could not see.* At 0.42 opacity, nine metres away, it was two eyes and a
   faint outline. The 3D player must never see less than the 2D player, so it is 0.62 with
   a stronger rim: ghostly, plain to see.

**3D-11 re-measured on the heaviest case** -- district 91, Architects, the richest coin
floor of any belt: mean 11.9–13.3 ms (75–84 fps), p95 16.1–17.7 ms, 89 draw calls, ~69k
triangles. Most of the extra calls are halo sprites on high-value coins, not aliens. The
mean clears 60 fps; the p95 sits on the line, as it did at build 8. **3D-12 re-recorded**
for all ten species at in-game distance.

**Not verified:** motion. The sway, the jerks, the flicker and the shimmer were checked as
numbers and in still frames, never watched moving at full frame rate.

## R45 · N3: the jumpscare and the portal ascension

**Asked:** "start N3, finish it and update it in github" -- the capture "should look
scarier, like a jumpscare", and at the portal the character should be pulled to the sky.

**Built:** `web3d/sequences.js` -- both sequences as pure data (flashes, keyframed tracks,
full / mild / off), so criterion **3D-15** checks them in Node: at most three flashes in
any second (WCAG 2.3.1), skippable, within length, and reduce motion never plays the full
one. `web3d/fx3d.js` plays them: flash, fade and glitch layers (the glitch redraws the
frame torn into displaced slices with red and cyan ghosts, read straight after the WebGL
render), and the ascension's motes. `audio3d.js` gains the heartbeat and ducking under
tension (a hunting alien within two cells), the shriek (detuned saws 220 → 1400 Hz through
a waveshaper, over a noise burst) and the rise (rumble and a climbing tone). The alien
rig gains a dark maw that opens with the jaw. Settings → Jumpscares. 3D build **15**.

**What looking caught:**

1. *A camera spinning to 41,000 radians.* The frame loop capped the time step above but
   not below; timestamps fed out of order between scripts made it negative, the camera
   turn's easing ran backwards, and the view filled with sky. Real browsers never send
   time backwards, but the loop now clamps the step to 0–100 ms anyway.
2. *A zero-sized canvas.* With the pane hidden the WebGL canvas had no size and the glitch
   layer threw; it now skips quietly. A frame must never die over an effect.
3. *A jaw that opened upward*, into the skull, and *a maw that sat behind the face* (a
   sign error), then *below the chin*, then *a red clown nose*. It is now placed by
   measuring the face's surface, as the third eye and the gills are: a dark, tall,
   screaming oval with a little red inside.
4. *Square motes*, some huge against the lens: now soft round points kept 1.2 m away.

**Checked in the browser pane**, stepping frames by hand: the jumpscare at 0.3–0.5 s (face
filling the view, mouth open, frame torn), the ascension at 1.0, 1.4 and 2.3 s (39.6 m up,
whiteout at 77%), the end card waiting for each sequence, any key skipping each variant,
reduce motion playing mild. **Not heard, and not watched at full speed.**

## R46 · N3 reworked: you cannot run past them, and the capture is a cutscene

**Asked** (with a screen recording): "the ending jumpscare is not like what you said it
would be, it hardly is like a jumpscare. And the human is able to run past the alien and
then only the game stops. Ideally, the alien should catch you and end you, like a
cutscene kinda for the game over."

**The recording could not be opened** -- macOS denies apps access to the screen-capture
app's private folder, and there is no video tool here -- so this round works from the
description. It was precise enough.

**Why you could run past them.** Three lags stacked: the body may lead the sim by up to
two cells (R39), the sim only decides a capture on a tick (every 250 ms), and an alien is
drawn gliding slightly behind its own cell. So the body visibly passed through an alien
and out the other side before the capture registered -- and the old jumpscare then turned
the camera *back* toward an alien that was now behind you. **Fixed:** awake aliens are
solid circles to the body (`resolveCircles` in `sim3d/body.js`, fed by
`Entities.solids()`); stunned aliens are not, exactly as in 2D. You bump into one, and it
takes you on its next step. The sim is unchanged and still decides every capture; parity
(3D-3) and determinism (3D-4) still pass. New criterion **3D-27**: walking straight at
an alien in ten districts, the body never entered it and every run ended in a capture.

**Why it was not a jumpscare.** About a second long, half of it a fade, and aimed at
wherever the alien had been. **Now a 2.6 s cutscene:** the alien lunges from where it
really is to arm's length with both arms reaching up at you; grabs (a thud, a flash, the
view jolted toward it); drags you face to face; its jaw unhinges and it shrieks for a full
second while the frame shakes, zooms in and tears; then a hard cut to black and silence
before the end card. Two flashes, well inside WCAG 2.3.1 (3D-15's length bound is now 3 s).

**What looking caught:** the first framing put the camera practically inside the face
(0.36 m, plus the 0.14 m grab pull, plus a 22° zoom): a cheek and the edge of one eye.
Now 0.58 m, a 10° zoom, and the camera tilted down to the face: eyes, the screaming
mouth and both hands in frame. Arms reaching at chest height were below the view; they
now reach up toward your face.

**Not verified:** never watched at full speed or heard. Whether it lands is the user's call.

---

## R47 · N3 again: the scare was being skipped, and was not scary

**Asked** (with a second recording, also unreadable here): "still, look at this, it does
not work, make the jumpscene extremely photogenic and very very scary (your levels of
scariness is extremely extremely low). also, the jaws opening up and gruesome scene is not
even showing up when caught like in the video i attached."

**Why the jaw never showed: you were skipping it without knowing.** "Any key skips" (R45)
meant any keydown -- and a movement key held down auto-repeats about 30 times a second.
You are almost always holding W when you are caught, so the first repeat, a few
milliseconds into the sequence, skipped straight to the end card. Every frame I had
checked was real; you never got to see one. **Fixed:** only a fresh press (not a repeat)
of Space, Enter or Escape, or a click, skips; and a sequence now has a `skipAfter` floor
(jumpscare 1.0 s, ascension 0.8 s) before which nothing skips it. 3D-15 now fails any
full or mild sequence with a floor under 0.5 s. Checked in the browser: eight W repeats
and a repeated Space at 0 s did nothing; Space at 0.9 s did nothing; Space at 1.05 s
skipped.

**Why it was not scary.** It was a cutscene: the camera turned, the alien walked in, the
mouth opened 0.5 s later, in a bright, evenly lit street. A jumpscare is the opposite --
no wind-up. **Now (2.2 s):** on the frame you are caught it is already there, 0.7 m in
front of wherever you were looking, and pushes in to 0.54 m; in that same frame the
district goes dark (lights to 6%, fog to a red-black wall 5.5 m out), a guttering red light
comes on under its chin, the jaw tears open over a ring of 18 needle teeth (new instanced
part, only drawn while the jaw is open), its slits pinch to burning needles and turn to
stare at you, and a sub-bass hit, a white flash, the scream, violent shake, zoom punch
and tearing all land at once. Second spasm at 0.62 s; hard cut to black and silence at
1.42 s. The scream is new: the ambience is cut under it, and it is a distorted formant
choir climbing two octaves with a vibrato screech on top.

**What looking caught** (each by screenshot): the red under-light at full strength plus
the glitch's red ghost turned the whole face one flat salmon -- light cut to 1.6 and the
ghost halved, skin glow dimmed to 45% close up; "dilated" slits blown wide read as cartoon
eyes -- they pinch instead; the slits sat on the outer edge of the wrapped-round eyes --
they now turn to face you; framing went from eyes cropped to mouth cropped before landing
on eyes, teeth and chin all in shot (0.7 to 0.54 m, pitch -0.24); the reaching forearms,
caught by the cold fill light, read as two blue pipes -- lowered.

**Not verified:** still never watched at full speed or heard; whether it scares is yours
to judge.

## R48 · The recording, read at last

**The user put the recording in the project folder.** No ffmpeg here, but the system's own
AVFoundation, driven from a 30-line Swift script, pulls frames out of a .mov; that is how
it was read (every 0.5 s, then every 0.1 s round the capture).

**What it showed (build 16, district 1, a Grey):** at 4.6-4.7 s the camera has turned onto
the alien at arm's length; at 4.8 s the end card is up. One tenth of a second of sequence,
then skipped -- exactly the held-key skip fixed in R47. The debug panel reads speed 0
because the body was pressed against the now-solid alien, not because no key was held.

**And a fault R47 had not found:** in that tenth of a second the minimap, keys, narrator
and debug panel were all back on screen. `finish()` hides the HUD and releases the
pointer, the browser reports the release a frame or two later, and `onLock(false)`
un-hid the HUD -- over the face. My browser checks never released a real pointer lock,
so they never saw it. **Fixed:** `onLock` leaves the HUD alone once the run has ended, and
`showEnd()` brings it back with the end card. Checked by calling `onLock(false)` straight
after `finish()`: HUD hidden through the scare, visible with the card.

## R49 · N3, fourth pass: it attacks you

**Asked** (with a film still of a creature lunging out of darkness, jaws wide, claws
blurred at both edges): "it looks much better now, but then, i want it to be more
scarier, like the image like I attached (it should look like it tries to attack you, not
just passively just showing its jaws) ... so that 20 year old college students can play
this too."

**What the still is doing**, which is what was taken from it (not the creature -- the
game's own ten species stay): near-total black; one cold light from above catching wet
teeth; the mouth the brightest thing in frame; claws smeared by motion at the edges; a
body caught mid-lunge. **Built (2.8 s):** rear up with claws spread and a hiss (0-0.26);
lunge with claws raking in, motion-smeared (to 0.40); impact -- flash, bass hit, scream,
three claw gashes torn across the screen, and you are knocked onto your back, the view
falling, rolling and looking up (to 0.72); it leans over you and bites twice, head
thrashing (to 1.62); a last lunge into the lens, cut to black and silence, a crunch.

**New machinery.** The face is pinned to a point in the camera's view and the body hung
off it (`AlienKit.faceLocal`, the face's position in the body frame on the last pose --
exact, because the body is rigid to it), so the framing holds across species and while
the body leans 0.62 rad over you. Claw pose (`st.claw`, `st.swipe`) with talons; two rows
of eleven teeth with fangs and four saliva strands replace the ring; skin darkened and
wetted (`st.skinK`, roughness) during the attack; a SpotLight key so only the face is lit;
motion smear (frames laid over the previous ones at part strength); an SVG layer of ragged
gashes that bleed; a blood vignette on a heartbeat; `def.sounds`, a list of sounds fired
once each (and not at all on a skip -- a skip jumped to the end and would have fired the
lot at once). New sounds: hiss, swipe, snap, and a crunch routed past the bus that cut()
has just silenced. The flash layer now sits above the glitch layer: until now a flash
during the glitch was drawn underneath the glitch's copy of the frame and never seen.

**What looking caught:** the first pass read as a toy -- grey skin glossy as a balloon,
the walls and sky still lit (the sky dome ignores fog; it is now hidden during the
attack), gashes like neon tubes (now ragged filled tears), the pinned face too close, and
a full-strength glitch making every frame unreadable (now spikes only on impact and
bites). The point key became a tight spot so the body falls into black.

**Not verified:** never watched at full speed; the new sounds never heard.

## R50 · Why the attack never reached the screen

**Asked** (with a third recording and one of my own screenshots): the cutscene is far too
short, make it at least six seconds; "the image i have attached (the one you said would
be the one I would see), was not rendered. why is it? explain what happened ... and most
importantly, fix it correctly."

**What the recording shows** (build 19, frames every 0.1 s round the capture at 2.85 s):
the alien walks into you over 0.4 s in its ordinary pose and ordinary light; its jaw opens
a little between 0.5 and 0.9 s; the light dims by about half; a gradual fade to black
starts at 1.6 s. No darkness, no claws, no knock-down, no gashes. That is, exactly, the
**mild** variant's timeline -- approach 0-0.4, jaw to 0.6 at 0.5-0.9, dark 0.5, fade
1.6-2.0.

**Why mild.** The variant was `variantFor(settings.jumpscares, settings.reduceMotion)`.
The user's Mac does not ask for reduced motion (checked: ReduceMotionEnabled 0), so it
was the saved choice: build 15's review note said "Then try Jumpscares: mild", the
setting lives in localStorage under a key no build stamp ever resets, and from then on
every capture the user saw was the gentle one. Every frame I checked was the full variant,
because my test page had no saved settings. This is also why builds 17-19 kept being
called not scary: the user never saw them. A second, latent way to the same place:
reduce motion silently turned full into mild, and its default comes from the operating
system, so a player could get mild without ever choosing it -- and the checkbox's label
("no head bob, no sprint FOV kick") never said it did that.

**Ruled out first, wrongly suspected for a while:** a crash in the frame loop (the leash
readout froze, but only because the body stops updating at game over; the loop was
alive -- the timed fade arrived on schedule); and stale cached modules (GitHub Pages
caches each file for 10 minutes and the 3D modules carry no ?v= stamp -- a real risk
right after a deploy, but not what happened here: the frames match mild, not any older
full sequence).

**Fixed:** (1) the variant is the Jumpscares setting and nothing else (`variantFor`
takes one argument; 3D-15 checks it); (2) settings move to a v2 key, carrying everything
over from v1 except the Jumpscares choice, which starts at full again, once; (3) the end
card says when the capture was not the full one -- the downgrade can never be silent
again; (4) the leash readout is hidden during the sequence too. Verified in the browser
the way the user plays, not the way my earlier checks did: a v1 setting of "mild" stored
before load (migrated to full, sensitivity and FOV kept), sound on, the capture
triggered by the sim through the real frame loop -- no errors, the full attack.

**Six seconds.** The attack is now 7.0 s (6.0 s of picture, then black and the crunch):
the lights die in two flickers; it stands in the dark 2.6 m off and comes at you in jerks
while your heart beats and you back away; rears; lunges; knocks you flat; bites three
times, screaming between bites; draws back in silence with the jaw stretched wide; lunges
into the lens. The world is hidden once the lights are out, so the attack happens in a
void and no wall can stand between you and it. New sounds: beat, buzz, breath. skipAfter
2.5 s; 3D-15's length bound is 7 s.

**Not verified:** never watched at full speed or heard.

---

## R51 · The plan, re-ordered around big maps

**Asked**, over several messages after N3 was accepted:

- "the levels are very small ... i want the maps to be atleast 5 times larger".
- Big maps should come before the art.
- Area must grow with every district, inside each belt and across belts, through fixed
  points: ×5 at district 1, ×10 at 10, ×30 at 50, ×45 at 75 and ×60 at 100. "we are not
  changing the scaling. i want the maps to be big."
- Fewer aliens is fine if they are faster.
- A new map builder is welcome ("it would be convinient when writing the story"), and
  the 2D map builder may be changed for it.
- Recalibrate the Dispatch to learn the player's behaviour ("likes to hide, has trouble
  at the corners, gets lost pretty easily, stays at the same place looking at map")
  rather than which room they are in.
- Would capping the frame rate at 30 stop places from appearing half a second late?

**Measured before planning** (Apple M3, Chrome, 1080p, shadows on):

- **Rendering is cheap at today's look.** Today's district was tiled 8 × 8, about
  district 100's size, giving 470,000 world triangles drawn with no culling. It built in
  18 ms and drew in 3.2 ms a frame; today's map draws in 3.8 ms.
- **Path searches are the real stutter risk.** One full-map distance field costs 1.7 ms
  at district 100's size, against 0.03 ms today. The squad re-plans every alien on the
  same tick, so 25 aliens would spend about 43 ms on one frame every 1.5 s, more on a
  weak laptop.
- **The frame-rate cap does not touch this.** A cap changes how much time each frame
  gets, not when anything is built. Nothing pops in, because a district is built whole
  while it loads.

**Where I was wrong:**

- My earlier estimate of "15–20+ minutes" per district at ×60 was too high. Keys show
  through walls, so a run is route-finding, not searching. Walking the route straight
  takes about 3½ minutes at district 100 with 10 keys; with hiding and waiting, perhaps
  twice that.
- My size table labelled walking times as "sprint across". There is no sprint meter;
  bolts double your speed while they last.

**Decided:**

- The plan is re-ordered: N8 (in five pushed steps), then N4, N5, N6, N7, N9.
- N8 gets the user's size curve, a city builder that emits named places for the story,
  and the `next` ruleset (D1, moved up from N6).
- Aliens: an arrival cap of about `4·√A`. They hunt faster, but never above 70 % of your
  walking speed, so breaking contact still works. They travel at up to twice your speed
  only when more than 40 m away and out of sight.
- The 3D Dispatch leads with behaviour traits and tactics (D4). Its constants go in
  `sim3d/dispatch/`; `sim/predictor/` is untouched.
- New criteria: 3D-28 (smoothness) and 3D-29 (fair speed). 3D-21 and 3D-22 are
  reworded. N9 is to be re-scoped for city maps after N8.

**Housekeeping:** rounds R47–R50 had been filed in the middle of this file, under a
"Current state" from an early round. They were moved back to the end, in order.

**Not verified:** nothing is built yet. The run-length figures are a geometric estimate
(nearest-key route, ×1.35 for streets, 6 m/s), not play.

---

## R52 · N8.1: districts are cities

**Asked:** "okay implement N8.1 now and updqte it in github".

**Built (3D build 21):**

- **The size curve.** `sim3d/next/size.js` holds the user's five points, piecewise linear
  between them. Every district is larger than the one before; 3D-21 checks all 100.
- **The city builder.** `sim3d/next/city.js` lays out avenues, streets and alleys, cutting
  the map into lots no larger than 22 × 16. Each lot gets one of eight neighbourhood
  types and becomes a named place.
- **The ruleset switch** (decision D1). `sim3d/next/rules.js` defines it: districts play
  `next`, while `classic` keeps 32 × 20 for parity. `?rules=classic` plays it in the
  sandbox.

**Measured:**

- **Generation:** 9 ms at district 1, about 90 ms at district 100.
- **Frame time** (whole frame, M3, 1080p, High with shadows): 11.2 ms at district 1 and
  12.8 ms at district 100, with 0.94 M triangles and nothing culled yet.
- **Sim:** the worst tick at district 100 is 6 ms with one alien.
- **Bots:** at district 1 (EASY) they won 7 of 8 runs on the city, against 5 of 8 on the
  classic map.

**Found on the way:**

1. **Open lots read as fields.** Plazas, yards, markets and parks were carved fully open,
   merged with the streets and became huge empty fields, the worst shape for a stealth
   game. The ASCII dump showed it before any rendering did. Yards, markets and parks are
   now walled with gates; plazas stay open.
2. **The bots never found a key on a city map.** `bots/policies.js` sized its path buffer
   for 32 × 20, and a typed array silently drops writes past its end, so every route a bot
   computed was garbage. Criterion 3D-9 caught it ("no win at district 1 EASY in 8
   attempts"). The buffer is now sized to the map; on a 2D map it is the same 640-cell
   buffer as before.
3. **Runs would time out.** The 2D time limit is 180 s of 8 ticks, which is six real
   minutes at the 3D tick rate. On `next` it now scales with the map's side: about
   13 minutes at district 1 and 46 at district 100.

**The 2D game.** Two 2D files changed, neither in behaviour:

- `sim/gen.js` exports `scatterBolts` and `scatterCoins`, which the user allowed.
- `bots/policies.js` sizes its buffer to the map, as above.

The new criterion 3D-20 hashes 10,000 2D levels against a fingerprint recorded before the
change: identical. The 2D suites still give 12 / 1 / 0, and webcheck is green.

**Not verified:**

- Nobody has played a city yet.
- The aliens are unchanged, as few and as slow as on a 640-cell board, so deep districts
  may feel empty until N8.2.
- Performance was measured on one M3 only.

---

## R53 · Keys you can find, and the tier speeds the tiers' names promise (3D build 22)

**Asked:** "in the minimap that we see when pressing tab, the keys are very small and hard
to find ... blinking ... or having a beacon on their own each", and "make the aliens
speed as 0.5x, 0.75x, 1x and 1.3x for the easy, medium, hard and the ultra hard levels
respectively".

**Built:**

- **Beacons.** Every uncollected key on the Tab map gets a gold beacon drawn at a fixed
  screen size: two rings pulsing out about once a second (well under the 3-flash limit),
  a breathing marker and its distance in metres. The open portal gets a teal one. Labels
  flip inward at the right edge.
- **The player's arrow.** It shrank with the map too, and is now drawn at a fixed size.
- **Tier speeds.** They are now 0.5 / 0.75 / 1 / 1.3 on the 3D page (`paramsFor()` in
  `sim3d/next/rules.js`), and the hub's tier picker shows them.

**What I assumed:** "speed" means the sim's own speed factor. The 2D tier blurbs already
say "half speed", "three-quarter speed" and "full speed", but `ALIEN_SPEED_CAP` holds
them to 0.375 / 0.5625 / 0.75, and ULTRA is 1.0. So every tier gets about a third faster.
In walking-speed terms, a hunting alien now moves at 29–33 % on EASY, 43–50 % on MEDIUM,
57–67 % on HARD and 74–87 % on ULTRA.

**The 2D game** keeps its own speeds, and so does `classic`, so parity (3D-3) holds.

## R54 · N8.2: few aliens, fast where you cannot see them (3D build 23)

**Asked:** "after you have done this, implement N8.2".

**Built.** `Game3DNext` (`sim3d/next/game.js`) overrides `Game3D` for `next`:

- **Population.** The arrival cap is `round(4·√A)`, 9 at district 1 to 31 at 100.
  Divisions stop at twice the cap.
- **Speed.** Aliens move at rates in cells per tick, with travel at 2 × tier walking
  speeds when more than 40 m away and out of line of sight.
- **Arrivals** (`sim3d/next/spawn.js`) are drawn 25–60 m away, out of sight, weighted by
  the prediction. The aliens there at the start are 60–120 m out.

**How the user's tier speeds met the plan.** The plan capped hunting at 70 % of walking
speed so an alert can always be outrun. With the new tier speeds, HARD is already at
67 % by district 10. A flat cap would have made HARD and ULTRA identical, which undoes
what the user asked for. So the ceiling scales with the tier: 70 % on HARD and 91 % on
ULTRA, where you hide rather than outrun. The 0.5 : 0.75 : 1 : 1.3 ratio holds at every
depth (3D-29 checks it).

**What the measurements said** (Node, M3, district 100, bots):

1. **The first version stuttered.** The worst tick was 11.7 ms. Profiling found three
   causes:
   - Every division recomputed par with the slow search. That's 2D behaviour: about
     9 ms, and up to 10 ms at the worst.
   - The squad re-dealt regions every re-plan, so patrolling aliens re-routed about three
     times a tick.
   - A chase drops every chaser's route, so when the alert ended they all needed new
     ones on the same tick.
2. **The fixes:**
   - **FastFields** (`sim3d/next/field.js`): the same BFS without bounds tests, modulo or
     predicate calls. It is identical cell for cell and 12–15× faster (0.125 ms against
     1.5 ms for a full district-100 field).
   - A patrolling alien keeps its destination for 6 s.
   - Chasers keep their old route.
   - Route fields are cached by target, with at most 10 new ones a tick at district 100.
3. **Result:** the tick is 2.5 ms at the 99th percentile and 3.9 ms at worst, with 35
   aliens. The whole frame is 10.8 ms mean at 1080p High, unchanged from build 21.
4. **Early captures.** Bots were sometimes caught within 5 s at districts 50 and 100.
   The trace showed one alien travelling fast while out of sight, slowing at about 40 m,
   and the bot walking straight into it, as designed. The aliens already on the map are
   still moved out to 60–120 m, so a run does not open with one round the first corner.

**A criterion needed changing.** 3D-27, the contact test, walked in a straight line at
the alien. On a city, with aliens starting 60–120 m away, that meets a wall, and 2 of 10
runs never arrived. It now walks the route. The property it guards, that the body never
enters an alien, held throughout: 0 overlaps.

**New criteria:**

- **3D-28.** New routes per tick stay within twice the budget, and tick time stays under
  32 full-map searches at p99 and 64 at worst. It is measured in searches on the same
  machine, so it holds on CI.
- **3D-29.** It checks the tier table at every district. It also checks that every
  multi-step move happened far away and out of sight (16,661 of them), and that no
  arrival landed in sight (110).

**Not verified:**

- Nobody has played it.
- Whether a full city at district 100 is tense, empty or overwhelming is the user's call.
  The arrival cap, travel speed and ceiling are single constants in `rules.js`.

---

## R55 · N8.3: keys, the portal, a map you can read, and how long a run takes (3D build 24)

**Asked:** "yeah proceed with N8.3 now".

**Built:**

- **Keys.** There are now `round(4 + 6·(d−1)/99)`: 4 at district 1 up to 10 at 100. Each
  goes in its own place, at least 25 m from the others, and never all in one half of the
  map. 0 of 80 test cities broke a rule.
- **The portal** is drawn from the quarter of place centres furthest, by walking, from
  the nearest key. It lands about 50 m from the nearest key at district 1 and 100 m at
  district 100.
- **The Tab map:**
  - the wheel zooms, and zooming closes in on you;
  - dragging with the button held pans it;
  - it reopens centred on you, at the zoom it was left at;
  - while it is open, a click does not fire the stun gun and a drag does not turn you;
  - place names appear wherever they fit, and avenue names from ×1.5;
  - off-screen keys are pinned to the edge, and pinned labels stack.

**Measured run length** (bots; "walk" is a bot taking the greedy route with no aliens):

| District | Walk | Par | Bot wins with aliens (MEDIUM) |
|---|---|---|---|
| 1 | 0.9 min | 1.2 min | 3/12, in 0.9 min |
| 10 | 1.3 | 1.7 | 3/12 |
| 25 | 1.7 | 2.3 | 4/12 |
| 50 | 2.6 | 3.5 | 2/12 |
| 75 | 3.3 | 4.4 | 1/12 |
| 100 | 4.4 | 6.0 | 1/12, in 4.3 min |

The walk matches the geometric estimate in R51 (3.7 min with 10 keys at district 100).
Bots do not hide, so how long a human run lasts is still the user's to report.

**The time limit, tightened.** N8.1's `√A` formula gave 13–46 min. That was 10–15 times
the walk, and nobody could see it until the end card said TIMED OUT. It is now
`max(6 min, 6 × par)` per run, about 7 min at district 1 and 36 at district 100. The HUD
turns the clock red and counts down through the last minute.

**Found on the way:** with the map fully zoomed out, the view's centre was clamped to the
district's middle and kept there. Zooming in from the full view therefore went to the
middle of the map, not to the player. The requested centre is now stored separately from
the clamped one.

**New criterion 3D-30:**

- the key count at five districts;
- one key per place, the spacing and both halves, over 68 cities;
- the portal drawn from the far quarter, over 16 runs;
- the time limit equal to `max(6 min, 6 × par)`.

**Not verified:**

- Zoom and drag were tested with synthetic wheel and mouse events, not a real mouse or
  trackpad.
- Run length is from bots only.

---

## R56 · A held Tab only flashed the map (3D build 25)

**Asked:** "pressing tab, only blinks the map once, i want the map to be displayed as long
as tab is being pressed".

**Why.** The keydown handler returned early on auto-repeats (`if (e.repeat) return`)
*before* reaching the Tab check, so only the first Tab keydown was cancelled. Every
repeat after it did the browser's own Tab: focus walked through the page's few
focusable elements and out to the browser's own toolbar. The window then lost focus, and
build 24's guard against alt-tab (close the map on window blur) closed it. Even without
that guard, focus leaving the page can end the pointer lock, which also closes the map.

**Fixed:** every Tab and M keydown is cancelled, repeats included, and the map opens
once; the keyup is cancelled too.

**Checked:**

- In the browser, one keydown and twelve repeats were all cancelled; the map stayed up
  while held and closed on release.
- A real held key cannot be pressed from here; synthetic events do not perform the
  browser's default actions.

---

## R57 · N8.4: drawing a city without drawing all of it (3D build 26)

**Asked:** "start N8.4, everything works fine so far".

**Measured first** (district 100, Medium, 1080p, M3): mean 12.4 ms, p95 17.0 ms, 109 draw
calls, 609k triangles. By layer:

| Layer | Triangles |
|---|---|
| Rubble (19,600 blocks) | 235k |
| Wall bodies | 120k |
| Wall caps | 120k |
| Floor | 57k |

All of it was drawn every frame, because each tile type was one mesh with one bounding
sphere covering the whole city.

**Built:**

- **Chunks.** Every instanced layer is cut into 48 m chunks (218 at district 100).
- **Far plane = fog.** The far plane sits at 100 m, just past the fog's solid end at
  90 m. Both are by view depth, so culling is invisible.
- **Buried walls.** A wall cell walled in on all four sides gets a cap but no body.
- **Shadows** follow you in a 90 m box, snapped to texels.
- **Frame-rate setting:** automatic, 60 or 30.

**What the measurements said:**

1. **Chunking alone** cut triangles to 272k at most and p95 to about 13.5 ms, but the mean
   only to about 11 ms. Something besides the 3D world was expensive.
2. **The HUD cost 7.4 ms** a frame (10.4 ms with it, 3.0 without). Removing *either* the
   2D board's redraw *or* the minimap's copy of it removed the whole cost, so it was the
   pair. Every frame the HUD redrew a 2232 × 1395 offscreen board, then copied that
   just-changed canvas into the minimap, which shows about 13 cells of it.
   - **Fix:** a second 2D renderer draws only a 16-cell window round you (a 13-cell
     circle fits in it at any rotation), offset by its context transform. The whole board
     is drawn only while the Tab map is open. `web/render.js` is untouched.
3. **Two guesses were tested and dropped.** Holding the background as an ImageBitmap
   made it slower. Replacing it with a 1×1 canvas changed nothing.
4. **Result** (three runs): mean 5.3–8.4 ms, p95 10.7–12.2 ms, worst 16.1 ms. High: mean
   5.3 ms, p95 7.8 ms. Recorded for 3D-11 at build 26.
5. **The frame cap's first version** drew "long enough since the last frame". That gave
   48 fps for a 60 cap on a 144 Hz display. Frames are now due on a fixed schedule, and
   simulated 60, 75, 120 and 144 Hz displays give exactly 60 and 30.

**Not verified:**

- The pane was hidden throughout, and GPU timings vary by about a third between runs.
- Nothing was measured on a weaker laptop.
- The frame cap was checked with simulated timestamps; a hidden pane runs no animation
  frames.

---

## R58 · Developer mode, removable (3D build 27)

**Asked:** "if i enter my developer code, I would be able to access all the levels and
have all weapons unlimited from the shop, so that I can test the levels out. this dev
mode should be removable after I have completed the game fully".

**Decided, and why:**

- **Dev runs are the unsaved sandbox, not the career.** Unlocking every district in the
  MAIN file would write test runs into the user's real save: scores, unlocks, and the
  dossier the aliens learn from. So "all levels" is a separate picker of every district,
  and "all weapons unlimited" is the dev run's own kit. The stun gun is kept at its 6
  charges and there are 999 s of lightning, both topped up every tick.
- **Two switches beyond the ask,** because the stated purpose is seeing how levels
  render: "they can't catch me" and "empty city". Also `[` and `]` change district.
- **The code is a salted SHA-256** in the public repository. The plain code went into a
  git-ignored local file, and was never printed to the terminal or written into this
  conversation.
  - Browser tests used a throwaway code, which was then replaced by a freshly invented one.
  - It is a convenience lock, not security, and the docs say so: a static site cannot
    hide a check from someone reading its source.
- **Removal.** Every hook is one line tagged `DEV-MODE`. `npm run remove-devmode` deletes
  the five dev-mode files and strips the tagged lines and the npm scripts. 3D-31
  dry-runs that every time, checking that nothing still refers to the deleted files and
  that every rewritten script parses.

**What the tests caught:** an apostrophe in "can't" inside a single-quoted string in
`dev3d.js`. It was a syntax error that would have broken the play page; 3D-31's import
of the module found it before any browser did.

**Checked in the browser:**

- A wrong code was refused. The test code opened the panel with 100 districts.
- The options carried into the links.
- A dev run started with the full kit and was topped up after spending.
- An alien on the player's cell did not catch them.
- `[` and `]` changed district.
- The same dev URL in a browser that was not unlocked was an ordinary sandbox: no gun,
  no strip.

**Not verified:** a career URL with `dev=1` was not exercised end to end. The preview's
fresh guest save redirected to the hub first. The refusal is the first condition in
`installDevRun`.

---

## R59 · The order after N8: art, items, floors, objectives, story last

**Asked:** whether the story (N5) should be left to last, then whether floors (N9) should
come before objectives (N7), and finally: "we can include floors later, and also patch
the art also later, it is art first. so lets go with A."

**Decided (the user's call):** N8.5 → N4 → N6 → N9 → N7 → N5.

- **Story last.** It is written against the finished game: places, landmarks, items,
  floors, objectives and the habits the Dispatch quotes. Written earlier, it would be
  rewritten as those change.
- **Floors before objectives.** A rescued courier has to use stairs, and relays are spread
  across floors. Objectives built on floors are built once.
- **Art before floors, by preference.** The alternative, floors before art, was offered
  as more consistent with "structure first". The user chose to see the art sooner and
  patch it for floors later.

**Knock-on, written into the spec:**

- N9.1 carries 1–2 extra days to patch the N4 art (stairs, slabs, interiors) and the N6
  items (sound between floors).
- Until N5 exists, N7 takes each district's objective from its own table
  (`web3d/objectives3d.js`).

The total remaining is about 10–15 weeks.

---

## R60 · N8.5: the Dispatch learns habits, not rooms (3D build 28)

**Asked:** "Start N8.5". The plan, from R51: the user asked for the aliens to learn
"the behaviour of the player rather than the exact location (like the player likes to
hide, has trouble at the corners, gets lost pretty easily, stays at the same place
looking at map ...)".

**Built** (3D-only, `sim3d/dispatch/`; nothing in `sim/predictor/` changed):

- **Tier 1 is geometry only.** `GeometryChain`: each region's share of the cells you can
  reach in 20 ticks. The room chain is gone from 3D.
- **The habit file.** Five habit measures, kept per profile as `habits3d` and z-scored
  against the five ordinary bots (`npm run priors3d`).
- **A tactic per habit,** in the squad re-plan, at a strength set by how far the habit
  sits above the population. At 0 a tactic does not exist.
- **The Tab map** is now part of the input record.
- **Five habit bots:** hider, cornerShy, wanderer, mapReader and runner.
- **The chatter's file note** names the strongest habit.

**What the measurements said, in order:**

1. **The first recognition pass caught two of five.** The hider was recognised, but the
   map reader and wanderer read zero on the map habit and the corner bot read *negative*.
   - **Map:** the map state was never put on the game's view, which is what the
     measure reads. It is now.
   - **Corner:** the bot hesitates on the approach, the cell before the corner zone,
     which the measure counted as "elsewhere". The zone is now two cells, and the bot
     decides on one.
2. **The map reader also read as corner-shy,** because stopping to read the map counted
   as stopping at a corner. The corner measure now uses calm, map-closed ticks only.
3. **The runner read average.** "Under threat" was judged after the step, so every
   successful escape (11 → 13 cells) was excluded, and walking past an alien toward a
   key counted as fleeing. Both fixed. After that, every habit bot's strongest habit is
   its own, and of the ordinary bots only the random walker (lost) and the evader (run)
   show one, both fairly.
4. **Paired runs** (20 each, same district, seed and record, tactics on vs off): the
   corner, lost and map tactics got their bot first seen 16–20 s sooner. But **the hide
   tactic backfired**: 15 of 20 caught against 19.
   - Sending aliens to water ahead of a hider who is calmly walking took them off a squad
     plan that was already working.
   - The alien camped outside the black box kept the bot hidden for good.
   - **Fix:** it now acts only once you have gone to ground, searching the water nearest
     where you were last seen. Result: same captures, first seen at 36 s instead of 48.
5. **The runner's flank point** (8–14 cells) was usually reached too late. At 5–11
   cells the runner is seen 16 % more in chases (21.1 → 24.4 detections); captures are
   unchanged. It's the weakest tactic, honestly reported.
6. **Bots with no habit:** 24 of 24 paired runs identical, tick for tick. A player without
   a habit plays the same game as before.

**New criterion 3D-22** checks all of this: prediction at least 3× uniform for ten
bots (7.2× is the worst), recognition, the paired effects, no-habit identity, and an
exact replay of a map-open run. It runs in about 28 s.

**Seen in the browser:** with a map habit at strength 0.77, standing still with the map
open for a few seconds sent both aliens on the map to the player's cell. The record
holds the map rows, and the chatter ended "File note: subject stands still to read its
map. Units, close in while it reads."

**A flaky check, found and fixed.** The first full suite failed 3D-28: one district-100
tick took 44.8 ms, while the 99th percentile was 3.2 ms. Two causes:

- **Real extra work.** The geometry tier ran a full-map search whenever you moved, though
  it only needs depth 20. It now stops at depth 20, covering the same cells; the 99th
  percentile is back to 2.7 ms.
- **An isolated slow tick.** It appeared in 2 of about 8 runs, both while the machine was
  busy, and never under `--trace-gc`, where major collections take about 0.5 ms. That
  points to the process being descheduled, not sim work.

The worst-case bound is now on the 99.9th percentile rather than the single slowest tick;
the slowest is still printed.

**Left as is:** the Dispatch's opening line for a new subject (`web/dispatch.js`, 2D) says
"barely a guess" even when the projection is sharp. It is 2D wording, untouched.

**Not verified:** no person has played against the tactics. Each tactic's reach (aliens
per tactic, the strength curve, the map stillness time) is one constant.

## R61 · N4.1: sky, light, weather, and the first three belts (3D build 29)

**Asked:** "Start N4.1". From R59's order: art first, then items, floors, objectives,
story last. N4.1 is the sky, lighting and weather, and the art of RUST, TIDE and MOSS.

**Built** (browser-only, `web3d/art/`; nothing in `sim/` or `sim3d/` changed):

- **`belts.js`, pure data.** Each art-directed belt has its surfaces, props, weather, and
  a sky and light at dusk and at midnight. `artFor(district)` mixes them by depth in the
  belt, so the ten districts run from dusk to midnight. The sun sets over the first half
  of a belt; the moon is up for the second. Being pure, the palette check runs in Node.
- **`textures.js`:** five canvas styles (riveted, plates, wetConcrete, mossyStone,
  flagstones), each a colour and a height canvas, the normal map from the height's
  Sobel gradient. Wet concrete also gets a roughness map.
- **`props.js`:** pipes and valves (RUST), bollards and buoys (TIDE), vines (MOSS), all
  instanced, on street-facing wall faces or in open water only.
- **`weather.js`:** dust, rain and spores, one `Points` cloud moved and wrapped round the
  camera entirely in the vertex shader.
- **`sky.js`:** the sky dome shader: gradient, sun or moon with glow, stars, fbm clouds,
  MOSS's canopy and TIDE's lighthouse beam. Its horizon is the fog colour.
- **Light** comes from the sun or moon you can see (`skyDir`), so High's shadows agree
  with the sky.
- **Belts 4–10** get the same sky and dusk-to-midnight light from their 2D palettes
  (`fallbackArt` in `world.js`) until N4.2.

**New criterion 3D-16**, the palette lint: 270 large-area colours over districts 1–30,
none within 25° of hue and 0.25 of lightness of an alien, key, coin or portal colour;
horizons never brighten going deeper.

**The lint caught one before it shipped:** RUST's first cloud colour sat on the alien
reds and the copper coin. It was darkened.

**Seen in the browser** (dusk and midnight of each belt, and `3d/belts.html` at offsets
0 and 9), and fixed:

- Water read as cyan in every belt; it now has a colour per belt.
- RUST at dusk was too dark to play (hemisphere light raised from 1.55 to 2.0).
- The dust was invisible: too small and too faint.
- Puddles and water ripples repeated on an obvious grid. Each floor and water cell now
  gets a seeded quarter turn, and the puddles are fewer and fainter.
- The stone's relief was too strong (normal strength 1.5).

**Two shader bugs** that only a browser shows:

- **`half` is a reserved word in GLSL ES.** The weather's vertex shader declared
  `vec3 half`; the program never compiled, so there was no weather at all, and the
  page showed nothing wrong. Found in the console. Renamed.
- **Reversed `smoothstep`.** `smoothstep(far, near, x)` is undefined in GLSL when the
  first edge is the larger one. It happens to work on some GPUs. Every use is now
  `1.0 - smoothstep(near, far, x)`.

**Lesson:** after any shader change, read the console's errors. A shader that fails to
compile draws nothing and throws nothing.

**Measured** (3D-11, re-recorded; Medium, 1080p, M3, hidden pane):

| District | Mean | p95 | Draw calls |
|---|---|---|---|
| 20, TIDE at midnight (heaviest rain) | 3.7 ms | 7.1–9.6 ms | 141 |
| 30, MOSS at midnight | 2.9–6.3 ms | 3.5–11.5 ms | 122 |
| 100, fallback art | 4.7–6.5 ms | 7.9–10.4 ms | 132 |

**Not built from the N4 plan, left for N4.2:** alien growth decals rising with depth,
landmark centrepieces, district-number signs, ruined facades, bloom and the per-belt
colour grade.

**Not verified:**

- no person has looked at it;
- not measured on a weaker laptop (rain is the heaviest weather);
- how the colours, the weather amounts and the prop densities feel is the user's call.

## R62 · The stun gun shoots what you can see (3D build 30)

**Asked:** "what is the shooting range of the gun? can you make it such that if one can
see the alien, and if the crosshair is inside their body, then one can shoot them?" And
on the art: "how about some wall art? or would it be better if they are added after the
story?"

**The range was 4.6–5.6 cells, 7–8.4 m:** the alien's own detection radius, carried
over from the 2D rule in phase 4. On a city map you could watch an alien 40 m down an
avenue with the crosshair on it and get a grey bracket.

**What "can see" means now.** Two things changed.

- **Reach is 72 m (`STUN_RANGE_M`).** Measured in the browser down an 84-cell street in
  RUST at district 5: an alien is a clear figure at 30 m, a small one at 45 m, a dim
  speck at 60–72 m, and gone into the fog by about 85 m. With linear fog from 26 m to 90 m,
  72 m leaves about a quarter of its contrast.
- **The line is the one you look along.** It runs from your eye to the point on the
  body the crosshair is on, with heights. The old line ran flat, from cell centre to
  cell centre, and treated a rubble heap (1.2–2.2 m) as a wall. Now a head showing over
  a 1.3 m heap can be shot, and the legs behind it cannot.

**Built:**

- `sim3d/solid.js` gives every cell's solid height: walls 3.2 m; rubble from the seeded
  draw `world.js` was already making, now shared, so the drawn heap and the sim agree.
- `raycast.js shotClear` is the grid march with each cell's span of the line checked
  against its top.
- `Game3D.canStun(id, aim)`. The page sends the aim with the shot (six integers in
  1/32 units), and it goes into the input record, hashed only when present. The sim
  re-checks the same line against the real positions: the eye within 5 cells of your
  cell and not inside a wall, the struck point within 2.5 cells of the alien's.
- The renderer walks every body along the ray and takes the nearest one you can see.
- **Also fixed: the crosshair could find aliens through walls.** Picking ignored walls,
  so it put a grey bracket on any alien behind one. Hidden aliens now get no bracket.

**Checked in the browser:**

- locks at 15, 60 and 70.5 m;
- a grey bracket at 75 m;
- nothing at 90 m;
- a head over a 1.31 m heap but not its legs;
- no bracket behind a wall;
- touch aim-assist;
- a real trigger pull through the game loop at 54 m: one charge spent, alien stunned,
  beam drawn to the struck point.

**Tests:**

- 3D-6 now checks 6,000 trigger pulls against an independent height-aware reference.
  Half carry aims, some deliberately off target. 11 of the hits were over rubble the
  flat test calls blocked. It also checks reach on a district-100 street: 47 cells yes,
  49 no.
- 3D-7 compares `shotClear` with the reference on 10,000 rays with heights.
- 3D-4's runs now fire aimed shots and still replay exactly.

**Not changed:** a trigger pull before your first move still does nothing (the opening
freeze holds the whole world).

**Not verified:** balance. The gun is much stronger: an alien can be stunned long before
it is close. The reach is one constant. Not played with a mouse by a person.

**Wall art: both, in two layers** (recommended; added to spec-3d-next.md):

- **N4.2 builds a decal layer** on street-facing wall faces, placed like the props and
  drawn into a per-belt canvas atlas. It fills the layer with art that needs no story:
  faded pre-invasion posters, graffiti tags and stencils, warning and street signs,
  peeling paint.
- **N5 adds wall art that tells the story** to the same layer, as data: survivor
  messages, tally marks, the courier sign leading to a transcript, occupation
  propaganda, murals at named places.

Waiting for the story would leave the walls bare for three phases. Doing it all now
would mean writing story content before the story exists.

## R63 · N4.2: every place looks like what it is (3D build 31)

**Asked:** "there are different regions in the same district, like different buildings
etc. I want the art to be slightly different for each of them, else there is no point in
naming the buildings alone." I agreed. The city builder has given every place a kind and
a name since N8.1, but the renderer never read them, so "Wren Market" and "Larch Blocks"
looked the same. I recommended doing this before the other seven belts, because the
kinds of place change how every belt is built. The user said "Yes, places first", so the
old N4.2 (seven belts, centrepieces, bloom) is now N4.3.

**Three levels of look:**

1. **Belt:** the colours (N4.1).
2. **Kind of place:** the pattern. `belts.js placeLook` pulls the belt's wall and floor
   colours toward the kind's tint, so RUST tenements are rusty brick and TIDE's are wet.
3. **Place:** a shade of its own, a few per cent.

The streets between places keep the belt's plain look.

**Built** (browser-only, plus one line in `solid.js`):

- `places.js`: 9 wall and 8 floor patterns.
- `layered.js`: per surface, one `DataArrayTexture` holds the street's slice and every
  kind's. Each wall and floor instance carries `aLayer`. A `MeshStandardMaterial` reads
  its maps from the array, its map lookups swapped in `onBeforeCompile`.
- Heights: tenements 5.4 m, depots 4.4 m. `solid.js` now treats every wall as solid at
  any height (it was 3.2 m), so the taller drawing changes no sim decision.
- Fittings:
  - yards' rubble is containers and crates, markets' is kiosks, each exactly as tall as
    the heap the sim knows, so 3D-6 still holds;
  - a park's lone wall cells are trees.
- `signs.js`: name plates at the gates, and wall art with no story in it. One merged
  mesh each.

**Why texture arrays.** One material per kind would multiply every chunk's wall and
floor draws by up to nine. With arrays the count stayed flat. The extra cost is about
26 MB of graphics memory.

**Caught on the way:**

- **The lint caught three colours:**
  - a plaza's stone sat on the copper coin's hue and lightness: greyed;
  - a market's mauve-brown goods colour did the same;
  - the name plates' cream lettering sat on the keys' gold: now a neutral off-white.
- **Lightning:** I dropped a lightning mark from the warning plates, which would read
  as the bolt pickup.
- **Seen in the browser and fixed:**
  - containers were near-black: tinted over the dark belt wall texture, they now have
    their own light ribbed skin;
  - lit windows were blown out to white: now a dim lamp gradient with a curtain, glowing
    0.18 at dusk to 0.8 at midnight;
  - the park was too dark: greener;
  - flat roofs were pale: darker.
- **The first measurement put district 20 at 150 draw calls**, the cap. Containers and
  tree crowns are now drawn whole instead of per chunk: 143.

**Measured** (Medium, 1080p, M3, one session):

| District | Mean | Draw calls |
|---|---|---|
| 20 | 6.8–8.5 ms | 143 |
| 30 | 6.4–7.6 ms | 120 |
| 100 (unchanged, the control) | 5.9–7.5 ms | 132 |

The machine ran about 1.5 ms slower than at build 29, so the place art itself costs
about 1 ms. Building the world takes about 250 ms warm.

**Not verified:**

- no person has walked it;
- not measured on a weaker laptop;
- whether each kind's look is right is the user's call.

**Left for N4.3:** belts 4–10 (with places from the start), ruined facades on rubble,
district-number signs, landmark centrepieces, bloom, the colour grade.

## R64 · N4.3: the other seven belts, landmarks, glow (3D builds 32–34)

**Asked:** "what is N4.3?", then "complete the entire of N4.3 now". It was pushed as
three builds so each could be reviewed: the belts, then the landmarks, then the glow.

**Build 32: the seven belts.**

- **Built:**
  - nine surfaces (`beltstyles.js`), registered into the style table;
  - seven prop kinds;
  - five weather kinds;
  - sky features: an aurora, a second moon, a giant sun, the mothership.
- **VIOLET and COBALT are always night:** one moon climbs all the way, and 3D-16's
  sun/moon rule knows that.
- **Colour rule:**
  - EMBER's sky is a dark maroon and CORAL's sunset a rose-magenta; a red sky would sit
    on the aliens' red.
  - The lint caught CORAL's tenement brick (too close to the calm alien's red);
    darkening the brick tint fixed it.
  - All 100 districts now lint clean, 3341 colours.
- **Seen and fixed:**
  - the mothership was invisible against the night sky, so it now has a lit underside
    and running lights;
  - the aurora was too faint;
  - JADE's moons were too small.
  - My first sky shots were all at the horizon: the game's frame loop reset the
    camera, so the shots now set its look through the controls.
- **Draw calls:** the new prop layers, cut into chunks, put COBALT at 167. Drawing
  every prop layer whole (one call each) brought it to 134.

**Build 33: landmarks.**

- **One skyline landmark per district:** a 30 m mast with a light, or a crashed ship
  half buried in a tenement roof. It stands on wall cells, solid to the sim at any
  height.
- **Plaza centrepieces:** statue, obelisk or fountain.
- **Avenue plates:** each avenue's name with the district number.
- **Building fronts:** each heap's biggest block, at the heap's own height, so the
  stun gun still hits exactly what you see.
- **Draw calls:** 123–139.

**Build 34: glow and grade.**

- **Written here, not vendored:** `post.js`, five small shaders against the plan's
  eight EffectComposer files, with no tone mapping to undo.
- **Bloom:** glowing props were plain white, under the bloom threshold, so they are
  now drawn at 2.4–3× white.
- **Mist:** JADE's mist read as grey puffs; it is now faint and edgeless.
- **Cost, honestly:** about 3–4 ms a frame at 1080p Medium on an M3.
  - Means stay inside 60 fps (9.2–13.9 ms).
  - EMBER and VIOLET's slowest 5 % of frames reach 16–19 ms.
  - 2× multisampling instead of 4× on Medium made little difference.
  - Low draws without it.
  - Offered: a separate on/off setting if it stutters for the user.

**Checked:**

- every belt at eye level;
- the sky features on their own;
- the belts page;
- a capture sequence through the new pipeline (no errors);
- 3D-16 on all 100 districts.

**Not verified:**

- weaker GPUs;
- whether each belt's look is right (the user's call);
- the grade's subtlety on a calibrated display.

## R65 · Glow gets its own setting (3D build 35)

**Asked:** "Add glow setting". I offered it after build 34 measured bloom and grade at
about 3–4 ms a frame on Medium, with EMBER and VIOLET's slowest frames at 16–19 ms.

**Built:** Settings › Glow and colour grade:

- **automatic** (the default): on at High and Medium, off at Low, exactly as in build 34;
- **on:** on at any quality, Low included (no multisampling there);
- **off:** off at any quality.

It switches the moment it changes (`Play3D.applyGlow` creates or drops the post
pipeline, and the belt's grade is reapplied) and is saved in `noise3d-settings-v2`. A
player can now drop the glow alone, keeping shadows and resolution.

**Checked in the browser:** all three choices at High and at Low, switching live, the
choice saved, no shader errors.

**Not verified:** a weaker laptop.

## R66 · N6.1: the inventory wheel and the first three items (3D build 36)

**Asked:** "implement N6.1. make sure that one can access their inventory by pressing
spacebar and choosing the weapon to be used with the rotation of their mouse."

**The input changed from the plan.** The plan had an item bar on keys 1–6. The user
asked for a wheel:

- hold Space, and a wheel opens with the stun gun at the top and the items round it;
- the mouse steers a pointer, and the view holds still;
- the slot in the pointer's direction is highlighted, and letting go of Space takes it
  in hand;
- clicking uses what is in hand.

Space was free; it now prevents the page's default scroll. Alt-tab cancels the wheel,
as it does the map.

**Built:**

- `sim3d/shop3d.js`: the item table, `canBuy3d`, `applyPurchase3d`.
- `Game3DNext`: `canUseItem`, `useItem`, the dampers' radius, and the decoy's hold on
  the squad re-plan.
- The input record: `item` in a row, hashed when present.
- `persist3d.js buyItem3d` and `returnItems3d`: the single write path.
- The hub shop, career carry-in and write-back, dev mode (unlimited), and the wheel and
  in-hand line (`hud3d.js`, `controls.js`).
- `play3d.js`: the target ring, the throws, and the decoy's and EMP's effects.

**Tuned from the plan:**

- The decoy reaches 8 cells, not 6: 9 m was too short to pull a hunt away.
- It also draws patrols within 14 cells, not only hunters: in a game about being heard,
  a rattle should draw the curious.
- Throws pass over rubble; only walls stop them.

**Tests.** 3D-17 checks each rule against a reference written in the test:

- dampers 0.75× once;
- 160 EMP placements, every stunned set exact, bad targets refused with nothing spent;
- 40 decoys: the hunt ends on them, the drawn aliens are held through re-plans, and
  patrols beyond the pull are untouched;
- nothing used with none carried;
- three runs with items replay tick for tick.

**Checked in the browser:**

- the wheel opens on Space;
- each slot can be picked with the mouse;
- the view holds still;
- each item is used through the real click path;
- the decoy's rings and the EMP flash;
- the shop rows.

**Not done:**

- bot balance runs: no bot policy uses items yet. N6.2's "balance measured" will need
  one;
- a wheel for phones.

## R67 · Throws: no range, ray-traced (3D build 37)

**Asked:** "make the range for these throwables infinite, and give them a raytracing for
it."

**Built.** The noise maker and the EMP lose their 8- and 6-cell limits.

- **The throw is a ray.** It runs from the eye through the crosshair, carried in the
  input record (quantised) instead of a target cell.
- **The sim traces it itself** (`raycast.js throwLanding`): the same grid march as
  `shotClear`, with each cell's span checked against the ground and against the cell's
  solid top.
  - The item lands where the ray reaches the ground.
  - If the ray meets a wall or a rubble heap first, it drops in the last open cell
    before it.
  - At the sky or off the map, nothing lands.
- **The page uses the same function**, so the ring is exactly where the item comes down,
  at any distance.
- **The arc.** A dotted arc from the hand to the ring is drawn, and the item flies along
  it. The arc is presentation only: the landing is the ray's.
- **Headless uses** still pass a cell (`{ x, y }`, walls-only line of sight), so bots and
  tests can throw without a camera.

**Tests:** 3D-17 now traces 4000 random rays against an independent reference (the
touched cells by slab clip, sorted by entry), checks that the page's quantised ray lands
where the sim says, and replays runs whose throws are rays.

**Checked in the browser:**

- landings at 2, 14, 32 and 53 m down a street;
- aiming up lands short of the wall at the street's end;
- an EMP thrown 32 m landed in exactly the aimed cell.

**Not verified:** balance. Unlimited range makes both items stronger. Prices are
unchanged and the user's call.

## R68 · N4.4 prototype: district 1 in a horror look, chosen with antialgorithm (3D build 38)

**Asked:** "make the art work at least 10 times more detailed … like Amnesia, Silent Hill
… design the rust level 1 alone in this format … install that skill, and use it. I want
to see … how good does that make the game generation look like non-AI."

**The skill** (github.com/mankidev/antialgorithm) was cloned into
`~/.claude/skills/antialgorithm`, its scripts read first (they only touch a local
history file), and loaded with the Skill tool. Its rule: name the default, then move away
for a reason from this project. The user fixed the genre, so it was used only for what
was still open:

| Default | District 1 does instead | Reason (a NOISE fact) |
|---|---|---|
| Silent Hill's white fog | Brown foundry smog | RUST is the foundry belt |
| Blood, dolls, wheelchairs, a motel sign | No gore: the street shows people trying to be quiet | The aliens hunt by sound and take people |
| Boards on every window | Mattresses and foam nailed over, some boards, a few lit | Soundproofing |
| *A Quiet Place*'s sand paths | Shoes left in pairs at doors, cut bell ropes | The same fear, not the famous image |
| Every lamp dead, or every lamp flickering | Most smashed, about 45 % burning | Lamps hum |
| A perfect grid of identical boxes | Frames, cornices, chimneys, pipes, cables; grime by world position | The skill's "AI finish": perfect geometry, unchanged repeats |

**Built.**

- **Light, fog and grade:** `belts.js RUST_HD`, `world.js lightScene` (torch, lamp pool)
  and `post.js` (grain, fringe, vignette).
- **Grime:** a world-space map in `layered.js`.
- **Detail:** `art/hd.js`, seven merged meshes.

**Seen and fixed in the browser:**

- the torch's hot spot was blown out (intensity 42 → 20);
- the dust read as glowing orbs (size 0.1 → 0.035);
- the wet sheen sparkled like noise;
- there was only one burning lamp (now 7).
- High ran 15 ms with p95 22 ms because the sun and the torch each drew a shadow pass of
  every merged mesh. The sun's shadows are dropped here, and only the trim casts:
  11.6–13.5 ms.

**Measured** (1080p):

| | Mean |
|---|---|
| Medium, district 1 | 9.4–12.4 ms |
| Medium, district 2 (unchanged, the control) | 9.5–9.9 ms |
| High, district 1 | 11.6–13.5 ms (p95 to 22 ms) |

**Not verified:** a weaker laptop; whether the user likes it. The detail meshes are
district-wide, so they need chunking before the big cities get them.

## R69 · Fixes after the prototype review; why the buildings still look generated (3D build 39)

**The user said:**

- the buildings carry random, repeating designs with no meaning, and look well kept for
  a city under invasion;
- a stunned alien sinks half into the ground;
- the torch is annoying: make things visible, and keep the torch for dark alleys;
- "is this what the antialgorithm gave you?"; if it cannot do better, suggest free
  models to download.

**Fixed:**

- **The stunned pose.** It was a 72° tip about the feet plus a 0.35 m drop. Now the alien
  falls flat on its back, raised by its body's thickness (lowest part within 5 cm of the
  ground).
- **The torch** is off until F.
- **Open ground** is lit by the sky: hemisphere light 1.9, fog from 7 to 72 m.
- **Darkness map.** How much sky each cell sees past the walls within 4 cells (weighted by
  height and nearness), blurred, with walls taking their street's value. It scales only
  the ambient light, through a patch on every standard material in the district. So an
  alley is nearly black (0.10 at its darkest), while the torch and lamps, being direct
  light, still light it. The sun is cut to 0.18 so it does not light the alleys.

**The honest answer on the buildings.** The skill decided *what* the street shows:
mattresses over windows, shoes at doors, smog. It does not and cannot make the craft
look less generated. The generated look comes from the medium itself:

- facades are canvas patterns drawn by code, one per kind of building;
- every building is a stack of identical 1.5 m boxes;
- decoration is placed by rules.

More code-drawn detail gives more of the same. The fix is art made by people.

**What is available:**

- Poly Haven's **Hidden Alley** collection: photo-real, CC0. Apartment and factory
  facades, fire escapes, gutters, chain-link, poles, roller shutters, lamps, bins, a
  covered car, barriers, manholes, air-con units. 18 pieces come to about 95 MB at 1K
  textures; the apartment facade is 118k triangles.
- ambientCG: about 20 photo-scanned CC0 facades, dirty bricks and painted metal, 3–9 MB
  each at 1K.

The OpenGameArt CC0 packs found by search could not be checked: their site's
certificate is not trusted on this machine.

## R70 · District 1: every building its own (3D build 40)

**Asked:** "the buildings you have don't even have an entrance. can't distinguish whether
the buildings are hotels, or house, bar, restaurants … they all look the same, which is
what primarily makes it look like slop … every adjacent building [should be] very unlike
… go all out … don't worry about the size." With two reference images: Amnesia's room and
Halo concept art.

**Assets.** The user's "don't worry about the size" answered the download question
(R69). 15 CC0 material sets from ambientCG, 1K, colour, normal and roughness only (44 MB),
are in `assets3d/materials/` with `assets3d/CREDITS.md`. They were chosen to keep the
palette rule: the yellow painted brick and the red peeling metal were left out.

**Built** (`web3d/art/buildings.js`, district 1 only):

- **Splitting.** Each solid tenement block is cut along its street front into runs of
  3–6 cells, each a building; the block's inner cells go to the nearest one. 254
  buildings.
- **Purpose.** House, apartments, shop, bar, cafe, pharmacy, launderette and garage,
  plus one each of cinema, bank, hotel and clinic. A building never matches a neighbour's
  purpose or wall material.
- **Each building's own:** storeys, ground and storey heights, wall, paint colours,
  damage, burnt or not, a sign (a trade and a surname drawn from many origins, not the
  stock list), and a font.
- **Ground floors by purpose:**
  - shopfront: tiled riser, display glass, glazed door, shutter;
  - pub: black panelling, small panes;
  - cafe: awning;
  - garage: roller door, tyres;
  - cinema: doors and posters;
  - bank: pilasters, steps, barred windows;
  - hotel: canopy;
  - clinic: double doors;
  - house: stoop, railings;
  - apartments: lobby door with an entry panel.
- **Upper floors:** sash, grid, or tall windows with balconies. Each window is broken,
  boarded, has a mattress over it, is glass with a curtain, or is lit. Apartments have
  fire escapes; air-con units hang under some windows.
- **Roofs:** pitched slate with chimneys, flat with vents, a water tank, or the hotel's
  rooftop sign.
- **Damage:** soot, signs missing letters, brick fallen onto the pavement.
- **Construction.** Merged per material (25), with UVs from world position so nothing
  stretches. Building cells drop out of the old wall instancing and decoration, and
  district 1 loses the random wall art the user called meaningless.

**Seen in the browser:**

- buildings first came out one cell (1.5 m) wide, so runs were raised from 1–5 cells
  to 3–6;
- the scene was too dark, so the grade gain was raised to 1.4;
- a street reads as a row of different businesses and homes: "BAR ESPOSITO", a clinic,
  "BUTCHER", "HARDWA E" with a letter gone.

**Measured** (1080p):

| | Mean | p95 |
|---|---|---|
| Medium | 11–14 ms | — |
| High | 14–15 ms | up to 23 ms |

Everything in district 1 is drawn at once, so bigger districts will need it chunked.

**Not built:** interiors.

## R71 · District 1: a new art style, from artist-made models (3D build 41)

**Asked:** "the walls still look like AI slop, they are not looking different. also, the
art style as a whole itself is not the same. did you look at the images i previously
sent? I want the entire art style to be changed, not just the design alone."

**I was wrong in R68–R70.** I had taken only the *level of detail* from the two
reference images, not their look: Halo's concept art is daylight, a blue sky, haze and
big readable shapes; the Amnesia shot is darkness with warm local light. And code-drawn
boxes with photo textures had hit their ceiling; the user could see it.

**Asked back, and answered:**

- Style: "Mix: day outside, dark inside": Halo daylight in the open streets, Amnesia
  darkness in the alleys, courtyards and interiors.
- Approach: "Yes, models and renderer": rebuild district 1 from artist-made CC0 models,
  about 100 MB, and upgrade the renderer.

**Downloaded** (Poly Haven, CC0, all credited in `assets3d/CREDITS.md`):

- the 18 models of its "hidden alley" set, of which 7 went unused and were taken out
  again (a car and a road barrier would block streets you walk through; the street lamp,
  fence and poles are 20,000–60,000 triangles each);
- three more small props (a wall lamp, a bench, a crate);
- six ground textures and one sky. The 4K sky HDR was only used to make the 0.36 MB dome
  image; it is not shipped.

What ships: 65 MB of models, 12 MB of textures, 1.8 MB of sky. Trees and hedges were
looked at and left out: 50,000–280,000 triangles each, and one tree is 100 MB.

**Built** (spec-3d.md, "District 1's new art style"):

- **Buildings** from two modular facade kits: plaster apartments and brick factories, in
  3 m bays, with their own windows, doors and trim. build 40's plan (purposes, never
  the same as a neighbour) is kept; each building now also gets a kit, window family,
  facade and joinery colour unlike its neighbours'.
- **Every other place** but the parks is built the same way: yard walls, warehouses,
  market stalls, burnt ruins.
- **Ground:** photographed asphalt, pavements with kerbs, cobbles, concrete, grass,
  dirt.
- **Props:** bins, bags, barrels, tyres, crates, benches, utility boxes, manholes,
  air conditioners, downpipes, roller shutters, and wall lamps in the narrow places.
- **Light:** a photographed sky that is also the light, a real sun with shadows (now at
  Medium too), haze, ACES tone mapping, ambient occlusion. The darkness map is now a
  sky-view factor, so only the true alleys go black.

**Measured, and what it changed:**

- The kits' walls are 6 cm grids (4,608 triangles for a blank 3 × 3 m bay). Re-meshed on
  load into rectangles, UVs kept exactly: a blank bay is 2 triangles.
- One `BatchedMesh` per material, culled per instance: the whole district is 33 draw
  calls of kit, 3.6 M triangles in all.
- The first full district ran at **40 ms** a frame at 1080p High. Toggling things one at
  a time found it: the wall lamp's glass uses transmission, which re-renders the scene
  every frame (17 ms). Drawn as plain glass now.
- The air conditioners are 9,400 triangles each and were 0.84 M triangles; now one window
  in fourteen, and they cast no shadow.
- The rooms behind 1,000 windows were lit PBR cards, the costliest overdraw; now unlit.
- The smog-era darkness map blacked out every street narrower than a square in daylight;
  replaced by the sky-view factor.

| 1080p | Mean | p95 |
|---|---|---|
| Medium, district 1 | 17–22 ms | up to 28 ms |
| High, district 1 | 21–26 ms | up to 33 ms |
| build 40, for comparison | 11–15 ms | up to 23 ms |

The sun's shadows are about 6 ms of it. Shadow filter type made no difference; ambient
occlusion costs 0.7 ms.

**Not done:**

- the parks' hedges and round trees;
- interiors you can enter;
- modelled roofs;
- chunking for big cities;
- every other district.

## R72 · Ten first districts, ten styles; and tripping (3D build 42)

**Asked:**

1. "whenever the player runs into a small obstacle like the stairs in front of the
   building, the used boxes, etc., make sure that the player is slightly tripped and
   temporarily loses balance … the speed need not be hindered."
2. Build 41's sky "looks bright … not suitable … as we are making the game look sombre
   (for the plot)". When it goes to other districts and belts, "make sure that the art
   style completely changes from belt to belt, rather than just changing the colour
   palette and calling it a day". Give the first district of each belt a different
   style; the user approves each before it is copied to the rest of its belt.

**The stumble** is the camera only. The sim, the speed, and the noise the aliens hear are
untouched. The kit builder records each obstacle's footprint; `Play3D.stumble` trips
once per obstacle above a walking pace. Checked on a real walk into a stoop: a 5° pitch,
a 7 cm drop and a roll, recovered in 0.75 s, at unchanged speed.

**The styles** (antialgorithm skill):

- **The default** was one grey fog in ten tints: what the user called "changing the colour
  palette".
- **The move:** each belt is lit by a different kind of light, tied to its alien and
  character, and its buildings, ground, weather and grade follow. The light sources:
  - RUST: the last light under cloud;
  - TIDE: a storm with no sun;
  - MOSS: sun through a canopy;
  - EMBER: fires;
  - VIOLET: an aurora;
  - ASH: none, and a frame with no colour but the entities';
  - CORAL: backlit mist;
  - JADE: two moons;
  - SOLAR: a dust-dimmed sun;
  - COBALT: the ship's searchlight.
- **Off-default choices made for the project's reasons:**
  - VIOLET has no neon (the power is out);
  - EMBER's fire is local, not everywhere (orange would crowd the aliens' red and the
    keys' gold);
  - ASH's colour survives only on what the player must read: the legibility rule made
    into the look.

**Downloaded** with the user's approval (Poly Haven, CC0, `assets3d/CREDITS.md`):

- four skies: 1K HDRs shipped, plus a JPEG dome made from each 4K;
- eight ground textures;
- about 20 MB in all.

**What the browser showed, and what it changed:**

- The first MOSS canopy was nearly solid, and from below its blobs read as black spots.
  It is now clustered leaf shapes with big gaps, unlit and dim green, as leaves look lit
  from behind.
- VIOLET and COBALT were black: a drawn night sky gives little light. Sky light ×5 and
  ×3.5, more fill. The searchlight needed 60,000 cd to read at 70 m.
- SOLAR's dimmed photo sky read as night. A dust veil over the whole dome, with a sun
  disc in it, made it a storm.
- Every plaster colour came out salmon: the plaster photo averages sRGB (151, 106, 81).
  Plaster and stone trim now keep the photo's light and dark, not its hue.
- ASH kept the red of fallen brick, which could pass for an alien. Kept colours must now
  be vivid and lit, and the rubble takes the building's colour.
  - Checked with swatches in the six entity colours: all keep their colour.
- Low "garden" walls round the parks were tried and dropped before shipping: the player
  could see aliens over a wall that blocks shots and sight. That breaks build 30's
  "if you can see it you can shoot it". Hedges at full height instead.
- The darkness map was baked into the model kit's shared materials when they were first
  used, so a second district would have used the first's alleys. Its uniforms are now
  shared and updated per district.
- 3D-16 now lints each style's facades, brick, haze and ground tint. Its dusk-to-midnight
  order starts after a first district, which sets its own hour. Two colours were moved
  off the 10-coin violet, and SOLAR's dust off the coin orange.

**Measured** (1080p Medium):

- Before the cost controls, the night belts were at 43, 41 and 58 ms. The first big cost
  was the long night fog; then the per-piece culling over 172,000 pieces (district 91),
  run for the camera and again for each shadow-casting light.
- After the cost controls (shorter night fog; detail hidden beyond 55 m; batches chunked
  by 64 m; only walls, trim and garage doors in the shadow passes):
  - RUST, TIDE, MOSS, EMBER, ASH, CORAL and SOLAR: 12–21 ms;
  - VIOLET, JADE and COBALT: 25–29 ms.

**Not done:**

- districts 2–10, 12–20 and the rest keep their old look until a belt's style is
  approved;
- the parks' lone trees;
- interiors;
- a weaker laptop.

## R73 · District 1 at 2K (3D build 43)

**Asked:** "the sky looks like real sky like from gta 6, but then the buildings dont look
real, they look like the ones from gta san andreas. I want the game to have consistent
graphics. How much space would that take?" Then: "continue with the 2K version. first
implement only the first district".

**Answered first:**

- **Size.** 2K would take the download from about 100 MB to 330–430 MB. Graphics memory
  was the real limit: about 2.4 GB of uncompressed 2K textures per district, so 2K had to
  be GPU-compressed.
- **Where the dated look came from** besides resolution:
  - every bay repeating;
  - build 42's flat plaster colour;
  - flat walls;
  - no bounce light.
- **Local versus web.** Running locally (`npm run serve`) removes the download wait, not
  the GPU cost.

**Downloaded**, with the user's approval of an itemised list:

- the 2K models (210 MB) and district 1's 2K ground with height maps (106 MB);
- the official Basis Universal WebAssembly encoder (3.5 MB, used once, not shipped);
- three 0.185.1's KTX2 decoder (seven files, about 0.7 MB, shipped and hash-checked).

Homebrew has no KTX-Software formula, and Khronos's own macOS package needs an
administrator's install; the encoder's WebAssembly build runs in Node with neither.

**Built** (spec-3d.md, "District 1 at 2K"):

- **Compression.** Colour and packed maps in ETC1S, normal maps in UASTC with Zstandard.
  The 2K JPEGs and PNGs were 301 MB; the KTX2 set is 179 MB.
- **Ground** with parallax relief.
- **Walls** with weathering by world position, a little of the plaster photo's colour
  back, and a warm bounce in the shade.
- **Every belt** (they share the kit): hedge blocks for the drawn trees, leaf-card edges
  on hedges, uneven puddles.

**What the browser showed:**

- **Decoder.** The newest encoder's output reads fine in three 0.185.1's decoder. Checked
  before converting anything: ETC1S came back as ETC2, UASTC as ASTC 4x4.
- **Conversion.** The first run stopped: one model lists the same image twice. Made
  resumable; 75 textures, no failures.
- **Darkness map.** It had been reading kit pieces at their local position since build 41,
  because `patchDark` handled instancing but not batching. Fixed.
- **Parks.** The drawn round trees and a hedge made of a forest-floor photo were the
  loudest "San Andreas" left. Clipped hedge blocks with ragged leaf cards replaced them.
- **Puddles.** As mirrors they showed the ripple map's stripes, then bright perfect
  squares. They are now uneven, darker and rougher. There are no screen-space
  reflections, so a mirror could only show the sky.

**Measured** in district 1 at 1080p:

| | Mean |
|---|---|
| Medium | 19–20 ms |
| High | 19–21 ms |

That is about 1 ms over 1K; compressed 2K costs little.

**Not done:**

- the other districts stay at 1K until the user approves district 1;
- no screen-space reflections;
- no real global illumination (the bounce is a hemisphere colour);
- a weaker laptop.

## R74 · Signs, coins and edge markers in district 1 (3D build 44)

**Asked**, district 1 first:

1. "the signboards, which have the names of the places are not looking good (like zinc
   wreck, mirror canal, etc.) i want you to make them also very realistic just like the
   buildings";
2. "when i dont look in the direction of the key, i want the key marker … to show at the
   right or the left side of the screen … if i turn my back on a key, I dont see the key
   markers and I have to search for it";
3. "make the coin with their numeric value in them. also make the coins look more
   realistic like the rest of the game graphic".

**Built** (spec-3d.md, "District 1's signs, coins and edge markers"):

- **Signs** are vitreous enamel street plates on bolts or steel posts, drawn at twice the
  old resolution with colour, relief and roughness maps and seeded wear.
- **Coins** are struck metal with the value on both faces, in the same four value colours.
- **Edge markers.** An off-screen key or portal is held at the side you would turn to.
  The three features are gated by `proto` in RUST's style, so the other districts are
  unchanged until approved.

**What the browser showed:**

- **Downpipes.** The first plate ("ANCHOR COURTS") had a downpipe running through it, and
  plates could cover doors. The kit builder now records which wall faces carry doors,
  tall glazing, garage doors, pipes, lamps, awnings or hedges; signs skip those, and are
  built after the buildings so they can see them.
- **Bands and copings.** Plates sank into the brick kit's 10 cm band and behind yard-wall
  copings. Off the wall by 12.5 cm on kit fronts, below the coping on yard walls.
- **Blocked plates.** A raycast from in front of each plate: 2 of 47 still clip a leaf
  card or an awning's edge.
- **Coin faces.** The "5" lay on its side: a stood-up cylinder's cap UVs run sideways.
  The faces are re-mapped flat, and mirrored on the back so the value is not reversed.
- **Pale coins.** The 2 and the 10 washed out in their own glow. Weaker glow on the pale
  metals, a darker nickel, and a frosted field with polished relief made all four values
  readable on a test row (the district has no 10).
- **Puddles.** Cover cells side by side read as rows of discs; each puddle now nearly
  fills its cell.

**Measured:** frame time unchanged (1080p High, 22 ms at the start square).

**Not done:** the other districts; the font is the system's ("DIN Condensed" on this
Mac).

## R75 · The scale: 2.5 m cells, 5 and 10 m/s (3D build 45)

**Asked:** "fix the cell size to 2.5m and keep the walking speed as 5m/s and the sprinting
as 10m/s. the aliens will move in proportion to this speed of the player as per the
difficulty mode chosen."

**What follows from it.** The sim moves you one cell a tick (two sprinting), so walking
speed is `CELL_M × TICK_HZ_3D`: 5 m/s at 2.5 m cells needs 2 Hz, and sprinting is then
10 m/s by itself. Builds 2–44 were 1.5 m at 4 Hz (6 and 12 m/s).

**[ASSUMED] Keep the game the same in cells and ticks; change only its size and clock.**
The user's size curve is in cells (×5 to ×60) and is not to be touched, so every city is
1.67× wider in metres (district 1 180 × 112 m, district 100 620 × 388 m). The aliens'
speeds were already fractions of your walking speed per tier, so they follow with no
change: on Hard a hunting alien runs 2.9–3.5 m/s, on Ultra up to 4.6 m/s, and they travel
at 10 m/s on Hard out of sight. The cost is the clock: every timer kept in ticks lasts
twice as long in seconds (a stun 20 s, an alert 10 s, a district about twice as long to
cross), but exactly as many of your steps as before. The alternative — keeping timers in
real seconds — would halve them in steps and change the balance that 3D-22 and R60
measured. Put to the user.

**Metres or cells, item by item:**

- **Cells (what the sim plays by).** Alien arrivals and the travel threshold were written
  in metres (25–60 m, 40 m), so the new scale moved arrivals 40% closer in steps (10–24
  cells instead of 17–40). Two Dispatch tactics then stopped helping (3D-22: the map
  tactic found you later, 32 s vs 24 s, and the run tactic saw fewer chases, 25.5 vs 27.4).
  They are now set in cells — 17–40 and 27, exactly build 44's — and 3D-22 passes as
  before. Bot play is unchanged, so `npm run priors3d` reproduces the checked-in priors
  byte for byte.
- **Metres (what you see).** Fog (26–90 m) and the stun gun's reach (72 m, now 28.8 cells).
  Render chunks were 32 cells; now 48 m, as before.
- **Per metre, not per cell (presentation).** Head bob and footsteps (a footstep was a
  change of sim cell: at 2.5 m, and 5 m a sprint tick, far too slow; now one at each low
  point of the bob, about every 2 m), the aliens' stride (they would have skated), their
  collision size (0.36 m), the trip threshold (1.35 m/s), wall-lamp spacing (7.5 m) and the
  odds of street clutter per metre of wall.

**Tests that assumed the old scale:**

- **3D-6** hard-coded the reach test at 47 and 49 cells of 1.5 m; now from `STUN_RANGE`
  and `CELL_M` (28 and 29 cells).
- **3D-5** watched a stopped body for 120 frames (8 ticks at 4 Hz, 4 at 2 Hz); now a
  second plus twice the allowance in ticks. It then still failed on 1 of 9,999 sequences
  whose run ended during the let-go, where the body is no longer moved; such a run is
  now skipped, as the walk phase already did. Worst catch-up: 1 tick.
- **3D-22** printed "seconds" as ticks / 4; now `TICK_HZ_3D`.

**Measured in the page:** walking 5.03 m/s, sprinting 9.89 m/s including the run-up, a
footstep every 1.9–2.0 m. 1080p Medium: district 1 mean 20.7–21.2 ms (build 44: 19–20),
VIOLET district 41 20.0–21.3 ms (was 25–29: the same fog covers fewer cells).

**Looked at:** district 1 (a one-cell alley is now a believable 2.5 m lane; puddle cells
merge into larger sheets) and district 2 on the older art, whose per-cell textures now
draw bricks and cobbles 1.67× larger. Left as they are: those districts are replaced when
their belt's style is approved.

**Not verified:** the feel. The sim sees pickups, the portal and capture every half
second now; whether that shows is a person's call.

## R76 · A harder stumble; every first district at district 1's finish (3D build 46)

**Asked:** "before you extend it to all the districts, firstly, make the stumble on the
small objects more pronounced than it is now, and even more pronounced when one is
sprinting. after that, change the artstyle of just the first district of each of the belt
like district 1. If I find the artstyle, then we can extend it to other districts in the
same belt, after i suggest some modifications."

**[ASSUMED] "Like district 1" means district 1's finish, not its look.** Build 42 gave
each belt's first district its own light, sky and palette because the user asked for
every belt to change style completely. So each keeps its style and takes what builds
43–44 added to district 1: 2K models and ground with relief, weathering, enamel plates,
minted coins, edge markers.

**The stumble.** Measured on a real stoop in district 1, by the frame loop:

| | Builds 42–45 | Build 46 |
|---|---|---|
| Walking | pitch 5°, roll 3°, drop 5 cm, 0.75 s | pitch 10°, roll 5°, drop 8 cm, 0.97 s |
| Sprinting | pitch 7°, roll 4°, drop 7 cm, 0.75 s | pitch 19.5°, roll 13°, drop 19 cm, 1.32 s |

New: a jolt as the foot stops, a lurch forward, a head turn toward the side you hit, and
a two-way wobble when sprinting. Speed untouched, as the user asked in R72.

**The first districts.**

- **Download** (the user agreed, with names, source and sizes): the seven ground
  textures belts 2–10 use, at 2K from Poly Haven, 111.8 MB. As KTX2 they are 39 MB.
- **Loading.** `loadGround2k` used to load every 2K set. With 14 that would make each
  district fetch all of them, so a style now loads only its own (`groundIdsFor`).
- **Weathering by belt**, from what each style says about its place: TIDE 1.25 down to
  COBALT 0.5.

**What the browser showed.** One check was new: each plate rendered flat magenta from
3 m in front, with and without the scene, to count what is left of it. A first version
compared lit renders and flagged half of MOSS: dark plates in shadow match their own iron
backing. A second drew the plates with their colour map as an alpha mask, which reads the
green channel and holed the dark-green plates. Raycasts were no use either: they missed
the batched kit pieces. Four kinds of thing hid plates:

- **A roller shutter's box** over a shop window (MOSS, "RIVET ROW");
- **a black box** in the cell in front (EMBER, and two in MOSS);
- **a shop's fascia sign** (SOLAR, behind "BAR OKAFOR");
- **(by the same reasoning, not seen) a hotel's canopy.**

All four are now excluded. Every first district: 33–279 plates, 94–97% visible on
average, none under 70%.

**Measured** at 1080p Medium: district 1 20 ms, MOSS 21, VIOLET 21–22, COBALT 30–31.
COBALT measured the same with the 1K finish, so the cost is its own and older (the
searchlight's shadows over a district-91 city).

**Not done:** the other districts of each belt, until the user has seen these and
suggested changes.

## R77 · A near-fall; every district in its belt's style (3D build 47)

**Asked:** "no, it is still not sufficient. the stumbling should be much more aggressive.
fix that, and then extend it to all the districts of the belt".

**[ASSUMED] "It" is the art.** The user had said they would extend the styles once they
liked them; this is that word. Each belt's style goes to all ten of its districts
unchanged.

**The stumble: a near-fall, and the screen takes the hit.**

- **Shape.** Builds 42–46 drew the stumble as one smooth dip. Now you pitch over in
  60 ms, hang at the bottom (0.12 s walking, 0.25 s sprinting), and come back up while
  staggering side to side (2 swings walking, 3 sprinting). A second slam lands at 0.3 s.
- **Screen.** With Glow on, the post pass takes a `shock` value from the stumble: a dark
  tunnel, a smear toward the middle, stronger fringes, a dimming, and a lens punch of up
  to 9°.
- **[ASSUMED] Speed still untouched,** as the user said in R72. A real stumble would
  cost time, and that would be a rules change. Not made unasked.

Measured on the stoop in district 1:

| | Pitch | Roll | Drop | Lasts |
|---|---|---|---|---|
| Build 46 walking | 10° | 5° | 8 cm | 0.97 s |
| Build 47 walking | 21° | 18° | 19 cm | 1.53 s |
| Build 46 sprinting | 20° | 13° | 19 cm | 1.32 s |
| Build 47 sprinting | 47° | 41° | 47 cm | 2.23 s |

Frames at 0.2 s and 0.8 s of a sprint stumble were looked at: first the stoop and
pavement filling a dark, smeared view, then the street rolled hard over.

**Every district.**

- **The change.** `artFor` styles every district (`styledDistrict`). The 2K kit is
  shared, and each belt's ground sets are the same for its ten districts.
- **Frame time** at 1080p Medium: district 10 21.5 ms, district 50 17–20 ms, district
  100 26–27.5 ms. District 100 is ready 7.4 s after load with the kit cached.
- **Plates:** 52, 159, 253 and 293 in districts 10, 57, 83 and 100, 96–97% visible on
  average.
- **A number that looked wrong and was not:** GPU textures grow with the city (1,207 to
  3,246). Each batched chunk keeps three small data textures; only 154 image textures
  are in use.

**What goes:** the dusk-to-midnight drift within a belt (builds 29–34) no longer shows.
Its tables remain for the drawn fallback.

## Current state

```
npm test          12 passed · 1 not demonstrated · 0 failed
npm run webcheck  39/39
npm run test3d    27 passed · 0 not demonstrated · 0 failed  (3D build 47; 3D-1 via the
                  2D suites above, run alongside)
```
