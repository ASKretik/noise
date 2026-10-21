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
    this.style = {};
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
    this.classList = new ClassList(this);
    this.width = 0;
    this.height = 0;
    this.clientWidth = 900;
    this.clientHeight = 600;
  }

  getContext() { if (!this._ctx) { this._ctx = ctxStub(); this._ctx.canvas = this; } return this._ctx; }

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
    const attr = sel.match(/^\[([a-zA-Z-]+)\]$/);
    if (attr) {
      const key = attr[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^data/, '');
      const prop = key.charAt(0).toLowerCase() + key.slice(1);
      return this.dataset[prop] !== undefined;
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

  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn); }
  /** Fire a listener the way a real event would. */
  fire(type, event = {}) {
    for (const fn of this._listeners[type] || []) fn({ preventDefault() {}, target: this, ...event });
  }
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.webgpu]  pretend navigator.gpu exists
 * @param {boolean} [opts.indexeddb] pretend IndexedDB exists but throws on open
 */
export function installDom(opts = {}) {
  const page = opts.page || 'play.html';
  const html = readFileSync(join(here, '..', page), 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const classesWanted = ['overlay-card', 'board', 'canvas-wrap'];

  const byId = new Map();
  const root = new El('body');

  for (const id of ids) {
    const el = new El(id === 'board' ? 'canvas' : (id === 'mode-select' ? 'select' : 'div'));
    el.id = id;
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
  // The touch d-pad buttons, so bindTouch has something to bind.
  const pad = byId.get('touchpad');
  if (pad) {
    for (let d = 0; d < 4; d++) {
      const b = new El('button');
      b.dataset.dir = String(d);
      pad.appendChild(b);
    }
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
  define('requestAnimationFrame', () => 0);     // the harness drives frames by hand
  define('cancelAnimationFrame', () => {});
  if (!globalThis.performance) define('performance', { now: () => Date.now() });
  if (opts.indexeddb === 'throwing') {
    define('indexedDB', { open() { throw new Error('access denied (simulated private browsing)'); } });
  } else {
    define('indexedDB', undefined);
  }

  return { document: doc, window: win, byId, root, El };
}
