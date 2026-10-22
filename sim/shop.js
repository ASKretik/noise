// sim/shop.js -- what coins buy.
//
// Pure: it takes a wallet and an inventory and returns new ones. The browser owns the
// buttons; this owns whether a purchase is legal and what it costs, so the rules cannot
// drift between the shop screen and anything else that spends.

export const STUN_GUN_CAPACITY = 6;

export const SHOP = Object.freeze({
  stunGun: {
    id: 'stunGun',
    label: 'Stun gun',
    price: 500,
    kind: 'once',
    blurb: `Holds ${STUN_GUN_CAPACITY} charges and arrives loaded. Press E to fire: every alien ` +
      `whose detection range you are currently standing in is stunned for five seconds, ` +
      `one charge each.`,
  },
  bullet: {
    id: 'bullet',
    label: 'Stun charge',
    price: 100,
    kind: 'quantity',
    requires: 'stunGun',
    max: STUN_GUN_CAPACITY,
    blurb: `Reloads the gun, up to ${STUN_GUN_CAPACITY}.`,
  },
  boltSecond: {
    id: 'boltSecond',
    label: 'Lightning, per second',
    price: 10,
    kind: 'quantity',
    max: 60,
    blurb: 'Banked seconds of double speed. Press L in the district to switch it on, ' +
      'press L again to switch it off — it only drains while it is on.',
  },
});

export const SHOP_ITEMS = Object.freeze(Object.values(SHOP));

export function blankWallet() { return { coins: 0 }; }

export function blankInventory() {
  return { stunGun: false, bullets: 0, boltSeconds: 0 };
}

/**
 * @returns {{ok:boolean, reason:string|null, cost:number, qty:number}}
 */
export function canBuy(wallet, inventory, itemId, qty = 1) {
  const item = SHOP[itemId];
  if (!item) return { ok: false, reason: 'unknown item', cost: 0, qty: 0 };
  const n = Math.max(1, Math.floor(qty));

  if (item.kind === 'once' && inventory[itemId]) {
    return { ok: false, reason: 'already owned', cost: 0, qty: 0 };
  }
  if (item.requires && !inventory[item.requires]) {
    return { ok: false, reason: `needs the ${SHOP[item.requires].label.toLowerCase()}`, cost: 0, qty: 0 };
  }
  if (item.max !== undefined) {
    const held = itemId === 'bullet' ? inventory.bullets : inventory.boltSeconds;
    if (held + n > item.max) {
      const room = item.max - held;
      return room <= 0
        ? { ok: false, reason: 'already full', cost: 0, qty: 0 }
        : { ok: false, reason: `room for ${room} more`, cost: 0, qty: 0 };
    }
  }
  const cost = item.price * (item.kind === 'once' ? 1 : n);
  if (wallet.coins < cost) {
    return { ok: false, reason: `needs ${cost - wallet.coins} more coins`, cost, qty: n };
  }
  return { ok: true, reason: null, cost, qty: n };
}

/**
 * Apply a purchase. Mutates nothing: returns the new wallet and inventory.
 * @returns {{ok:boolean, reason:string|null, wallet:object, inventory:object, cost:number}}
 */
export function applyPurchase(wallet, inventory, itemId, qty = 1) {
  const check = canBuy(wallet, inventory, itemId, qty);
  if (!check.ok) return { ...check, wallet, inventory };

  const nextWallet = { ...wallet, coins: wallet.coins - check.cost };
  const nextInv = { ...inventory };
  if (itemId === 'stunGun') {
    nextInv.stunGun = true;
    // Arrives loaded, which is why the gun costs five bullets' worth rather than one.
    nextInv.bullets = STUN_GUN_CAPACITY;
  } else if (itemId === 'bullet') {
    nextInv.bullets = Math.min(STUN_GUN_CAPACITY, nextInv.bullets + check.qty);
  } else if (itemId === 'boltSecond') {
    nextInv.boltSeconds = Math.min(SHOP.boltSecond.max, nextInv.boltSeconds + check.qty);
  }
  return { ok: true, reason: null, wallet: nextWallet, inventory: nextInv, cost: check.cost };
}
