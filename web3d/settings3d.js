// web3d/settings3d.js -- player settings for the 3D page. Browser only.
//
// Properties of the person at the keyboard, not of a save file -- like the theme and the
// quality tier, they live in localStorage. Every read and write is wrapped: private
// browsing throws, and losing a preference must never cost a run.

const KEY = 'noise3d-settings-v1';

export const DEFAULT_SETTINGS = Object.freeze({
  sens: 1,
  invertY: false,
  fov: 90,
  reduceMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  sound: true,
  jumpscares: 'full',        // full | mild | off; reduce motion turns full into mild
});

export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not remembered */ }
}
