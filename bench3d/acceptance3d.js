// bench3d/acceptance3d.js -- the 3D acceptance criteria. `npm run test3d`
//
// Same three verdicts as the 2D suite. A criterion whose machinery does not exist yet
// reports NOT DEMONSTRATED rather than passing on faith; one that is measured by hand
// (frame rate, legibility) stays NOT DEMONSTRATED until the measurement is recorded in
// bench3d/measured.json.
//
//   npm run test3d                 everything, including both 2D suites (3D-1)
//   npm run test3d -- --skip-2d    skip re-running the 2D suites (3D-1 reports ND)
//   npm run test3d -- --only 3,5   just those

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const PASS = 'PASS';
export const FAIL = 'FAIL';
export const ND = 'NOT DEMONSTRATED';

const argv = process.argv.slice(2);
const SKIP_2D = argv.includes('--skip-2d');
const onlyIdx = argv.indexOf('--only');
const ONLY = onlyIdx >= 0 ? String(argv[onlyIdx + 1]).split(',').map(Number) : null;

// ------------------------------------------------------------------ helpers

function walk(dir, exts = ['.js', '.mjs']) {
  const abs = resolve(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const name of readdirSync(abs)) {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) out.push(...walk(relative(ROOT, p), exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

/** Strip block and line comments; good enough for scanning our own source. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

function importSpecifiers(src) {
  const out = [];
  const re = /(?:^|[\s;])(?:import|export)\s[^'";]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|[\s;])import\s*['"]([^'"]+)['"]/gm;
  let m;
  const s = stripComments(src);
  while ((m = re.exec(s))) out.push(m[1] || m[2] || m[3]);
  return out;
}

function htmlScripts(src) {
  const out = [];
  const re = /<script[^>]*\ssrc="([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

const rel = (p) => relative(ROOT, p).split('\\').join('/');
const inside = (absPath, dir) => rel(absPath).startsWith(dir + '/');

// ------------------------------------------------------------------ criteria

export const criteria = [];
const add = (n, text, fn) => criteria.push({ n, text, fn });

add(0, 'Build hygiene: vendored three.js matches its recorded hashes; 3D stylesheet ?v= equals BUILD3D; the banner has an entry for this build', async () => {
  const problems = [];
  const vdir = resolve(ROOT, 'vendor/three/0.185.1');
  const expected = {
    'three.module.min.js': 'hrzuJItk9EvPwjwzGudGGQYZV9WcqwQBcdy2+1kAvrY=',
    'three.core.min.js': 'BbJgkzjHbNZdr3TzrFFbyaUEXhs7M+3AfYyb1VJQ+pA=',
    LICENSE: 'izeOvmDi/lABWMsKxxy16LfZKVPCq8xjoOuQSZZTtbw=',
    // build 41: the loaders for district 1's models and sky (examples/jsm, unmodified)
    'addons/loaders/GLTFLoader.js': 'l2Qtcg8WzJoMmESTQZjk0MAjvqjolXbQ91RdA7LRA9I=',
    'addons/loaders/HDRLoader.js': 'CYa1ePms0UzsdOXuheB/ReaBtAvNIppgGgORIB+bX/E=',
    'addons/utils/BufferGeometryUtils.js': 'XFUiI6kwmIN0O4BTjW6c20XjIn8w0+xW+yw5tG541ZU=',
    'addons/utils/SkeletonUtils.js': 'sWMqcDIGw9gw3p/L5RVpZ3DQS3GhXua1CvptLDKYyG8=',
    // build 43: the decoder for GPU-compressed (KTX2) textures
    'addons/loaders/KTX2Loader.js': 'OjIzzjQJRDB200FLeIMuFAX8+sXss002c2X9B4ESfWw=',
    'addons/utils/WorkerPool.js': 'WscJX9VmvJrkg3YFX9Zu3yfLnrv54Sadwga/1JM66es=',
    'addons/libs/ktx-parse.module.js': '9AxJH2xE3eURJoEh93igBQ5zsaFf2ETBrix4xzIT6vw=',
    'addons/libs/zstddec.module.js': 'XL+BjoQmKKRGTnSFlKberhjO3do8L1QeezoP9fx2EeI=',
    'addons/libs/basis/basis_transcoder.js': 'hHi1tta3Tn0wgrifZBcyHY0dwDB/KzDUSEuxG0QWlqE=',
    'addons/libs/basis/basis_transcoder.wasm': 'bPF9yIk1LELprPiJcQeXjRJwBf4zhsNqDjhF4nlnYwo=',
    'addons/math/ColorSpaces.js': 'zDXAHHk80XzN7XvIFCq//Tzg1g3W3o1dIWmDvQWu4mI=',
  };
  for (const [f, h] of Object.entries(expected)) {
    const p = join(vdir, f);
    if (!existsSync(p)) { problems.push(`missing vendor/three/0.185.1/${f}`); continue; }
    const got = createHash('sha256').update(readFileSync(p)).digest('base64');
    if (got !== h) problems.push(`${f} hash ${got} != ${h}`);
  }
  const { BUILD3D } = await import('../web3d/build3d.js');
  const { CHANGES } = await import('../web3d/changes3d.js');
  if (!CHANGES.some((c) => c.build === BUILD3D)) problems.push(`changes3d.js has no entry for build ${BUILD3D}`);
  for (const page of walk('3d', ['.html'])) {
    const html = readFileSync(page, 'utf8');
    for (const m of html.matchAll(/href="\.\.\/web3?d?\/style3?d?\.css(?:\?v=(\d+))?"/g)) {
      if (Number(m[1]) !== BUILD3D) problems.push(`${rel(page)}: ?v=${m[1] ?? '(none)'} != ${BUILD3D}`);
    }
  }
  return problems.length ? [FAIL, problems.join('; ')] : [PASS, `build ${BUILD3D}; ${Object.keys(expected).length} vendor files verified`];
});

add(1, 'The 2D suites are untouched: npm test 12 passed / 1 ND / 0 failed, npm run webcheck all green', async () => {
  if (SKIP_2D) return [ND, 'skipped with --skip-2d'];
  const t = spawnSync(process.execPath, ['bench/acceptance.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const tm = (t.stdout || '').match(/(\d+) passed · (\d+) not demonstrated · (\d+) failed/);
  const w = spawnSync(process.execPath, ['bench/webcheck.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const wm = (w.stdout || '').match(/(\d+)\/(\d+) passed/);
  const okT = tm && tm[1] === '12' && tm[2] === '1' && tm[3] === '0' && t.status === 0;
  const okW = wm && wm[1] === wm[2] && w.status === 0;
  const detail = `npm test: ${tm ? `${tm[1]}/${tm[2]}/${tm[3]}` : 'no summary'} · webcheck: ${wm ? `${wm[1]}/${wm[2]}` : 'no summary'}`;
  return [okT && okW ? PASS : FAIL, detail];
});

add(2, 'Arrows run one way: no 2D file imports 3D code; sim3d imports only sim/ and sim3d/ and touches no DOM; nothing 3D calls Math.random', async () => {
  const problems = [];
  const banned = ['sim3d', 'web3d', '3d', 'vendor', 'bench3d'];
  const twoD = [...walk('sim'), ...walk('web'), ...walk('bots'), ...walk('bench')];
  for (const f of twoD) {
    for (const spec of importSpecifiers(readFileSync(f, 'utf8'))) {
      if (!spec.startsWith('.')) continue;
      const target = resolve(dirname(f), spec);
      if (banned.some((d) => inside(target, d))) problems.push(`${rel(f)} imports ${spec}`);
    }
  }
  for (const page of ['index.html', 'play.html', 'districts.html']) {
    for (const src of htmlScripts(readFileSync(resolve(ROOT, page), 'utf8'))) {
      if (banned.some((d) => src.startsWith(d + '/') || src.startsWith('./' + d + '/'))) problems.push(`${page} loads ${src}`);
    }
  }
  const DOM = /\b(document|window|navigator|localStorage|sessionStorage|indexedDB|requestAnimationFrame|HTMLElement|performance\.now)\b/;
  const sim3d = walk('sim3d');
  for (const f of sim3d) {
    const src = readFileSync(f, 'utf8');
    for (const spec of importSpecifiers(src)) {
      const target = resolve(dirname(f), spec);
      if (!spec.startsWith('.') || !(inside(target, 'sim') || inside(target, 'sim3d'))) problems.push(`${rel(f)} imports ${spec}`);
    }
    const m = stripComments(src).match(DOM);
    if (m) problems.push(`${rel(f)} references ${m[1]}`);
  }
  for (const f of [...sim3d, ...walk('web3d')]) {
    if (/Math\.random\s*\(/.test(stripComments(readFileSync(f, 'utf8')))) problems.push(`${rel(f)} calls Math.random`);
  }
  return problems.length ? [FAIL, problems.slice(0, 8).join('; ')]
    : [PASS, `${twoD.length} 2D modules + 3 pages clean; ${sim3d.length} sim3d modules pure`];
});

// Criteria 3+ are registered by the modules that implement them, as they land.
const LATER = [
  [3, 'Parity: Game3D driven through the leash reproduces recorded 2D runs bit for bit'],
  [4, 'Determinism: same seed and same 3D input record give an identical tick-log hash'],
  [5, 'Leash invariants hold over 10,000 random continuous control sequences'],
  [6, 'Targeted stun never stuns an inert, out-of-range or occluded alien, never spends without a stun'],
  [7, 'Grid raycast agrees with dense point sampling on 10,000 random rays'],
  [8, 'Save isolation: 3D never writes the 2D database; each sweep spares the other; 3D guest leaves 3D main byte-identical'],
  [9, 'The full meta loop runs headless with a null renderer'],
  [10, 'The page is playable with dispatch templated and nothing optional loaded'],
  [11, 'Frame budget met at Medium, 1080p (measured by hand, recorded)'],
  [12, 'Every belt renders legibly (screenshot review, recorded)'],
];

async function loadLater() {
  const extra = resolve(ROOT, 'bench3d/criteria');
  if (existsSync(extra)) {
    for (const f of readdirSync(extra).filter((n) => n.endsWith('.js')).sort()) {
      const mod = await import(new URL(`./criteria/${f}`, import.meta.url).href);
      for (const c of mod.criteria || []) criteria.push(c);
    }
  }
  for (const [n, text] of LATER) {
    if (!criteria.some((c) => c.n === n)) add(n, text, async () => [ND, 'not built yet']);
  }
  criteria.sort((a, b) => a.n - b.n);
}

// ------------------------------------------------------------------ run

await loadLater();
console.log('');
console.log('NOISE 3D -- acceptance criteria');
console.log('='.repeat(86));
const tally = { [PASS]: 0, [FAIL]: 0, [ND]: 0 };
for (const c of criteria) {
  if (ONLY && !ONLY.includes(c.n)) continue;
  const t0 = Date.now();
  let verdict, detail;
  try {
    [verdict, detail] = await c.fn();
  } catch (err) {
    verdict = FAIL;
    detail = (err?.stack || String(err)).split('\n').slice(0, 4).join('\n      ');
  }
  tally[verdict]++;
  console.log('');
  console.log(`[${verdict}] 3D-${c.n}. ${c.text}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (detail) console.log(`      ${detail}`);
}
console.log('');
console.log('='.repeat(86));
console.log(`  ${tally[PASS]} passed · ${tally[ND]} not demonstrated · ${tally[FAIL]} failed`);
console.log('');
process.exit(tally[FAIL] > 0 ? 1 : 0);
