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
