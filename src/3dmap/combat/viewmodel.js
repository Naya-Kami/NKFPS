import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const {clamp, damp, lerp, smoothstep} = THREE.MathUtils;
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT_GRIP = [.054, -.093, .041];
const MUZZLE_HEIGHT = {sidearm: .058, smg: .047, rifle: .032, marksman: .032};

// Shapes and proportions are camera-space artwork for NKFPS's fictional arsenal.
const STYLES = {
  sidearm: {paint: 0xa9bbc3, signal: 0x5ef4db, muzzle: -.30, hand: [-.041, -.091, -.035], sight: .112, kick: 1},
  smg: {paint: 0x566653, signal: 0xffae57, muzzle: -.47, hand: [-.035, -.095, -.262], sight: .128, kick: .63},
  rifle: {paint: 0xc2baa5, signal: 0x74ffcd, muzzle: -.67, hand: [-.041, -.103, -.350], sight: .129, kick: .86},
  marksman: {paint: 0x56697f, signal: 0xffc575, muzzle: -.85, hand: [-.047, -.106, -.410], sight: .151, kick: 1.42},
};

function material(color, roughness = .64, metalness = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({color, roughness, metalness, fog: false, ...extra});
}

function weaponMaterials(style) {
  return {
    dark: material(0x20262c, .59, .16), alloy: material(0x515960, .38, .39),
    padded: material(0x303842, .77), paint: material(style.paint, .43, .19),
    signal: material(style.signal, .46, .1, {emissive: style.signal, emissiveIntensity: .65}),
  };
}

function discard(group) {
  group.traverse(object => object.geometry?.dispose());
  group.removeFromParent();
}

// Static pieces are batched by material. Moving pieces keep their own groups.
function buildParts(parent, name, draw) {
  const group = new THREE.Group();
  group.name = name;
  const batches = new Map();

  function add(geometry, mat, x = 0, y = 0, z = 0) {
    let meshGeometry = geometry;
    if (geometry.index) {
      meshGeometry = geometry.toNonIndexed();
      geometry.dispose();
    }
    meshGeometry.translate(x, y, z);
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push(meshGeometry);
  }

  function block(mat, x, y, z, w, h, d, edge = .006, roll = 0) {
    const geometry = new RoundedBoxGeometry(w, h, d, 1, edge);
    if (roll) geometry.rotateX(roll);
    add(geometry, mat, x, y, z);
  }

  function plate(mat, depth, outline, x = 0, bevel = .004) {
    const shape = new THREE.Shape();
    outline.forEach(([z, y], i) => (i === 0 ? shape.moveTo(-z, y) : shape.lineTo(-z, y)));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1,
    });
    geometry.rotateY(Math.PI / 2);
    add(geometry, mat, x - depth / 2);
  }

  function tube(mat, radius, length, y, z, edges = 10, open = false) {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, edges, 1, open);
    geometry.rotateX(Math.PI / 2);
    add(geometry, mat, 0, y, z);
  }

  function ring(mat, radius, wall, y, z) {
    add(new THREE.TorusGeometry(radius, wall, 5, 14), mat, 0, y, z);
  }

  draw({add, block, plate, tube, ring});
  for (const [mat, geometries] of batches) {
    const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
    if (geometries.length > 1) geometries.forEach(piece => piece.dispose());
    group.add(new THREE.Mesh(geometry, mat));
  }
  parent.add(group);
  return group;
}

function addNotchSight({block}, mat, y, front) {
  for (const side of [-1, 1]) {
    block(mat.dark, side * .019, y - .005, .022, .012, .023, .018, .003);
    block(mat.signal, side * .017, y - .002, .032, .005, .006, .003, .001);
  }
  block(mat.dark, 0, y - .01, front, .014, .02, .027, .002);
  block(mat.signal, 0, y - .001, front + .008, .006, .006, .006, .001);
}

function addCompactSight({block}, mat, y, front, wide = false) {
  const width = wide ? .032 : .025;
  block(mat.dark, 0, y - .034, front, width * 2 + .018, .022, .067);
  for (const side of [-1, 1]) {
    block(mat.alloy, side * width, y - .003, front, .012, .053, .044, .006);
    block(mat.signal, side * (width + .006), y - .007, front + .005, .002, .017, .022, .001);
  }
  block(mat.paint, 0, y + .025, front, width * 2 + .01, .011, .041, .004);
  block(mat.signal, 0, y - .013, front, .005, .009, .004, .001);
}

