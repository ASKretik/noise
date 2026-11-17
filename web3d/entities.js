// web3d/entities.js -- aliens, keys, coins, bolts, the portal. Browser only.
//
// Phase 2: graybox shapes. The sim position is the truth; aliens are drawn between their
// previous and current cell by the session's alpha.

import * as THREE from 'three';
import { COLORS } from '../web/render.js';

const coinColor = (v) => COLORS[`coin${v}`] || COLORS.coin1;

export class Entities {
  constructor(scene, { cellM }) {
    this.scene = scene;
    this.cellM = cellM;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.aliens = new Map();
    this.alienGeo = new THREE.CapsuleGeometry(0.32, 1.1, 4, 10);
    this.alienMat = new THREE.MeshStandardMaterial({ color: COLORS.alien, roughness: 0.5, emissive: 0x330008 });
    this.stunMat = new THREE.MeshStandardMaterial({ color: COLORS.stunned, roughness: 0.8 });
    this.pickups = [];
  }

  /** Build the static pickups for a fresh game. */
  reset(game) {
    for (const m of this.aliens.values()) this.group.remove(m);
    this.aliens.clear();
    for (const p of this.pickups) this.group.remove(p.mesh);
    this.pickups = [];
    const c = this.cellM;
    const at = (o, y) => new THREE.Vector3((o.x + 0.5) * c, y, (o.y + 0.5) * c);
    const keyGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
    const keyMat = new THREE.MeshStandardMaterial({ color: COLORS.key, emissive: 0x4a3200, metalness: 0.6, roughness: 0.3 });
    for (const k of game.caches) this._pickup('key', k, new THREE.Mesh(keyGeo, keyMat), at(k, 1.1));
    const coinGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16);
    for (const k of game.coins) {
      const m = new THREE.Mesh(coinGeo, new THREE.MeshStandardMaterial({ color: coinColor(k.value), metalness: 0.7, roughness: 0.35 }));
      m.rotation.x = Math.PI / 2;
      this._pickup('coin', k, m, at(k, 0.6));
    }
    const boltGeo = new THREE.OctahedronGeometry(0.22);
    const boltMat = new THREE.MeshStandardMaterial({ color: COLORS.bolt, emissive: 0x665a00 });
    for (const k of game.bolts) this._pickup('bolt', k, new THREE.Mesh(boltGeo, boltMat), at(k, 0.9));

    if (this.portal) this.group.remove(this.portal);
    this.portal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55 * c / 1.5, 0.55 * c / 1.5, 40, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: COLORS.portal, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.portal.position.copy(at(game.portal, 20));
    this.portal.visible = false;
    this.group.add(this.portal);
  }

  _pickup(kind, ref, mesh, pos) {
    mesh.position.copy(pos);
    this.group.add(mesh);
    this.pickups.push({ kind, ref, mesh, baseY: pos.y });
  }

  sync(game, alpha, t) {
    const c = this.cellM;
    const seen = new Set();
    for (const p of game.patrols) {
      seen.add(p.id);
      let m = this.aliens.get(p.id);
      if (!m) {
        m = new THREE.Mesh(this.alienGeo, this.alienMat);
        m.userData.alienId = p.id;
        this.aliens.set(p.id, m);
        this.group.add(m);
      }
      const px = p.prevX ?? p.x, py = p.prevY ?? p.y;
      const x = px + (p.x - px) * alpha, y = py + (p.y - py) * alpha;
      const inert = (p.stunnedUntil || 0) > game.tick;
      m.material = inert ? this.stunMat : this.alienMat;
      m.position.set((x + 0.5) * c, inert ? 0.45 : 0.87, (y + 0.5) * c);
      m.rotation.z = inert ? Math.PI / 2.4 : 0;
    }
    for (const [id, m] of this.aliens) if (!seen.has(id)) { this.group.remove(m); this.aliens.delete(id); }

    for (const p of this.pickups) {
      const gone = p.kind === 'key' ? p.ref.collected : p.ref.taken;
      p.mesh.visible = !gone;
      if (gone) continue;
      p.mesh.position.y = p.baseY + Math.sin(t * 2 + p.ref.x) * 0.06;
      p.mesh.rotation.y = t * (p.kind === 'coin' ? 2.2 : 1.2);
    }
    this.portal.visible = game.portalRevealed;
  }

  /** Alien meshes, for the crosshair raycast. */
  alienMeshes() { return [...this.aliens.values()]; }
}
