import assert from 'node:assert/strict';
import test from 'node:test';
import {Scene, Vector3} from 'three';
import {createPracticeRange, traceRangeSegment} from '../src/3dmap/combat/range.js';
import {MAPS, rectPoly} from '../src/3dmap/maps/atlas.js';
import {buildMap, createMaterials} from '../src/3dmap/maps/model.js';
import {spawnPosition} from '../src/3dmap/maps/navigation.js';
import {createPhysicsWorld, PLAYER} from '../src/3dmap/maps/physics.js';
import {createCanvasDocument} from './helpers/canvasDocument.js';
import {bundledPropLibrary} from './helpers/propLibrary.js';

const fixture = {
  id: 'fixture', origin: [0, 0], scale: 1, theme: 'coastal',
  outer: rectPoly([-24, -24, 48, 48]),
  floorHoles: [], stairs: [], additionalFloors: [], bridges: [], rooms: [],
};

function fireAt(range, origin, point, frames = 8) {
  const direction = point.clone().sub(origin).normalize();
  range.fire({origin, direction, speed: 145, gravity: 7, range: 150, bodyDamage: 72, headDamage: 140, color: 0xaca1ff});
  for (let i = 0; i < frames; i++) range.update(1 / 60, origin);
}

test('a shot hits the nearest wall or floor and passes through an open doorway', () => {
  const wall = (from, to) => ({kind: 'wall', a: [from, -3], b: [to, -3], thickness: .09, bottom: 0, top: 3});
  const world = createPhysicsWorld(fixture, [wall(-5, -1), wall(1, 5)]);
  const eye = new Vector3(2, PLAYER.eye, 0);
  const distance = traceRangeSegment(world, eye, new Vector3(2, PLAYER.eye, -8));
  assert.ok(distance !== null && Math.abs(distance * 8 - 2.955) < .002);
  assert.equal(traceRangeSegment(world, new Vector3(0, PLAYER.eye, 0), new Vector3(0, PLAYER.eye, -8)), null);
  const floor = traceRangeSegment(world, eye, new Vector3(2, -PLAYER.eye, 0));
  assert.ok(floor !== null && Math.abs(floor - .5) < .002);
});

test('cover blocks practice damage, while a clear critical shot eliminates a robot and it respawns', () => {
  const wall = {kind: 'wall', a: [2, -12], b: [2, -6], thickness: .10, bottom: 0, top: 3};
  const scene = new Scene();
  const hits = [];
  const range = createPracticeRange(scene, createPhysicsWorld(fixture, [wall]), {onHit: event => hits.push(event)});
  const eye = new Vector3(0, PLAYER.eye, 0);
  range.reset(eye);
  range.setVisible(true);

  const rangeGroup = scene.children[0];
  const robot = rangeGroup.children[0];
  let head;
  robot.traverse(part => {
    if (!head && part.userData.rangeHit?.zone === 'head') head = part;
  });
  const point = new Vector3();
  fireAt(range, new Vector3(4, PLAYER.eye, -8), head.getWorldPosition(point));
  assert.equal(hits.length, 0);
  fireAt(range, eye, head.getWorldPosition(point));
  assert.deepEqual(hits, [{damage: 140, critical: true, killed: true}]);
  assert.equal(robot.visible, false);

  for (let i = 0; i < 125; i++) range.update(1 / 60, eye);
  assert.equal(robot.visible, true);
  range.setVisible(false);
  assert.equal(rangeGroup.children.length, range.targetCount);
  range.dispose();
  assert.equal(scene.children.length, 0);
});

test('all three practice entry points have three robots on the actual map geometry', async () => {
  globalThis.document = createCanvasDocument();
  const assets = await bundledPropLibrary();
  const scans = Object.fromEntries(['wall', 'concrete', 'steel', 'rock', 'metal'].map(name => [name, {}]));
  for (const map of Object.values(MAPS)) {
    const materials = createMaterials(scans, map.theme);
    const model = buildMap(map, materials, {mobile: true, assets});
    const world = createPhysicsWorld(map, model.colliders);
    const range = createPracticeRange(new Scene(), world);
    range.reset(new Vector3(...spawnPosition(map, 'attacker', model.colliders)));
    assert.equal(range.targetCount, 3, map.id);
    range.dispose();
    model.dispose();
    Object.values(materials).forEach(material => material.dispose());
  }
});
