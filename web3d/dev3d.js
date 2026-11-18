// web3d/dev3d.js -- developer mode for the 3D game. Browser only. REMOVABLE.
//
// Switched on by typing the developer code on the 3D hub. Only a salted SHA-256 of the
// code is in the repository (web3d/devhash.js, written by `npm run devcode`), and this
// browser remembers that it was unlocked, never the code.
//
// What it gives:
//
//   hub   a Developer panel: every district 1-100 one click away, any tier, city or
//         classic maps, and two switches -- "they can't catch me" and "empty city"
//   play  dev runs are the unsaved sandbox, so they never touch the MAIN or GUEST file,
//         the dossier, scores or unlocks. Every shop item comes unlimited: the stun gun,
//         kept full of charges, and lightning that never runs out. [ and ] jump to the
//         previous and next district.
//
// It is a convenience lock, not security: the site is static and the check runs in the
// browser, so anyone who reads the source can switch it on -- for their own browser only.
// Nothing changes for a player who has not.
//
// REMOVING IT, once the game is finished: `npm run remove-devmode` deletes this file,
// devhash.js, the two dev-mode tools and criterion 3D-31, and every line tagged DEV-MODE
// in the files that load it. Then run the 3D loop as usual. Criterion 3D-31 dry-runs that
// removal on every test run, so it keeps working as the code around it changes.

import { DEV_HASH, DEV_SALT } from './devhash.js';
import { STUN_GUN_CAPACITY } from '../sim/shop.js';
import { ITEMS3D, ITEM3D_IDS } from '../sim3d/shop3d.js';
import { TICKS_PER_SECOND } from '../sim/difficulty.js';
import { DISTRICT_THEMES, BLOCK_SIZE, TOTAL_DISTRICTS } from '../web/themes.js';

const KEY = 'noise3d-dev';
const OPT_KEY = 'noise3d-dev-options';
/** Lightning in a dev run, in the sim's seconds; topped up every tick, so it never ends. */
export const DEV_BOLT_SECONDS = 999;
const TIERS = ['easy', 'medium', 'hard', 'ultra'];

