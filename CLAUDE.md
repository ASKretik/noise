# Working conventions for NOISE

## Ship it, don't just save it

**Every change goes to GitHub, not just to the local working tree.** The deliverable is the
live site, not the directory. A change that is committed but unpushed does not exist as far
as this project is concerned.

The loop for any change, in order:

```sh
npm run stamp     # bump the build: new IndexedDB namespace + stylesheet cache-buster
npm test          # 13 acceptance criteria — must stay 12 passed / 1 ND / 0 failed
npm run webcheck  # browser-layer checks against the DOM shim
git add -A && git commit
git push origin main
gh run watch <id> --exit-status     # the deploy gate runs the suites again
```

`npm run stamp` goes first and is not optional: the build stamp namespaces the save
database, so every published update starts every save fresh. A test fails if the
stylesheet `?v=` has drifted from it.

Read the suite output **before** committing, not after. This has bitten once already: a
stale assertion in criterion 10 went in green-looking and had to be fixed a commit later.

`.github/workflows/pages.yml` re-runs both suites before publishing, so a failing suite
blocks the deploy rather than replacing a working site. That gate is the reason pushing is
safe, not a reason to skip the local run.

- Live: https://askretik.github.io/noise/
- Repo: https://github.com/ASKretik/noise

## Rules that are load-bearing

**Nothing calls `Math.random`.** Every stochastic decision draws from a seeded `Rng`
(`sim/prng.js`). This is what makes "same seed and inputs produce an identical run"
checkable, and it is acceptance criterion 1.

**`/sim` is pure.** No DOM, no imports from outside `/sim`. It runs under Node for the
benchmarks and in the browser for play, and that single property is what makes ~400
episodes/second possible. Browser-only concerns live in `/web` as leaves.

**Every distance field declares whose it is.** `HUMAN` and `ALIEN` in `sim/pathfind.js`.
Buildings block the human and not the alien; black boxes do the reverse. Mixing them up is
a whole class of bug.

**The isolation rule.** The active profile id is a single module-level value in
`sim/profile.js`, read by the only write path. No mutator takes an id. A guest run must
leave the main dossier byte-identical — criterion 9.

## Generated constants

`sim/predictor/priors.js` and `sim/predictor/couplings.js` are **build artefacts**, written
by `npm run priors` and `npm run couplings`. They describe the game as it stood when they
were generated.

> **After any mechanical change, regenerate them — but check the rule applies first.**
> They are selected against a corpus recorded at `BENCH_TIER = 'hard'`. A change that does
> not alter HARD's behaviour (an ULTRA-only tweak, a UI change) does not invalidate them,
> and regenerating anyway just churns two checked-in tables with seed noise.

Stale constants have caused one real regression: they were describing a game that no longer
ran, and acceptance criterion 6 failed until they were regenerated. If a prediction result
moves for no visible reason, this is the first thing to check.

## Benchmarks are pinned to HARD

`BENCH_TIER` in `bench/harness.js`. `levelParams()` defaults to MEDIUM because that is right
for a new player, and the harness silently inherited it once when tiers landed — slowing
every alien 25% in every measurement for a reason with nothing to do with prediction. Keep
the pin.

Seed counts below ~14 are noisy enough that criteria 5 and 6 flip on seed choice alone. CI
uses the default for that reason.

## Documentation is part of the change

- **`spec.md`** describes the system **as built**, not as planned. Keep it true.
- **`decisions.md`** logs every change round: what was asked, what was assumed, what the
  measurements said — including when they said I was wrong.
- **`dna.md`** is the original build log against the first spec.

## No browser is available

No session has had browser tooling. The headless harness proves the wiring runs; it draws
no pixels, lays out no CSS, and the ambience has never made a sound.

When visual work is unavoidable, render it and look at it rather than trusting the values:
emit SVG from the real data (or record the actual canvas calls and replay them as SVG) and
view the result. That is how invisible buildings and a hair cap that read as sunglasses
were both caught. State plainly what remains unverified.
