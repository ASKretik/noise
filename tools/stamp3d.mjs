// tools/stamp3d.mjs -- bump the 3D build stamp. `npm run stamp3d`
//
// The 3D game's own counter. It namespaces the 3D save database and the 3D pages'
// stylesheet cache-busters, and it is the number in the in-development banner. It never
// touches web/build.js or any 2D page, so a 3D update cannot reset a 2D save.
//
// It refuses to bump without an entry in web3d/changes3d.js for the NEW number, so the
// banner a reviewer sees can never be blank or a build behind.
//
//   npm run stamp3d            bump, after adding the changes3d.js entry for build N+1
//   npm run stamp3d -- --sync  rewrite the ?v= links to the current number, no bump

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BUILD_FILE = resolve(ROOT, 'web3d', 'build3d.js');
const PAGES_DIR = resolve(ROOT, '3d');

const src = readFileSync(BUILD_FILE, 'utf8');
const match = src.match(/export const BUILD3D = (\d+);/);
if (!match) throw new Error('web3d/build3d.js: BUILD3D constant not found');

const sync = process.argv.includes('--sync');
const current = Number(match[1]);
const next = sync ? current : current + 1;

const { CHANGES } = await import(pathToFileURL(resolve(ROOT, 'web3d', 'changes3d.js')).href + `?t=${Date.now()}`);
if (!CHANGES.some((c) => c.build === next)) {
  console.error(`stamp3d: web3d/changes3d.js has no entry for build ${next}.`);
  console.error('Add one first: { build, date, phase, changed, tryThis, unverified }.');
  process.exit(1);
}

if (!sync) {
  writeFileSync(BUILD_FILE, src.replace(/export const BUILD3D = \d+;/, `export const BUILD3D = ${next};`));
}

const STYLE_LINK = /href="(\.\.\/web3?d?\/style3?d?\.css)(?:\?v=\d+)?"/g;
for (const name of readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html'))) {
  const p = resolve(PAGES_DIR, name);
  const html = readFileSync(p, 'utf8');
  writeFileSync(p, html.replace(STYLE_LINK, (_, href) => `href="${href}?v=${next}"`));
}

console.log(sync ? `3D build ${next} (links synced)` : `3D build ${current} -> ${next}`);
console.log(`  IndexedDB namespace: noise3d-${next}  (3D saves start fresh; 2D saves untouched)`);
