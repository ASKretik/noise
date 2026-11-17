// web3d/quality.js -- three quality tiers, chosen per device. Browser only.
//
// A property of the device rather than of the save file, like the theme: it lives in
// localStorage. Auto-selection mirrors web/dispatch.js's modelAdvisable() -- a coarse
// pointer, a saveData connection or under 4 GB of reported memory means Low, because
// those are the devices that have already crashed a tab in this project.

export const QUALITY = Object.freeze({
  high: { id: 'high', label: 'High', pixelRatio: 2, shadows: true, antialias: true },
  medium: { id: 'medium', label: 'Medium', pixelRatio: 1.5, shadows: false, antialias: true },
  low: { id: 'low', label: 'Low', pixelRatio: 1, shadows: false, antialias: false },
});

const KEY = 'noise3d-quality';

export function autoQuality() {
  const coarse = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
  const save = navigator.connection?.saveData;
  const mem = navigator.deviceMemory;
  if (coarse || save || (mem && mem < 4)) return 'low';
  if (!coarse && mem && mem >= 8) return 'high';
  return 'medium';
}

/** The tier in force: an explicit choice, else the automatic one. Coarse pointers are capped at Low. */
export function currentQuality() {
  let id = null;
  try { id = localStorage.getItem(KEY); } catch { /* private mode */ }
  if (!QUALITY[id]) id = autoQuality();
  if (window.matchMedia?.('(hover: none) and (pointer: coarse)').matches) id = 'low';
  return QUALITY[id];
}

export function setQuality(id) {
  try { if (QUALITY[id]) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* fine */ }
}