function buildSidearm(rig, mat, style) {
  buildParts(rig, 'Sidearm frame', parts => {
    const {block, plate} = parts;
    plate(mat.dark, .067, [[.065, .049], [-.229, .036], [-.226, -.011], [-.106, -.020], [-.052, -.065], [.009, -.155], [.079, -.143], [.050, -.034]]);
    plate(mat.padded, .076, [[.052, -.025], [-.010, -.043], [.014, -.148], [.071, -.143]]);
    block(mat.dark, 0, -.059, -.107, .046, .013, .088, .005);
    block(mat.dark, 0, -.037, -.145, .047, .052, .013, .004);
  });
  return buildParts(rig, 'Sidearm top housing', parts => {
    const {block, plate, tube} = parts;
    plate(mat.paint, .069, [[.065, .074], [.033, .093], [-.216, .093], [-.269, .069], [-.268, .035], [-.206, .021], [.054, .032]]);
    tube(mat.alloy, .023, .059, .058, -.266);
    tube(mat.dark, .011, .003, .058, -.297);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        block(mat.dark, side * .036, .061, .035 - i * .015, .004, .046, .006, .001, -.28);
      }
      block(mat.signal, side * .036, .042, -.171, .003, .005, .05, .001);
    }
    addNotchSight(parts, mat, style.sight, -.222);
  });
}

function buildSmg(rig, mat, style) {
  return buildParts(rig, 'Compact receiver', parts => {
    const {block, plate, tube} = parts;
    plate(mat.paint, .103, [[.222, .066], [.161, .095], [-.271, .094], [-.380, .068], [-.371, .017], [-.237, -.046], [.063, -.050], [.136, -.104], [.218, -.105]]);
    plate(mat.dark, .090, [[.064, -.038], [-.008, -.032], [-.010, -.057], [.025, -.169], [.083, -.165]]);
    block(mat.padded, 0, -.019, .224, .112, .171, .031);
    block(mat.dark, 0, -.028, -.274, .110, .047, .094);
    block(mat.alloy, 0, .088, -.103, .062, .019, .451, .004);
    tube(mat.dark, .024, .126, .047, -.391);
    tube(mat.alloy, .038, .054, .047, -.439, 8);
    tube(mat.dark, .017, .002, .047, -.467);
    for (const side of [-1, 1]) {
      plate(mat.alloy, .008, [[.144, .073], [-.082, .070], [-.102, .031], [.115, .028]], side * .053, .002);
      for (let i = 0; i < 4; i++) {
        block(mat.dark, side * .055, .039, -.278 + i * .026, .005, .045, .009, .001, -.45);
      }
      block(mat.signal, side * .059, .05, .049, .002, .008, .054, .001);
    }
    addCompactSight(parts, mat, style.sight, -.131);
  });
}

function buildRifle(rig, mat, style) {
  return buildParts(rig, 'Rifle receiver', parts => {
    const {block, plate, tube} = parts;
    plate(mat.paint, .095, [[.104, .074], [-.167, .087], [-.240, .064], [-.222, -.040], [-.174, -.066], [.085, -.050], [.108, -.009]]);
    plate(mat.dark, .072, [[.191, .040], [.107, .040], [.097, -.044], [.284, -.101], [.298, -.093], [.298, .062]]);
    block(mat.padded, 0, -.02, .301, .085, .193, .028);
    plate(mat.padded, .077, [[.042, -.014], [-.021, -.036], [.005, -.152], [.073, -.146]]);
    plate(mat.dark, .090, [[-.192, .073], [-.499, .069], [-.529, .034], [-.516, -.030], [-.306, -.056], [-.222, -.044]]);
    block(mat.alloy, 0, .079, -.195, .062, .016, .591, .004);
    tube(mat.alloy, .021, .138, .032, -.565);
    tube(mat.dark, .032, .075, .032, -.631, 8);
    tube(mat.signal, .027, .012, .032, -.602, 8);
    tube(mat.alloy, .017, .004, .032, -.668);
    for (const side of [-1, 1]) {
      plate(mat.alloy, .006, [[.070, .049], [-.115, .057], [-.162, .018], [-.135, -.015], [.049, -.009]], side * .051, .002);
      block(mat.signal, side * .056, .027, -.041, .003, .008, .096, .001);
      for (let i = 0; i < 4; i++) {
        block(mat.paint, side * .047, .014, -.456 + i * .051, .012, .054, .025, .002, -.35);
      }
    }
    addCompactSight(parts, mat, style.sight, -.029, true);
  });
}

