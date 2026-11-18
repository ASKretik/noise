// sim3d/shop3d.js -- the 3D game's own items. Pure.
//
// N6.1 (spec-3d-next.md N6). The 2D shop (sim/shop.js: the stun gun, its charges, banked
// lightning) is untouched; these are bought in the 3D hub and carried in the profile as
// inventory.items3d, written through the store's single active-id path (persist3d.js).
// Their rules are Game3DNext's (sim3d/next/game.js): the `next` ruleset only.
//
// Times are sim ticks: at 4 Hz, 4 ticks are one real second.

export const ITEMS3D = Object.freeze({
  decoy: Object.freeze({
    id: 'decoy', label: 'Noise maker', price: 60, carry: 3, perDistrict: 3, range: 8,
    blurb: 'A clockwork rattle you throw. Wherever it lands, any alien hunting you drops the chase and goes to search there, and the ones patrolling nearby go to look. Being seen again starts the hunt again.',
  }),
  dampers: Object.freeze({
    id: 'dampers', label: 'Dampers', price: 120, carry: 1, perDistrict: 1, range: 0,
    blurb: 'Felt and rubber for your boots and kit. For the rest of the district they hear you at three quarters of the distance. The stun gun\'s reach does not change.',
  }),
  emp: Object.freeze({
    id: 'emp', label: 'EMP', price: 150, carry: 2, perDistrict: 1, range: 6,
    blurb: 'A pulse grenade. Every awake alien within 3 cells of where it lands, with nothing solid in between, is stunned as if shot.',
  }),
});
export const ITEM3D_IDS = Object.freeze(Object.keys(ITEMS3D));
/** Item ids as numbers, for the input record's hash (record.js). */
export const ITEM_CODE = Object.freeze({ decoy: 1, dampers: 2, emp: 3 });

/** How long a decoy holds the aliens it drew, unless they see you: 10 real seconds. */
export const DECOY_TICKS = 40;
/** Patrolling aliens within this many cells of a decoy go to it. */
export const DECOY_PULL = 14;
/** An EMP stuns awake aliens within this many cells of where it lands. */
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
