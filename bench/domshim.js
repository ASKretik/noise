// bench/domshim.js -- just enough DOM to run web/main.js under Node.
//
// There is no headless browser in this toolchain, and "it parsed" is not the same claim
// as "it runs": the mistakes that actually happen in a wiring file are a mistyped element
// id, a listener attached to null, a panel written before it exists. Those are all
// catchable without a renderer.
//
// The element set is PARSED OUT OF index.html rather than hard-coded, so this shim cannot
// drift away from the real page: rename an id in the markup without renaming it in
// main.js and bench/webcheck.js fails.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

class ClassList {
  constructor(el) { this.el = el; }
  get _set() { return new Set((this.el.className || '').split(/\s+/).filter(Boolean)); }
  add(...c) { const s = this._set; for (const x of c) s.add(x); this.el.className = [...s].join(' '); }
  remove(...c) { const s = this._set; for (const x of c) s.delete(x); this.el.className = [...s].join(' '); }
  contains(c) { return this._set.has(c); }
  toggle(c) { this.contains(c) ? this.remove(c) : this.add(c); }
}

const ctxStub = () => {
  const noop = () => {};
  const ctx = {
    canvas: null,
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
    shadowColor: '', shadowBlur: 0, font: '',
    globalAlpha: 1, globalCompositeOperation: 'source-over', textAlign: '', textBaseline: '',
    clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
    arc: noop, arcTo: noop, ellipse: noop, fill: noop, stroke: noop,
    moveTo: noop, lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop, rect: noop,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, transform: noop, clip: noop,
    setLineDash: noop, getLineDash: () => [], setTransform: noop, resetTransform: noop,
    drawImage: noop, fillText: noop, strokeText: noop, measureText: () => ({ width: 10 }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
  };
  return ctx;
};

class El {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    // CSS custom properties are set through setProperty, not assignment, so a bare
    // object is not enough of a style declaration to run the district grid.
    const vars = {};
    this.style = {
      setProperty(k, v) { vars[k] = String(v); this[k] = String(v); },
      getPropertyValue(k) { return vars[k] ?? ''; },
      removeProperty(k) { delete vars[k]; delete this[k]; },
    };
    this.className = '';
    this.id = '';
    this.hidden = false;
    this.value = '';
    this.title = '';
    this.type = '';
    this.disabled = false;
    this._text = '';
    this._html = '';
    this._listeners = {};
    this._attrs = {};
    this.classList = new ClassList(this);
    this.width = 0;
    this.height = 0;
    this.clientWidth = 900;
    this.clientHeight = 600;
  }

  getContext() { if (!this._ctx) { this._ctx = ctxStub(); this._ctx.canvas = this; } return this._ctx; }

  getBoundingClientRect() {
    return { x: 0, y: 0, left: 0, top: 0, right: this.clientWidth, bottom: this.clientHeight,
      width: this.clientWidth, height: this.clientHeight };
  }

  setPointerCapture() {}
  releasePointerCapture() {}

  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v ?? ''); }

  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v ?? '');
    for (const c of this.children) c.parentElement = null;
    this.children = [];
  }

  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  append(...cs) { for (const c of cs) this.appendChild(c); }
  prepend(c) { c.parentElement = this; this.children.unshift(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentElement = null; }
  remove() { this.parentElement?.removeChild(this); }

  get lastChild() { return this.children[this.children.length - 1] || null; }
  get firstChild() { return this.children[0] || null; }

  _descendants(out = []) { for (const c of this.children) { out.push(c); c._descendants(out); } return out; }

  _matches(sel) {
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    // [data-act] and [data-act="stun"] both, since the touch layer uses the second form.
    const attr = sel.match(/^\[([a-zA-Z-]+)(?:="([^"]*)")?\]$/);
    if (attr) {
      const key = attr[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^data/, '');
      const prop = key.charAt(0).toLowerCase() + key.slice(1);
      const have = this.dataset[prop];
      return attr[2] === undefined ? have !== undefined : have === attr[2];
    }
    return this.tagName === sel.toUpperCase();
  }

  querySelector(sel) { return this._descendants().find((e) => e._matches(sel)) || null; }
  querySelectorAll(sel) { return this._descendants().filter((e) => e._matches(sel)); }
  closest(sel) {
    let n = this;
    while (n) { if (n._matches(sel)) return n; n = n.parentElement; }
    return null;
  }

  setAttribute(k, v) { this._attrs[k] = String(v); if (k === 'href' || k === 'id' || k === 'type') this[k] = String(v); }
  getAttribute(k) { return this._attrs[k] ?? null; }
  removeAttribute(k) { delete this._attrs[k]; }
  hasAttribute(k) { return k in this._attrs; }

  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn); }
  /** Fire a listener the way a real event would. */
  fire(type, event = {}) {
    for (const fn of this._listeners[type] || []) fn({ preventDefault() {}, target: this, ...event });
  }
}

