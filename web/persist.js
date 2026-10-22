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

const DB_NAME = 'noise';
/**
 * Bumped to 2 to scrap every save written before the difficulty tier, the wallet and the
 * inventory existed. Those records predate choices that cannot be inferred -- there is no
 * honest answer to "which tier was this played on" for a file written before tiers -- so
 * they are dropped rather than guessed at. The upgrade deletes the old object store
 * outright; sim/profile.js refuses anything below the current schema as a second line of
 * defence for the in-memory path.
 */
const DB_VERSION = 2;
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
 * @returns {Promise<{store: ProfileStore, degraded: boolean, reason: string|null}>}
 */
export async function createProfileStore() {
  try {
    const db = await openDB();
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
