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
import { createProfileStore } from './persist.js';

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

async function boot() {
  const { store: s, degraded, reason } = await createProfileStore();
  store = s;
  if (degraded) {
    $('storage-note').textContent =
      `Local storage unavailable (${reason}). You can play, but nothing will be saved.`;
  }
  $('chooser-cancel').addEventListener('click', closeChooser);

  const host = $('slots');
  host.innerHTML = '';

  for (const id of PROFILE_IDS) {
    const rec = await store.peek(id);
    const dossier = new Dossier(rec?.dossier);
    const runs = rec?.runs?.length ?? 0;
    const fresh = !rec || !rec.difficulty;
    const strongest = dossier.strongest(1)[0];
    const label = strongest
      ? `${TRAIT_BY_KEY[strongest.key]?.label || strongest.key} ${strongest.z > 0 ? '+' : ''}${strongest.z.toFixed(2)}sd`
      : null;

    const btn = document.createElement(fresh ? 'button' : 'a');
    btn.className = 'slot';
    if (fresh) {
      btn.type = 'button';
      btn.addEventListener('click', () => openChooser(id));
    } else {
      btn.href = `districts.html?p=${encodeURIComponent(id)}`;
    }

    btn.innerHTML =
      `<h2>${id === 'main' ? 'MAIN' : 'GUEST'}${fresh ? ' <span class="slot-new">new file</span>' : ''}</h2>` +
      (fresh
        ? `<p class="slot-hint">No file yet. Pick a difficulty tier to start — it is permanent.</p>`
        : `<div class="slot-meta">` +
          `<span>tier<b>${difficultyOf(rec.difficulty).label}</b></span>` +
          `<span>unlocked<b>district ${rec.level ?? 1}</b></span>` +
          `<span>coins<b>${(rec.wallet?.coins ?? 0).toLocaleString()}</b></span>` +
          `<span>runs logged<b>${runs}</b></span>` +
          `<span>they know you<b>${Math.round(dossier.confidence() * 100)}%</b></span>` +
          `</div>` +
          `<p class="slot-hint">${label
            ? `strongest habit on file: ${label}`
            : (id === 'main' ? 'no habits on file yet — they start blind' : 'hand the laptop over; they start blind again')}</p>`);
    host.appendChild(btn);
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
