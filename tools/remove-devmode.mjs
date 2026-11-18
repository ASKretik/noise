// tools/remove-devmode.mjs -- take developer mode out of the 3D game, for good.
//
//   npm run remove-devmode            remove it
//   npm run remove-devmode -- --dry   say what would change, change nothing
//
// Dev mode lives in its own files plus one-line hooks, every hook tagged DEV-MODE. This
// deletes the files, strips the tagged lines and drops the two npm scripts. Then run the
// 3D loop as usual: a web3d/changes3d.js entry, `npm run stamp3d`, the three suites, and
// commit the deletions too (`git add -A` is not used in this repo -- name the files, or
// `git rm` the deleted ones). spec-3d.md's "Developer mode" section should go in the same
// commit. Criterion 3D-31 dry-runs this on every test run, so it keeps working.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TAG = 'DEV-MODE';
/** Whole files that are dev mode and nothing else. */
export const DEV_FILES = [
  'web3d/dev3d.js', 'web3d/devhash.js', 'tools/devcode.mjs', 'tools/remove-devmode.mjs',
  'bench3d/criteria/devmode.js', 'DEV-MODE-CODE.txt',
];
/** Files that carry tagged hook lines. */
export const TAGGED_FILES = ['web3d/hub3d.js', 'web3d/play3d.js', '3d/index.html', 'web3d/style3d.css', '.gitignore'];
export const DEV_SCRIPTS = ['devcode', 'remove-devmode'];

/** What removal would do, without doing it: { deletes: [path], rewrites: {path: text} }. */
export function planRemoval(root) {
  const rewrites = {};
  for (const f of TAGGED_FILES) {
    const p = resolve(root, f);
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, 'utf8').split('\n');
    const kept = lines.filter((l) => !l.includes(TAG));
    if (kept.length !== lines.length) rewrites[f] = kept.join('\n');
  }
  const pkgPath = resolve(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  let changed = false;
  for (const s of DEV_SCRIPTS) if (pkg.scripts && s in pkg.scripts) { delete pkg.scripts[s]; changed = true; }
  if (changed) rewrites['package.json'] = `${JSON.stringify(pkg, null, 2)}\n`;
  const deletes = DEV_FILES.filter((f) => existsSync(resolve(root, f)));
  return { deletes, rewrites };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const dry = process.argv.includes('--dry');
  const { deletes, rewrites } = planRemoval(root);
  for (const [f, text] of Object.entries(rewrites)) {
    console.log(`${dry ? 'would rewrite' : 'rewrote'} ${f}`);
    if (!dry) writeFileSync(resolve(root, f), text);
  }
  for (const f of deletes) {
    console.log(`${dry ? 'would delete' : 'deleted'} ${f}`);
    if (!dry) unlinkSync(resolve(root, f));
  }
  if (!dry) {
    console.log('\nDeveloper mode is out. Next: a changes3d.js entry, npm run stamp3d, npm test,');
    console.log('npm run webcheck, npm run test3d -- --skip-2d, then commit the rewrites and deletions');
    console.log('(and remove the "Developer mode" section from spec-3d.md in the same commit).');
  }
}
