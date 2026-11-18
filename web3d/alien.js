// web3d/alien.js -- the alien body: geometry, materials and per-frame posing. Browser only.
//
// One skeleton, posed every frame by forward kinematics from a handful of angles:
//
//   head      a lathe cranium, a hinged jaw, almond eyes with red slits (three, for some)
//   torso     a lathe ribcage hunched forward of the pelvis, a thin neck
//   arms      shoulder -> elbow -> wrist, three long fingers
//   legs      digitigrade: hip -> knee (forward) -> ankle (back) -> toes (forward)
//
// What a species looks like is data (web3d/species.js): proportions, skin, marking
// pattern, motion style, and optional FEATURES, each one more instanced part --
//
//   gills     slits down the side of the head             Deep ones
//   web       membranes between the fingers               Deep ones
//   growths   fungal caps sprouting from the cranium      Sporelings
//   collar    a frill of fins that flares when hunting    Choristers
//   crest     fins along the crown                        Wardens
//   plates    armour on chest, shoulders and shins        Wardens
//   augments  metal bands and panels, segmented limbs     Architects
//
// Drawn BY PART across all aliens: one InstancedMesh per part type, so the draw-call cost
// is fixed per species (7 to 10) however many aliens there are.
//
// The skin carries the threat colour. Its markings glow red, and a red rim light traces
// the silhouette, both scaled by a per-instance glow (calm, hunting, stunned = dark), so
// every species reads as "red = alien" against every belt.

import * as THREE from 'three';
import { Rng, hashString } from '../sim/prng.js';

export const MAX_ALIENS = 48;
const BONES = 17;
const TEETH = 22;        // two rows of eleven, upper and lower
const DROOL = 8;         // four strands of saliva, two segments each
const TALONS = 6;        // a hooked talon on each finger
const JOINTS = 12;

const DOWN = new THREE.Vector3(0, -1, 0);
/** A strand of saliva: a unit cylinder hanging from the origin down -Y to -1. */
function droolGeometry() {
  const g = new THREE.CylinderGeometry(1, 1, 1, 5, 1);
  g.translate(0, -0.5, 0);
  return g;
}
/** A tooth: a thin cone, base at the origin, tip up +Y at 1. */
function teethGeometry() {
  const g = new THREE.ConeGeometry(1, 1, 6, 1);
  g.translate(0, 0.5, 0);
  return g;
}
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

/** A cheap deterministic hash in [0, 1) -- the same kind web/render.js uses for speckle. */
const hash01 = (a, b) => {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

// ------------------------------------------------------------------ skin

/** Mottled albedo plus a glow map in one of the marking styles, drawn from a seed. */
function skinTextures(style, seed) {
  const rng = new Rng(hashString(`markings:${seed}`), 'markings');
  const S = 256;
  const albedo = document.createElement('canvas');
  albedo.width = albedo.height = S;
  let g = albedo.getContext('2d');
  g.fillStyle = '#e6ebe4'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2200; i++) {
    const v = 190 + rng.int(65);
    g.fillStyle = `rgb(${v},${v + 4},${v})`;
    g.beginPath(); g.arc(rng.int(S), rng.int(S), 1 + rng.int(4), 0, Math.PI * 2); g.fill();
  }

  const glow = document.createElement('canvas');
  glow.width = glow.height = S;
  g = glow.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  const dot = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };

  switch (style) {
    case 'cracks': {                       // a branching network, lit from inside
      for (let i = 0; i < 16; i++) {
        let x = rng.int(S), y = rng.int(S), a = rng.float() * Math.PI * 2;
        g.lineWidth = 1.5 + rng.float() * 2.5;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 9; k++) {
          a += (rng.float() - 0.5) * 1.4;
          x += Math.cos(a) * 14; y += Math.sin(a) * 14;
          g.lineTo(x, y);
          if (rng.bool(0.25)) { g.moveTo(x, y); a += rng.bool(0.5) ? 1.2 : -1.2; }
        }
        g.stroke();
      }
      break;
    }
    case 'spots': {                        // fungal spots in clusters
      for (let c = 0; c < 9; c++) {
        const cx = rng.int(S), cy = rng.int(S);
        for (let i = 0; i < 6; i++) dot(cx + (rng.float() - 0.5) * 40, cy + (rng.float() - 0.5) * 40, 1.5 + rng.float() * 5);
      }
      break;
    }
    case 'stripes': {                      // lateral lines of pits, like a fish
      for (let i = 0; i < 6; i++) {
        const x = (i + 0.5) * (S / 6) + (rng.float() - 0.5) * 10;
        for (let y = 4; y < S; y += 11) dot(x + Math.sin(y / 30) * 4, y, 2.2);
      }
      break;
    }
    case 'ribs': {                         // thin bands across, like showing ribs
      g.lineWidth = 2;
      for (let y = 8; y < S; y += 15) {
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x / 20 + y) * 2);
        g.stroke();
      }
      break;
    }
    case 'circuits': {                     // right-angled traces with nodes
      g.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        let x = rng.int(S), y = rng.int(S);
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          if (rng.bool(0.5)) x += (rng.int(5) - 2) * 14; else y += (rng.int(5) - 2) * 14;
          g.lineTo(x, y);
        }
        g.stroke();
        dot(x, y, 3.5);
      }
      break;
    }
    case 'sigils': {                       // scattered glyphs: rings, bars, chevrons
      g.lineWidth = 2;
      for (let i = 0; i < 22; i++) {
        const x = rng.int(S), y = rng.int(S), k = rng.int(3);
        g.beginPath();
        if (k === 0) g.arc(x, y, 5, 0, Math.PI * 2);
        else if (k === 1) { g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.moveTo(x, y - 6); g.lineTo(x, y + 6); }
        else { g.moveTo(x - 6, y + 4); g.lineTo(x, y - 4); g.lineTo(x + 6, y + 4); }
        g.stroke();
      }
      break;
    }
    case 'rings': {                        // concentric rings
      g.lineWidth = 1.8;
      for (let i = 0; i < 9; i++) {
        const x = rng.int(S), y = rng.int(S);
        for (let r = 4; r < 22; r += 6) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); }
      }
      break;
    }
    default: {                             // 'veins': wavering stripes and paired pits
      for (let i = 0; i < 7; i++) {
        let x = rng.int(S);
        g.lineWidth = 1.5 + rng.float() * 2;
        g.beginPath(); g.moveTo(x, 0);
        for (let y = 0; y <= S; y += 16) { x += (rng.float() - 0.5) * 18; g.lineTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < 26; i++) {
        const x = rng.int(S), y = rng.int(S), r = 1.5 + rng.float() * 2;
        dot(x, y, r); dot(x + 7, y, r);
      }
    }
  }

  const tex = (cv) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return { albedo: tex(albedo), glow: tex(glow) };
}

