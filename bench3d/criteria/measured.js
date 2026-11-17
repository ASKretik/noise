// bench3d/criteria/measured.js -- 3D-11 and 3D-12, which are measured by hand.
//
// They pass only on a recorded measurement in bench3d/measured.json, which names the
// build, the date and who measured it. No entry, or a "partial" one, is NOT DEMONSTRATED.

import { readFileSync, existsSync } from 'node:fs';

const FILE = new URL('../measured.json', import.meta.url);
const rec = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};

const verdict = (n) => async () => {
  const r = rec[String(n)];
  if (!r) return ['NOT DEMONSTRATED', 'no recorded measurement yet'];
  const line = `build ${r.build}, ${r.date}, ${r.by}: ${r.note}`;
  return [r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'NOT DEMONSTRATED', line];
};

export const criteria = [
  { n: 11, text: 'Frame budget met at Medium, 1080p (measured by hand, recorded in bench3d/measured.json)', fn: verdict(11) },
  { n: 12, text: 'Every belt renders legibly: aliens, keys, coins and rings against all ten palettes (screenshot review, recorded)', fn: verdict(12) },
];
