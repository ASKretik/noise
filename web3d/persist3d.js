// web3d/persist3d.js -- the 3D game's save files. Browser only.
//
// A deliberate duplicate of web/persist.js with three names changed, because the
// alternative -- parameterising web/persist.js -- means editing the 2D game, which this
// build does not do before integration (plan-3d.md, phase 10 folds the two back together).
//
//   database       noise3d-<BUILD3D>     (2D: noise-<BUILD>)
//   sweep pattern  /^noise3d(-\d+)?$/    (2D: /^noise(-\d+)?$/)
//   guest marker   noise3d.guestSession  (2D: noise.guestSession)
//
// The two sweep patterns cannot match each other's databases -- criterion 3D-8 pins that --
// so a 3D update resets 3D saves and never 2D ones, and vice versa. Everything else is
// the 2D game's: ProfileStore, the isolation rule (sim/profile.js's single active id),
// guest-is-session-scoped, and "every published update starts every save fresh".

import { ProfileStore, memoryBackend } from '../sim/profile.js';
import { BUILD3D } from './build3d.js';

export const DB_NAME_3D = `noise3d-${BUILD3D}`;
export const SWEEP_3D = /^noise3d(-\d+)?$/;
const GUEST_SESSION_KEY = 'noise3d.guestSession';
const DB_VERSION = 1;
const STORE = 'profiles';

/** Wipe the 3D guest slot once per browser session (sessionStorage dies with the tab). */
export async function ensureGuestSession3d(store) {
  let fresh = true;
  try {
    fresh = !sessionStorage.getItem(GUEST_SESSION_KEY);
    if (fresh) sessionStorage.setItem(GUEST_SESSION_KEY, String(Date.now()));
  } catch { fresh = true; }
  if (!fresh) return false;
  try {
    await store.load('guest');
    await store.eraseActive();
  } catch (err) {
    console.warn('[persist3d] could not reset the guest slot:', err?.message);
    return false;
  }
  return true;
}

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    let req;
    try { req = indexedDB.open(DB_NAME_3D, DB_VERSION); } catch (err) { return reject(err); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
      db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'));
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    let out;
    const t = db.transaction(STORE, mode);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
    out = fn(t.objectStore(STORE), (v) => { out = v; });
  });
}

function indexedDBBackend(db) {
  return {
    kind: 'indexeddb',
    get(id) {
      return tx(db, 'readonly', (store, set) => { const r = store.get(id); r.onsuccess = () => set(r.result || null); });
    },
    put(id, record) {
      return tx(db, 'readwrite', (store) => { store.put({ ...record, id }); });
    },
    keys() {
      return tx(db, 'readonly', (store, set) => { const r = store.getAllKeys(); r.onsuccess = () => set(r.result || []); });
    },
  };
}

async function sweepOld3dBuilds() {
  try {
    if (typeof indexedDB?.databases !== 'function') return;
    for (const { name } of await indexedDB.databases()) {
      if (typeof name === 'string' && SWEEP_3D.test(name) && name !== DB_NAME_3D) indexedDB.deleteDatabase(name);
    }
  } catch (err) {
    console.warn('[persist3d] could not sweep old builds:', err?.message);
  }
}

/** @returns {Promise<{store: ProfileStore, degraded: boolean, reason: string|null}>} */
export async function createProfileStore3d() {
  try {
    const db = await openDB();
    sweepOld3dBuilds();
    return { store: new ProfileStore(indexedDBBackend(db)), degraded: false, reason: null };
  } catch (err) {
    console.warn('[persist3d] falling back to in-memory profiles:', err?.message);
    return { store: new ProfileStore(memoryBackend()), degraded: true, reason: err?.message || 'IndexedDB unavailable' };
  }
}