/** Glow is per instance (`aGlow`): add it to any material's emission, plus a rim light. */
function withGlow(mat, colorHex, rim) {
  const rc = new THREE.Color(colorHex);
  const rimColor = `vec3(${rc.r.toFixed(3)}, ${rc.g.toFixed(3)}, ${rc.b.toFixed(3)})`;
  const rimS = rim.toFixed(3);
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
        totalEmissiveRadiance += ${rimColor} * rimF * ${rimS} * vGlow;
      }`);
  };
  mat.customProgramCacheKey = () => `alien-glow-${colorHex}-${rimS}-${mat.transparent}`;
  return mat;
}

function skinMaterial(sp) {
  const tex = skinTextures(sp.markings, sp.id);
  const m = sp.material;
  const translucent = (m.opacity ?? 1) < 1;
  return withGlow(new THREE.MeshStandardMaterial({
    color: 0xffffff, map: tex.albedo, roughness: m.roughness, metalness: m.metalness,
    emissive: sp.glowColor, emissiveMap: tex.glow, emissiveIntensity: m.emissiveIntensity,
    transparent: translucent, opacity: m.opacity ?? 1, depthWrite: !translucent,
  }), sp.glowColor, sp.rim);
}

// ------------------------------------------------------------------ geometry

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

/** A triangle with corners at the origin, +X and +Y: mapped onto any three points by a basis. */
function triangleGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  g.computeVertexNormals();
  return g;
}

/** A fin: base along X at y = 0, tip at (0, 1, 0). */
function finGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0, 0.3, 0.45, 0, -0.3, 0.45, 0], 3));
  g.setIndex([0, 1, 3, 0, 3, 4, 4, 3, 2]);
  g.computeVertexNormals();
  return g;
}

function craniumGeometry(sp) {
  const geo = new THREE.LatheGeometry(sp.cranium.map(([r, y]) => new THREE.Vector2(r, y)), 32);
  geo.rotateX(sp.craniumTip);
  geo.scale(sp.craniumScale[0], sp.craniumScale[1], sp.craniumScale[2]);
  geo.computeVertexNormals();
  return geo;
}

/** Direction of a limb: straight down, swung forward by ax (about X), splayed by az (about Z). */
function limbDir(out, ax, az) {
  const c = Math.cos(ax);
  return out.set(Math.sin(az) * c, -Math.cos(az) * c, -Math.sin(ax));
}

// ------------------------------------------------------------------ the kit

export class AlienKit {
  constructor(group, species) {
    this.sp = species;
    this.group = group;
    this.features = new Set(species.features.map((f) => f.type));
    this.feature = Object.fromEntries(species.features.map((f) => [f.type, f]));
    this.skin = skinMaterial(species);

    const cranium = craniumGeometry(species);
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
    const eyes = species.thirdEye ? 3 : 2;
    const joints = JOINTS + (species.segmented ? 8 : 0);

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
      joint: mk(joint, this.skin, joints, true),
      eye: mk(almondGeometry(), eyeMat, eyes, false),
      slit: mk(new THREE.SphereGeometry(1, 10, 8), slitMat, eyes, false),
      // the mouth: a dark gap that only opens when the jaw drops (the jumpscare)
      maw: mk(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 1, false),
      // a ring of needle teeth round the maw, drawn only while it is open
      // wet, glassy teeth: the cold key light in the attack catches every one
      teeth: mk(teethGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0.15, emissive: 0x2a2620 }), TEETH, false),
      drool: mk(droolGeometry(), new THREE.MeshStandardMaterial({ color: 0xd6eef2, roughness: 0.04, metalness: 0.1, emissive: 0x18262a, transparent: true, opacity: 0.7, depthWrite: false }), DROOL, false),
      talon: mk(teethGeometry(), new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.2, metalness: 0.3 }), TALONS, false),
    };

    // ---- feature parts, only the ones this species has
    // Feature parts keep the red rim on their edges but do not glow all over: a plate or a
    // fin lit solid red read as a red slab, not as armour.
    const glowMat = (opts) => withGlow(new THREE.MeshStandardMaterial({ emissive: species.glowColor, emissiveIntensity: 0.06, ...opts }), species.glowColor, species.rim * 0.6);
    if (this.features.has('gills')) this.m.gill = mk(new THREE.SphereGeometry(1, 8, 6), slitMat, 6, false);
    if (this.features.has('web')) {
      this.m.web = mk(triangleGeometry(), glowMat({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, roughness: 0.3, depthWrite: false }), 4, true);
    }
    if (this.features.has('growths')) {
      const f = this.feature.growths;
      this.m.growth = mk(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), glowMat({ color: 0xffffff, roughness: 0.85 }), f.count, true);
      // fixed spots on the upper half of this species' cranium, chosen by seed
      const p = cranium.attributes.position;
      const rng = new Rng(hashString(`growths:${species.id}`), 'growths');
      const top = [];
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.18) top.push(i);
      this.growthSpots = Array.from({ length: f.count }, () => {
        const i = top[rng.int(top.length)];
        const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
        const n = v.clone().sub(new THREE.Vector3(0, 0.18, 0.04)).normalize();
        return { at: v.addScaledVector(n, -0.012), n, r: 0.04 + rng.float() * 0.06, h: 0.7 + rng.float() * 1.0 };
      });
    }
    if (this.features.has('collar')) {
      this.m.fin = mk(finGeometry(), glowMat({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.55 }), this.feature.collar.fins, true);
    }
    if (this.features.has('crest')) {
      // horns along the crown: a fin seen from the front is edge-on and invisible
      const horn = new THREE.ConeGeometry(1, 1, 10);
      horn.translate(0, 0.5, 0);
      this.m.horn = mk(horn, glowMat({ color: 0xffffff, roughness: 0.4, metalness: 0.2 }), this.feature.crest.fins, true);
    }
    if (this.features.has('plates')) {
      this.m.plate = mk(new THREE.BoxGeometry(1, 1, 1), glowMat({ color: 0xffffff, roughness: 0.45, metalness: 0.35 }), 8, true);
    }
    if (this.features.has('augments')) {
      this.m.band = mk(new THREE.CylinderGeometry(1, 1, 1, 14, 1), new THREE.MeshStandardMaterial({ color: this.feature.augments.color, roughness: 0.28, metalness: 0.9 }), 8, false);
      this.m.panel = mk(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: this.feature.augments.color, roughness: 0.3, metalness: 0.85 }), 3, false);
    }
    this.n = Object.fromEntries(Object.keys(this.m).map((k) => [k, 0]));

    // The third eye sits ON the brow: find the cranium's front surface at that height
    // rather than trusting a hand-picked depth (a taller head put it inside the skull).
    if (species.thirdEye) {
      const p = cranium.attributes.position;
      let front = 0;
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(p.getX(i)) < 0.04 && Math.abs(p.getY(i) - species.thirdEye.y) < 0.04) front = Math.min(front, p.getZ(i));
      }
      this.thirdEyeZ = front + species.eye.d * species.thirdEye.scale * 0.35;
    }
    // The mouth opens in the face just above the jaw hinge: measure where the face is there.
    {
      const p = cranium.attributes.position;
      let front = 0;
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(p.getX(i)) < 0.03 && Math.abs(p.getY(i) + 0.02) < 0.03) front = Math.min(front, p.getZ(i));
      }
      this.mouthZ = front;
    }
    // The crest's horns run along the crown: the topmost points of the midline.
    if (this.features.has('crest')) {
      const p = cranium.attributes.position;
      const mid = [];
      for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) < 0.01) mid.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
      const top = mid.reduce((m, v) => (v.y > m.y ? v : m), mid[0]);
      const pick = (dz) => mid.filter((v) => v.y > top.y - 0.12).reduce((m, v) => ((v.z - top.z) * dz > (m.z - top.z) * dz ? v : m), top);
      this.crownLine = { a: pick(-1), b: pick(1), c: new THREE.Vector3(0, top.y - 0.3, top.z) };
    }
    // Gills likewise sit on the side of the head, wherever this species' head is.
    if (this.features.has('gills')) {
      const p = cranium.attributes.position;
      let side = 0;
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(p.getY(i) + 0.01) < 0.04 && Math.abs(p.getZ(i)) < 0.06) side = Math.max(side, Math.abs(p.getX(i)));
      }
      this.gillX = side;
    }

    // scratch
    this._m = new THREE.Matrix4(); this._l = new THREE.Matrix4(); this._h = new THREE.Matrix4();
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._d = new THREE.Vector3();
    this._c = new THREE.Color(); this._fc = new THREE.Color();
    this._p = Array.from({ length: 24 }, () => new THREE.Vector3());
  }

  /** Draw calls this species costs, for the record. */
  get drawCalls() { return Object.keys(this.m).length; }

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

  /** The unscaled frame of a segment from a to b: origin at a, local -Y pointing at b. */
  _frame(base, a, b) {
    const d = this._d.subVectors(b, a);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(DOWN, d.multiplyScalar(1 / Math.max(len, 1e-6)));
    return { M: new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1))), len };
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

  /** Something placed in a segment's frame: t along it (0..1), offset, size, rotation. */
  _onSegment(kind, seg, t, off, size, color, glow, rot = null) {
    const L = new THREE.Matrix4().compose(
      new THREE.Vector3(off[0], -t * seg.len + off[1], off[2]),
      rot || new THREE.Quaternion(), new THREE.Vector3(size[0], size[1], size[2]),
    );
    this._put(kind, new THREE.Matrix4().multiplyMatrices(seg.M, L), color, glow);
  }

  /**
   * Pose one alien.
   * @param {THREE.Matrix4} base  world transform at the feet, facing -z
   * @param {object} st  { gait, look, tilt, pitch, jaw, convulse, t, inert, hunting, seed, flare }
   */
  pose(base, st) {
    const sp = this.sp, mo = sp.motion;
    const seed = st.seed || 0;
    const tint = this._c.set(st.inert ? sp.skin.stunned : st.hunting ? sp.skin.hunting : sp.skin.calm);
    if (st.skinK != null) tint.multiplyScalar(st.skinK);   // the attack: near-black skin, lit only where the light hits
    let glow = st.inert ? sp.glow.stunned : st.hunting ? sp.glow.hunting * (0.85 + 0.15 * Math.sin(st.t * 6)) : sp.glow.calm;
    if (mo.flicker && !st.inert) glow *= 1 - mo.flicker * (0.5 + 0.5 * Math.sin(st.t * 23 + seed) * Math.sin(st.t * 7.1 + seed * 2));
    if (mo.shimmer && !st.inert) glow *= 1 + mo.shimmer * Math.sin(st.t * 4 + seed);
    // close up (the jumpscare) a full-strength glow and rim flatten the face to one red; dim them
    if (st.glowK != null) glow *= st.glowK;
    const P = this._p;
    // Husks move in jerks: the gait advances in steps instead of smoothly.
    const gait = mo.jerk ? Math.round(st.gait * 2.2) / 2.2 : st.gait;
    const swing = st.inert ? 0 : Math.sin(gait);
    const jit = (k) => (st.convulse > 0 ? Math.sin(st.t * 57 + k * 2.1) * 0.35 * st.convulse : 0);
    const sway = mo.sway && !st.inert ? Math.sin(st.t * 0.9 + seed) * mo.sway : 0;

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
      const lift = Math.max(0, ph) * 0.05;           // the foot in its forward swing lifts
      ankle.y += lift; toe.y += lift;
      legs.push({ s, hip, knee, ankle, toe });
      minY = Math.min(minY, toe.y - lift, ankle.y - lift);
    }
    const drop = minY;
    const shift = (v) => { v.y -= drop; return v; };
    shift(pelvis);
    for (const L of legs) { shift(L.hip); shift(L.knee); shift(L.ankle); shift(L.toe); }

    const chest = P[1].set(sway * 0.6, sp.chest.y - drop, sp.chest.z);
    const neckTop = P[2].set(sway, sp.neckTop.y - drop, sp.neckTop.z);
    chest.x += jit(5) * 0.08;

    // ---- torso and neck
    this._bone(base, chest, pelvis, sp.torso.r, sp.torso.r * sp.torso.depth, tint, glow, 'torso');
    this._bone(base, neckTop, chest, sp.neckR, sp.neckR, tint, glow);
    const torsoSeg = this._frame(base, chest, pelvis);

    // ---- legs
    const legSegs = [];
    for (const L of legs) {
      this._bone(base, L.hip, L.knee, sp.thigh.r, sp.thigh.r, tint, glow);
      this._bone(base, L.knee, L.ankle, sp.shin.r, sp.shin.r, tint, glow);
      this._bone(base, L.ankle, L.toe, sp.foot.r, sp.foot.r * 0.8, tint, glow);
      this._joint(base, L.hip, sp.thigh.r * sp.jointR, tint, glow);
      this._joint(base, L.knee, sp.shin.r * 1.18, tint, glow);
      this._joint(base, L.ankle, sp.foot.r * 1.15, tint, glow);
      if (sp.segmented) {
        this._joint(base, L.hip.clone().lerp(L.knee, 0.5), sp.thigh.r * 1.12, tint, glow);
        this._joint(base, L.knee.clone().lerp(L.ankle, 0.5), sp.shin.r * 1.12, tint, glow);
      }
      legSegs.push({ s: L.s, thigh: this._frame(base, L.hip, L.knee), shin: this._frame(base, L.knee, L.ankle) });
    }

    // ---- arms: counter-swing to the legs, long and slightly splayed
    const armSegs = [];
    for (const s of [-1, 1]) {
      const ph = s < 0 ? -swing : swing;
      // st.reach (0..1, the capture cutscene): both arms come up and forward, for you
      const reach = st.reach || 0;
      const aU = (0.14 + 0.32 * ph + jit(10 + s)) * (1 - reach) + 1.72 * reach;   // up, toward your face
      const aF = (aU + 0.55 + jit(12 + s) * 0.5) * (1 - reach) + (aU + 0.05) * reach;
      const shoulder = new THREE.Vector3(s * sp.shoulderX + sway * 0.6, chest.y - 0.05, chest.z + 0.02);
      const elbow = shoulder.clone().addScaledVector(limbDir(this._d, aU, s * (0.16 - 0.1 * reach)), sp.upperArm.len);
      const wrist = elbow.clone().addScaledVector(limbDir(this._d, aF, s * (0.1 + 0.32 * reach)), sp.forearm.len);
      // st.claw (0..1, the attack): arms flung out and up, forearms and splayed claws
      // thrust at you; st.swipe (0..1) rakes the forearms in across the face.
      const claw = st.claw || 0, swipe = st.swipe || 0;
      let clawFore = null;
      if (claw > 0) {
        const up = new THREE.Vector3(s * 0.8, 0.38, -0.45).normalize();
        const eC = shoulder.clone().addScaledVector(up, sp.upperArm.len);
        clawFore = new THREE.Vector3(s * 0.2, 0.3, -1).normalize()
          .lerp(new THREE.Vector3(-s * 0.9, 0.08, -0.45).normalize(), swipe).normalize();
        const wC = eC.clone().addScaledVector(clawFore, sp.forearm.len);
        elbow.lerp(eC, claw);
        wrist.lerp(wC, claw);
      }
      this._bone(base, shoulder, elbow, sp.upperArm.r, sp.upperArm.r, tint, glow);
      this._bone(base, elbow, wrist, sp.forearm.r, sp.forearm.r, tint, glow);
      this._joint(base, shoulder, sp.upperArm.r * 1.25, tint, glow);
      this._joint(base, elbow, sp.forearm.r * 1.2, tint, glow);
      this._joint(base, wrist, sp.forearm.r * 1.1, tint, glow);
      if (sp.segmented) {
        this._joint(base, shoulder.clone().lerp(elbow, 0.5), sp.upperArm.r * 1.12, tint, glow);
        this._joint(base, elbow.clone().lerp(wrist, 0.5), sp.forearm.r * 1.12, tint, glow);
      }
      const tips = [];
      const side = clawFore ? new THREE.Vector3().crossVectors(clawFore, AY).normalize() : null;
      const curl = clawFore ? new THREE.Vector3().crossVectors(side, clawFore).normalize() : null;
      for (const k of [-1, 0, 1]) {
        const tip = wrist.clone().addScaledVector(limbDir(this._d, aF + 0.22, s * 0.1 + k * sp.finger.spread), sp.finger.len);
        let fd = null;
        if (clawFore) {
          // splayed wide, hooked a little down, a quarter longer: claws, not fingers
          fd = clawFore.clone().addScaledVector(side, k * 0.55).addScaledVector(curl, -0.3).normalize();
          tip.lerp(wrist.clone().addScaledVector(fd, sp.finger.len * 1.25), claw);
        }
        this._bone(base, wrist, tip, sp.finger.r, sp.finger.r, tint, glow);
        if (fd && claw > 0.3) {
          const tq = new THREE.Quaternion().setFromUnitVectors(AY, fd.clone().addScaledVector(curl, -0.35).normalize());
          this._put('talon', this._m.multiplyMatrices(base, new THREE.Matrix4().compose(tip, tq, this._s.set(sp.finger.r * 0.95, 0.075 * claw, sp.finger.r * 0.95))), null, 0);
        }
        tips.push(tip);
      }
      armSegs.push({ s, upper: this._frame(base, shoulder, elbow), fore: this._frame(base, elbow, wrist), wrist, tips });
    }

    // ---- head: look toward what it hears, tilt, twitch; jaw hinged under the chin
    const head = this._h.compose(neckTop, this._q.setFromAxisAngle(AY, st.look + jit(20) * 0.5)
      .multiply(this._q2.setFromAxisAngle(AZ, st.tilt + sway * 1.5))
      .multiply(new THREE.Quaternion().setFromAxisAngle(AX, st.pitch)), this._s.setScalar(1));
    const headW = new THREE.Matrix4().multiplyMatrices(base, head);
    this._put('cranium', headW, tint, glow);

    // hinged at the front of the chin; a negative turn about X drops it down and forward
    const jawM = new THREE.Matrix4().makeTranslation(0, -0.07, this.mouthZ + 0.03)
      .multiply(new THREE.Matrix4().makeRotationX(-st.jaw))
      .multiply(new THREE.Matrix4().compose(this._v.set(0, -0.015, -0.05), this._q.identity(), this._s.set(0.085, 0.06, 0.1)));
    this._put('jaw', this._m.multiplyMatrices(headW, jawM), tint, glow);
    const open = Math.max(0, st.jaw);
    // A dark, tall, screaming gullet with only a dim red deep inside. Once it opens: two
    // rows of long wet teeth, fangs at the corners, angled out at you, and strands of
    // saliva stretched between them.
    const mw = 0.026 + 0.03 * open, mh = 0.0005 + 0.07 * open, my = -0.005 - 0.03 * open, mz = this.mouthZ - 0.006;
    const mawM = new THREE.Matrix4().compose(this._v.set(0, my, mz), this._q.identity(), this._s.set(mw, mh, 0.016));
    this._put('maw', this._m.multiplyMatrices(headW, mawM), new THREE.Color(0x030001).lerp(new THREE.Color(sp.glowColor), 0.06 * open), 0);
    if (open > 0.15) {
      const k = Math.min(1, (open - 0.15) / 0.45);
      const ivory = new THREE.Color(0xf0e6cc), stain = new THREE.Color(0x9a6a44);
      const H = TEETH / 2;
      for (let i = 0; i < TEETH; i++) {
        const top = i < H, j = i % H;
        const u = ((j + 0.5) / H * 2 - 1) * 0.9;                       // -0.9 .. 0.9 across the mouth
        const edge = Math.sqrt(Math.max(0, 1 - u * u));
        const fang = Math.exp(-(((Math.abs(u) - 0.55) / 0.12) ** 2));   // the corners
        const len = (0.016 + 0.014 * edge + 0.03 * fang + 0.006 * hash01(i, 5)) * k * (top ? 1 : 0.85);
        const dir = this._d.set(-u * 0.12, top ? -1 : 1, -0.38).normalize();
        const q = this._q.setFromUnitVectors(AY, dir);
        const r = (0.0042 + 0.003 * fang) * k + 0.0005;
        const L = new THREE.Matrix4().compose(this._v.set(u * mw, my + (top ? 1 : -1) * mh * edge * 0.97, mz - 0.008), q, this._s.set(r, len, r));
        this._put('teeth', this._m.multiplyMatrices(headW, L), ivory.clone().lerp(stain, 0.4 * hash01(i, 9)), 0);
      }
      if (open > 0.35) {
        for (let n = 0; n < 4; n++) {
          const u = [-0.55, -0.12, 0.3, 0.66][n];
          const edge = Math.sqrt(1 - u * u);
          const a = new THREE.Vector3(u * mw, my + mh * edge * 0.8, mz - 0.012);
          const b = new THREE.Vector3((u + 0.08) * mw, my - mh * edge * 0.75, mz - 0.012);
          const mid = a.clone().lerp(b, 0.55).add(this._v.set(0.004 * (n - 1.5), -0.012, -0.012));
          const rr = 0.0013 + 0.0008 * hash01(n, 3);
          for (const [p, q2] of [[a, mid], [mid, b]]) {
            const d = q2.clone().sub(p);
            const len = d.length();
            const M = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(DOWN, d.normalize()), new THREE.Vector3(rr, len, rr));
            this._put('drool', this._m.multiplyMatrices(headW, M), null, 0);
          }
        }
      }
    }
    // where its face is in the body's frame, so the attack can pin the face to your view
    this.faceLocal = (this.faceLocal || new THREE.Vector3()).set(0, sp.eye.y * 0.55, this.mouthZ).applyMatrix4(head);

    const e = sp.eye, sl = sp.slit;
    // st.dilate (the jumpscare): the slits pinch to burning needles
    const dil = st.dilate || 0;
    const slitColor = new THREE.Color(st.inert ? 0x1a0508 : sp.glowColor).multiplyScalar(1 + 1.5 * dil);
    const putEye = (frame, slant, k, stare = 0) => {
      const eyeL = frame.clone()
        .multiply(new THREE.Matrix4().makeRotationZ(slant))
        .multiply(new THREE.Matrix4().makeScale(e.w * k, e.h * k, e.d * k));
      this._put('eye', this._m.multiplyMatrices(headW, eyeL), null, 0);
      // just in front of the eye's surface, upright like a cat's pupil
      // dilate also turns the slits from their wrapped-round rest to stare straight at you
      const slitL = frame.clone()
        .multiply(new THREE.Matrix4().makeRotationY(stare * 0.9))
        .multiply(new THREE.Matrix4().compose(this._v.set(0, 0, -(e.d * k + 0.004)), this._q.identity(), this._s.set(sl.w * k * (1 - 0.55 * dil), sl.h * k * (1 + 0.2 * dil), sl.d)));
      this._put('slit', this._m.multiplyMatrices(headW, slitL), slitColor, 0);
    };
    for (const s of [-1, 1]) {
      putEye(new THREE.Matrix4().compose(this._v.set(s * e.x, e.y, e.z), this._q.setFromAxisAngle(AY, -s * e.wrap), this._s.setScalar(1)), s * e.slant, 1, s * e.wrap * dil);
    }
    if (sp.thirdEye) {
      const te = sp.thirdEye;
      putEye(new THREE.Matrix4().compose(this._v.set(0, te.y, this.thirdEyeZ), this._q.setFromAxisAngle(AX, 0.35), this._s.setScalar(1)), Math.PI / 2, te.scale);
    }

    // ---- features
    const fc = this._fc;
    if (this.m.gill) {
      const gc = new THREE.Color(st.inert ? 0x1a0508 : sp.glowColor).multiplyScalar(0.75);
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const L = new THREE.Matrix4().compose(this._v.set(s * (this.gillX - 0.004), -0.01 - k * 0.006, -0.03 + k * 0.032),
            this._q.setFromAxisAngle(AY, 0), this._s.set(0.008, 0.05, 0.007));
          this._put('gill', new THREE.Matrix4().multiplyMatrices(headW, L), gc, 0);
        }
      }
    }
    if (this.m.web) {
      fc.copy(tint).multiplyScalar(0.85);
      for (const A of armSegs) {
        for (let k = 0; k < 2; k++) {
          const u = A.tips[k].clone().sub(A.wrist), v = A.tips[k + 1].clone().sub(A.wrist);
          const n = u.clone().cross(v).normalize().multiplyScalar(0.001);
          // shrink toward the wrist a little, so the web is a membrane, not a paddle
          u.multiplyScalar(0.82); v.multiplyScalar(0.82);
          const M = new THREE.Matrix4().makeBasis(u, v, n).setPosition(A.wrist);
          this._put('web', new THREE.Matrix4().multiplyMatrices(base, M), fc, glow * 0.6);
        }
      }
    }
    if (this.m.growth) {
      fc.set(st.inert ? 0x6a6550 : 0xe3d6a4);
      for (const g of this.growthSpots) {
        const q = new THREE.Quaternion().setFromUnitVectors(AY, g.n);
        const L = new THREE.Matrix4().compose(g.at, q, this._s.set(g.r, g.r * g.h, g.r));
        this._put('growth', new THREE.Matrix4().multiplyMatrices(headW, L), fc, glow * 0.8);
      }
    }
    if (this.m.fin) {
      // A frilled lizard's ruff: a fan of petals behind the head, facing forward. Calm, it
      // folds back flat against the neck; hunting, it opens round the head.
      const f = this.feature.collar;
      fc.set(st.inert ? 0x5a4a50 : f.color);
      const open = st.inert ? 0 : (st.flare ?? (st.hunting ? 1 : 0));
      const ring = new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().makeTranslation(neckTop.x, neckTop.y - 0.06, neckTop.z + 0.06));
      const back = new THREE.Vector3(0, -0.25, 1).normalize();
      for (let i = 0; i < f.fins; i++) {
        const a = -2.0 + (4.0 * i) / (f.fins - 1);          // round the head, from shoulder to shoulder
        const radial = new THREE.Vector3(Math.sin(a), Math.cos(a), 0);
        const tip = radial.clone().multiplyScalar(open).addScaledVector(back, 1 - open).normalize();
        const width = tip.clone().cross(new THREE.Vector3(0, 0, 1));
        if (width.lengthSq() < 1e-6) width.set(1, 0, 0);
        width.normalize();
        const n = width.clone().cross(tip).normalize().multiplyScalar(0.001);
        const M = new THREE.Matrix4().makeBasis(width.multiplyScalar(0.17), tip.clone().multiplyScalar(0.2 + 0.2 * open), n)
          .setPosition(radial.multiplyScalar(0.06));
        this._put('fin', new THREE.Matrix4().multiplyMatrices(ring, M), fc, glow * 0.7);
      }
    }
    if (this.m.horn) {
      const f = this.feature.crest;
      fc.set(st.inert ? 0x3a4440 : f.color);
      // the crown runs from the brow up and back over the tipped dome
      const p = this.crownLine;
      for (let i = 0; i < f.fins; i++) {
        const k = f.fins === 1 ? 0.5 : i / (f.fins - 1);
        const at = p.a.clone().lerp(p.b, k);
        // staggered left and right, leaning out, so the row reads as a crown from the front
        const side = (i % 2 ? 1 : -1) * (f.fins > 1 ? 1 : 0);
        at.x += side * 0.075;
        const n = at.clone().sub(p.c).normalize().add(new THREE.Vector3(side * 0.45, 0, 0)).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(AY, n);
        const h = 0.13 + 0.07 * Math.sin(Math.PI * k);
        const L = new THREE.Matrix4().compose(at.addScaledVector(n, -0.01), q, this._s.set(0.035, h, 0.035));
        this._put('horn', new THREE.Matrix4().multiplyMatrices(headW, L), fc, glow * 0.5);
      }
    }
    if (this.m.plate) {
      fc.set(st.inert ? 0x2c3330 : this.feature.plates.color);
      const r = sp.torso.r;
      for (const s of [-1, 1]) {
        // two pectoral plates angled round the chest, not one flat square
        this._onSegment('plate', torsoSeg, 0.26, [s * r * 0.45, 0, -r * sp.torso.depth * 0.82], [r * 0.85, torsoSeg.len * 0.32, 0.03], fc, glow * 0.4,
          new THREE.Quaternion().setFromAxisAngle(AY, s * 0.38));
      }
      for (const A of armSegs) this._onSegment('plate', A.upper, 0.12, [A.s * sp.upperArm.r * 0.9, 0, 0], [0.03, 0.14, 0.11], fc, glow * 0.4);
      for (const A of armSegs) this._onSegment('plate', A.fore, 0.5, [0, 0, -sp.forearm.r * 0.9], [0.07, 0.2, 0.02], fc, glow * 0.4);
      for (const Lg of legSegs) this._onSegment('plate', Lg.shin, 0.45, [0, 0, -sp.shin.r * 0.95], [0.08, 0.22, 0.025], fc, glow * 0.4);
    }
    if (this.m.band) {
      for (const A of armSegs) {
        this._onSegment('band', A.upper, 0.5, [0, 0, 0], [sp.upperArm.r * 1.35, 0.055, sp.upperArm.r * 1.35]);
        this._onSegment('band', A.fore, 0.5, [0, 0, 0], [sp.forearm.r * 1.4, 0.06, sp.forearm.r * 1.4]);
      }
      for (const Lg of legSegs) {
        this._onSegment('band', Lg.thigh, 0.5, [0, 0, 0], [sp.thigh.r * 1.3, 0.06, sp.thigh.r * 1.3]);
        this._onSegment('band', Lg.shin, 0.5, [0, 0, 0], [sp.shin.r * 1.35, 0.06, sp.shin.r * 1.35]);
      }
      // a plate over one temple, and one down the sternum
      const temple = new THREE.Matrix4().compose(this._v.set(0.235 * sp.craniumScale[0], 0.22, 0.06), this._q.setFromAxisAngle(AY, 0.25), this._s.set(0.025, 0.16, 0.2));
      this._put('panel', new THREE.Matrix4().multiplyMatrices(headW, temple));
      this._onSegment('panel', torsoSeg, 0.3, [0, 0, -sp.torso.r * sp.torso.depth * 0.95], [0.05, torsoSeg.len * 0.5, 0.02]);
      this._onSegment('panel', torsoSeg, 0.3, [0, 0, sp.torso.r * sp.torso.depth * 0.95], [0.12, torsoSeg.len * 0.35, 0.02]);
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
