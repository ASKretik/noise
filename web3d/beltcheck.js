// web3d/beltcheck.js -- 3d/belts.html: one district from each belt, side by side.
//
// A dev page for criterion 3D-12: is a red alien, a gold key, every coin value and a bolt
// readable on all ten palettes? Each panel stands at that district's spawn, faces its
// most open direction and puts one of each entity in the corridor ahead.

import * as THREE from 'three';
import { DIRS, isWalkable } from '../sim/grid.js';
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

const panels = [];
for (let b = 0; b < 10; b++) {
  const district = b * 10 + 1 + (new URLSearchParams(location.search).get('offset') | 0);
  const runner = new DistrictRunner({ profileId: 'beltcheck', district, tier: 'medium' });
  const { map } = runner.level;
  const scene = new THREE.Scene();
  const world = buildWorld(runner.level, { cellM: CELL_M });
  scene.add(world.group);
  lightScene(scene, world.palette, { cellM: CELL_M, mapW: map.w, mapH: map.h });

  const p = runner.game.player;
  let best = 0, bestRun = -1;
  for (let d = 0; d < 4; d++) {
    let k = 0;
    while (k < 14 && isWalkable(map, p.x + DIRS[d].dx * (k + 1), p.y + DIRS[d].dy * (k + 1))) k++;
    if (k > bestRun) { bestRun = k; best = d; }
  }
  const D = DIRS[best];
  const ahead = (k) => ({ x: p.x + D.dx * Math.min(k, bestRun), y: p.y + D.dy * Math.min(k, bestRun) });
  const side = { x: -D.dy, y: D.dx };
  const at = (k, s) => { const a = ahead(k); const c = { x: a.x + side.x * s, y: a.y + side.y * s }; return isWalkable(map, c.x, c.y) ? c : a; };
  const fake = {
    tick: 0, portalRevealed: false, portal: ahead(9),
    caches: [{ ...at(2, 0), collected: false }],
    coins: [1, 2, 5, 10].map((value, i) => ({ ...at(3, i - 1.5 > 0 ? 1 : -1), value, taken: false })).map((c, i) => ({ ...c, x: c.x + (i % 2 ? 0 : 0) })),
    bolts: [{ ...at(4, 1), taken: false }],
    patrols: [{ id: 1, ...ahead(6), prevX: ahead(6).x, prevY: ahead(6).y }],
  };
  fake.coins = [1, 2, 5, 10].map((value, i) => ({ ...at(3 + (i >> 1), i % 2 ? 1 : -1), value, taken: false }));
  const ents = new Entities(scene, { cellM: CELL_M });
  ents.reset(fake);
  ents.sync(fake, 1, 0.5);

  const cam = new THREE.PerspectiveCamera(60, 1, 0.05, 220);
  cam.rotation.order = 'YXZ';
  cam.position.set((p.x + 0.5) * CELL_M, EYE_M, (p.y + 0.5) * CELL_M);
  cam.rotation.set(-0.08, [0, -Math.PI / 2, Math.PI, Math.PI / 2][best], 0);
  panels.push({ district, scene, cam, name: world.palette.name });
}

function draw() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  const cols = 5, rows = 2, pw = Math.floor(w / cols), ph = Math.floor(h / rows);
  const calls = [];
  renderer.clear();
  panels.forEach((pn, i) => {
    const x = (i % cols) * pw, y = h - (Math.floor(i / cols) + 1) * ph;
    renderer.setViewport(x, y, pw - 2, ph - 2);
    renderer.setScissor(x, y, pw - 2, ph - 2);
    pn.cam.aspect = (pw - 2) / (ph - 2);
    pn.cam.updateProjectionMatrix();
    renderer.info.reset();
    renderer.render(pn.scene, pn.cam);
    calls.push(`${pn.name} D${pn.district}: ${renderer.info.render.calls} calls`);
  });
  document.getElementById('info').textContent =
    `Top row RUST TIDE MOSS EMBER VIOLET · bottom row ASH CORAL JADE SOLAR COBALT. In each: key, coins 1/2/5/10, bolt, alien.  ${calls.join(' · ')}`;
}
renderer.info.autoReset = false;
draw();
addEventListener('resize', draw);
