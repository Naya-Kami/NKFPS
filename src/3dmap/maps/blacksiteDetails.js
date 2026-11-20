import * as THREE from 'three';
import {pointInPolygon, segmentPointDistance} from './atlas.js';

const TOP_OF_PAINT = .018;
const PIER_DECK = -2.5;

function hash(x, y) {
  const seed = Math.imul(x + 11, 1597334677) ^ Math.imul(y + 17, 3812015801);
  return (Math.imul(seed ^ (seed >>> 16), 2246822519) >>> 0) / 4294967296;
}

function paintTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fine = hash(x, y);
      const chips = hash(x >> 1, y >> 1);
      const patch = hash(x >> 3, y >> 3);
      const value = Math.round(164 + 59 * fine + 32 * patch);
      const offset = (y * size + x) * 4;
      data.set([value, value, value, chips < .065 + .08 * patch ? 0 : 255], offset);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function addBlacksiteDetails(map, mats, {box, beam, geo, p, text, walls, ownedMaterials}) {
  const yellowPaint = new THREE.MeshStandardMaterial({
    color: 0xc3a357,
    map: paintTexture(),
    roughness: .88,
    alphaTest: .45,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  ownedMaterials.add(yellowPaint);

  function paint(polygon) {
    const positions = [], normals = [], uvs = [], indices = [];
    for (const vertex of polygon) {
      const world = p(vertex, TOP_OF_PAINT);
      positions.push(...world);
      normals.push(0, 1, 0);
      uvs.push(world[0] / 2.3, world[2] / 2.3);
    }
    // The authored polygons run clockwise on the plan. In XZ coordinates the
    // winding must be reversed to face a camera looking down onto the floor.
    for (let i = 1; i < polygon.length - 1; i++) indices.push(0, i + 1, i);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geo(geometry, yellowPaint);
  }

  function line(x, z, width, length) {
    paint([[x, z], [x + width, z], [x + width, z + length], [x, z + length]]);
  }

  // Worn perimeter stripes follow the generator plinth and loading bay. The
  // bay hatching is sized for the marked vehicle area in the reference plan.
  line(101, 793, 92, 1.3);
  line(101, 857, 92, 1.3);
  line(101, 794, 1.3, 63);
  line(192, 794, 1.3, 63);
  line(793, 876, 77, 1.4);
  line(793, 904, 77, 1.4);
  line(793, 877, 1.4, 27);
  line(869, 877, 1.4, 27);
  for (let x = 799; x < 847; x += 10) {
    paint([[x + 2, 879], [x + 4.8, 879], [x - 1, 902], [x - 3.8, 902]]);
  }
  for (const z of [1001, 1007]) {
    line(471, z, 16, 1.2);
    line(525, z, 16, 1.2);
  }

  function drain(at, length, width, angle = 0) {
    const px = map.scale;
    const offset = (x, z) => [at[0] + (Math.cos(angle) * x + Math.sin(angle) * z) / px,
      at[1] + (-Math.sin(angle) * x + Math.cos(angle) * z) / px];
    // Slotted iron, inset black channel, steel rim and flush mounting bolts.
    box(at, .017, length, .014, width, mats.rubber, angle);
    for (const side of [-1, 1]) {
      box(offset(0, side * (width / 2 - .023)), .026, length, .021, .047, mats.dark, angle);
      box(offset(side * (length / 2 - .022), 0), .026, .044, .021, width, mats.dark, angle);
    }
    const count = Math.floor((length - .09) / .114);
    for (let i = 1; i < count; i++) {
      const x = (i / count - .5) * (length - .07);
      box(offset(x, 0), .024, .057, .015, width - .058, mats.trainMetal, angle);
    }
    for (const end of [-1, 1]) {
      box(offset(end * (length / 2 - .15), 0), .033, .042, .011, .042, mats.trainMetal, angle);
    }
  }

  drain([505, 998], 6.4, .35);
  drain([503, 722], 5.7, .32);
  drain([790, 843], 4.1, .34, -Math.PI / 2);
  drain([247, 871], 3.3, .31, -Math.PI / 2);
  drain([117, 512], 4.6, .3, -Math.PI / 2);

  function pipeRack(from, to, normal, label) {
    // Resolve the mounting plane against the same wall segments used to draw
    // the building. No rack may span a portal or protrude from a wall end.
    const wall = walls.find(segment =>
      segmentPointDistance(...from, segment.a, segment.b).distance < .01 &&
      segmentPointDistance(...to, segment.a, segment.b).distance < .01);
    if (!wall) return;
    const tangent = [to[0] - from[0], to[1] - from[1]];
    const length = Math.hypot(...tangent) * map.scale;
    const wallFace = wall.thickness / 2;
    const point = (t, offset) => from.map((value, axis) =>
      value + t * tangent[axis] + normal[axis] * (wallFace + offset) / map.scale);
    const facing = Math.atan2(normal[0], normal[1]);
    const height = wall.base + 2.42;
    const pipeOffset = .125;

    for (const [y, radius, material] of [[height, .062, mats.trainStripe], [height + .23, .048, mats.trainMetal]]) {
      beam(p(point(0, pipeOffset), y), p(point(1, pipeOffset), y), radius, material);
      for (const t of [0, 1]) {
        beam(p(point(t, -.018), y), p(point(t, pipeOffset), y), radius * 1.1, material);
        box(point(t, .018), y, .22, .24, .056, mats.dark, facing);
      }
      const clips = Math.ceil(length / 2);
      for (let index = 1; index < clips; index++) {
        const t = index / clips;
        const width = .055 / length;
        beam(p(point(t - width, pipeOffset), y), p(point(t + width, pipeOffset), y), radius + .021, mats.metal);
        box(point(t, .071), y - .032, .108, .1, .156, mats.dark, facing);
      }
    }
    box(point(.52, .021), height - .48, .71, .22, .043, mats.dark, facing);
    text(label, point(.52, .046), height - .48, .66, .18, '#d2c5a3', '#343a37', false, facing);
  }

  pipeRack([95, 451], [95, 580], [1, 0], 'SEA WATER / 06');
  pipeRack([205, 588], [205, 633], [1, 0], 'PUMP RETURN');
  pipeRack([662, 328], [766, 328], [0, 1], 'COOLANT LOOP');
  pipeRack([792, 730], [870, 730], [0, 1], 'DOCK SUPPLY');

  // Radial steel mullions join the existing containment glass and its two
  // metal rings. Their bolt plates remain within the base collar footprint.
  const [cx, cz] = map.core.center;
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4;
    const at = [cx + 30.8 * Math.sin(angle), cz + 30.8 * Math.cos(angle)];
    box(at, 4.17, .115, 7.47, .133, mats.dark, angle);
    for (const y of [.62, 2.5, 4.7, 7.72]) {
      box(at, y, .245, .19, .215, mats.trainMetal, angle);
      for (const x of [-.071, .071]) {
        const fastener = [at[0] + (Math.cos(angle) * x + .114 * Math.sin(angle)) / map.scale,
          at[1] + (-Math.sin(angle) * x + .114 * Math.cos(angle)) / map.scale];
        box(fastener, y, .033, .033, .026, mats.dark, angle);
      }
    }
  }
  const placard = [cx, cz + 32.5];
  box(placard, 1.46, .81, .39, .075, mats.dark);
  text('ECHO   /   VESSEL 01', [cx, placard[1] + .43], 1.46, .76, .31, '#d8c69c', '#39392e');
  box([cx, cz + 31.1], 1.46, .18, .32, .35, mats.metal);

  // The pier and approach should carry weight into their foundations. End
  // these bents below the water and start them at the actual deck underside.
  const pier = map.additionalFloors.find(floor => floor.id === 'sea-pier');
  const deckUnderside = PIER_DECK - .55;
  for (const z of [1043, 1084]) {
    const west = [113, z], east = [150, z];
    if (![west, east].every(at => pointInPolygon(...at, pier.polygon))) continue;
    for (const at of [west, east]) {
      box(at, (deckUnderside - 10) / 2, .52, deckUnderside + 10, .52, mats.wall);
      box(at, -4.28, .74, .25, .74, mats.dark);
    }
    box([131.5, z], deckUnderside - .18, 4.35, .38, .73, mats.metal);
    beam(p(west, -6.6), p(east, -3.27), .105, mats.dark);
  }
  const approach = map.additionalFloors.find(floor => floor.id === 'entry-bridge');
  const supports = [[527, 1175], [574, 1175]];
  if (supports.every(at => pointInPolygon(...at, approach.polygon))) {
    for (const at of supports) {
      box(at, -4.49, .96, 7.9, 1.04, mats.wall);
      box(at, -.83, 1.28, .58, 1.43, mats.wall);
    }
    box([550.5, 1175], -.78, 5.88, .5, 1.13, mats.cap);
  }
}
