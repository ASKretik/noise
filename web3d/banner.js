// web3d/banner.js -- the "3D · in development" strip on every 3D page.
//
// Two jobs. It proves which build you are looking at (GitHub Pages caches for about ten
// minutes, so "I don't see the change" is usually a stale cache, and the number answers
// that), and it says what changed and what to try, so a review takes two minutes instead
// of a hunt. The bar is always visible; the details open on click.

import { BUILD3D } from './build3d.js';
import { CHANGES } from './changes3d.js';

function list(title, items) {
  if (!items || items.length === 0) return '';
  const lis = items.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
  return `<div class="b3-sec"><h4>${title}</h4><ul>${lis}</ul></div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Mount the banner at the top of `parent` (default: body). Returns the element. */
export function mountBanner(parent = document.body, { compact = false } = {}) {
  const latest = CHANGES.find((c) => c.build === BUILD3D) || CHANGES[0];
  const el = document.createElement('aside');
  el.className = 'b3-banner' + (compact ? ' compact' : '');
  el.setAttribute('aria-label', '3D build information');

  const older = CHANGES.filter((c) => c !== latest).slice(0, 4)
    .map((c) => `<li><b>build ${c.build}</b> · ${escapeHtml(c.changed[0] || '')}</li>`).join('');

  el.innerHTML = `
    <button class="b3-bar" type="button" aria-expanded="false">
      <span class="b3-tag">3D · in development</span>
      <span class="b3-build">build ${BUILD3D}</span>
      <span class="b3-phase">phase ${latest?.phase ?? '?'}</span>
      <span class="b3-more">what changed</span>
    </button>
    <div class="b3-body">
      ${list('Changed', latest?.changed)}
      ${list('Try this', latest?.tryThis)}
      ${list('Not verified yet', latest?.unverified)}
      ${older ? `<div class="b3-sec"><h4>Earlier builds</h4><ul>${older}</ul></div>` : ''}
    </div>`;

  const bar = el.querySelector('.b3-bar');
  const set = (open) => {
    el.classList.toggle('open', open);
    bar.setAttribute('aria-expanded', String(open));
  };
  set(false);
  bar.addEventListener('click', (e) => {
    e.stopPropagation();
    set(!el.classList.contains('open'));
  });

  parent.prepend(el);
  return el;
}
