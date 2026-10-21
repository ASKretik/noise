// web/launch.js -- the profile picker. index.html only.
//
// Its whole job is to show what the system already knows about each slot and then hand
// off to play.html. The contrast between the two slots is the demo: hand the laptop over
// on GUEST and the aliens spawn near-randomly; switch to MAIN and they are waiting at the
// junction you always use. Same code, same seeds, different dossier.

import { Dossier } from '../sim/predictor/dossier.js';
import { PROFILE_IDS } from '../sim/profile.js';
import { TRAIT_BY_KEY } from '../sim/predictor/traits.js';
import { createProfileStore } from './persist.js';

const $ = (id) => document.getElementById(id);

async function boot() {
  const { store, degraded, reason } = await createProfileStore();
  if (degraded) {
    $('storage-note').textContent =
      `Local storage unavailable (${reason}). You can play, but nothing will be saved.`;
  }

  const host = $('slots');
  host.innerHTML = '';

  for (const id of PROFILE_IDS) {
    const rec = await store.peek(id);
    const dossier = new Dossier(rec?.dossier);
    const runs = rec?.runs?.length ?? 0;
    const strongest = dossier.strongest(1)[0];
    const label = strongest
      ? `${TRAIT_BY_KEY[strongest.key]?.label || strongest.key} ${strongest.z > 0 ? '+' : ''}${strongest.z.toFixed(2)}sd`
      : null;

    const btn = document.createElement('a');
    btn.className = 'slot';
    btn.href = `play.html?p=${encodeURIComponent(id)}`;
    btn.innerHTML =
      `<h2>${id === 'main' ? 'MAIN' : 'GUEST'}</h2>` +
      `<div class="slot-meta">` +
      `<span>unlocked<b>district ${rec?.level ?? 1}</b></span>` +
      `<span>runs logged<b>${runs}</b></span>` +
      `<span>file depth<b>${dossier.levelsSeen} district${dossier.levelsSeen === 1 ? '' : 's'}</b></span>` +
      `<span>they know you<b>${Math.round(dossier.confidence() * 100)}%</b></span>` +
      `</div>` +
      `<p class="slot-hint">${label
        ? `strongest habit on file: ${label}`
        : (id === 'main' ? 'no file yet — they start blind' : 'hand the laptop over; they start blind again')}</p>`;
    host.appendChild(btn);
  }
}

boot().catch((err) => {
  console.error('[noise] launch failed', err);
  document.body.innerHTML =
    `<pre style="padding:24px;color:#ff4d5e;font:13px ui-monospace,monospace">` +
    `NOISE failed to start.\n\n${err?.stack || err}\n</pre>`;
});
