// web3d/alien.js -- the alien body: geometry, materials and per-frame posing. Browser only.
//
// One skeleton, posed every frame by forward kinematics from a handful of angles:
//
//   head      a lathe cranium, a hinged jaw, almond eyes with red slits
//   torso     hunched forward of the pelvis, a thin neck
//   arms      shoulder -> elbow -> wrist, three long fingers
//   legs      digitigrade: hip -> knee (forward) -> ankle (back) -> toes (forward)
//
// Drawn BY PART across all aliens: one InstancedMesh for every cranium, one for every
// jaw, one for every torso, one for every bone (17 per alien), one for every joint (12 per
// alien), one for eyes and one for eye slits. Seven draw calls however many aliens.
//
// The skin carries the threat colour. Its markings glow red, and a red rim light traces
// the silhouette, both scaled by a per-instance glow (calm, hunting, stunned = dark), so a
// grey-green creature still reads as "red = alien" against every belt.

import * as THREE from 'three';
import { Rng, hashString } from '../sim/prng.js';

export const MAX_ALIENS = 48;
const BONES = 17;
const JOINTS = 12;

const DOWN = new THREE.Vector3(0, -1, 0);
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

/** A cheap deterministic hash in [0, 1) -- the same kind web/render.js uses for speckle. */
const hash01 = (a, b) => {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

/** Mottled skin albedo and a glow map of markings, drawn from a seed. */
function skinTextures(seed) {
  const rng = new Rng(hashString(`markings:${seed}`), 'markings');
  const S = 256;
  const albedo = document.createElement('canvas');
  albedo.width = albedo.height = S;
  let g = albedo.getContext('2d');
  g.fillStyle = '#e6ebe4'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2200; i++) {
    const v = 190 + rng.int(65);
    g.fillStyle = `rgb(${v},${v + 4},${v})`;
    const r = 1 + rng.int(4);
    g.beginPath(); g.arc(rng.int(S), rng.int(S), r, 0, Math.PI * 2); g.fill();
  }
  const glow = document.createElement('canvas');
  glow.width = glow.height = S;
  g = glow.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
  // wavering stripes running the length of each part
  for (let i = 0; i < 7; i++) {
    let x = rng.int(S);
    g.lineWidth = 1.5 + rng.float() * 2;
    g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y <= S; y += 16) { x += (rng.float() - 0.5) * 18; g.lineTo(x, y); }
    g.stroke();
  }
  // paired dots, like vents or sensory pits
  for (let i = 0; i < 26; i++) {
    const x = rng.int(S), y = rng.int(S), r = 1.5 + rng.float() * 2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.arc(x + 7, y, r, 0, Math.PI * 2); g.fill();
  }
  const tex = (cv) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return { albedo: tex(albedo), glow: tex(glow) };
}

/**
 * Skin: a standard material whose emission is scaled per instance (`aGlow`), plus a red
 * fresnel rim light so the silhouette reads against any ground.
 */
