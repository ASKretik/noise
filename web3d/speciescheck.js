// web3d/speciescheck.js -- 3d/species.html: the ten alien species side by side.
//
// A dev page for reviewing N2: each panel is the first district of a belt, with that belt's
// species standing three metres away, turned three-quarters, hunting, and close enough to
// hear you -- so its head is turned to stare at the camera. Draw calls per species are
// printed under the grid.

import * as THREE from 'three';
import { DIRS, TILE } from '../sim/grid.js';
import { CELL_M, EYE_M } from '../sim3d/units.js';
import { buildWorld, lightScene } from './world.js';
import { Entities } from './entities.js';
import { DistrictRunner } from './runner.js';

const canvas = document.getElementById('grid');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setScissorTest(true);
renderer.autoClear = false;
renderer.info.autoReset = false;

// ?b=N shows one belt full-size; ?d=cells sets the distance (default 2).
const q = new URLSearchParams(location.search);
const only = q.get('b') != null ? Number(q.get('b')) : null;
const dist = Number(q.get('d')) || 2;
const panels = [];
for (let b = 0; b < 10; b++) {
  if (only != null && b !== only) continue;
  const district = b * 10 + 1;
  const runner = new DistrictRunner({ profileId: 'speciescheck', district, tier: 'medium' });
  const { map } = runner.level;
  const scene = new THREE.Scene();
  const world = buildWorld(runner.level, { cellM: CELL_M });
  scene.add(world.group);
  lightScene(scene, world.palette, { cellM: CELL_M, mapW: map.w, mapH: map.h });

  // the most open direction from the spawn; the alien stands two cells along it
  const p = runner.game.player;
  let best = 0, bestRun = -1;
  for (let d = 0; d < 4; d++) {
    let k = 0;
    // open floor only: looking through a black box would hide what is being reviewed
    const open = (t) => t === TILE.FLOOR || t === TILE.COVER;
    while (k < 10 && open(map.tiles[(p.y + DIRS[d].dy * (k + 1)) * map.w + p.x + DIRS[d].dx * (k + 1)])) k++;
    if (k > bestRun) { bestRun = k; best = d; }
  }
  const D = DIRS[best];
  const at = { x: p.x + D.dx * Math.min(Math.ceil(dist), bestRun), y: p.y + D.dy * Math.min(Math.ceil(dist), bestRun) };
  const cam = new THREE.PerspectiveCamera(46, 1, 0.05, 220);
  cam.rotation.order = 'YXZ';
  const back = Math.ceil(dist) - dist;      // fractional distances move the camera forward
  cam.position.set((p.x + 0.5 + D.dx * back) * CELL_M, EYE_M - 0.15, (p.y + 0.5 + D.dy * back) * CELL_M);
  const yaw = [0, -Math.PI / 2, Math.PI, Math.PI / 2][best];
  cam.rotation.set(Number(q.get('pitch')) || -0.08, yaw, 0);
  cam.updateMatrixWorld();

  const fake = {
    tick: 0, portalRevealed: false, portal: at, caches: [], coins: [], bolts: [],
    player: { x: p.x, y: p.y }, effectiveRadius: 4.6,
    params: { chaseMovePeriod: 2, patrolMovePeriod: 2.5 },
    patrols: [{ id: 1, x: at.x, y: at.y, mode: q.get('calm') ? 'patrol' : 'hunt' }],
  };
  const ents = new Entities(scene, { cellM: CELL_M, district });
  ents.reset(fake);
  for (let i = 0; i < 40; i++) {
    ents.sync(fake, 1, 2 + i / 60, { dt: 1 / 60, camera: cam });
    const v = ents.vis.get(1);
    v.born = -10; v.twitchNext = 1e9;
    v.heading = yaw + Math.PI + 0.6;          // three-quarters on; the head turns the rest
  }
  panels.push({ district, scene, cam, name: ents.species.name, belt: world.palette.name, calls: ents.kit.drawCalls });
}

function draw() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  const cols = only != null ? 1 : 5, rows = only != null ? 1 : 2, pw = Math.floor(w / cols), ph = Math.floor(h / rows);
  renderer.clear();
  panels.forEach((pn, i) => {
    const x = (i % cols) * pw, y = h - (Math.floor(i / cols) + 1) * ph;
    renderer.setViewport(x, y, pw - 2, ph - 2);
    renderer.setScissor(x, y, pw - 2, ph - 2);
    pn.cam.aspect = (pw - 2) / (ph - 2);
    pn.cam.updateProjectionMatrix();
    renderer.render(pn.scene, pn.cam);
  });
  document.getElementById('info').textContent = panels
    .map((pn) => `${pn.belt} D${pn.district}: ${pn.name} (${pn.calls} draw calls for any number)`).join(' · ');
}
draw();
addEventListener('resize', draw);
