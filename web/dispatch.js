// web/dispatch.js -- the surveillance system's internal monologue.
//
// A pretrained instruct model, downloaded and run in the browser, writing two sentences
// from live predictor state. This is the project's pretrained-model integration:
// downloaded, never trained.
//
// Three constraints, all of which bite, and all three are handled here:
//
//   LAZY LOAD. The quantised weights are a couple of hundred megabytes. Nothing is
//   fetched until the first level is already playable, and the browser cache makes every
//   later visit instant.
//
//   NEVER BLOCK THE LOOP. Generation is async and fire-and-forget. The panel updates when
//   it updates. The game loop never awaits it, and a request that arrives while one is in
//   flight is dropped rather than queued -- stale commentary is worse than none.
//
//   DEGRADE CLEANLY. WebGPU needs a recent Chrome or Edge. The WASM fallback exists but
//   is slow enough to feel broken, so without WebGPU this falls back to templated strings
//   assembled from the same state object. The panel always says something.
//
// THE TEST THAT KEEPS IT HONEST: if the text would read identically with the predictor
// deleted, it has failed. Both paths -- model and template -- are therefore driven from
// the same state object and both must shift with confidence: hedged and vague when the
// dossier is thin, specific and assured when it has six levels on you. The templates are
// written in confidence tiers for exactly that reason, so the fallback passes the same
// test the model does.

const MODEL_PRIMARY = 'HuggingFaceTB/SmolLM2-360M-Instruct';
const MODEL_SMALL = 'HuggingFaceTB/SmolLM2-135M-Instruct';
const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';

export const DISPATCH_STATE = Object.freeze({
  IDLE: 'idle', LOADING: 'loading', READY: 'ready', TEMPLATE: 'template', FAILED: 'failed',
});

export function webgpuAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

/**
 * Compact state object. This is the prompt contract: real numbers only, no prose, and
 * every field is something the predictor actually computed.
 */
export function buildState({ game, prediction, dossier, chain, lastSpawn, level, profile, mode }) {
  const strongest = dossier ? dossier.strongest(2) : [];
  return {
    level,
    profile: profile?.displayName || 'UNKNOWN',
    mode,
    entropy: game ? game.score : 0,
    entropyBits: game ? Number(game.entropy.toFixed(2)) : 0,
    topRegion: prediction ? prediction.top : null,
    topProb: prediction ? Number((prediction.topP * 100).toFixed(0)) : null,
    predictionEntropy: prediction ? Number(prediction.entropyBits.toFixed(2)) : null,
    dossierLevels: dossier ? dossier.levelsSeen : 0,
    dossierRuns: dossier ? dossier.updates : 0,
    dossierConfidence: dossier ? Number(dossier.confidence().toFixed(2)) : 0,
    chainMaturity: chain ? Number(chain.maturity().toFixed(2)) : 0,
    traits: strongest.map((s) => ({ key: s.key, z: Number(s.z.toFixed(2)) })),
    lastSpawn: lastSpawn ? { region: lastSpawn.region, reason: lastSpawn.reason, fallback: !!lastSpawn.fallback } : null,
    patrols: game ? game.patrols.length : 0,
    alert: game ? game.alertTicks > 0 : false,
    cachesLeft: game ? game.caches.length - game.collected : 0,
  };
}

const TRAIT_PHRASE = {
  wallAffinity: ['keeps off the walls', 'hugs the walls'],
  corridorPreference: ['stays out in the open', 'threads the corridors'],
  junctionAffinity: ['avoids the junctions', 'lives on the junctions'],
  openGroundTolerance: ['will not cross open ground', 'walks straight across open ground'],
  coverSeeking: ['ignores cover', 'routes through cover'],
  coverDwell: ['never settles in cover', 'sits in cover'],
  headingPersistence: ['changes heading constantly', 'holds a heading'],
  turnRate: ['runs in straight lines', 'turns at every opportunity'],
  backtrackRate: ['never doubles back', 'doubles back often'],
  motionRate: ['stops frequently', 'never stops moving'],
  pauseMean: ['pauses briefly', 'takes long pauses'],
  pauseVar: ['pauses predictably', 'pauses erratically'],
  revisitRate: ['takes fresh ground', 'retreads old ground'],
  regionDwell: ['moves between districts constantly', 'settles into one district'],
  objectiveDirectness: ['takes the shortest line to a cache', 'wanders on the way to a cache'],
  cacheOrdering: ['takes the nearest cache first', 'goes for the furthest cache first'],
  dropRush: ['beelines for the drop', 'takes their time reaching the drop'],
  threatDistance: ['lets patrols get close', 'gives patrols a wide berth'],
  threatTurnAway: ['holds course on contact', 'breaks away the moment we are seen'],
  postAlertFlee: ['does not run when spotted', 'runs the moment we are spotted'],
  postAlertFreeze: ['keeps moving when spotted', 'freezes when spotted'],
};

function phrase(trait) {
  const pair = TRAIT_PHRASE[trait.key];
  if (!pair) return trait.key;
  return trait.z >= 0 ? pair[1] : pair[0];
}

/**
 * The fallback, written in confidence tiers so it passes the same honesty test as the
 * model: delete the predictor and these sentences cannot be produced.
 */
