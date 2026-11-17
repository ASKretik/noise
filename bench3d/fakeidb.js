// bench3d/fakeidb.js -- a small in-process IndexedDB with per-database versions.
//
// bench/domshim.js has one, but it keeps a single version counter for every database,
// so the second database opened in a run never receives `onupgradeneeded` and its writes
// land in a throwaway map. That is harmless for the 2D game, which only ever opens one
// database; the 3D save-isolation test opens two side by side, which is the whole point
// of it. This one versions per database and implements databases() and deleteDatabase(),
// so both games' real sweeps can be run against each other.

export function createFakeIndexedDB() {
  const dbs = new Map();     // name -> { version, stores: Map(storeName -> Map(key -> record)) }
  const later = (fn) => setTimeout(fn, 0);
  const api = {
    open(name, version = 1) {
      const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      later(() => {
        let rec = dbs.get(name);
        const upgrade = !rec || rec.version < version;
        if (!rec) { rec = { version: 0, stores: new Map() }; dbs.set(name, rec); }
        const db = {
          name,
          objectStoreNames: { contains: (s) => rec.stores.has(s) },
          createObjectStore(s) { rec.stores.set(s, new Map()); return {}; },
          deleteObjectStore(s) { rec.stores.delete(s); },
          transaction(storeName) {
            const data = rec.stores.get(storeName);
            if (!data) throw new Error(`NotFoundError: no object store ${storeName} in ${name}`);
            const store = {
              get(key) { const r = { result: undefined, onsuccess: null }; later(() => { r.result = data.get(key); r.onsuccess?.(); }); return r; },
              put(record) { const r = { onsuccess: null }; data.set(record.id, JSON.parse(JSON.stringify(record))); later(() => r.onsuccess?.()); return r; },
              getAllKeys() { const r = { result: [], onsuccess: null }; later(() => { r.result = [...data.keys()]; r.onsuccess?.(); }); return r; },
            };
            const tx = { objectStore: () => store, oncomplete: null, onerror: null, onabort: null };
            later(() => later(() => tx.oncomplete?.()));
            return tx;
          },
        };
        req.result = db;
        if (upgrade) { rec.version = version; req.onupgradeneeded?.(); }
        req.onsuccess?.();
      });
      return req;
    },
    async databases() { return [...dbs.entries()].map(([name, r]) => ({ name, version: r.version })); },
    deleteDatabase(name) { dbs.delete(name); return {}; },
    /** Test helpers. */
    _names: () => [...dbs.keys()].sort(),
    _seed(name) { if (!dbs.has(name)) dbs.set(name, { version: 1, stores: new Map([['profiles', new Map()]]) }); },
    _record(name, id) { return dbs.get(name)?.stores.get('profiles')?.get(id) ?? null; },
  };
  return api;
}

export function installFakeIndexedDB() {
  const idb = createFakeIndexedDB();
  Object.defineProperty(globalThis, 'indexedDB', { value: idb, configurable: true, writable: true });
  return idb;
}
