// sim3d/record.js -- the per-tick 3D input record. Pure.
//
// One row per tick the page ran: the direction the leash emitted, whether it asked for a
// double step, and the stun target if the trigger was pulled. Together with the run seed
// this is a complete description of a 3D run: replay() rebuilds it without a body, a
// camera or a mouse, which is what criterion 3D-4 checks.
//
// Since N8.5 a row also says whether the Tab map was open: the `next` rules act on it
// (standing still over the map draws the aliens in). It is hashed only when true, so a
// record that never opened the map -- every classic run -- hashes exactly as before.
//
// Since 3D build 36 (N6.1) a row can carry an item use, { id, x, y }, hashed when present.
//
// Since 3D build 30 a shot also carries its aim (game3d.js aimOf: the line from your eye
// to the point on the alien the crosshair was on), hashed only when present.

import { ITEM_CODE } from './shop3d.js';

export class InputRecord {
  constructor() { this.rows = []; }
  push(row) {
    const stunTarget = row.stunTarget ?? null;
    const stunAim = stunTarget != null && row.stunAim ? row.stunAim.slice() : null;
    const item = row.item ? { id: row.item.id, x: row.item.x | 0, y: row.item.y | 0 } : null;
    this.rows.push({ dir: row.dir, sprint: !!row.sprint, stunTarget, stunAim, mapOpen: !!row.mapOpen, item });
  }
  get length() { return this.rows.length; }

  /** FNV-1a over the rows. */
  hash() {
    let h = 0x811c9dc5;
    const mix = (n) => {
      const v = (n | 0) >>> 0;
      for (let b = 0; b < 4; b++) { h ^= (v >>> (b * 8)) & 0xff; h = Math.imul(h, 0x01000193); }
    };
    for (const r of this.rows) {
      mix(r.dir); mix(r.sprint ? 1 : 0); mix(r.stunTarget ?? -1);
      if (r.stunAim) { mix(0x61696d); for (const v of r.stunAim) mix(v); }
      if (r.mapOpen) mix(0x6d6170);
      if (r.item) { mix(0x6974656d); mix(ITEM_CODE[r.item.id] || 0); mix(r.item.x); mix(r.item.y); }
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}

/** Drive a fresh Game3D through a record. Returns the game. */
export function replay(game, rows) {
  for (const r of rows) {
    if (game.over) break;
    game.step(r.dir, { sprint: r.sprint, stunTarget: r.stunTarget, stunAim: r.stunAim ?? null, mapOpen: !!r.mapOpen, item: r.item ?? null });
  }
  return game;
}
