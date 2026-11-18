// web3d/hub3d.js -- the 3D launch page, hub and shop. 3d/index.html only.
//
// One page instead of the 2D game's two (launch, districts): profile slots, the
// permanent tier chooser, the district grid and the shop. Every rule is the 2D game's --
// sim/profile.js, sim/shop.js, sim/difficulty.js -- with the 3D game's own save files.

import { Dossier } from '../sim/predictor/dossier.js';
import { DIFFICULTIES, DIFFICULTY_IDS, difficultyOf } from '../sim/difficulty.js';
import { TIER_SPEED_3D, TIER_BLURB_3D } from '../sim3d/next/rules.js';
import { SHOP_ITEMS, canBuy, STUN_GUN_CAPACITY } from '../sim/shop.js';
import { DISTRICT_THEMES, BLOCK_SIZE, TOTAL_DISTRICTS } from '../web/themes.js';
import { install as installTheme } from '../web/theme.js';
import { simSecondsToReal } from '../sim3d/units.js';
import { createProfileStore3d, ensureGuestSession3d } from './persist3d.js';
import { mountBanner } from './banner.js';
import { mountDevPanel } from './dev3d.js'; // DEV-MODE

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let store = null;
let degraded = false;

const show = (view) => { for (const v of ['v-slots', 'v-tier', 'v-hub']) $(v).hidden = v !== view; };

async function boot() {
  installTheme();
  mountBanner(document.body);
  mountDevPanel($('dev3d')); // DEV-MODE
  ({ store, degraded } = await createProfileStore3d());
  await ensureGuestSession3d(store);
  const q = new URLSearchParams(location.search);
  const p = q.get('p');
  if (p === 'main' || p === 'guest') return openHub(p);
  return renderSlots();
}

// ------------------------------------------------------------------ slots

async function renderSlots() {
  show('v-slots');
  const host = $('v-slots');
  host.innerHTML = '';
  for (const id of ['main', 'guest']) {
    const rec = await store.peek(id);
    const has = !!rec?.difficulty;
    const dossier = has ? Dossier.fromJSON(rec.dossier) : null;
    const card = document.createElement('article');
    card.className = 'l3-panel l3-slot';
    const isGuest = id === 'guest';
    card.innerHTML = `
      <h2>${isGuest ? 'GUEST' : 'MAIN'}</h2>
      <p>${isGuest
        ? 'Starts blind every time: forgotten when this tab closes. For handing the keyboard to someone.'
        : has
          ? `${esc(difficultyOf(rec.difficulty).label)} · district ${rec.level} reached · ${rec.wallet.coins} coins · a file ${dossier.levelsSeen} district${dossier.levelsSeen === 1 ? '' : 's'} deep.`
          : 'Your persistent 3D save. The file on you builds here, district after district.'}</p>
      <div class="g3-actions"></div>`;
    const actions = card.querySelector('.g3-actions');
    const btn = (label, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = `btn ${cls}`; b.textContent = label; b.addEventListener('click', fn); actions.append(b); };
    if (has) {
      btn('continue', 'primary', () => openHub(id));
      if (!isGuest) {
        btn('start fresh', 'ghost', async () => {
          if (!confirm(`Erase the 3D MAIN file? Progress, wallet, kit, tier and a ${dossier.levelsSeen}-district file on how you move all go. Your 2D save is not touched.`)) return;
          await store.load(id);
          await store.eraseActive();
          renderSlots();
        });
      }
    } else {
      btn(isGuest ? 'play as guest' : 'new file', 'primary', () => chooseTier(id));
    }
    host.append(card);
  }
  if (degraded) {
    const n = document.createElement('p');
    n.className = 'g3-note';
    n.textContent = 'This browser is not letting the page store anything, so progress will not be saved this session.';
    host.append(n);
  }
}

// ------------------------------------------------------------------ tier