/**
 * A minimal in-process IndexedDB.
 *
 * The pages share storage through IndexedDB, and in a browser that is what lets the
 * launcher, the hub and the district all see the same save file. Handing each page its
 * own memory backend instead made every cross-page check meaningless -- the hub found no
 * profile and redirected, and everything downstream failed for the wrong reason.
 *
 * This implements only what web/persist.js actually calls, and it deliberately lives
 * OUTSIDE installDom so the data survives from one page to the next inside one run, the
 * way a real origin's storage does. It also means the real IndexedDB adapter is exercised
 * rather than permanently falling back.
 */
const fakeStores = new Map();   // dbName -> Map(storeName -> Map(key -> record))
let fakeVersion = 0;

/**
 * sessionStorage, shared across pages like IndexedDB and cleared only by
 * endBrowserSession(). That distinction is the whole point: the guest slot is wiped once
 * per browser session, and testing it needs a thing that survives navigation between the
 * three pages but not "closing the tab".
 */
let fakeSession = new Map();

export function resetFakeStorage() { fakeStores.clear(); fakeVersion = 0; fakeSession = new Map(); }

/** Simulate closing the tab: sessionStorage goes, IndexedDB stays. */
export function endBrowserSession() { fakeSession = new Map(); }

function makeSessionStorage() {
  return {
    getItem: (k) => (fakeSession.has(k) ? fakeSession.get(k) : null),
    setItem: (k, v) => { fakeSession.set(k, String(v)); },
    removeItem: (k) => { fakeSession.delete(k); },
    clear: () => { fakeSession.clear(); },
  };
}

function makeFakeIndexedDB() {
  const later = (fn) => setTimeout(fn, 0);
  return {
    open(name, version) {
      const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      later(() => {
        if (!fakeStores.has(name)) fakeStores.set(name, new Map());
        const stores = fakeStores.get(name);
        const db = {
          name,
          objectStoreNames: { contains: (s) => stores.has(s) },
          createObjectStore(storeName) { stores.set(storeName, new Map()); return {}; },
          deleteObjectStore(storeName) { stores.delete(storeName); },
          transaction(storeName) {
            const data = stores.get(storeName) || new Map();
            const store = {
              get(key) {
                const r = { result: undefined, onsuccess: null };
                later(() => { r.result = data.get(key); r.onsuccess?.(); });
                return r;
              },
              put(record) {
                const r = { onsuccess: null };
                data.set(record.id, JSON.parse(JSON.stringify(record)));
                later(() => r.onsuccess?.());
                return r;
              },
              getAllKeys() {
                const r = { result: [], onsuccess: null };
                later(() => { r.result = [...data.keys()]; r.onsuccess?.(); });
                return r;
              },
            };
            const tx = { objectStore: () => store, oncomplete: null, onerror: null, onabort: null };
            // Two hops, so any get/put scheduled by the caller resolves before complete.
            later(() => later(() => tx.oncomplete?.()));
            return tx;
          },
        };
        req.result = db;
        if (version > fakeVersion) {
          fakeVersion = version;
          req.onupgradeneeded?.({ target: req });
        }
        req.onsuccess?.();
      });
      return req;
    },
  };
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.webgpu]  pretend navigator.gpu exists
 * @param {'absent'|'throwing'|'working'} [opts.indexeddb]
 */