/** The digest tools/devcode.mjs writes: SHA-256 of "salt:code", hex. */
export async function hashCode(code) {
  const bytes = new TextEncoder().encode(`${DEV_SALT}:${String(code).trim()}`);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Has the code been entered in this browser (for the code currently in devhash.js)? */
export function devUnlocked() {
  try { return localStorage.getItem(KEY) === DEV_HASH; } catch { return false; }
}

function setUnlocked(on) {
  try { if (on) localStorage.setItem(KEY, DEV_HASH); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}

function loadOptions() {
  const base = { tier: 'medium', rules: 'next', god: false, empty: false };
  try { return { ...base, ...JSON.parse(localStorage.getItem(OPT_KEY) || '{}') }; } catch { return base; }
}

function saveOptions(o) {
  try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch { /* not remembered */ }
}

/** The play.html link for a dev run of district d under the given options. */
export function devLink(d, o) {
  const q = new URLSearchParams({ d: String(d), t: o.tier, dev: '1' });
  if (o.rules === 'classic') q.set('rules', 'classic');
  if (o.god) q.set('god', '1');
  if (o.empty) q.set('empty', '1');
  return `play.html?${q}`;
}

// ------------------------------------------------------------------ the hub panel

/**
 * The Developer panel on the 3D hub: a code box while locked, the district picker and
 * switches once unlocked.
 * @param {HTMLElement} host
 */
export function mountDevPanel(host) {
  if (!host) return;
  const render = () => (devUnlocked() ? renderOpen(host, render) : renderLocked(host, render));
  render();
}

function renderLocked(host, rerender) {
  host.innerHTML = `
    <details class="dev3d">
      <summary>Developer mode</summary>
      <form class="dev3d-form" autocomplete="off">
        <input type="password" placeholder="developer code" aria-label="developer code" spellcheck="false">
        <button class="btn ghost" type="submit">unlock</button>
        <span class="dev3d-msg" role="status"></span>
      </form>
    </details>`;
  const form = host.querySelector('form');
  const input = form.querySelector('input');
  const msg = form.querySelector('.dev3d-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!crypto?.subtle) { msg.textContent = 'This browser cannot check the code here (needs https or localhost).'; return; }
    if (await hashCode(input.value) === DEV_HASH) {
      setUnlocked(true);
      input.value = '';
      rerender();
    } else {
      msg.textContent = 'That is not the developer code.';
      input.select();
    }
  });
}

function renderOpen(host, rerender) {
  const o = loadOptions();
  host.innerHTML = `
    <div class="dev3d dev3d-open">
      <h2>Developer mode <span class="dev3d-badge">ON</span></h2>
      <p>Every district, unsaved: nothing here touches your MAIN or GUEST file. Every shop
        item comes unlimited (stun gun kept full, lightning that never runs out). In a
        district, <kbd>[</kbd> and <kbd>]</kbd> go to the previous and next one.</p>
      <div class="dev3d-opts">
        <label>tier <select data-k="tier">${TIERS.map((t) => `<option value="${t}"${o.tier === t ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>maps <select data-k="rules">
          <option value="next"${o.rules === 'next' ? ' selected' : ''}>city (as played)</option>
          <option value="classic"${o.rules === 'classic' ? ' selected' : ''}>classic 32 x 20</option>
        </select></label>
        <label class="g3-check"><input type="checkbox" data-k="god"${o.god ? ' checked' : ''}> they can't catch me</label>
        <label class="g3-check"><input type="checkbox" data-k="empty"${o.empty ? ' checked' : ''}> empty city (no aliens)</label>
      </div>
      <div class="l3-grid dev3d-grid"></div>
      <button class="btn ghost dev3d-lock" type="button">turn developer mode off</button>
    </div>`;
  const grid = host.querySelector('.dev3d-grid');
  const drawGrid = () => {
    grid.innerHTML = '';
    for (let b = 0; b < TOTAL_DISTRICTS / BLOCK_SIZE; b++) {
      const theme = DISTRICT_THEMES[b];
      const row = document.createElement('div');
      row.className = 'l3-belt';
      row.style.setProperty('--belt', theme.accent);
      row.innerHTML = `<span class="l3-belt-name">${theme.name}</span>`;
      for (let k = 1; k <= BLOCK_SIZE; k++) {
        const d = b * BLOCK_SIZE + k;
        const a = document.createElement('a');
        a.className = 'l3-d';
        a.textContent = d;
        a.href = devLink(d, o);
        row.append(a);
      }
      grid.append(row);
    }
  };
  drawGrid();
  for (const el of host.querySelectorAll('[data-k]')) {
    el.addEventListener('change', () => {
      o[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
      saveOptions(o);
      drawGrid();
    });
  }
  host.querySelector('.dev3d-lock').addEventListener('click', () => { setUnlocked(false); rerender(); });
}

// ------------------------------------------------------------------ the district page

/**
 * Turn a play.html sandbox into a dev run, if the URL asks (?dev=1) AND this browser has
 * the code. Career runs (?p=main / guest) are never dev runs. Hooks the Play3D instance:
 * its loadout, its run start (switches) and its tick (top-ups), plus the [ ] keys.
 * @param {import('./play3d.js').Play3D} play
 * @returns {object|null} the dev options in force, or null
 */
export function installDevRun(play) {
  const q = new URLSearchParams(location.search);
  if (q.get('dev') !== '1' || play.careerMode || !devUnlocked()) return null;
  const opts = { god: q.get('god') === '1', empty: q.get('empty') === '1' };

  // a strip at the bottom of the screen, so a dev run never passes for a real one
  const badge = document.createElement('div');
  badge.className = 'dev3d-run';
  badge.setAttribute('role', 'status');
  Object.assign(badge.style, {
    position: 'fixed', left: '50%', bottom: '10px', transform: 'translateX(-50%)', zIndex: '40',
    font: '600 11px ui-monospace, Menlo, monospace', letterSpacing: '0.04em', color: '#ffd166',
    background: 'rgba(10,12,18,0.78)', border: '1px solid rgba(255,209,102,0.45)', borderRadius: '6px',
    padding: '4px 10px', pointerEvents: 'none', whiteSpace: 'nowrap',
  });
  document.body.append(badge);

  const allItems = () => Object.fromEntries(ITEM3D_IDS.map((id) => [id, ITEMS3D[id].carry]));   // DEV-MODE
  play.loadout = () => ({ stunGun: true, bullets: STUN_GUN_CAPACITY, boltSeconds: DEV_BOLT_SECONDS, items: allItems(), unlimited: true });

  const topUp = (g) => {
    g.loadout.stunGun = true;
    g.loadout.bullets = STUN_GUN_CAPACITY;
    g.loadout.boltSeconds = DEV_BOLT_SECONDS;
    g.boltBankTicks = DEV_BOLT_SECONDS * TICKS_PER_SECOND;
    if (g.loadout.items) { g.loadout.items = allItems(); g.itemCapOff = true; }   // N6.1: items too
  };

  const start = play.start.bind(play);
  play.start = (n) => {
    start(n);
    const g = play.runner.game;
    if (opts.empty) { g.patrols.length = 0; g.spawnPolicy = null; }
    if (opts.god) { g._collides = () => false; g._swapped = () => false; }
    topUp(g);
    const url = new URL(location.href);
    url.searchParams.set('d', String(n));
    history.replaceState(null, '', url);
    badge.textContent = `DEV · district ${n} · unsaved · unlimited kit${opts.god ? ' · they cannot catch you' : ''}${opts.empty ? ' · empty city' : ''} · [ ] change district`;
  };

  const afterTick = play.afterTick.bind(play);
  play.afterTick = (row) => { topUp(play.runner.game); afterTick(row); };

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.target?.closest?.('input, select, textarea')) return;
    if (e.code !== 'BracketLeft' && e.code !== 'BracketRight') return;
    const n = Math.min(TOTAL_DISTRICTS, Math.max(1, play.district + (e.code === 'BracketRight' ? 1 : -1)));
    if (n !== play.district) play.start(n);
  });

  return opts;
}