async function chooseTier(id) {
  await store.load(id);
  if (store.difficulty()) return openHub(id);
  show('v-tier');
  $('tier-slot').textContent = id.toUpperCase();
  const host = $('tier-list');
  host.innerHTML = '';
  for (const tid of DIFFICULTY_IDS) {
    const t = DIFFICULTIES[tid];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'l3-tier';
    b.innerHTML = `<b>${t.label}</b><span>aliens at ${Math.round(TIER_SPEED_3D[tid] * 100)}% speed · score ×${t.scoreMult.toFixed(2)}</span><em>${esc(TIER_BLURB_3D[tid] || t.blurb)}</em>`;
    b.addEventListener('click', () => { store.chooseDifficulty(tid); openHub(id); });
    host.append(b);
  }
  $('tier-back').onclick = () => renderSlots();
}

// ------------------------------------------------------------------ hub

async function openHub(id) {
  const rec = await store.load(id);
  if (!rec.difficulty) return chooseTier(id);
  history.replaceState(null, '', `?p=${id}`);
  show('v-hub');
  renderStatus();
  renderGrid();
  renderShop();
}

function renderStatus() {
  const rec = store.current();
  const dossier = Dossier.fromJSON(rec.dossier);
  $('h-profile').textContent = rec.id.toUpperCase();
  $('h-tier').textContent = difficultyOf(rec.difficulty).label;
  $('h-wallet').textContent = `${rec.wallet.coins} coins`;
  $('h-file').textContent = `${dossier.levelsSeen} district${dossier.levelsSeen === 1 ? '' : 's'} deep`;
  const inv = rec.inventory;
  $('h-kit').textContent = `${inv.stunGun ? `gun ${inv.bullets}/${STUN_GUN_CAPACITY}` : 'no gun'} · ${simSecondsToReal(inv.boltSeconds).toFixed(0)} s lightning`;
}

function renderGrid() {
  const rec = store.current();
  const host = $('h-grid');
  host.innerHTML = '';
  for (let b = 0; b < TOTAL_DISTRICTS / BLOCK_SIZE; b++) {
    const theme = DISTRICT_THEMES[b];
    const row = document.createElement('div');
    row.className = 'l3-belt';
    row.style.setProperty('--belt', theme.accent);
    row.innerHTML = `<span class="l3-belt-name">${theme.name}</span>`;
    for (let k = 1; k <= BLOCK_SIZE; k++) {
      const d = b * BLOCK_SIZE + k;
      const locked = d > rec.level;
      const best = rec.bestScores?.[String(d)];
      const a = document.createElement(locked ? 'span' : 'a');
      a.className = `l3-d${locked ? ' locked' : ''}${best ? ' cleared' : ''}`;
      a.textContent = d;
      if (!locked) {
        a.href = `play.html?p=${rec.id}&d=${d}`;
        a.title = best ? `best ${best}` : 'not yet cleared';
      }
      row.append(a);
    }
    host.append(row);
  }
}

const LABEL_3D = {
  stunGun: 'The frame, empty. In first person you aim it: one alien per charge, the one under your crosshair, if it can hear you and nothing solid is in between.',
  bullet: `Reloads the gun, up to ${STUN_GUN_CAPACITY}.`,
  boltSecond: `Banked sprint. In 3D one bought second lasts ${simSecondsToReal(1).toFixed(0)} real seconds, because the 3D city runs at half speed. Hold Shift to spend it.`,
};

function renderShop() {
  const rec = store.current();
  $('h-shop-note').textContent = `${rec.wallet.coins} coins. Prices are the 2D game's.`;
  const host = $('h-shop');
  host.innerHTML = '';
  for (const item of SHOP_ITEMS) {
    const qty = item.id === 'boltSecond' ? 10 : 1;
    const check = canBuy(rec.wallet, rec.inventory, item.id, qty);
    const row = document.createElement('div');
    row.className = 'l3-item';
    row.innerHTML = `<div><b>${esc(item.label)}${qty > 1 ? ` × ${qty}` : ''}</b><p>${esc(LABEL_3D[item.id] || item.blurb)}</p></div>`;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${check.ok ? 'primary' : 'ghost'}`;
    b.disabled = !check.ok;
    b.textContent = check.ok ? `${check.cost} coins` : check.reason;
    b.addEventListener('click', () => {
      const res = store.buy(item.id, qty);
      if (res.ok) { renderStatus(); renderShop(); }
    });
    row.append(b);
    host.append(row);
  }
}

boot();
