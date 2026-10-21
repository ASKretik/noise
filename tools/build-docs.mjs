// tools/build-docs.mjs -- mirror the playable site into /docs.
//
// There is no build step: the game is plain ES modules and GitHub Pages serves them as
// they are. This script exists only because GitHub Pages offers two ways to publish from
// a branch -- the repository root or a /docs folder -- and the repo supports both:
//
//   Primary:  Settings > Pages > Source: GitHub Actions   (.github/workflows/pages.yml
//             uploads the repo root; nothing is duplicated, nothing to run)
//   Fallback: Settings > Pages > Source: Deploy from a branch, /docs
//             (run `npm run build:docs` and commit /docs)
//
// Copying rather than symlinking because Pages does not follow symlinks.

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(ROOT, 'docs');

/** Everything the playable page needs, and nothing else. */
const ENTRIES = ['index.html', 'play.html', 'sim', 'web', 'bots'];

// Remove ONLY the mirrored entries, never the directory.
//
// `rm -rf docs` was the first version of this and it was wrong: /docs is not just a
// deploy mirror, it is also where the benchmark report and its figures live
// permanently. Wiping the directory deleted docs/bench.html and docs/plots/*.svg, and
// because the script runs before a commit, the deletion went into git.
await mkdir(OUT, { recursive: true });
for (const entry of ENTRIES) {
  await rm(resolve(OUT, entry), { recursive: true, force: true });
}

for (const entry of ENTRIES) {
  await cp(resolve(ROOT, entry), resolve(OUT, entry), { recursive: true });
}

// Pages runs Jekyll by default, which ignores files and folders beginning with an
// underscore and can rewrite things it should not. .nojekyll turns it off.
await writeFile(resolve(OUT, '.nojekyll'), '');

console.log(`mirrored into docs/: ${ENTRIES.join(', ')}`);
console.log('(docs/bench.html and docs/plots/ are left alone -- they are not part of the mirror)');
console.log('commit docs/ and set Pages source to "Deploy from a branch" -> /docs');