function skinMaterial(sp, tex) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: tex.albedo, roughness: 0.58, metalness: 0.02,
    emissive: sp.glowColor, emissiveMap: tex.glow, emissiveIntensity: 1.5,
  });
  const rim = sp.rim.toFixed(3);
  const rc = new THREE.Color(sp.glowColor);
  const rimColor = `vec3(${rc.r.toFixed(3)}, ${rc.g.toFixed(3)}, ${rc.b.toFixed(3)})`;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance *= vGlow;
      {
        float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);
        totalEmissiveRadiance += ${rimColor} * rimF * ${rim} * vGlow;
      }`);
  };
  mat.customProgramCacheKey = () => `alien-skin-${rim}`;
  return mat;
}

/** An almond: a sphere whose height is pinched toward its ends, so the tips are points. */
function almondGeometry() {
  const geo = new THREE.SphereGeometry(1, 28, 16);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setY(i, p.getY(i) * Math.sqrt(Math.max(0, 1 - x * x)));
  }
  geo.computeVertexNormals();
  return geo;
}

/** Direction of a limb: straight down, swung forward by ax (about X), splayed by az (about Z). */
function limbDir(out, ax, az) {
  const c = Math.cos(ax);
  return out.set(Math.sin(az) * c, -Math.cos(az) * c, -Math.sin(ax));
}

export class AlienKit {
  constructor(group, species) {
    this.sp = species;
    this.group = group;
    const tex = skinTextures(species.id);
    this.skin = skinMaterial(species, tex);

    const cranium = new THREE.LatheGeometry(species.cranium.map(([r, y]) => new THREE.Vector2(r, y)), 32);
    cranium.rotateX(species.craniumTip);
    cranium.scale(1, 1, species.craniumDepth);
    cranium.computeVertexNormals();
    const jaw = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const bone = new THREE.CylinderGeometry(1, 0.78, 1, 12, 1);
    bone.translate(0, -0.5, 0);
    const joint = new THREE.SphereGeometry(1, 12, 8);
    // the ribcage: a lathe from the neck (y = 0) down to the waist (y = -1), unit radius
    const torso = new THREE.LatheGeometry(species.torso.profile.map(([r, y]) => new THREE.Vector2(r, y)), 20);
    torso.computeVertexNormals();
    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: 0x040406, roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02,
    });
    const slitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

    const mk = (geo, mat, per, glow) => {
      const m = new THREE.InstancedMesh(geo, mat, MAX_ALIENS * per);
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.userData.per = per;
      if (glow) {
        const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ALIENS * per), 1);
        a.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aGlow', a);
      }
      group.add(m);
      return m;
    };
    this.m = {
      cranium: mk(cranium, this.skin, 1, true),
      jaw: mk(jaw, this.skin, 1, true),
      torso: mk(torso, this.skin, 1, true),
      bone: mk(bone, this.skin, BONES, true),
      joint: mk(joint, this.skin, JOINTS, true),
      eye: mk(almondGeometry(), eyeMat, 2, false),
      slit: mk(new THREE.SphereGeometry(1, 10, 8), slitMat, 2, false),
    };
    this.n = { cranium: 0, jaw: 0, torso: 0, bone: 0, joint: 0, eye: 0, slit: 0 };

    // scratch
    this._m = new THREE.Matrix4(); this._l = new THREE.Matrix4(); this._h = new THREE.Matrix4();
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._d = new THREE.Vector3();
    this._c = new THREE.Color();
    this._p = Array.from({ length: 24 }, () => new THREE.Vector3());
  }

  begin() { for (const k in this.n) this.n[k] = 0; }

  end() {
    for (const [k, mesh] of Object.entries(this.m)) {
      mesh.count = this.n[k];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      const g = mesh.geometry.attributes.aGlow;
      if (g) g.needsUpdate = true;
    }
  }

  _put(kind, matrix, color, glow) {
    const mesh = this.m[kind];
    const i = this.n[kind]++;
    mesh.setMatrixAt(i, matrix);
    if (color) mesh.setColorAt(i, color);
    const g = mesh.geometry.attributes.aGlow;
    if (g) g.setX(i, glow);
  }

  /** A bone from a to b (alien-local), radii rx/rz, under the alien's base matrix. */
  _bone(base, a, b, rx, rz, color, glow, kind = 'bone') {
    const d = this._d.subVectors(b, a);
    const len = d.length();
    this._q.setFromUnitVectors(DOWN, d.multiplyScalar(1 / Math.max(len, 1e-6)));
    this._l.compose(a, this._q, this._s.set(rx, len, rz));
    this._put(kind, this._m.multiplyMatrices(base, this._l), color, glow);
  }

  _joint(base, p, r, color, glow) {
    this._l.compose(p, this._q.identity(), this._s.setScalar(r));
    this._put('joint', this._m.multiplyMatrices(base, this._l), color, glow);
  }

  /**
   * Pose one alien.
   * @param {THREE.Matrix4} base  world transform at the feet, facing -z
   * @param {object} st  { gait, look, tilt, pitch, jaw, convulse, t, inert, hunting }
   */
  pose(base, st) {
    const sp = this.sp;
    const tint = this._c.set(st.inert ? sp.skin.stunned : st.hunting ? sp.skin.hunting : sp.skin.calm);
    const glow = st.inert ? sp.glow.stunned : st.hunting ? sp.glow.hunting * (0.85 + 0.15 * Math.sin(st.t * 6)) : sp.glow.calm;
    const P = this._p;
    const swing = st.inert ? 0 : Math.sin(st.gait);
    const jit = (k) => (st.convulse > 0 ? Math.sin(st.t * 57 + k * 2.1) * 0.35 * st.convulse : 0);

    // ---- legs (digitigrade), then lift the whole body so the toes touch the ground
    const pelvis = P[0].set(0, sp.pelvisY, 0.02);
    const legs = [];
    let minY = Infinity;
    for (const s of [-1, 1]) {
      const ph = s < 0 ? swing : -swing;
      const aT = 0.42 + 0.32 * ph + jit(s);
      const aS = aT - 1.15;
      const aM = aS + 0.95;
      const hip = new THREE.Vector3(s * sp.hipX, sp.pelvisY, 0.02);
      const knee = hip.clone().addScaledVector(limbDir(this._d, aT, s * 0.04), sp.thigh.len);
      const ankle = knee.clone().addScaledVector(limbDir(this._d, aS, 0), sp.shin.len);
      const toe = ankle.clone().addScaledVector(limbDir(this._d, aM, 0), sp.foot.len);
      // the foot in its forward swing lifts a little
      const lift = Math.max(0, ph) * 0.05;
      ankle.y += lift; toe.y += lift;
      legs.push({ hip, knee, ankle, toe });
      minY = Math.min(minY, toe.y - lift, ankle.y - lift);
    }
    const drop = minY;
    const shift = (v) => { v.y -= drop; return v; };
    shift(pelvis);
    for (const L of legs) { shift(L.hip); shift(L.knee); shift(L.ankle); shift(L.toe); }

    const chest = P[1].set(0, sp.chest.y - drop, sp.chest.z);
    const neckTop = P[2].set(0, sp.neckTop.y - drop, sp.neckTop.z);
    chest.x += jit(5) * 0.08;

    // ---- torso and neck
    this._bone(base, chest, pelvis, sp.torso.r, sp.torso.r * sp.torso.depth, tint, glow, 'torso');
    this._bone(base, neckTop, chest, sp.neckR, sp.neckR, tint, glow);

    // ---- legs
    for (const L of legs) {
      this._bone(base, L.hip, L.knee, sp.thigh.r, sp.thigh.r, tint, glow);
      this._bone(base, L.knee, L.ankle, sp.shin.r, sp.shin.r, tint, glow);
      this._bone(base, L.ankle, L.toe, sp.foot.r, sp.foot.r * 0.8, tint, glow);
      this._joint(base, L.hip, sp.thigh.r * sp.jointR, tint, glow);
      this._joint(base, L.knee, sp.shin.r * 1.18, tint, glow);
      this._joint(base, L.ankle, sp.foot.r * 1.15, tint, glow);
    }

    // ---- arms: counter-swing to the legs, long and slightly splayed
    for (const s of [-1, 1]) {
      const ph = s < 0 ? -swing : swing;
      const aU = 0.14 + 0.32 * ph + jit(10 + s);
      const aF = aU + 0.55 + jit(12 + s) * 0.5;
      const shoulder = new THREE.Vector3(s * sp.shoulderX, chest.y - 0.05, chest.z + 0.02);
      const elbow = shoulder.clone().addScaledVector(limbDir(this._d, aU, s * 0.16), sp.upperArm.len);
      const wrist = elbow.clone().addScaledVector(limbDir(this._d, aF, s * 0.1), sp.forearm.len);
      this._bone(base, shoulder, elbow, sp.upperArm.r, sp.upperArm.r, tint, glow);
      this._bone(base, elbow, wrist, sp.forearm.r, sp.forearm.r, tint, glow);
      this._joint(base, shoulder, sp.upperArm.r * 1.25, tint, glow);
      this._joint(base, elbow, sp.forearm.r * 1.2, tint, glow);
      this._joint(base, wrist, sp.forearm.r * 1.1, tint, glow);
      for (const k of [-1, 0, 1]) {
        const tip = wrist.clone().addScaledVector(limbDir(this._d, aF + 0.22, s * 0.1 + k * sp.finger.spread), sp.finger.len);
        this._bone(base, wrist, tip, sp.finger.r, sp.finger.r, tint, glow);
      }
    }

    // ---- head: look toward what it hears, tilt, twitch; jaw hinged under the chin
    const head = this._h.compose(neckTop, this._q.setFromAxisAngle(AY, st.look + jit(20) * 0.5)
      .multiply(this._q2.setFromAxisAngle(AZ, st.tilt))
      .multiply(new THREE.Quaternion().setFromAxisAngle(AX, st.pitch)), this._s.setScalar(1));
    const headW = new THREE.Matrix4().multiplyMatrices(base, head);
    this._put('cranium', headW, tint, glow);

    const jawM = new THREE.Matrix4().makeTranslation(0, -0.07, -0.1)
      .multiply(new THREE.Matrix4().makeRotationX(st.jaw))
      .multiply(new THREE.Matrix4().compose(this._v.set(0, -0.015, -0.045), this._q.identity(), this._s.set(0.07, 0.05, 0.085)));
    this._put('jaw', this._m.multiplyMatrices(headW, jawM), tint, glow);

    const e = sp.eye, sl = sp.slit;
    const slitColor = this._c.set(st.inert ? 0x1a0508 : sp.glowColor);
    for (const s of [-1, 1]) {
      const frame = new THREE.Matrix4().compose(
        this._v.set(s * e.x, e.y, e.z),
        this._q.setFromAxisAngle(AY, -s * e.wrap),
        this._s.setScalar(1),
      );
      const eyeL = frame.clone()
        .multiply(new THREE.Matrix4().makeRotationZ(s * e.slant))
        .multiply(new THREE.Matrix4().makeScale(e.w, e.h, e.d));
      this._put('eye', this._m.multiplyMatrices(headW, eyeL), null, 0);
      const slitL = frame.clone()
        // just in front of the eye's surface, upright like a cat's pupil
        .multiply(new THREE.Matrix4().compose(this._v.set(0, 0, -(e.d + 0.004)), this._q.identity(), this._s.set(sl.w, sl.h, sl.d)));
      this._put('slit', this._m.multiplyMatrices(headW, slitL), slitColor, 0);
    }
  }

  /** Which posed alien (by its order this frame) a ray hits, or -1. */
  pick(raycaster) {
    const meshes = [this.m.cranium, this.m.torso, this.m.bone, this.m.joint];
    for (const mesh of meshes) mesh.computeBoundingSphere();
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return -1;
    const h = hits[0];
    return Math.floor(h.instanceId / h.object.userData.per);
  }
}

/** Idle twitches: deterministic per alien, scheduled from a hash, never Math.random. */
export function twitchOffset(a, id, t, sp) {
  if (a.twitchNext == null) { a.twitchK = 0; a.twitchNext = a.born + sp.twitchEvery[0] + hash01(id, 0) * 3; }
  if (t >= a.twitchNext) {
    a.twitchT0 = t;
    a.twitchDir = hash01(id, a.twitchK + 0.5) < 0.5 ? -1 : 1;
    a.twitchK++;
    a.twitchNext = t + sp.twitchEvery[0] + hash01(id, a.twitchK) * (sp.twitchEvery[1] - sp.twitchEvery[0]);
  }
  if (a.twitchT0 == null) return 0;
  const k = (t - a.twitchT0) / 0.14;
  return k >= 1 ? 0 : a.twitchDir * 0.32 * Math.sin(Math.PI * k);
}
