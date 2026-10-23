// web/hud.js -- DOM panels. Reads sim and predictor state, writes text and bars.
//
// The panels exist to make the model visible. A player who cannot see what the system
// believes has no way to distinguish a predictor from a cheat, and the whole premise
// depends on them being able to tell the difference.

import { TRAIT_BY_KEY } from '../sim/predictor/traits.js';
import { MODE_LABEL } from '../sim/predictor/combine.js';
import { TICKS_PER_SECOND } from '../sim/difficulty.js';

const $ = (id) => document.getElementById(id);
const pct = (v) => `${Math.round(v * 100)}%`;

export class Hud {
  constructor() {
    this.el = {
      level: $('hud-level'),
      profile: $('hud-profile'),
      keytab: $('keytab'),
      keytabCount: $('keytab-count'),
      keytabNote: $('keytab-note'),
      boost: $('hud-boost'),
      bullets: $('hud-bullets'),
      bolt: $('hud-bolt'),
      coins: $('hud-coins'),
      coinsRun: $('hud-coins-run'),
      difficulty: $('hud-difficulty'),
      settled: $('hud-settled'),
      startHint: $('start-hint'),
      score: $('hud-score'),
      bits: $('hud-bits'),
      patrols: $('hud-patrols'),
      alert: $('hud-alert'),
      time: $('hud-time'),
      mode: $('hud-mode-label'),
      tau: $('hud-tau'),
      lambda: $('hud-lambda'),
      predictionList: $('prediction-list'),
      predictionMeta: $('prediction-meta'),
      drivers: $('prediction-drivers'),
      dossierList: $('dossier-list'),
      dossierMeta: $('dossier-meta'),
      dispatchText: $('dispatch-text'),
      dispatchStatus: $('dispatch-status'),
      spawnLog: $('spawn-log'),
    };
    this._bars = [];
    this._lastRegionCount = 0;
  }

  setProfile(profile, storeKind) {
    if (this.el.profile) {
      this.el.profile.textContent = profile.displayName;
      this.el.profile.dataset.degraded = storeKind === 'memory' ? 'yes' : 'no';
      this.el.profile.title = storeKind === 'memory'
        ? 'Storage unavailable: progress is in memory only for this session'
        : 'Progress saved locally';
    }
  }

  setLevel(level, params) {
    this.params = params;
    if (this.el.level) this.el.level.textContent = String(level);
    if (this.el.difficulty) {
      this.el.difficulty.textContent = params.difficultyLabel || '—';
      this.el.difficulty.title = params.aliensKnowKeys
        ? 'They are told which keys you have taken.'
        : 'They model how you move, but are never told which keys you have taken.';
    }
  }

  /** Banked coins, which only change between runs. */
  setWallet(coins) {
    if (this.el.coins) this.el.coins.textContent = Number(coins || 0).toLocaleString();
  }

  setMode(mode, difficulty) {
    if (this.el.mode) this.el.mode.textContent = MODE_LABEL[mode] || mode;
    if (this.el.tau) this.el.tau.textContent = difficulty.tau.toFixed(2);
    if (this.el.lambda && this.params) {
      const scale = difficulty.lambdaScale ?? 1;
      this.el.lambda.textContent = `${this.params.lambdaBase.toFixed(4)} x${scale.toFixed(2)}`;
    }
    if (this.el.settled) {
      this.el.settled.textContent = mode !== 'full'
        ? 'controller off'
        : (difficulty.settled ? 'locked for this district' : 'set on first entry');
      this.el.settled.title = 'Difficulty is settled once per district and reused on every ' +
        'retry, so losing never makes the same district harder.';
    }
  }

  /** Called every rendered frame; cheap string writes only. */
  tick(game) {
    if (this.el.startHint) this.el.startHint.hidden = game.started;

    const left = game.caches.length - game.collected;
    this.el.keytabCount.textContent = `${game.collected} / ${game.caches.length}`;
    if (game.dropUnlocked) {
      this.el.keytab.dataset.state = 'open';
      this.el.keytabNote.textContent = 'portal open — get to it';
    } else {
      this.el.keytab.dataset.state = 'locked';
      this.el.keytabNote.textContent =
        `key${left === 1 ? '' : 's'} — ${left} more to open the portal`;
    }

    this.el.score.textContent = String(game.score);
    this.el.bits.textContent = `${game.entropy.toFixed(2)} bits`;
    this.el.patrols.textContent = String(game.patrols.length);
    this.el.time.textContent = `${(game.tick / TICKS_PER_SECOND).toFixed(1)}s`;

    const alert = game.alertTicks > 0;
    const hidden = game.onCover;
    this.el.alert.textContent = alert
      ? `SEEN ${game.alertTicks}`
      : (hidden ? 'HIDDEN' : 'unseen');
    this.el.alert.dataset.state = alert ? 'alert' : (hidden ? 'hidden' : 'calm');

    if (this.el.boost) {
      const b = game.boostTicks;
      this.el.boost.textContent = b > 0 ? `${(b / TICKS_PER_SECOND).toFixed(1)}s` : '—';
      this.el.boost.dataset.state = b > 0 ? 'on' : 'off';
    }
    if (this.el.bullets) {
      const inv = game.loadout;
      this.el.bullets.textContent = inv.stunGun ? `${inv.bullets}` : 'none';
      this.el.bullets.dataset.state = !inv.stunGun ? 'none' : (inv.bullets > 0 ? 'ready' : 'empty');
    }
    if (this.el.bolt) {
      const left = game.boltSecondsLeft;
      this.el.bolt.textContent = left > 0 ? `${left.toFixed(1)}s` : 'none';
      this.el.bolt.dataset.state = left <= 0 ? 'none' : (game.boltOn ? 'on' : 'off');
    }
    if (this.el.coinsRun) {
      this.el.coinsRun.textContent = game.coinValue > 0 ? ` +${game.coinValue}` : '';
    }
  }

