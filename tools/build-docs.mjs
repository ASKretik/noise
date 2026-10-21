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

const ENTRIES = ['index.html', 'sim', 'web', 'bots'];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const entry of ENTRIES) {
  await cp(resolve(ROOT, entry), resolve(OUT, entry), { recursive: true });
}

// Pages runs Jekyll by default, which ignores files and folders beginning with an
// underscore and can rewrite things it should not. .nojekyll turns it off.
await writeFile(resolve(OUT, '.nojekyll'), '');

console.log(`built docs/ from: ${ENTRIES.join(', ')}`);
console.log('commit docs/ and set Pages source to "Deploy from a branch" -> /docs');
