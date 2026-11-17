// web3d/entities.js -- aliens, keys, coins, bolts, the portal, detection rings. Browser only.
//
// The sim position is the truth; everything here is presentation of it.
//
// Aliens are drawn by PART across all aliens -- one instanced mesh for every torso, one
// for every head, one for every limb -- so twelve aliens cost the same six draw calls as
// one. They glide toward their sim cell at the speed their move period implies instead of
// hopping, which at 4 Hz with a 2.33-tick period would be a jump every 580 ms.
//
// Entity colours are the 2D game's vocabulary (web/render.js COLORS) and never change
// with the belt: red alien, gold key, coin colour = value, electric bolt, teal portal.

import * as THREE from 'three';
import { COLORS } from '../web/render.js';
import { euclid } from '../sim/grid.js';

const MAX_ALIENS = 48;
const UP = new THREE.Vector3(0, 1, 0);

function haloTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function boltShape() {
  const s = new THREE.Shape();
  const pts = [[0.05, 0.32], [-0.14, 0.0], [-0.01, 0.0], [-0.07, -0.32], [0.15, 0.06], [0.02, 0.06], [0.1, 0.32]];
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  s.closePath();
  return s;
}

export class Entities {
  constructor(scene, { cellM }) {
    this.scene = scene;
    this.cellM = cellM;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.halo = haloTexture();

    // ---- alien parts, instanced across every alien
    const skin = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.05, emissive: 0x2a0006 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const mk = (geo, mat) => {
      const m = new THREE.InstancedMesh(geo, mat, MAX_ALIENS);
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      return m;
    };
    this.parts = {
      torso: mk(new THREE.CapsuleGeometry(0.27, 0.72, 4, 12), skin),
      head: mk(new THREE.SphereGeometry(1, 16, 12), skin),
      eye: mk(new THREE.SphereGeometry(0.055, 8, 6), eyeMat),
      limb: mk(new THREE.CapsuleGeometry(0.075, 0.55, 3, 8), skin),
    };
    this.parts.eye.count = 0;
    // Detection rings on the floor: additive, so a dimmer colour is a fainter ring.
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.rings = mk(new THREE.RingGeometry(0.965, 1, 96).rotateX(-Math.PI / 2), ringMat);
    this.discs = mk(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), ringMat.clone());
    this.rings.renderOrder = this.discs.renderOrder = 4;