function buildMarksman(rig, mat, style) {
  return buildParts(rig, 'Marksman receiver', ({block, plate, tube, ring}) => {
    plate(mat.paint, .097, [[.121, .067], [-.222, .080], [-.274, .062], [-.278, -.042], [-.121, -.068], [.083, -.050], [.129, -.012]]);
    plate(mat.alloy, .078, [[.109, .055], [.295, .057], [.310, .033], [.298, -.046], [.166, -.046], [.103, -.019]]);
    plate(mat.dark, .066, [[.061, -.034], [-.020, -.046], [.011, -.176], [.078, -.171]]);
    block(mat.padded, 0, -.015, .317, .097, .153, .027);
    block(mat.padded, 0, .054, .229, .080, .027, .132);
    plate(mat.dark, .088, [[-.239, .056], [-.507, .057], [-.556, .025], [-.536, -.028], [-.282, -.061]]);
    tube(mat.alloy, .024, .284, .032, -.671);
    tube(mat.dark, .041, .093, .032, -.797, 8);
    tube(mat.paint, .036, .018, .032, -.829, 8);
    tube(mat.dark, .019, .005, .032, -.846);
    for (const side of [-1, 1]) {
      plate(mat.alloy, .013, [[-.268, .031], [-.484, .035], [-.512, .015], [-.480, -.013], [-.268, -.035]], side * .047, .002);
      block(mat.signal, side * .053, .032, -.095, .003, .009, .108, .001);
      block(mat.dark, side * .053, -.004, -.099, .007, .02, .147, .003);
    }
    for (const z of [-.270, -.066]) {
      block(mat.alloy, 0, .095, z, .076, .038, .033, .004);
    }
    tube(mat.dark, .031, .216, style.sight, -.162, 14, true);
    for (const [z, radius] of [[-.280, .047], [-.050, .040]]) {
      tube(mat.paint, radius, .033, style.sight, z, 14, true);
      ring(mat.alloy, radius - .004, .008, style.sight, z + .016);
      ring(mat.signal, radius - .013, .0015, style.sight, z + .017);
    }
    block(mat.alloy, 0, .187, -.163, .036, .016, .035, .004);
  });
}

function buildMagazine(rig, mat, id) {
  const z = {sidearm: .041, smg: -.137, rifle: -.159, marksman: -.140}[id];
  const height = {sidearm: .082, smg: .147, rifle: .123, marksman: .071}[id];
  const group = buildParts(rig, 'Removable cartridge', ({block, plate}) => {
    plate(mat.alloy, .056, [[.028, .020], [-.043, .012], [-.029, -height], [.035, -height + .008]], 0, .004);
    block(mat.padded, 0, -height, .003, .069, .016, .075, .004);
    for (const side of [-1, 1]) {
      block(mat.paint, side * .030, -height * .52, -.011, .006, height * .55, .026, .002);
      block(mat.signal, side * .033, -height * .53, -.019, .002, height * .23, .004, .001);
    }
  });
  const y = id === 'sidearm' ? -.088 : -.046;
  group.position.set(0, y, z);
  return {group, y, z};
}

const builds = {sidearm: buildSidearm, smg: buildSmg, rifle: buildRifle, marksman: buildMarksman};

function buildWeapon(id, mat) {
  const group = new THREE.Group();
  group.name = `${id} model`;
  const cyclingPart = builds[id](group, mat, STYLES[id]);
  const magazine = buildMagazine(group, mat, id);
  return {group, cyclingPart, magazine};
}

export function createWeaponMesh(id = 'sidearm') {
  const style = STYLES[id];
  const mat = weaponMaterials(style);
  Object.values(mat).forEach(m => { m.fog = true; });
  const {group} = buildWeapon(id, mat);
  return {
    group,
    grip: new THREE.Vector3(...RIGHT_GRIP),
    supportGrip: new THREE.Vector3(...style.hand),
    muzzle: new THREE.Vector3(0, MUZZLE_HEIGHT[id], style.muzzle),
    dispose() {
      discard(group);
      Object.values(mat).forEach(m => m.dispose());
    },
  };
}

