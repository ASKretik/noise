// web/theme.js -- light and dark, remembered.
//
// The preference lives in localStorage rather than on a save profile, because it is a
// property of the person at the keyboard rather than of the file they are playing:
// switching from MAIN to GUEST should not relight the room.
//
// WHAT DOES NOT CHANGE: the board itself. The district is a rendered scene with its own
// art direction -- ten belt palettes tuned so a red alien, a gold key and a white human
// all read against the ground -- and a light version would need ten more palettes and
// would wash out every entity on them. So the chrome adapts and the board stays as drawn,
// framed like a screen inside the page. That is what almost every game with a UI does.

const KEY = 'noise.theme';
export const THEMES = ['dark', 'light'];

function stored() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : null;
  } catch {
    return null;      // private mode with storage blocked
  }
}

function systemPrefers() {
  try {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** The theme in force: an explicit choice if there is one, otherwise the system's. */
export function current() {
  return stored() || systemPrefers();
}

export function apply(theme) {
  const t = THEMES.includes(theme) ? theme : 'dark';
  const root = document.documentElement;
  root.dataset.theme = t;
  root.style.colorScheme = t;
  for (const btn of document.querySelectorAll('[data-theme-toggle]')) {
    btn.dataset.mode = t;
    btn.setAttribute('aria-pressed', String(t === 'light'));
    btn.title = t === 'light' ? 'Switch to dark' : 'Switch to light';
    const label = btn.querySelector('[data-theme-label]');
    if (label) label.textContent = t === 'light' ? 'Light' : 'Dark';
  }
  return t;
}

export function toggle() {
  const next = current() === 'light' ? 'dark' : 'light';
  try { localStorage.setItem(KEY, next); } catch { /* preference just will not persist */ }
  return apply(next);
}

/**
 * Wire every [data-theme-toggle] on the page and apply the current theme.
 * Safe to call on any page; pages without a toggle still get the right colours.
 */
export function install() {
  const theme = apply(current());
  for (const btn of document.querySelectorAll('[data-theme-toggle]')) {
    btn.addEventListener('click', () => toggle());
  }
  // Follow the system only while the player has not made a choice of their own.
  try {
    window.matchMedia?.('(prefers-color-scheme: light)')
      .addEventListener?.('change', () => { if (!stored()) apply(systemPrefers()); });
  } catch { /* no matchMedia */ }
  return theme;
}
