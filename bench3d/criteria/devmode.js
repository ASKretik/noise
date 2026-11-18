// bench3d/criteria/devmode.js -- 3D-31: developer mode stays removable. DEV-MODE
//
// Dev mode (web3d/dev3d.js) is meant to come out once the game is finished, with one
// command: `npm run remove-devmode`. This dry-runs that removal on every test run:
//
//   - after it, nothing in the shipped code still refers to the deleted files, so every
//     reference has to be on a line tagged DEV-MODE (or in a dev-mode file);
//   - every JavaScript file it rewrites still parses (node --check on the rewritten text);
//   - the browser's digest (dev3d.js, WebCrypto) and the tool's (devcode.mjs) agree, and
//     devhash.js holds a digest, not a code; the plain-text code file is git-ignored.
//
// Deleted by the removal it checks.

import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PASS = 'PASS', FAIL = 'FAIL';

function walk(dir) {
  const abs = resolve(ROOT, dir);
  const out = [];
  for (const name of readdirSync(abs)) {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) out.push(...walk(relative(ROOT, p)));
    else if (/\.(js|mjs|html|css|json)$/.test(name)) out.push(relative(ROOT, p).split('\\').join('/'));
  }
  return out;
}

export const criteria = [{
  n: 31,
  text: 'Developer mode is removable in one step: a dry run of `npm run remove-devmode` leaves no reference to dev-mode files and every rewritten script parses; the code is stored only as a salted digest',
  async fn() {
    if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;   // Node 18
    const problems = [];
    const { planRemoval, DEV_FILES } = await import('../../tools/remove-devmode.mjs');
    const { deletes, rewrites } = planRemoval(ROOT);

    // nothing left pointing at what is deleted
    const shipped = ['web3d', 'sim3d', 'sim', 'web', '3d', 'bench3d', 'bench', 'tools', 'bots']
      .flatMap((d) => walk(d))
      .filter((f) => !DEV_FILES.includes(f) && f !== 'web3d/changes3d.js');   // the changelog keeps its history
    const names = ['dev3d', 'devhash', 'remove-devmode', 'devcode.mjs', 'mountDevPanel', 'installDevRun'];
    for (const f of shipped) {
      const text = rewrites[f] ?? readFileSync(resolve(ROOT, f), 'utf8');
      for (const n of names) if (text.includes(n)) problems.push(`${f} still mentions ${n} after removal`);
    }
    // what is rewritten still parses
    const tmp = mkdtempSync(join(tmpdir(), 'devmode-'));
    try {
      for (const [f, text] of Object.entries(rewrites)) {
        if (!/\.(js|mjs)$/.test(f)) continue;
        const p = join(tmp, f.replace(/\//g, '__').replace(/\.js$/, '.mjs'));
        writeFileSync(p, text);
        const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
        if (r.status !== 0) problems.push(`${f} does not parse after removal: ${r.stderr.split('\n')[0]}`);
      }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    for (const f of ['web3d/hub3d.js', 'web3d/play3d.js', '3d/index.html', 'package.json']) {
      if (!rewrites[f]) problems.push(`removal would not touch ${f}`);
    }

    // the code is a digest, and both sides compute the same one
    const { DEV_HASH, DEV_SALT } = await import('../../web3d/devhash.js');
    if (!/^[0-9a-f]{64}$/.test(DEV_HASH) || !DEV_SALT) problems.push('devhash.js does not hold a salted SHA-256');
    const { hashCode } = await import('../../web3d/dev3d.js');
    const { digest } = await import('../../tools/devcode.mjs');
    if (await hashCode('sample code') !== digest(DEV_SALT, 'sample code')) problems.push('browser and tool digests differ');
    const ignored = spawnSync('git', ['check-ignore', '-q', 'DEV-MODE-CODE.txt'], { cwd: ROOT });
    if (ignored.status !== 0 && ignored.error === undefined) problems.push('DEV-MODE-CODE.txt is not git-ignored');

    return problems.length
      ? [FAIL, problems.slice(0, 6).join('; ')]
      : [PASS, `dry run: ${deletes.length} files deleted, ${Object.keys(rewrites).length} rewritten (${Object.keys(rewrites).join(', ')}); no references left, rewritten scripts parse; code stored as a salted SHA-256, browser and tool agree`];
  },
}];
