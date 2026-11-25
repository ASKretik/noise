// sim3d/shop3d.js -- the 3D game's own items. Pure.
//
// N6.1 (spec-3d-next.md N6). The 2D shop (sim/shop.js: the stun gun, its charges, banked
// lightning) is untouched; these are bought in the 3D hub and carried in the profile as
// inventory.items3d, written through the store's single active-id path (persist3d.js).
// Their rules are Game3DNext's (sim3d/next/game.js): the `next` ruleset only.
//
// Times are sim ticks: at TICK_HZ_3D (4 Hz; 2 Hz in builds 45-47) four ticks are one real second.

export const ITEMS3D = Object.freeze({
  decoy: Object.freeze({
    id: 'decoy', label: 'Noise maker', price: 60, carry: 3, perDistrict: 3, range: Infinity, thrown: true,
    blurb: 'A clockwork rattle you throw as far as you can see: it lands where you aim. Wherever it lands, any alien hunting you drops the chase and goes to search there, and the ones patrolling nearby go to look. Being seen again starts the hunt again.',
  }),
  dampers: Object.freeze({
    id: 'dampers', label: 'Dampers', price: 120, carry: 1, perDistrict: 1, range: 0,
    blurb: 'Felt and rubber for your boots and kit. For the rest of the district they hear you at three quarters of the distance. The stun gun\'s reach does not change.',
  }),
  emp: Object.freeze({
    id: 'emp', label: 'EMP', price: 150, carry: 2, perDistrict: 1, range: Infinity, thrown: true,
    blurb: 'A pulse grenade, thrown wherever you aim. Every awake alien within 7.5 m of where it lands, with nothing solid in between, is stunned as if shot.',
  }),
});
export const ITEM3D_IDS = Object.freeze(Object.keys(ITEMS3D));
/** Item ids as numbers, for the input record's hash (record.js). */
export const ITEM_CODE = Object.freeze({ decoy: 1, dampers: 2, emp: 3 });

/**
 * A throw from the page is a ray: the eye (x, y in 1/THROW_Q of a cell, height in
 * 1/THROW_Q of a metre) and a direction (horizontal in cells, vertical in metres, each
 * x THROW_DQ). The sim traces it itself (raycast.js throwLanding), so the ring the page
 * draws and where the item lands are the same calculation.
 */
export const THROW_Q = 32, THROW_DQ = 4096;
/** The ray of a throw from the eye along a view direction, both in the page's metres. */
export function throwRayOf(eye, dir, cellM) {
  const q = (v) => Math.round(v * THROW_Q), dq = (v) => Math.round(v * THROW_DQ);
  return [q(eye.x / cellM), q(eye.z / cellM), q(eye.y), dq(dir.x / cellM), dq(dir.z / cellM), dq(dir.y)];
}

/** How long a decoy holds the aliens it drew, unless they see you: 40 of your steps, 10 real seconds at 4 Hz. */
export const DECOY_TICKS = 40;
/** Patrolling aliens within this many cells of a decoy go to it. */
export const DECOY_PULL = 14;
/** An EMP stuns awake aliens within this many cells of where it lands (7.5 m at 2.5 m cells). */
export const EMP_RADIUS = 3;
/** Dampers scale the radius you are heard at by this. */
export const DAMPERS_FACTOR = 0.75;

export function blankItems3d() {
  return Object.fromEntries(ITEM3D_IDS.map((id) => [id, 0]));
}

/** The carried counts, clamped to what each item allows. */
export function itemsOf(inventory) {
  const have = inventory?.items3d || {};
  return Object.fromEntries(ITEM3D_IDS.map((id) => [id, Math.max(0, Math.min(ITEMS3D[id].carry, Math.floor(have[id] || 0)))]));
}

export function canBuy3d(wallet, inventory, id) {
  const item = ITEMS3D[id];
  if (!item) return { ok: false, reason: 'no such item', cost: 0 };
  const have = itemsOf(inventory)[id];
  if (have >= item.carry) return { ok: false, reason: `carrying ${item.carry}, the most`, cost: 0 };
  if ((wallet?.coins || 0) < item.price) return { ok: false, reason: `needs ${item.price - (wallet?.coins || 0)} more coins`, cost: item.price };
  return { ok: true, reason: null, cost: item.price };
}

/** A purchase as a new wallet and inventory; the caller commits them. */
export function applyPurchase3d(wallet, inventory, id) {
  const check = canBuy3d(wallet, inventory, id);
  if (!check.ok) return check;
  const items3d = itemsOf(inventory);
  items3d[id]++;
  return { ...check, wallet: { ...wallet, coins: wallet.coins - check.cost }, inventory: { ...inventory, items3d } };
}
