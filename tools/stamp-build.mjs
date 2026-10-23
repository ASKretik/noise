// tools/stamp-build.mjs -- bump the build stamp. `npm run stamp`
//
// One number, two consumers: the IndexedDB namespace (so a published update starts every
// save fresh) and the stylesheet cache-buster (so a phone that cached the previous
// layout picks up the new one immediately). Keeping them on the same counter means they
// cannot drift, which is exactly what happened while the ?v= was edited by hand.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BUILD_FILE = resolve(ROOT, 'web', 'build.js');
const PAGES = ['index.html', 'play.html', 'districts.html'];

const src = readFileSync(BUILD_FILE, 'utf8');
const match = src.match(/export const BUILD = (\d+);/);
if (!match) throw new Error('web/build.js: BUILD constant not found');

const next = Number(match[1]) + 1;
writeFileSync(BUILD_FILE, src.replace(/export const BUILD = \d+;/, `export const BUILD = ${next};`));

for (const page of PAGES) {
  const p = resolve(ROOT, page);
  const html = readFileSync(p, 'utf8');
  writeFileSync(p, html.replace(/href="web\/style\.css(?:\?v=\d+)?"/g, `href="web/style.css?v=${next}"`));
}

console.log(`build ${match[1]} -> ${next}`);
console.log(`  IndexedDB namespace: noise-${next}  (every save file starts fresh)`);
console.log(`  stylesheet: web/style.css?v=${next}`);