export function templated(s) {
  const region = s.topRegion ?? '?';
  const prob = s.topProb ?? 0;

  if (s.mode === 'uniform') {
    return `No model on this subject -- dispatch is seeding district ${region} at random. ` +
      `Noise index ${s.entropy}; ${s.patrols} unit${s.patrols === 1 ? '' : 's'} deployed.`;
  }

  if (s.dossierRuns === 0) {
    return `New subject, no file. Projection is geometry only: district ${region} at ${prob} percent, ` +
      `and at ${s.predictionEntropy} bits of spread that is barely a guess. Noise index ${s.entropy}.`;
  }

  const t0 = s.traits[0] ? phrase(s.traits[0]) : null;
  const t1 = s.traits[1] ? phrase(s.traits[1]) : null;

  if (s.dossierLevels < 2) {
    return `Thin file on ${s.profile} -- ${s.dossierRuns} run${s.dossierRuns === 1 ? '' : 's'} logged. ` +
      `Subject ${t0 || 'has no settled habits yet'}; district ${region} at ${prob} percent, held loosely.`;
  }

  if (s.dossierLevels < 5) {
    return `${s.dossierLevels} districts on file. Subject ${t0}${t1 ? ` and ${t1}` : ''}. ` +
      `Expecting district ${region} at ${prob} percent${s.alert ? ' and we have eyes on now' : ''}.`;
  }

  return `File on ${s.profile} runs ${s.dossierLevels} districts deep and it is consistent: ` +
    `subject ${t0}${t1 ? `, ${t1}` : ''}. District ${region}, ${prob} percent. ` +
    `${s.lastSpawn?.fallback ? 'Placement fell back to random.' : 'Unit already posted.'}`;
}

function buildPrompt(s) {
  const traits = s.traits.length
    ? s.traits.map((t) => `${t.key} ${t.z > 0 ? '+' : ''}${t.z} sd`).join(', ')
    : 'none established';
  return [
    'You are the dispatcher for a city surveillance grid, speaking on an internal channel.',
    'Write exactly two short sentences of clipped operational commentary about the subject.',
    'Be specific when the file is thick and openly uncertain when it is thin. No greetings, no lists, no quotes.',
    '',
    'STATE',
    `district_under_surveillance: ${s.level}`,
    `subject: ${s.profile}`,
    `noise_index: ${s.entropy} of 1000 (higher means harder to predict)`,
    `predicted_district: ${s.topRegion} at ${s.topProb}% confidence`,
    `prediction_spread_bits: ${s.predictionEntropy}`,
    `file_depth_districts: ${s.dossierLevels}`,
    `file_depth_runs: ${s.dossierRuns}`,
    `strongest_habits: ${traits}`,
    `last_placement: ${s.lastSpawn ? s.lastSpawn.reason : 'none yet'}`,
    `units_deployed: ${s.patrols}`,
    `contact: ${s.alert ? 'eyes on subject' : 'no contact'}`,
  ].join('\n');
}

/** Keep two sentences, drop anything after them. */
export function trimToTwoSentences(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').replace(/^["'\s]+/, '').trim();
  if (!clean) return '';
  const parts = clean.match(/[^.!?]+[.!?]+/g);
  if (!parts || parts.length === 0) return clean.slice(0, 220);
  return parts.slice(0, 2).map((x) => x.trim()).join(' ').trim();
}

export function createDispatcher({ onStatus = () => {}, onText = () => {} } = {}) {
  let state = DISPATCH_STATE.IDLE;
  let generator = null;
  let inFlight = false;
  let enabled = true;
  let modelName = null;
  let loadPromise = null;

  const setState = (s, detail) => { state = s; onStatus(s, detail); };

  async function load({ small = false } = {}) {
    if (loadPromise) return loadPromise;
    if (!webgpuAvailable()) {
      // The WASM path works and is slow enough that players read it as a hang. Templates
      // are instant and, written in tiers, still track the predictor's confidence.
      setState(DISPATCH_STATE.TEMPLATE, 'WebGPU unavailable');
      return null;
    }
    modelName = small ? MODEL_SMALL : MODEL_PRIMARY;
    setState(DISPATCH_STATE.LOADING, modelName);
    loadPromise = (async () => {
      try {
        const { pipeline, env } = await import(/* @vite-ignore */ `${CDN}`);
        env.allowLocalModels = false;
        generator = await pipeline('text-generation', modelName, {
          device: 'webgpu',
          dtype: 'q4',
          progress_callback: (p) => {
            if (p?.status === 'progress' && p.total) {
              setState(DISPATCH_STATE.LOADING, `${Math.round((p.loaded / p.total) * 100)}%`);
            }
          },
        });
        setState(DISPATCH_STATE.READY, modelName);
        return generator;
      } catch (err) {
        console.warn('[dispatch] model load failed, using templates:', err?.message);
        generator = null;
        loadPromise = null;
        setState(DISPATCH_STATE.TEMPLATE, err?.message || 'load failed');
        return null;
      }
    })();
    return loadPromise;
  }

  /**
   * Fire and forget. Returns the templated line synchronously so the panel is never
   * empty, then replaces it if and when the model answers.
   */
  function request(s) {
    const fallback = templated(s);
    onText(fallback, 'template');
    if (!enabled || !generator || inFlight) return fallback;

    inFlight = true;
    (async () => {
      try {
        const out = await generator(
          [{ role: 'user', content: buildPrompt(s) }],
          { max_new_tokens: 48, do_sample: true, temperature: 0.75, top_p: 0.9, return_full_text: false },
        );
        const raw = Array.isArray(out) ? (out[0]?.generated_text ?? '') : (out?.generated_text ?? '');
        const text = trimToTwoSentences(typeof raw === 'string' ? raw : raw?.at?.(-1)?.content ?? '');
        if (text) onText(text, 'model');
      } catch (err) {
        console.warn('[dispatch] generation failed:', err?.message);
        setState(DISPATCH_STATE.TEMPLATE, 'generation failed');
        generator = null;
      } finally {
        inFlight = false;
      }
    })();
    return fallback;
  }

  return {
    load,
    request,
    get state() { return state; },
    get modelName() { return modelName; },
    get usingModel() { return !!generator; },
    setEnabled(v) { enabled = !!v; },
    templated,
  };
}
