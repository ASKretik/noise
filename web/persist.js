// web/persist.js -- the IndexedDB adapter. Browser-only leaf.
//
// Two profiles in one object store keyed by profile id. No passwords, no accounts, no
// server, and no cross-device sync, all of which are decisions rather than omissions.
//
// Every call is wrapped: private browsing mode throws on open, and a thrown open must
// degrade to in-memory state rather than take the whole game down. The architecture puts
// this module at a leaf for exactly that reason -- a missing IndexedDB costs you saved
// progress and nothing else.

import { ProfileStore, memoryBackend } from '../sim/profile.js';
import { BUILD } from './build.js';

/**
 * The guest slot is scoped to a browser session: closing the tab forgets it entirely.
 *
 * The original design made guest a persistent second save so a friend who came back next
 * week kept their districts. That is now reversed by request -- guest is a hand-the-laptop-
 * over slot, and the demo it exists for ("same code, same seeds, different dossier") is
 * strongest when it starts blind every single time.
 *
 * sessionStorage is the right marker rather than a timestamp: it is cleared by the browser
 * exactly when the tab closes, and it survives reloads and navigation between the three
 * pages, so a guest does not get wiped halfway through their own run.
 */
const GUEST_SESSION_KEY = 'noise.guestSession';

export async function ensureGuestSession(store) {
  let fresh = true;
  try {
    fresh = !sessionStorage.getItem(GUEST_SESSION_KEY);
    if (fresh) sessionStorage.setItem(GUEST_SESSION_KEY, String(Date.now()));
  } catch {
    // Private mode with storage blocked: treat every load as a new session, which errs
    // toward wiping a slot that is meant to be disposable anyway.
    fresh = true;
  }
  if (!fresh) return false;

  const previous = store.current ? null : null;
  try {
    const active = store.cache ? store.cache.get('guest') : null;
    await store.load('guest');
    await store.eraseActive();
    if (active) { /* nothing to restore: the point is that it is gone */ }
  } catch (err) {
    console.warn('[persist] could not reset the guest slot:', err?.message);
    return false;
  }
  return true;
}

/**
 * The database is namespaced by the build stamp, so **every published update starts every
 * save file fresh**.
 *
 * That is deliberate for a project still changing shape. The schema, the difficulty tiers,
 * the economy and the scoring have each moved between deploys, and a profile carried
 * across one of those is a record of rules that no longer exist -- a best score set under
 * a different score equation is not a score, it is a number. Starting clean is cheaper and
 * more honest than migrating a save into a different game.
 *
 * sim/profile.js additionally refuses any record below the current schema, which covers
 * the in-memory path where there is no database name to namespace.
 */
const DB_NAME = `noise-${BUILD}`;
const DB_VERSION = 1;
const STORE = 'profiles';

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      return reject(err);
    }
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
      return tx(db, 'readonly', (store, set) => {
        const r = store.get(id);
        r.onsuccess = () => set(r.result || null);
      });
    },
    put(id, record) {
      return tx(db, 'readwrite', (store) => {
        // The record carries its own key, and it is the active id. Nothing else can be
        // written here, which is the isolation rule holding at the storage boundary too.
        store.put({ ...record, id });
      });
    },
    keys() {
      return tx(db, 'readonly', (store, set) => {
        const r = store.getAllKeys();
        r.onsuccess = () => set(r.result || []);
      });
    },
  };
}

/**
 * Delete the databases left behind by earlier builds.
 *
 * Namespacing alone would quietly accumulate one abandoned database per update in every
 * player's browser. Best effort: `indexedDB.databases()` is unavailable on some browsers,
 * and a failure here must never stop the game from starting.
 */
async function sweepOldBuilds() {
  try {
    if (typeof indexedDB?.databases !== 'function') return;
    const all = await indexedDB.databases();
    for (const { name } of all) {
      if (typeof name === 'string' && /^noise(-\d+)?$/.test(name) && name !== DB_NAME) {
        indexedDB.deleteDatabase(name);
      }
    }
  } catch (err) {
    console.warn('[persist] could not sweep old builds:', err?.message);
  }
}

/**
 * @returns {Promise<{store: ProfileStore, degraded: boolean, reason: string|null}>}
 */
export async function createProfileStore() {
  try {
    const db = await openDB();
    sweepOldBuilds();          // fire and forget; never blocks the first paint
    return { store: new ProfileStore(indexedDBBackend(db)), degraded: false, reason: null };
  } catch (err) {
    console.warn('[persist] falling back to in-memory profiles:', err?.message);
    return {
      store: new ProfileStore(memoryBackend()),
      degraded: true,
      reason: err?.message || 'IndexedDB unavailable',
    };
  }
}
