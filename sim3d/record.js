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

export class InputRecord {
  constructor() { this.rows = []; }
  push(row) { this.rows.push({ dir: row.dir, sprint: !!row.sprint, stunTarget: row.stunTarget ?? null, mapOpen: !!row.mapOpen }); }
  get length() { return this.rows.length; }

  /** FNV-1a over the rows. */
  hash() {
    let h = 0x811c9dc5;
    const mix = (n) => {
      const v = (n | 0) >>> 0;
      for (let b = 0; b < 4; b++) { h ^= (v >>> (b * 8)) & 0xff; h = Math.imul(h, 0x01000193); }
    };
    for (const r of this.rows) { mix(r.dir); mix(r.sprint ? 1 : 0); mix(r.stunTarget ?? -1); if (r.mapOpen) mix(0x6d6170); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}

/** Drive a fresh Game3D through a record. Returns the game. */
export function replay(game, rows) {
  for (const r of rows) {
    if (game.over) break;
    game.step(r.dir, { sprint: r.sprint, stunTarget: r.stunTarget, mapOpen: !!r.mapOpen });
  }
  return game;
}