export function installDom(opts = {}) {
  const page = opts.page || 'play.html';
  const html = readFileSync(join(here, '..', page), 'utf8');
  // Capture the whole opening tag for each id, so attributes written in the markup --
  // `hidden` above all -- start out matching the real page rather than defaulting.
  const tags = new Map();
  for (const m of html.matchAll(/<([a-zA-Z0-9-]+)([^>]*\sid="([^"]+)"[^>]*)>/g)) {
    tags.set(m[3], { tag: m[1], attrs: m[2] });
  }
  const ids = [...tags.keys()];
  const classesWanted = ['overlay-card', 'board', 'canvas-wrap'];

  const byId = new Map();
  const root = new El('body');

  for (const id of ids) {
    const info = tags.get(id);
    const el = new El(info?.tag || 'div');
    el.id = id;
    if (info && /\shidden(\s|=|$)/.test(info.attrs)) el.hidden = true;
    if (info) {
      const cls = info.attrs.match(/\sclass="([^"]*)"/);
      if (cls) el.className = cls[1];
    }
    byId.set(id, el);
    root.appendChild(el);
  }
  // A handful of class hooks main.js and render.js reach for by selector.
  const overlay = byId.get('overlay');
  if (overlay) {
    const card = new El('div');
    card.className = 'overlay-card';
    overlay.appendChild(card);
  }
  const canvas = byId.get('board');
  if (canvas) {
    const wrap = new El('div');
    wrap.className = 'canvas-wrap';
    const board = new El('div');
    board.className = 'board';
    board.clientWidth = 900;
    root.appendChild(board);
    board.appendChild(wrap);
    wrap.appendChild(canvas);
  }
  // The thumb-control overlay's internals. These carry no ids in the markup -- they are
  // reached by class and data attribute -- so they have to be built explicitly.
  const touch = byId.get('touch-layer');
  if (touch) {
    const zone = new El('div');
    zone.className = 'stick-zone';
    zone.dataset.stickZone = '';
    const stick = new El('div');
    stick.className = 'stick';
    stick.dataset.stick = '';
    const knob = new El('span');
    knob.className = 'knob';
    knob.dataset.knob = '';
    stick.appendChild(knob);
    const hint = new El('span');
    hint.className = 'stick-hint';
    zone.append(stick, hint);

    const stack = new El('div');
    stack.className = 'act-stack';
    for (const act of ['bolt', 'stun']) {
      const b = new El('button');
      b.className = `act act-${act === 'bolt' ? 'run' : 'stun'}`;
      b.dataset.act = act;
      const count = new El('span');
      count.className = 'act-count';
      count.dataset.count = '';
      b.appendChild(count);
      stack.appendChild(b);
    }
    touch.append(zone, stack);
  }

  const listeners = {};
  const doc = {
    body: root,
    hidden: false,
    documentElement: root,
    getElementById: (id) => byId.get(id) || null,
    createElement: (tag) => new El(tag),
    querySelector: (sel) => root.querySelector(sel),
    querySelectorAll: (sel) => root.querySelectorAll(sel),
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    removeEventListener: () => {},
    fire: (t, e = {}) => { for (const fn of listeners[t] || []) fn(e); },
  };

  const winListeners = {};
  const win = {
    matchMedia: (q) => ({ matches: !!opts.coarsePointer && /coarse|hover: none/.test(q), media: q,
      addEventListener() {}, removeEventListener() {} }),
    visualViewport: { width: 1280, height: 800, addEventListener() {}, removeEventListener() {} },
    location: {
      href: `http://localhost/${page}${opts.search || ''}`,
      search: opts.search || '',
      pathname: `/${page}`,
      assign() {}, replace() {},
    },
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 800,
    confirm: () => true,
    alert: () => {},
    addEventListener: (t, fn) => { (winListeners[t] ||= []).push(fn); },
    removeEventListener: () => {},
    fire: (t, e = {}) => { for (const fn of winListeners[t] || []) fn({ preventDefault() {}, ...e }); },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  };

  // defineProperty rather than assignment: modern Node ships a real `navigator` global
  // that is getter-only, so `globalThis.navigator = ...` throws.
  const define = (name, value) => {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: true });
  };

  define('document', doc);
  define('window', win);
  define('navigator', { gpu: opts.webgpu ? {} : undefined, userAgent: 'node' });
  define('sessionStorage', makeSessionStorage());
  define('localStorage', makeSessionStorage());
  define('requestAnimationFrame', () => 0);     // the harness drives frames by hand
  define('cancelAnimationFrame', () => {});
  if (!globalThis.performance) define('performance', { now: () => Date.now() });
  if (opts.indexeddb === 'throwing') {
    define('indexedDB', { open() { throw new Error('access denied (simulated private browsing)'); } });
  } else if (opts.indexeddb === 'working') {
    define('indexedDB', makeFakeIndexedDB());
  } else {
    define('indexedDB', undefined);
  }

  return { document: doc, window: win, byId, root, El };
}
