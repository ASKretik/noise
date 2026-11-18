// web3d/gun.js -- the stun gun viewmodel, lock-on and shot effects. Browser only.
//
// The renderer PROPOSES a target -- the alien body under the crosshair, and the exact
// point on it -- and the sim DISPOSES: Game3D.canStun(id, aim) checks that the line from
// your eye to that point clears every wall and rubble heap (what you see), that the alien
// is awake, and that it is within 72 m. The crosshair only shows a lock when the sim would
// accept the shot, the aim travels with the shot, and a locked shot always lands, so the
// skill is acquiring the lock. An alien you cannot see gets no bracket at all.
//
// The viewmodel is drawn in its own pass after the world with the depth buffer cleared,
// so it never clips into a wall you are standing against. Built from primitives; the six
// charge cells along the top are the magazine, lit or dark.

import * as THREE from 'three';
import { STUN_GUN_CAPACITY } from '../sim/shop.js';
import { aimOf, STUN_REASON } from '../sim3d/game3d.js';
import { STUN_RANGE_M } from '../sim3d/units.js';

// reasons that mean the crosshair is not really on a visible alien: no bracket for those
const UNSEEN = new Set([STUN_REASON.BLOCKED, STUN_REASON.OFF_TARGET, STUN_REASON.NO_TARGET]);

const CELL_ON = new THREE.Color(0x9fd8ff);
const CELL_OFF = new THREE.Color(0x1a2230);

export class StunGun {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x202028, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1, 2, 1);
    this.scene.add(key);

    const body = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.45, metalness: 0.6 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x8b93a6, roughness: 0.35, metalness: 0.8 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, toneMapped: false });
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
    add(new THREE.BoxGeometry(0.075, 0.085, 0.32), body, 0, 0, 0);
    add(new THREE.BoxGeometry(0.055, 0.14, 0.07), body, 0, -0.1, 0.09, 0.28);
    add(new THREE.CylinderGeometry(0.022, 0.026, 0.2, 14).rotateX(Math.PI / 2), trim, 0, 0.01, -0.24);
    this.tip = add(new THREE.SphereGeometry(0.022, 12, 8), glow, 0, 0.01, -0.345);
    add(new THREE.TorusGeometry(0.034, 0.008, 6, 18), trim, 0, 0.01, -0.17);
    this.cells = [];
    for (let i = 0; i < STUN_GUN_CAPACITY; i++) {
      const c = add(new THREE.BoxGeometry(0.018, 0.012, 0.03), new THREE.MeshBasicMaterial({ color: CELL_OFF.clone(), toneMapped: false }), 0, 0.05, -0.09 + i * 0.038);
      this.cells.push(c);
    }
    this.flash = new THREE.PointLight(0x9fd8ff, 0, 1.2);
    this.flash.position.set(0, 0.01, -0.38);
    g.add(this.flash);
    this.model = g;
    this.rest = new THREE.Vector3(0.21, -0.19, -0.46);
    g.scale.setScalar(0.82);
    g.position.copy(this.rest);
    g.rotation.y = 0.05;
    this.camera.add(g);
    this.scene.add(this.camera);

    this.recoil = 0;
    this.sway = new THREE.Vector2();
    this.lastYaw = 0; this.lastPitch = 0;
    this.visible = false;
    this.beams = [];
    this.raycaster = new THREE.Raycaster();
    // a little past the reach, so a visible alien just too far shows the grey bracket
    this.raycaster.far = STUN_RANGE_M + 10;
  }

  /** Lock-on: what is under the crosshair, and would the sim accept a shot at it? */
  /**
   * @param {number} [assist] touch only: radians of cone in which the nearest-to-centre
   *   valid alien locks even if the crosshair is not exactly on it. A thumb is not a mouse.
   */
  aim(mainCamera, entities, game, assist = 0) {
    if (!game.loadout.stunGun) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), mainCamera);
    const eye = mainCamera.position, cellM = entities.cellM;
    // every alien body along the crosshair ray, nearest first: the first one you can see
    let unseen = null;
    for (const hit of entities.pickAll(this.raycaster)) {
      const aim = aimOf(eye, hit.point, cellM);
      const check = game.canStun(hit.id, aim);
      if (check.ok) return { id: hit.id, ok: true, reason: null, aim, point: hit.point };
      if (UNSEEN.has(check.reason)) { unseen = unseen ?? hit.id; continue; }
      if (!assist) return { id: hit.id, ok: false, reason: check.reason, point: hit.point };
      break;
    }
    if (assist > 0) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(mainCamera.quaternion);
      let best = null, bestA = assist;
      for (const p of game.patrols) {
        const pos = entities.alienPosition(p.id);
        if (!pos) continue;
        const a = fwd.angleTo(pos.clone().sub(eye));
        if (a >= bestA) continue;
        const aim = aimOf(eye, pos, cellM);
        if (game.canStun(p.id, aim).ok) { bestA = a; best = { id: p.id, ok: true, reason: null, aim, point: pos, assisted: true }; }
      }
      if (best) return best;
    }
    return { id: null, ok: false, reason: unseen != null ? STUN_REASON.BLOCKED : null };
  }

  fired(mainScene, from, to) {
    this.recoil = 1;
    this.flash.intensity = 3;
    if (!to) return;
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    mainScene.add(line);
    this.beams.push({ line, t: 0, scene: mainScene });
  }

  dry() { this.recoil = 0.25; }

  /** Muzzle position in world space, for the beam. */
  muzzleWorld(mainCamera) {
    return new THREE.Vector3(0.2, -0.16, -0.75).applyMatrix4(mainCamera.matrixWorld);
  }

  update(dt, mainCamera, game, { yaw, pitch, bob = 0, reduceMotion = false }) {
    this.visible = !!game.loadout.stunGun;
    this.model.visible = this.visible;
    const charges = game.loadout.bullets;
    this.cells.forEach((c, i) => c.material.color.copy(i < charges ? CELL_ON : CELL_OFF));
    this.camera.fov = mainCamera.fov;
    this.camera.aspect = mainCamera.aspect;
    this.camera.updateProjectionMatrix();

    // Sway lags the mouse a touch; recoil kicks back and up.
    const dyaw = yaw - this.lastYaw, dpitch = pitch - this.lastPitch;
    this.lastYaw = yaw; this.lastPitch = pitch;
    const k = reduceMotion ? 0 : 1;
    this.sway.x += (Math.max(-0.06, Math.min(0.06, dyaw * 0.9)) * k - this.sway.x) * (1 - Math.exp(-dt * 10));
    this.sway.y += (Math.max(-0.05, Math.min(0.05, dpitch * 0.9)) * k - this.sway.y) * (1 - Math.exp(-dt * 10));
    this.recoil *= Math.exp(-dt * 12);
    this.flash.intensity *= Math.exp(-dt * 30);
    const m = this.model;
    m.position.set(this.rest.x + this.sway.x, this.rest.y - this.sway.y + bob * 0.4, this.rest.z + this.recoil * 0.06);
    m.rotation.set(this.recoil * 0.35, 0.05 + this.sway.x * 1.5, 0);
    this.tip.scale.setScalar(1 + this.recoil * 1.4);

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      b.line.material.opacity = Math.max(0, 1 - b.t / 0.18);
      if (b.t > 0.18) { b.scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); this.beams.splice(i, 1); }
    }
  }

  render(renderer) {
    if (!this.visible) return;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }
}