function buildHand(rig, mat, side) {
  return buildParts(rig, side > 0 ? 'Right glove' : 'Left glove', ({block}) => {
    block(mat.glove, side * .009, -.010, .020, .067, .074, .087, .015, -.12);
    block(mat.padded, side * .037, .004, .023, .012, .051, .05, .006);
    block(mat.stitch, side * .043, .009, .022, .003, .005, .035, .001);
    block(mat.glove, -side * .022, .025, .001, .027, .029, .060, .009, -.27);
    for (let i = 0; i < 4; i++) {
      block(mat.glove, -side * .018, -.032 + i * .013, -.019 - i * .002, .047, .012, .039, .005);
    }
    block(mat.sleeve, side * .014, -.031, .065, .069, .064, .031, .009, -.25);
    block(mat.stitch, side * .034, -.027, .083, .023, .038, .004, .001);
  });
}

function buildSleeve(root, mat, name) {
  const geometry = new THREE.CylinderGeometry(.048, .073, 1, 10, 1);
  const sleeve = new THREE.Mesh(geometry, mat.sleeve);
  sleeve.name = name;
  root.add(sleeve);
  return sleeve;
}

export function createViewmodel(camera) {
  const root = new THREE.Group();
  root.name = 'First-person operator';
  root.visible = false;
  camera.add(root);
  const key = new THREE.DirectionalLight(0xfff0d7, 2.6);
  key.position.set(-1, 1.2, .9);
  key.target.position.set(0, -.22, -.5);
  const rim = new THREE.DirectionalLight(0x92c9ff, 1.4);
  rim.position.set(1, .4, -.8);
  rim.target.position.copy(key.target.position);
  root.add(new THREE.HemisphereLight(0xe5efff, 0x65747a, 1.25), key, key.target, rim, rim.target);

  const mat = {
    ...weaponMaterials(STYLES.sidearm),
    glove: material(0x353941, .89), sleeve: material(0x5b6460, .92), stitch: material(0x9a9c87, .85),
  };
  const rig = new THREE.Group();
  root.add(rig);
  const rightHand = buildHand(rig, mat, 1);
  rightHand.position.set(...RIGHT_GRIP);
  rightHand.rotation.set(.36, -.19, -.18);
  const leftHand = buildHand(rig, mat, -1);
  const rightSleeve = buildSleeve(root, mat, 'Right forearm');
  const leftSleeve = buildSleeve(root, mat, 'Left forearm');
  const muzzle = new THREE.Object3D();
  rig.add(muzzle);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffae56, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const flash = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), flashMaterial);
  flash.position.z = -.047;
  flash.visible = false;
  muzzle.add(flash);

  const sleeveEnd = new THREE.Vector3();
  const sleeveVector = new THREE.Vector3();
  const sleeveOffset = new THREE.Vector3(0, -.031, .065);
  const grip = new THREE.Vector3();
  const pose = new THREE.Vector3();
  let id, style, weapon, cyclingPart, magazine;
  let draw = 0, recoil = 0, flashTime = 0, phase = 0, gait = 0, aim = 0;
  let swayX = 0, swayY = 0, airtime = 0, landing = 0, wasGrounded = true;

  function setWeapon(next) {
    if (!Object.hasOwn(STYLES, next) || next === id) return;
    if (weapon) discard(weapon);
    id = next;
    style = STYLES[id];
    mat.paint.color.setHex(style.paint);
    mat.signal.color.setHex(style.signal);
    mat.signal.emissive.setHex(style.signal);
    ({group: weapon, cyclingPart, magazine} = buildWeapon(id, mat));
    rig.add(weapon);
    muzzle.position.set(0, MUZZLE_HEIGHT[id], style.muzzle);
    grip.set(...style.hand);
    leftHand.position.copy(grip);
    draw = 0;
    recoil = 0;
    flashTime = 0;
    flash.visible = false;
  }

  function placeSleeve(sleeve, hand, x, y, z) {
    sleeveEnd.copy(sleeveOffset).applyQuaternion(hand.quaternion).add(hand.position)
      .applyQuaternion(rig.quaternion).add(rig.position);
    sleeveVector.copy(sleeveEnd).sub(sleeve.position.set(x, y, z));
    sleeve.position.addScaledVector(sleeveVector, .5);
    sleeve.scale.y = Math.max(.001, sleeveVector.length());
    sleeve.quaternion.setFromUnitVectors(UP, sleeveVector.normalize());
  }

  function update(dt, {speed = 0, grounded = true, crouched = false, aiming = false,
    reloadProgress = null, lookX = 0, lookY = 0} = {}) {
    const reloading = reloadProgress !== null;
    const cycle = reloading ? clamp(reloadProgress, 0, 1) : 0;
    const reloadPose = smoothstep(cycle, 0, .19) * (1 - smoothstep(cycle, .71, 1));
    const unload = smoothstep(cycle, .21, .43) * (1 - smoothstep(cycle, .55, .78));
    const reach = smoothstep(cycle, .015, .21) * (1 - smoothstep(cycle, .79, 1));
    aim = damp(aim, aiming && !reloading ? 1 : 0, 15, dt);
    gait = damp(gait, grounded ? clamp(speed / 5.2, 0, 1) : 0, 11, dt);
    phase += dt * (5 + gait * 6);
    swayX = damp(swayX, clamp(lookX * .00115, -.05, .05), 19, dt);
    swayY = damp(swayY, clamp(lookY * .0011, -.04, .04), 19, dt);
    if (grounded && !wasGrounded) landing = 1;
    wasGrounded = grounded;
    landing *= Math.exp(-dt * 13);
    airtime = damp(airtime, grounded ? 0 : 1, 10, dt);
    recoil *= Math.exp(-dt * 17);
    flashTime = Math.max(0, flashTime - dt);
    flash.visible = flashTime > 0;
    flashMaterial.opacity = clamp(flashTime / .036, 0, 1);
    draw = Math.min(1, draw + dt * 4.8);
    const lowered = 1 - smoothstep(draw, 0, 1);

    const bob = gait * (1 - aim * .8) * (crouched ? .65 : 1);
    const aspectOffset = clamp(camera.aspect / 1.2, .55, 1);
    rig.position.set(
      lerp(.218 * aspectOffset, 0, aim) + Math.sin(phase) * .015 * bob + swayX * .43 - reloadPose * .038,
      lerp(-.207, -style.sight, aim) + Math.cos(phase * 2) * .013 * bob + swayY * .4
        - landing * .038 - airtime * .024 - reloadPose * .021 - lowered * .14,
      lerp(-.46, -.40, aim) + recoil * .054 + lowered * .04,
    );
    rig.rotation.set(
      Math.sin(phase * 2) * .022 * bob + recoil * .104 + swayY - airtime * .052 - lowered * .46 + reloadPose * .14,
      swayX * .94 - reloadPose * .14,
      Math.cos(phase) * .036 * bob - swayX * .66 + reloadPose * (id === 'sidearm' ? .49 : .34) + lowered * .13,
    );

    if (id === 'sidearm') cyclingPart.position.z = recoil * .028;
    magazine.group.position.set(-unload * .09, magazine.y - unload * .18, magazine.z + unload * .035);
    magazine.group.rotation.set(unload * .37, 0, unload * -.21);
    pose.set(-.056 - unload * .09, magazine.y - .073 - unload * .18, magazine.z + .02 + unload * .035);
    leftHand.position.copy(grip).lerp(pose, reach);
    leftHand.rotation.set(-.23 + reach * .48, .28 - reach * .55, .44 - reach * .76);
    leftHand.visible = cycle < .39 || cycle > .58;
    magazine.group.visible = cycle < .39 || cycle > .58;
    leftSleeve.visible = leftHand.visible;
    placeSleeve(rightSleeve, rightHand, .40 * aspectOffset, -.53, -.21);
    placeSleeve(leftSleeve, leftHand, -.34 * aspectOffset, -.52, -.22);
  }

  function fire() {
    recoil = Math.min(1.8, recoil + style.kick);
    flashTime = .043;
    flash.visible = true;
    flash.rotation.z = Math.random() * Math.PI;
    const scale = id === 'marksman' ? 1.2 : .95;
    flash.scale.set(.057 * scale, .045 * scale, .111 * scale);
    flashMaterial.opacity = .95;
  }

  setWeapon('sidearm');
  update(1 / 60);
  return {
    setWeapon, update, fire,
    getMuzzlePosition(target) { return muzzle.getWorldPosition(target); },
    setVisible(visible) { root.visible = visible; },
    dispose() {
      discard(root);
      Object.values(mat).forEach(m => m.dispose());
      flashMaterial.dispose();
    },
  };
}
