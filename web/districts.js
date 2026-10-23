// web/districts.js -- the hub: pick a district, or spend coins. districts.html only.
//
// Sits between the profile picker and the game. Everything on it reads from the profile
// and writes through ProfileStore, so the shop cannot invent coins and the district grid
// cannot unlock anything the runs did not earn.

import { createProfileStore, ensureGuestSession } from './persist.js';
import { PROFILE_IDS } from '../sim/profile.js';
import { difficultyOf, CURVE_CAP } from '../sim/difficulty.js';
import { SHOP_ITEMS, canBuy, STUN_GUN_CAPACITY } from '../sim/shop.js';
import { TOTAL_DISTRICTS, BLOCK_SIZE, DISTRICT_THEMES, blockOf, themeFor } from './themes.js';
import { install as installTheme } from './theme.js';

const $ = (id) => document.getElementById(id);

let store = null;
let profile = null;

function renderDistricts() {
  const grid = $('district-grid');
  grid.innerHTML = '';
  const unlocked = profile.level || 1;

  $('districts-note').textContent =
    `District ${unlocked} of ${TOTAL_DISTRICTS} is the furthest you have opened. Clear one to ` +
    `unlock the next. Replaying an earlier district still pays coins, but its score decays ` +
    `each attempt. The difficulty curve tops out at district ${CURVE_CAP}; past that the ` +
    `districts keep coming at full pressure and the file on you keeps thickening.`;

  let lastBlock = -1;
  for (let L = 1; L <= TOTAL_DISTRICTS; L++) {
    const block = blockOf(L);
    if (block !== lastBlock) {
      lastBlock = block;
      const theme = DISTRICT_THEMES[block % DISTRICT_THEMES.length];
      const head = document.createElement('h3');
      head.className = 'block-head';
      head.style.setProperty('color', theme.accent);
      head.textContent = `${theme.name} · districts ${block * BLOCK_SIZE + 1}–${block * BLOCK_SIZE + BLOCK_SIZE}`;
      grid.appendChild(head);
    }

    const theme = themeFor(L);
    const locked = L > unlocked;
    const plays = profile.plays?.[String(L)] || 0;
    const best = profile.bestScores?.[String(L)] || 0;

    const card = locked ? document.createElement('div') : document.createElement('a');
    card.className = `district ${locked ? 'locked' : ''}`;
    card.style.setProperty('--d-accent', theme.accent);
    card.style.setProperty('--d-glow', theme.glow);
    card.style.setProperty('--d-tint', theme.tint);
    if (!locked) card.href = `play.html?p=${encodeURIComponent(profile.id)}&d=${L}`;

    card.innerHTML =
      `<span class="d-num">${L}</span>` +
      (locked
        ? `<span class="d-state">locked</span>`
        : `<span class="d-state">${plays ? `${plays} attempt${plays === 1 ? '' : 's'}` : 'unplayed'}</span>` +
          `<span class="d-best">${best ? `best ${best.toLocaleString()}` : '—'}</span>`) +
      (L === unlocked && !locked ? `<span class="d-flag">furthest</span>` : '');
    grid.appendChild(card);
  }
}

function renderShop() {
  const grid = $('shop-grid');
  grid.innerHTML = '';
  const wallet = profile.wallet;
  const inv = profile.inventory;

  for (const item of SHOP_ITEMS) {
    const quantities = item.kind === 'once' ? [1] : (item.id === 'bullet' ? [1, 3, 6] : [5, 10, 30]);
    const owned = item.id === 'stunGun'
      ? (inv.stunGun
        ? `owned · ${inv.bullets}/${STUN_GUN_CAPACITY} charges loaded${inv.bullets === 0 ? ' — buy charges to use it' : ''}`
        : 'not owned')
      : item.id === 'bullet'
        ? `${inv.bullets}/${STUN_GUN_CAPACITY} loaded`
        : `${inv.boltSeconds.toFixed(0)}s banked`;

    const card = document.createElement('div');
    card.className = 'shop-item';
    // Built as real elements rather than written as innerHTML and then queried back out:
    // assigning innerHTML and immediately querySelector-ing into it couples this code to
    // the parser, and it is the kind of thing that works until it quietly does not.
    const head = document.createElement('h4');
    head.innerHTML = `${item.label} <span class="price">${item.price} coins${item.kind === 'once' ? '' : ' each'}</span>`;
    const blurb = document.createElement('p');
    blurb.className = 'muted';
    blurb.textContent = item.blurb;
    const ownedEl = document.createElement('p');
    ownedEl.className = 'owned';
    ownedEl.textContent = owned;
    const row = document.createElement('div');
    row.className = 'buy-row';
    card.append(head, blurb, ownedEl, row);
    for (const qty of quantities) {
      const check = canBuy(wallet, inv, item.id, qty);
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = item.kind === 'once' ? 'buy' : `buy ${qty}`;
      btn.disabled = !check.ok;
      btn.title = check.ok ? `${check.cost} coins` : (check.reason || '');
      btn.addEventListener('click', () => buy(item.id, qty));
      row.appendChild(btn);
      if (item.kind === 'once') break;
    }
    grid.appendChild(card);
  }
}

function buy(itemId, qty) {
  const res = store.buy(itemId, qty);
  profile = store.current();
  $('shop-status').textContent = res.ok
    ? `Bought ${qty > 1 ? `${qty}x ` : ''}${itemId} for ${res.cost} coins.`
    : `Cannot buy: ${res.reason}.`;
  renderWallet();
  renderShop();
}

function renderWallet() {
  $('wallet-coins').textContent = (profile.wallet.coins || 0).toLocaleString();
}

function showTab(which) {
  $('panel-districts').hidden = which !== 'districts';
  $('panel-shop').hidden = which !== 'shop';
  $('tab-districts').classList.toggle('active', which === 'districts');
  $('tab-shop').classList.toggle('active', which === 'shop');
  try { sessionStorage.setItem('noise.tab', which); } catch { /* private mode */ }
}

async function boot() {
  installTheme();
  const requested = new URLSearchParams(window.location.search).get('p');
  const id = PROFILE_IDS.includes(requested) ? requested : 'main';

  const { store: s } = await createProfileStore();
  store = s;
  // Landing here directly in a new tab must still wipe a stale guest slot.
  await ensureGuestSession(store);
  profile = await store.load(id);

  // A save file with no tier has not finished being created. Send it back.
  if (!profile.difficulty) {
    window.location.replace(`index.html?new=${encodeURIComponent(id)}`);
    return;
  }

  const tier = difficultyOf(profile.difficulty);
  $('hub-profile').textContent = profile.displayName;
  $('hub-difficulty').textContent = tier.label;
  $('hub-difficulty').title = tier.blurb;

  renderWallet();
  renderDistricts();
  renderShop();

  $('tab-districts').addEventListener('click', () => showTab('districts'));
  $('tab-shop').addEventListener('click', () => showTab('shop'));
  let tab = 'districts';
  try { tab = sessionStorage.getItem('noise.tab') || 'districts'; } catch { /* ignore */ }
  showTab(tab);
}

boot().catch((err) => {
  console.error('[noise] hub failed', err);
  document.body.innerHTML =
    `<pre style="padding:24px;color:#ff4d5e;font:13px ui-monospace,monospace">` +
    `NOISE failed to start.\n\n${err?.stack || err}\n</pre>`;
});