    // You, seen from outside -- only ever visible in the killcam.
    this.human = new THREE.Group();
    const coat = new THREE.MeshStandardMaterial({ color: COLORS.humanJacket, roughness: 0.7 });
    const skinH = new THREE.MeshStandardMaterial({ color: COLORS.human, roughness: 0.6 });
    const hb = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 4, 10), coat); hb.position.y = 0.95;
    const hh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), skinH); hh.position.y = 1.6;
    const beacon = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: COLORS.beacon, transparent: true, opacity: 0.9, depthWrite: false }));
    beacon.position.y = 0.04;
    this.human.add(hb, hh, beacon);
    this.human.visible = false;
    this.group.add(this.human);

    this.vis = new Map();         // alien id -> { x, y, heading, gait, stun }
    this.slotIds = [];            // instance slot -> alien id (torso/head meshes)
    this.pickups = [];
    this.flying = [];
    this.radius = null;
  }

  // ------------------------------------------------------------------ static pickups

  reset(game) {
    for (const p of this.pickups) this.group.remove(p.obj);
    for (const f of this.flying) this.group.remove(f.obj);
    for (const set of this.coinSets || []) for (const it of set.items) if (it.halo) this.group.remove(it.halo);
    this.pickups = []; this.flying = [];
    this.vis.clear();
    this.radius = null;
    const c = this.cellM;
    const at = (o, y) => new THREE.Vector3((o.x + 0.5) * c, y, (o.y + 0.5) * c);

    const gold = new THREE.MeshStandardMaterial({ color: COLORS.key, emissive: 0x5a3c00, metalness: 0.75, roughness: 0.28 });
    const ringGeo = new THREE.TorusGeometry(0.1, 0.035, 8, 20);
    const shaftGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05);
    const toothGeo = new THREE.BoxGeometry(0.08, 0.045, 0.045);
    for (const k of game.caches) {
      const key = new THREE.Group();
      const ring = new THREE.Mesh(ringGeo, gold); ring.position.y = 0.2;
      const shaft = new THREE.Mesh(shaftGeo, gold);
      const t1 = new THREE.Mesh(toothGeo, gold); t1.position.set(0.05, -0.12, 0);
      const t2 = new THREE.Mesh(toothGeo, gold); t2.position.set(0.05, -0.05, 0);
      key.add(ring, shaft, t1, t2, this._halo(COLORS.key, 0.9, 0.55));
      key.scale.setScalar(1.6);
      this._pickup('key', k, key, at(k, 1.15));
    }

    // Coins are instanced by value: a district-10 floor carries thirty or more, and one
    // draw call each (plus a halo) was most of the frame's draw calls. Only the 5s and 10s
    // keep a halo -- worth is still readable from colour and size alone.
    const coinGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.045, 24).rotateX(Math.PI / 2);
    this.coinSets = [];
    const byValue = new Map();
    for (const k of game.coins) (byValue.get(k.value) || byValue.set(k.value, []).get(k.value)).push(k);
    for (const [value, list] of byValue) {
      const color = COLORS[`coin${value}`] || COLORS.coin1;
      const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.3, emissive: new THREE.Color(color).multiplyScalar(0.22) });
      const mesh = new THREE.InstancedMesh(coinGeo, mat, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      const scale = 0.9 + Math.min(value, 10) * 0.03;
      const items = list.map((ref) => {
        const base = at(ref, 0.75);
        let halo = null;
        if (value >= 5) { halo = this._halo(color, 0.8 + value * 0.04, 0.22 + value * 0.025); halo.position.copy(base); this.group.add(halo); }
        return { ref, base, halo, gone: false };
      });
      this.coinSets.push({ mesh, items, scale, geo: coinGeo, mat });
      this.pickups.push({ kind: 'coinset', obj: mesh, ref: { taken: false }, base: new THREE.Vector3(), gone: false, set: true });
    }

    const boltGeo = new THREE.ExtrudeGeometry(boltShape(), { depth: 0.05, bevelEnabled: false }).center();
    const boltMat = new THREE.MeshStandardMaterial({ color: COLORS.bolt, emissive: 0x8a7a00, roughness: 0.4 });
    for (const k of game.bolts) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(boltGeo, boltMat), this._halo(COLORS.bolt, 0.75, 0.5));
      g.scale.setScalar(1.3);
      this._pickup('bolt', k, g, at(k, 0.95));
    }

    // ---- the portal: a light column visible over every wall, and a ring on the ground
    if (this.portal) this.group.remove(this.portal);
    this.portal = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45 * c, 0.45 * c, 60, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: COLORS.portal, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    beam.position.y = 30;
    const pad = new THREE.Mesh(
      new THREE.RingGeometry(0.2 * c, 0.48 * c, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: COLORS.portal, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    pad.position.y = 0.04;
    this.portal.add(beam, pad, this._halo(COLORS.portal, 3.2, 0.8));
    this.portal.position.copy(at(game.portal, 0));
    this.portal.children[2].position.y = 1.2;
    this.portal.visible = false;
    this.group.add(this.portal);
  }

  _halo(color, size, opacity) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.halo, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.setScalar(size);
    return s;
  }

  _pickup(kind, ref, obj, pos) {
    obj.position.copy(pos);
    this.group.add(obj);
    this.pickups.push({ kind, ref, obj, base: pos.clone(), gone: false });
  }

  // ------------------------------------------------------------------ per frame

  /**
   * @param {object} game
   * @param {number} alpha  session alpha, unused for aliens (they glide by speed)
   * @param {number} t      seconds since page load
   * @param {object} o      { dt, tickHz, camera }
   */
  sync(game, alpha, t, o = {}) {
    const dt = o.dt ?? 1 / 60;
    const tickHz = o.tickHz ?? 4;
    const c = this.cellM;
    const m4 = new THREE.Matrix4(), base = new THREE.Matrix4(), local = new THREE.Matrix4();
    const q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    const col = new THREE.Color();

    // the detection radius eases when you step into or out of water
    const targetR = game.effectiveRadius;
    this.radius = this.radius == null ? targetR : this.radius + (targetR - this.radius) * (1 - Math.exp(-dt * 8));

    const seen = new Set();
    let n = 0, e = 0, l = 0;
    const P = this.parts;
    this.slotIds.length = 0;
    for (const p of game.patrols) {
      if (n >= MAX_ALIENS) break;
      seen.add(p.id);
      let a = this.vis.get(p.id);
      if (!a) {
        a = { x: p.x, y: p.y, heading: 0, gait: 0, stun: 0, born: t };
        this.vis.set(p.id, a);
      }
      const inert = (p.stunnedUntil || 0) > game.tick;
      const hunting = p.mode === 'hunt' || p.mode === 'cutoff';
      const period = hunting ? game.params.chaseMovePeriod : game.params.patrolMovePeriod;
      const speed = (tickHz / period) * 1.12;             // cells per second, a touch quick
      const dx = p.x - a.x, dy = p.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 1.6) { a.x = p.x; a.y = p.y; }
      else if (d > 1e-4 && !inert) {
        const step = Math.min(d, speed * dt);
        a.x += (dx / d) * step; a.y += (dy / d) * step;
        a.gait += step * 5.2;
        const want = Math.atan2(-dx, -dy);
        let diff = want - a.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        a.heading += diff * (1 - Math.exp(-dt * 10));
      }
      a.stun += ((inert ? 1 : 0) - a.stun) * (1 - Math.exp(-dt * 7));

      // body transform: stand, face the heading, slump when stunned
      const bob = inert ? 0 : Math.abs(Math.sin(a.gait)) * 0.05;
      const grow = Math.min(1, (t - a.born) * 3);
      q.setFromAxisAngle(UP, a.heading);
      const slump = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a.stun * 1.25);
      q.multiply(slump);
      base.compose(v.set((a.x + 0.5) * c, bob - a.stun * 0.35, (a.y + 0.5) * c), q, s.setScalar(grow));

      const tint = col.set(inert ? COLORS.stunned : hunting ? COLORS.alien : COLORS.alienCalm);
      // A hunched torso, a long head pushed forward, arms that hang wide: the silhouette
      // has to read as "creature" at thirty metres, not as a red pill.
      const hunch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.22);
      P.torso.setMatrixAt(n, m4.multiplyMatrices(base, local.compose(v.set(0, 1.0, 0), hunch, s.set(1, 1, 0.85))));
      P.torso.setColorAt(n, tint);
      P.head.setMatrixAt(n, m4.multiplyMatrices(base, local.compose(v.set(0, 1.74, -0.14), q.identity(), s.set(0.27, 0.31, 0.34))));
      P.head.setColorAt(n, tint);
      for (const side of [-1, 1]) {
        P.eye.setMatrixAt(e, m4.multiplyMatrices(base, local.compose(v.set(side * 0.12, 1.79, -0.44), q.identity(), s.setScalar(1.35))));
        P.eye.setColorAt(e, col.set(inert ? 0x222226 : COLORS.alienEye));
        e++;
      }
      const swing = inert ? 0 : Math.sin(a.gait) * 0.6;
      const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
      const limbs = [
        // [x, y, swing, splay, length scale]
        [-0.46, 1.0, swing, 0.28, 1.3], [0.46, 1.0, -swing, -0.28, 1.3],
        [-0.16, 0.38, -swing, 0.05, 1.0], [0.16, 0.38, swing, -0.05, 1.0],
      ];
      for (const [lx, ly, sw, splay, len] of limbs) {
        const rot = new THREE.Quaternion().setFromAxisAngle(X, sw).multiply(new THREE.Quaternion().setFromAxisAngle(Z, splay));
        local.compose(v.set(lx, ly, 0), rot, s.set(1, len, 1));
        P.limb.setMatrixAt(l, m4.multiplyMatrices(base, local));
        P.limb.setColorAt(l, col.set(inert ? COLORS.stunned : hunting ? COLORS.alien : COLORS.alienCalm).multiplyScalar(0.78));
        l++;
      }

      // the ring: the radius at which this alien detects YOU, red when it does
      const R = this.radius * c * (1 - a.stun);
      const onYou = !inert && euclid(p.x, p.y, game.player.x, game.player.y) <= game.effectiveRadius;
      base.compose(v.set((a.x + 0.5) * c, 0.035, (a.y + 0.5) * c), q.identity(), s.set(Math.max(R, 0.001), 1, Math.max(R, 0.001)));
      this.rings.setMatrixAt(n, base);
      this.rings.setColorAt(n, col.set(onYou ? 0xff4d5e : 0x7a1f2a).multiplyScalar(onYou ? 0.9 + Math.sin(t * 9) * 0.1 : 0.55));
      this.discs.setMatrixAt(n, base);
      this.discs.setColorAt(n, col.set(onYou ? 0x3a0a10 : 0x12060a));
      this.slotIds[n] = p.id;
      n++;
    }
    for (const id of [...this.vis.keys()]) if (!seen.has(id)) this.vis.delete(id);
    for (const mesh of [P.torso, P.head, this.rings, this.discs]) mesh.count = n;
    P.eye.count = e; P.limb.count = l;
    for (const mesh of [P.torso, P.head, P.eye, P.limb, this.rings, this.discs]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // pickups: bob and spin, and fly to you when the sim says you took one
    const cm = new THREE.Matrix4(), cq = new THREE.Quaternion(), cs = new THREE.Vector3(), cv = new THREE.Vector3();
    for (const set of this.coinSets || []) {
      set.items.forEach((it, i) => {
        if (it.ref.taken && !it.gone) {
          it.gone = true;
          if (it.halo) this.group.remove(it.halo);
          const fly = new THREE.Mesh(set.geo, set.mat);
          fly.position.copy(it.base);
          fly.scale.setScalar(set.scale);
          this.group.add(fly);
          this.flying.push({ obj: fly, from: it.base.clone(), t0: t });
        }
        if (it.gone) { set.mesh.setMatrixAt(i, cm.makeScale(0, 0, 0)); return; }
        cq.setFromAxisAngle(UP, t * 2.4 + i);
        cv.set(it.base.x, it.base.y + Math.sin(t * 2 + it.base.x) * 0.07, it.base.z);
        set.mesh.setMatrixAt(i, cm.compose(cv, cq, cs.setScalar(set.scale)));
      });
      set.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const p of this.pickups) {
      if (p.set) continue;
      const gone = p.kind === 'key' ? p.ref.collected : p.ref.taken;
      if (gone && !p.gone) {
        p.gone = true;
        this.flying.push({ obj: p.obj, from: p.obj.position.clone(), t0: t });
      }
      if (p.gone) continue;
      p.obj.position.y = p.base.y + Math.sin(t * 2 + p.base.x) * 0.07;
      p.obj.rotation.y = t * (p.kind === 'coin' ? 2.4 : 1.3);
    }
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      const k = Math.min(1, (t - f.t0) / 0.28);
      if (o.camera) {
        const target = o.camera.position.clone().add(new THREE.Vector3(0, -0.35, 0));
        f.obj.position.lerpVectors(f.from, target, k * k);
      }
      f.obj.scale.setScalar((1 - k) * 1.4 + 0.01);
      if (k >= 1) { this.group.remove(f.obj); this.flying.splice(i, 1); }
    }

    this.portal.visible = game.portalRevealed;
    if (this.portal.visible) {
      this.portal.children[0].material.opacity = 0.22 + Math.sin(t * 3) * 0.06;
      this.portal.children[1].rotation.y = t * 0.8;
    }
  }

  /** Show or hide your own figure (killcam only). x, y in cells. */
  showHuman(on, x = 0, y = 0, heading = 0) {
    this.human.visible = on;
    if (!on) return;
    this.human.position.set((x + 0.5) * this.cellM, 0, (y + 0.5) * this.cellM);
    this.human.rotation.y = heading;
  }

  /** Visual position of an alien in metres, or null. */
  alienPosition(id) {
    const a = this.vis.get(id);
    return a ? new THREE.Vector3((a.x + 0.5) * this.cellM, 1.2, (a.y + 0.5) * this.cellM) : null;
  }

  /** Raycast the alien bodies; returns the alien id under the ray, or null. */
  pick(raycaster) {
    // An InstancedMesh caches the bounding sphere of its instances the first time it is
    // raycast, and these move every frame: without a recompute the ray is rejected
    // against wherever the aliens were at the first pick (or against nothing at all).
    for (const m of [this.parts.torso, this.parts.head]) { m.computeBoundingSphere(); }
    const hits = raycaster.intersectObjects([this.parts.torso, this.parts.head], false);
    if (!hits.length) return null;
    return this.slotIds[hits[0].instanceId] ?? null;
  }

  /** Current visual positions, for positional audio. */
  alienVoices() {
    return [...this.vis.entries()].map(([id, a]) => ({ id, x: (a.x + 0.5) * this.cellM, z: (a.y + 0.5) * this.cellM, inert: a.stun > 0.5 }));
  }
}
