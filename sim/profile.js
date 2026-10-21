// sim/profile.js -- profiles, and the isolation rule.
//
// THE ISOLATION RULE, which is the one thing in this project not to get wrong:
// every write to `dossier` and `runs` is scoped to the active profile id, and the active
// profile id is a single module-level value read by the store -- never a parameter
// threaded through call sites, where one missed argument silently corrupts six levels of
// learning about someone. A guest run must leave the main dossier byte-identical, and
// there is a test for exactly that in bench/acceptance.js.
//
// The store is backend-agnostic on purpose. The browser passes an IndexedDB adapter
// (web/persist.js); the acceptance test passes an in-memory object. That is what makes
// the isolation rule testable under Node at all, and it is why this file lives in /sim
// rather than /web despite being "persistence".

export const SCHEMA = 3;
export const PROFILE_IDS = Object.freeze(['main', 'guest']);
export const MAX_RUNS = 50;

/** The single module-level value. Read it, never pass it. */
let activeId = null;

export function setActiveProfile(id) {
  if (!PROFILE_IDS.includes(id)) throw new Error(`unknown profile id: ${id}`);
  activeId = id;
  return activeId;
}

export function getActiveProfileId() { return activeId; }

export function clearActiveProfile() { activeId = null; }

export function blankProfile(id, displayName = null) {
  return {
    id,
    displayName: displayName ?? (id === 'main' ? 'MAIN' : 'GUEST'),
    level: 1,
    dossier: { traits: {}, updates: 0, levelsSeen: 0 },
    runs: [],
    /**
     * Difficulty settled for each district the first time it is entered, then reused on
     * every retry. See adaptDifficulty(): re-tuning on each attempt makes a district get
     * harder every time you lose it, which reads as the game punishing failure.
     */
    difficultyByLevel: {},
    settings: { spawnerMode: 'full', dispatchEnabled: true, showHeatmap: false },
    schema: SCHEMA,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Migration guard. A stored profile from an older schema is upgraded field by field
 * rather than discarded: throwing away someone's dossier because a field was added is
 * the worst possible failure mode for the one piece of state this project is about.
 */
export function migrate(record) {
  if (!record || typeof record !== 'object') return null;
  const out = { ...blankProfile(record.id || 'main'), ...record };
  out.schema = SCHEMA;
  if (!out.dossier || typeof out.dossier !== 'object') out.dossier = { traits: {}, updates: 0, levelsSeen: 0 };
  // Schema 1 stored the trait map at the top level of `dossier`.
  if (!out.dossier.traits) {
    const { updates = 0, levelsSeen = 0, ...rest } = out.dossier;
    out.dossier = { traits: rest, updates, levelsSeen };
  }
  if (!out.difficultyByLevel || typeof out.difficultyByLevel !== 'object') out.difficultyByLevel = {};
  if (!Array.isArray(out.runs)) out.runs = [];
  out.runs = out.runs.slice(-MAX_RUNS);
  if (!out.settings || typeof out.settings !== 'object') out.settings = blankProfile(out.id).settings;
  if (typeof out.level !== 'number' || !(out.level >= 1)) out.level = 1;
  return out;
}

/**
 * @typedef {object} Backend
 * @property {(id:string)=>Promise<object|null>} get
 * @property {(id:string, record:object)=>Promise<void>} put
 * @property {()=>Promise<string[]>} keys
 * @property {string} kind
 */

export class ProfileStore {
  /** @param {Backend} backend */
  constructor(backend) {
    this.backend = backend;
    this.cache = new Map();
  }

  get kind() { return this.backend.kind; }

  /** Load a profile and make it active. Creates it if absent. */
  async load(id) {
    setActiveProfile(id);
    let rec = null;
    try {
      rec = migrate(await this.backend.get(id));
    } catch (err) {
      console.warn('[profile] read failed, starting fresh:', err?.message);
    }
    if (!rec) rec = blankProfile(id);
    rec.id = id;
    this.cache.set(id, rec);
    return rec;
  }

  /** Peek at a profile without making it active. Read-only by construction. */
  async peek(id) {
    try {
      const rec = migrate(await this.backend.get(id));
      return rec ? Object.freeze(rec) : null;
    } catch {
      return null;
    }
  }

  /** The active record. Throws rather than guessing if nothing is active. */
  current() {
    if (!activeId) throw new Error('no active profile: call load() first');
    const rec = this.cache.get(activeId);
    if (!rec) throw new Error(`active profile ${activeId} is not loaded`);
    return rec;
  }

  /**
   * The single write path. Every mutator below goes through it, and it resolves the id
   * from the module-level value rather than from an argument.
   */
  async _commit(mutate) {
    const rec = this.current();
    mutate(rec);
    rec.updatedAt = Date.now();
    rec.schema = SCHEMA;
    try {
      await this.backend.put(activeId, rec);
    } catch (err) {
      // Degrade to in-memory rather than taking the game down: private browsing throws
      // here, and a thrown write must not cost the player their run.
      console.warn('[profile] write failed, keeping in memory only:', err?.message);
    }
    return rec;
  }

  /** Append a finished run. Capped, newest last. */
  recordRun(run) {
    return this._commit((rec) => {
      rec.runs.push({
        level: run.level,
        ticks: run.ticks,
        entropy: Math.round((run.entropy ?? 0) * 1000) / 1000,
        score: run.score ?? 0,
        won: !!run.won,
        at: Date.now(),
      });
      if (rec.runs.length > MAX_RUNS) rec.runs = rec.runs.slice(-MAX_RUNS);
    });
  }

  /** Fold a run's measured traits into the active profile's dossier. */
  saveDossier(dossierJSON) {
    return this._commit((rec) => { rec.dossier = dossierJSON; });
  }

  /**
   * Record the difficulty a district was settled at, so retries reuse it verbatim.
   * The first entry wins and is returned on every later call.
   *
   * Synchronous by design: the caller needs the numbers now, to build the run with. The
   * write behind it is fire-and-forget and already degrades to memory on failure, so
   * there is nothing useful for a caller to await or handle.
   */
  rememberDifficulty(level, difficulty) {
    const rec = this.current();
    const key = String(level);
    if (rec.difficultyByLevel[key]) return rec.difficultyByLevel[key];
    const stored = {
      tau: difficulty.tau,
      lambdaScale: difficulty.lambdaScale,
      meanSurvival: difficulty.meanSurvival ?? null,
      meanEntropy: difficulty.meanEntropy ?? null,
      at: Date.now(),
    };
    rec.difficultyByLevel[key] = stored;
    this._commit(() => {}).catch(() => {});
    return stored;
  }

  settledDifficulty(level) {
    const rec = this.cache.get(activeId);
    return rec?.difficultyByLevel?.[String(level)] || null;
  }

  unlockLevel(level) {
    return this._commit((rec) => { rec.level = Math.max(rec.level, level); });
  }

  setSettings(partial) {
    return this._commit((rec) => { rec.settings = { ...rec.settings, ...partial }; });
  }

  /** Wipe the active profile. Doubles as the fastest way to demo a cold model. */
  resetActive() {
    return this._commit((rec) => {
      const fresh = blankProfile(rec.id, rec.displayName);
      rec.level = fresh.level;
      rec.dossier = fresh.dossier;
      rec.runs = fresh.runs;
      rec.difficultyByLevel = {};
      rec.createdAt = Date.now();
    });
  }

  /** Recent runs for the difficulty controller. */
  recentRuns(n = 5) {
    const rec = this.cache.get(activeId);
    return rec ? rec.runs.slice(-n) : [];
  }
}

/** The in-memory backend. Used by the tests, and as the browser's degraded mode. */
export function memoryBackend(seed = {}) {
  const data = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
  return {
    kind: 'memory',
    async get(id) { const v = data.get(id); return v ? JSON.parse(JSON.stringify(v)) : null; },
    async put(id, rec) { data.set(id, JSON.parse(JSON.stringify(rec))); },
    async keys() { return [...data.keys()]; },
    _raw: data,
  };
}
