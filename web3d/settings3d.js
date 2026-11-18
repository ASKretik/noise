// web3d/settings3d.js -- player settings for the 3D page. Browser only.
//
// Properties of the person at the keyboard, not of a save file -- like the theme and the
// quality tier, they live in localStorage. Every read and write is wrapped: private
// browsing throws, and losing a preference must never cost a run.

const KEY = 'noise3d-settings-v2';
// v1 also held the Jumpscares choice -- and build 15's review note asked you to try "mild",
// which then quietly stayed on for every capture after it (R50). v2 carries everything
// over from v1 except that choice, which starts at full again, once.
const KEY_V1 = 'noise3d-settings-v1';

export const DEFAULT_SETTINGS = Object.freeze({
  sens: 1,
  invertY: false,
  fov: 90,
  reduceMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  sound: true,
  jumpscares: 'full',        // full | mild | off
  fpsCap: 'auto',            // 'auto' (the display's own rate) | 60 | 30 -- N8.4
  glow: 'auto',              // 'auto' (on at High and Medium, off at Low) | 'on' | 'off' -- bloom and grade, N4.3
});

export function loadSettings() {
  try {
    const now = localStorage.getItem(KEY);
    if (now) return { ...DEFAULT_SETTINGS, ...JSON.parse(now) };
    const old = JSON.parse(localStorage.getItem(KEY_V1) || '{}');
    delete old.jumpscares;
    const s = { ...DEFAULT_SETTINGS, ...old };
    saveSettings(s);
    return s;
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not remembered */ }
}
