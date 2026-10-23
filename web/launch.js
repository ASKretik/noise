// web/launch.js -- the profile picker. index.html only.
//
// Its whole job is to show what the system already knows about each slot and then hand
// off to play.html. The contrast between the two slots is the demo: hand the laptop over
// on GUEST and the aliens spawn near-randomly; switch to MAIN and they are waiting at the
// junction you always use. Same code, same seeds, different dossier.

import { Dossier } from '../sim/predictor/dossier.js';
import { PROFILE_IDS } from '../sim/profile.js';
import { TRAIT_BY_KEY } from '../sim/predictor/traits.js';
import { DIFFICULTIES, DIFFICULTY_IDS, difficultyOf } from '../sim/difficulty.js';
import { createProfileStore, ensureGuestSession } from './persist.js';
import { install as installTheme } from './theme.js';

const $ = (id) => document.getElementById(id);

let store = null;

/** The permanent choice. Asked once, when the save file is created. */
function openChooser(id) {
  $('chooser-slot').textContent = id === 'main' ? 'MAIN' : 'GUEST';
  const host = $('tiers');
  host.innerHTML = '';
  for (const tierId of DIFFICULTY_IDS) {
    const tier = DIFFICULTIES[tierId];
    const btn = document.createElement('button');
    btn.className = 'tier';
    btn.type = 'button';
    btn.dataset.tier = tierId;
    btn.innerHTML =
      `<span class="tier-name">${tier.label}</span>` +
      `<span class="tier-speed">aliens at ${Math.round(tier.speedFactor * 100)}% speed</span>` +
      `<span class="tier-blurb">${tier.blurb}</span>` +
      `<span class="tier-mult">score x${tier.scoreMult.toFixed(2)}</span>`;
    btn.addEventListener('click', async () => {
      await store.load(id);
      store.chooseDifficulty(tierId);
      window.location.href = `districts.html?p=${encodeURIComponent(id)}`;
    });
    host.appendChild(btn);
  }
  $('chooser').hidden = false;
  $('slots').hidden = true;
}

function closeChooser() {
  $('chooser').hidden = true;
  $('slots').hidden = false;
}

/** Render one slot. MAIN offers continue-or-erase; GUEST is always disposable. */
function renderSlot(id, rec, dossier) {
  const hasFile = !!(rec && rec.difficulty);
  const isGuest = id === 'guest';
  const runs = rec?.runs?.length ?? 0;

  const slot = document.createElement('div');
  slot.className = `slot ${hasFile ? '' : 'empty'}`;

  const title = document.createElement('h2');
  title.innerHTML = `${isGuest ? 'GUEST' : 'MAIN'}` +
    (hasFile ? '' : ' <span class="slot-new">new file</span>');
  slot.appendChild(title);

  if (hasFile) {
    const strongest = dossier.strongest(1)[0];
    const meta = document.createElement('div');
    meta.className = 'slot-meta';
    meta.innerHTML =
      `<span>tier<b>${difficultyOf(rec.difficulty).label}</b></span>` +
      `<span>unlocked<b>district ${rec.level ?? 1}</b></span>` +
      `<span>coins<b>${(rec.wallet?.coins ?? 0).toLocaleString()}</b></span>` +
      `<span>runs logged<b>${runs}</b></span>` +
      `<span>they know you<b>${Math.round(dossier.confidence() * 100)}%</b></span>`;
    slot.appendChild(meta);

    const hint = document.createElement('p');
    hint.className = 'slot-hint';
    hint.textContent = strongest
      ? `strongest habit on file: ${TRAIT_BY_KEY[strongest.key]?.label || strongest.key} ` +
        `${strongest.z > 0 ? '+' : ''}${strongest.z.toFixed(2)}sd`
      : 'no habits on file yet — they start blind';
    slot.appendChild(hint);
  } else {
    const hint = document.createElement('p');
    hint.className = 'slot-hint';
    hint.textContent = isGuest
      ? 'Hand the laptop over. Starts blind, and is wiped the moment you close the tab.'
      : 'Pick a difficulty tier to begin — the tier is permanent for this file.';
    slot.appendChild(hint);
  }

  const actions = document.createElement('div');
  actions.className = 'slot-actions';

  if (hasFile) {
    const cont = document.createElement('a');
    cont.className = 'btn';
    cont.href = `districts.html?p=${encodeURIComponent(id)}`;
    cont.textContent = isGuest ? 'continue this session' : 'continue';
    actions.appendChild(cont);
  } else {
    const start = document.createElement('button');
    start.className = 'btn';
    start.type = 'button';
    start.textContent = 'start a new file';
    start.addEventListener('click', () => openChooser(id));
    actions.appendChild(start);
  }

  // Erasing is offered on MAIN only. GUEST erases itself when the tab closes, so a
  // button for it would be offering something that already happens.
  if (hasFile && !isGuest) {
    const fresh = document.createElement('button');
    fresh.className = 'btn ghost danger';
    fresh.type = 'button';
    fresh.textContent = 'start fresh';
    fresh.title = 'Erase this file completely and begin again';
    fresh.addEventListener('click', () => eraseAndRestart(id, rec));
    actions.appendChild(fresh);
  }

  slot.appendChild(actions);

  if (isGuest) {
    const note = document.createElement('p');
    note.className = 'slot-note';
    note.textContent = 'resets when you close the tab';
    slot.appendChild(note);
  }
  return slot;
}

/**
 * "Start fresh" on MAIN. Confirms first, because this throws away the one thing in the
 * project that takes real time to build: the dossier.
 */
async function eraseAndRestart(id, rec) {
  const depth = rec?.dossier?.levelsSeen ?? 0;
  const ok = window.confirm(
    `Start a fresh file?\n\n` +
    `This erases everything on MAIN: district ${rec?.level ?? 1}, ` +
    `${(rec?.wallet?.coins ?? 0).toLocaleString()} coins, your inventory, every logged run, ` +
    `and the dossier — ${depth} district${depth === 1 ? '' : 's'} of everything the system ` +
    `has learned about how you move. It cannot be undone, and you will pick a tier again.`,
  );
  if (!ok) return;
  await store.load(id);
  await store.eraseActive();
  openChooser(id);
}

async function boot() {
  installTheme();
  const { store: s, degraded, reason } = await createProfileStore();
  store = s;
  if (degraded) {
    $('storage-note').textContent =
      `Local storage unavailable (${reason}). You can play, but nothing will be saved.`;
  }
  $('chooser-cancel').addEventListener('click', closeChooser);

  // A new browser session means a blank guest slot, before anything is drawn.
  await ensureGuestSession(store);

  const host = $('slots');
  host.innerHTML = '';
  for (const id of PROFILE_IDS) {
    const rec = await store.peek(id);
    host.appendChild(renderSlot(id, rec, new Dossier(rec?.dossier)));
  }

  // Arriving from the hub with an unfinished file: go straight to the chooser.
  const needsTier = new URLSearchParams(window.location.search).get('new');
  if (PROFILE_IDS.includes(needsTier)) openChooser(needsTier);
}

boot().catch((err) => {
  console.error('[noise] launch failed', err);
  document.body.innerHTML =
    `<pre style="padding:24px;color:#ff4d5e;font:13px ui-monospace,monospace">` +
    `NOISE failed to start.\n\n${err?.stack || err}\n</pre>`;
});