  _ensureBars(count) {
    if (this._lastRegionCount === count) return;
    const host = this.el.predictionList;
    host.innerHTML = '';
    this._bars = [];
    for (let r = 0; r < count; r++) {
      const row = document.createElement('div');
      row.className = 'bar-row';
      const label = document.createElement('span');
      label.className = 'bar-label';
      label.textContent = String(r).padStart(2, '0');
      const track = document.createElement('div');
      track.className = 'bar-track';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      track.appendChild(fill);
      const val = document.createElement('span');
      val.className = 'bar-val';
      row.append(label, track, val);
      host.appendChild(row);
      this._bars.push({ row, fill, val });
    }
    this._lastRegionCount = count;
  }

  prediction(pred, game) {
    if (!pred) return;
    this._ensureBars(pred.dist.length);
    let max = 0;
    for (const p of pred.dist) if (p > max) max = p;
    for (let r = 0; r < pred.dist.length; r++) {
      const b = this._bars[r];
      const p = pred.dist[r];
      b.fill.style.width = `${((max > 0 ? p / max : 0) * 100).toFixed(1)}%`;
      b.val.textContent = pct(p);
      b.row.dataset.top = r === pred.top ? 'yes' : 'no';
      b.row.dataset.here = r === pred.currentRegion ? 'yes' : 'no';
    }
    this.el.predictionMeta.textContent =
      `k=${pred.k} ticks · spread ${pred.entropyBits.toFixed(2)} bits · tier-1 gate ${pct(pred.gate)} · tier-2 confidence ${pct(pred.confidence)}`;

    this.el.drivers.innerHTML = '';
    if (pred.drivers.length === 0) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = pred.mode === 'uniform'
        ? 'tier 2 disabled in this mode'
        : (pred.confidence === 0 ? 'no file on this subject yet' : 'tier 1 is confident; tier 2 standing down');
      this.el.drivers.appendChild(li);
    }
    for (const d of pred.drivers) {
      const li = document.createElement('li');
      li.innerHTML = `<b>${d.why}</b> <span class="muted">${d.trait} ${d.z > 0 ? '+' : ''}${d.z.toFixed(2)}sd → ${d.feature}</span>`;
      this.el.drivers.appendChild(li);
    }
  }

  dossier(dossier, chain) {
    const rows = dossier.summary().filter((t) => t.seen)
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    const host = this.el.dossierList;
    host.innerHTML = '';
    if (rows.length === 0) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'empty — nothing observed on this profile yet';
      host.appendChild(li);
    }
    for (const t of rows) {
      const li = document.createElement('li');
      li.className = 'trait-row';
      const z = Math.max(-2.5, Math.min(2.5, t.z));
      const w = (Math.abs(z) / 2.5) * 50;
      li.innerHTML =
        `<span class="trait-name">${TRAIT_BY_KEY[t.key]?.label || t.key}</span>` +
        `<span class="trait-gauge"><i style="left:${z < 0 ? 50 - w : 50}%;width:${w}%" data-sign="${z < 0 ? 'neg' : 'pos'}"></i></span>` +
        `<span class="trait-z">${z > 0 ? '+' : ''}${z.toFixed(2)}</span>`;
      host.appendChild(li);
    }
    this.el.dossierMeta.textContent =
      `${dossier.levelsSeen} level${dossier.levelsSeen === 1 ? '' : 's'} cleared · ${dossier.updates} run${dossier.updates === 1 ? '' : 's'} folded in · ` +
      `tier-2 confidence ${pct(dossier.confidence())}` +
      (chain ? ` · tier-1 maturity ${pct(chain.maturity())}` : '');
  }

  dispatch(text, source) {
    this.el.dispatchText.textContent = text;
    this.el.dispatchText.dataset.source = source;
  }

  dispatchStatus(state, detail) {
    const map = {
      idle: 'standby',
      loading: `loading model ${detail || ''}`.trim(),
      ready: 'model online',
      template: `templated (${detail || 'no WebGPU'})`,
      failed: 'offline',
    };
    this.el.dispatchStatus.textContent = map[state] || state;
    this.el.dispatchStatus.dataset.state = state;
  }

  spawn(entry) {
    const li = document.createElement('li');
    const how = entry.split
      ? 'division'
      : (entry.fallback ? 'fallback' : `${entry.tries} draw${entry.tries === 1 ? '' : 's'}`);
    li.innerHTML = `<b>t${entry.tick}</b> ${entry.split ? 'split in' : 'arrived in'} district ${entry.region} ` +
      `<span class="muted">${entry.playerDist} cells away · ${how}</span>`;
    li.title = entry.reason;
    this.el.spawnLog.prepend(li);
    while (this.el.spawnLog.children.length > 6) this.el.spawnLog.lastChild.remove();
  }

  clearSpawns() { this.el.spawnLog.innerHTML = ''; }
}
