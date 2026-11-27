import {Group, MathUtils, Quaternion, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PLAYER} from '../maps/physics.js';
import {createWeaponMesh} from './viewmodel.js';

const AYAME_URL = new URL('../../../assets/characters/runtime/ayame_blaze.glb', import.meta.url).href;
const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0);
const {clamp, damp, lerp, smoothstep} = MathUtils;

function disposeModel(model) {
  const geometry = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set(), images = new Set();
  model.traverse(object => {
    if (object.geometry) geometry.add(object.geometry);
    if (object.skeleton) skeletons.add(object.skeleton);
    for (const material of [object.material].flat()) {
      if (material) materials.add(material);
    }
  });
  for (const material of materials) {
    for (const property of Object.values(material)) {
      if (property?.isTexture) textures.add(property);
    }
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
    if (texture.source.data?.close) images.add(texture.source.data);
  }
  for (const image of images) image.close();
  for (const item of geometry) item.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
}

// The shared character rig has twist bones between the main joints. Solve
// against the measured shoulder/elbow/wrist and hip/knee/ankle positions.
function createPoser(model) {
  const bones = new Map();
  model.traverse(object => {
    if (object.isBone) bones.set(object.name.replaceAll('.', ''), object);
    if (object.isSkinnedMesh) object.frustumCulled = false;
  });
  const joint = name => {
    const bone = bones.get(name);
    if (!bone) throw new Error(`Missing character joint ${name}`);
    return bone;
  };

  const hip = joint('root'), spine = joint('spine05'), chest = joint('spine02'), head = joint('head');
  const hipRest = hip.position.clone();
  const modelRotation = model.getWorldQuaternion(new Quaternion());
  const worldToModelRotation = modelRotation.clone().invert();
  function binding(upperName, lowerName, endName) {
    const upper = joint(upperName), lower = joint(lowerName), end = joint(endName);
    const start = upper.getWorldPosition(new Vector3());
    const middle = lower.getWorldPosition(new Vector3());
    const finish = end.getWorldPosition(new Vector3());
    return {
      upper, lower, end,
      upperLength: start.distanceTo(middle), lowerLength: middle.distanceTo(finish),
      restPosition: model.worldToLocal(finish),
      restRotation: end.getWorldQuaternion(new Quaternion()).premultiply(worldToModelRotation),
    };
  }
  const sides = ['L', 'R'].map((name, index) => ({
    sign: index === 0 ? 1 : -1,
    leg: binding(`upperleg01${name}`, `lowerleg01${name}`, `foot${name}`),
    arm: binding(`upperarm01${name}`, `lowerarm01${name}`, `wrist${name}`),
  }));
  const rest = new Map([hip, spine, chest, head, ...sides.flatMap(({arm, leg}) => [arm.upper, arm.lower, arm.end, leg.upper, leg.lower, leg.end])]
    .map(bone => [bone, bone.quaternion.clone()]));

  const start = new Vector3(), end = new Vector3(), knee = new Vector3(), direction = new Vector3(), bend = new Vector3();
  const from = new Vector3(), to = new Vector3(), step = new Vector3(), foot = new Vector3(), pole = new Vector3();
  const orientation = new Quaternion(), parentRotation = new Quaternion(), correction = new Quaternion();
  const hand = new Vector3(), handDirection = new Vector3(), aimDirection = new Vector3();
  let stride = 0, runWeight = 0, crouchWeight = 0, walkWeight = 0, airWeight = 0, aimWeight = 0, landing = 0;
  let groundedLast = true, time = 0, recoil = 0;

  function rotateInWorld(bone, worldRotation) {
    bone.parent.getWorldQuaternion(parentRotation);
    bone.quaternion.copy(parentRotation.invert()).multiply(worldRotation);
  }

  function align(bone, current, desired) {
    correction.setFromUnitVectors(current.normalize(), desired.normalize());
    bone.getWorldQuaternion(orientation).premultiply(correction);
    rotateInWorld(bone, orientation);
  }

  function solve(chain, target, bendToward) {
    const {upper, lower, end: wristOrAnkle, upperLength, lowerLength} = chain;
    upper.getWorldPosition(start);
    model.localToWorld(end.copy(target));
    const limit = upperLength + lowerLength - .001;
    direction.subVectors(end, start);
    const reach = clamp(direction.length(), Math.abs(upperLength - lowerLength) + .001, limit);
    direction.normalize();
    const along = (upperLength ** 2 - lowerLength ** 2 + reach ** 2) / (2 * reach);
    bend.copy(bendToward).applyQuaternion(modelRotation);
    bend.addScaledVector(direction, -bend.dot(direction)).normalize();
    const away = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
    knee.copy(start).addScaledVector(direction, along).addScaledVector(bend, away);
    lower.getWorldPosition(from).sub(start);
    align(upper, from, to.subVectors(knee, start));
    lower.getWorldPosition(start);
    wristOrAnkle.getWorldPosition(from).sub(start);
    end.copy(direction).multiplyScalar(reach - along).addScaledVector(bend, -away);
    align(lower, from, end);
  }

  function pose(dt, input, weapon) {
    const {yaw, pitch = 0, speed = 0, velocityX, velocityZ, grounded = true,
      crouched = false, aiming = false, reloadProgress = null} = input;
    time += dt;
    recoil = damp(recoil, 0, 16, dt);
    walkWeight = damp(walkWeight, smoothstep(speed, .04, 1.6), 14, dt);
    runWeight = damp(runWeight, smoothstep(speed, 4.3, 6.5), 10, dt);
    crouchWeight = damp(crouchWeight, Number(crouched), 13, dt);
    airWeight = damp(airWeight, Number(!grounded), 18, dt);
    aimWeight = damp(aimWeight, Number(aiming), 15, dt);
    landing = !groundedLast && grounded ? 1 : damp(landing, 0, 12, dt);
    groundedLast = grounded;
    stride = (stride + dt * speed / lerp(1.42, 2.35, runWeight)) % 1;
    step.set(0, 0, 1);
    if (Number.isFinite(velocityX) && Number.isFinite(velocityZ) && speed > .04) {
      step.set(-velocityX, 0, -velocityZ).applyAxisAngle(UP, -yaw).normalize();
    }

    for (const [bone, rotation] of rest) bone.quaternion.copy(rotation);
    const breathing = Math.sin(time * 2.7) * .004;
    const hipDrop = .31 * crouchWeight + .06 * landing;
    hip.position.copy(hipRest);
    hip.position.y += breathing - hipDrop - .053 * walkWeight + Math.cos(stride * Math.PI * 4) * .023 * walkWeight;
    hip.position.z -= .12 * crouchWeight;
    spine.rotateZ(-(.15 * runWeight + .15 * crouchWeight + .14 * airWeight));
    chest.rotateY(Math.sin(stride * Math.PI * 2) * .09 * walkWeight * (1 - aimWeight));
    head.rotateZ(clamp(pitch * .75, -.53, .61) + .08 * crouchWeight);
    model.getWorldQuaternion(modelRotation);

    const stance = lerp(.61, .45, runWeight);
    for (const {sign, leg} of sides) {
      const cycle = (stride + (sign > 0 ? 0 : .5)) % 1;
      const swing = clamp((cycle - stance) / (1 - stance), 0, 1);
      const reach = walkWeight * lerp(lerp(.29, .41, runWeight), .22, crouchWeight);
      const travel = cycle <= stance ? lerp(reach, -reach, cycle / stance) : lerp(-reach, reach, smoothstep(swing, 0, 1));
      foot.copy(leg.restPosition).addScaledVector(step, travel * (1 - airWeight));
      foot.y += Math.sin(swing * Math.PI) * lerp(.13, .24, runWeight) * walkWeight * (1 - airWeight) + (sign > 0 ? .33 : .20) * airWeight;
      foot.z += .08 * crouchWeight + (sign > 0 ? .19 : -.08) * airWeight;
      solve(leg, foot, pole.set(sign * .18, 0, 1));
      orientation.setFromAxisAngle(RIGHT, .30 * airWeight - .14 * Math.sin(swing * Math.PI) * walkWeight);
      rotateInWorld(leg.end, orientation.multiply(leg.restRotation).premultiply(modelRotation));
    }

    const reload = reloadProgress === null ? 0 : Math.sin(Math.PI * smoothstep(reloadProgress, .08, .98));
    const reloadReach = reloadProgress === null ? 0 : Math.sin(Math.PI * smoothstep(reloadProgress, .1, .87));
    const handling = weapon.group;
    handling.rotation.set(clamp(pitch, -.92, .92) - .31 * reload - .30 * runWeight + .075 * recoil,
      Math.PI - .18 * reload, -.19 * reload, 'YXZ');
    const goal = hand.set(lerp(-.16, -.095, aimWeight), lerp(1.24, 1.42, aimWeight) - hipDrop + breathing - .11 * runWeight,
      lerp(.17, .23, aimWeight) - recoil * .029);
    handling.position.copy(goal).sub(to.copy(weapon.grip).multiplyScalar(handling.scale.x).applyQuaternion(handling.quaternion));
    aimDirection.set(0, 0, -1).applyQuaternion(handling.quaternion);

    for (const {sign, arm} of sides) {
      hand.copy(sign > 0 ? weapon.supportGrip : weapon.grip).multiplyScalar(handling.scale.x).applyQuaternion(handling.quaternion).add(handling.position);
      hand.addScaledVector(aimDirection, sign > 0 ? -.035 : -.066);
      if (sign > 0) {
        hand.x += .08 * reloadReach;
        hand.y -= .24 * reloadReach;
        hand.z -= .13 * reloadReach;
      }
      solve(arm, hand, pole.set(sign * .68, -1, -.22));
      arm.end.getWorldQuaternion(orientation);
      handDirection.copy(UP).applyQuaternion(orientation);
      to.copy(aimDirection).add(pole.set(-sign * .40, sign > 0 ? -.05 : -.24, 0)).normalize().applyQuaternion(modelRotation);
      align(arm.end, handDirection, to);
    }
  }

  return {pose, fire() { recoil = 1; }};
}

export async function createCombatCharacter(scene) {
  const {scene: model} = await new GLTFLoader().loadAsync(AYAME_URL);
  let poser;
  try {
    poser = createPoser(model);
  } catch (error) {
    disposeModel(model);
    throw error;
  }

  const actor = new Group();
  actor.name = 'Ayame combat movement preview';
  actor.visible = false;
  model.rotation.y = Math.PI;
  actor.add(model);
  scene.add(actor);
  let weapon, currentWeapon;

  return {
    setVisible(visible) { actor.visible = visible; },
    update(dt, input) {
      const {position, yaw, weaponId = 'sidearm'} = input;
      if (weaponId !== currentWeapon) {
        weapon?.dispose();
        weapon = createWeaponMesh(weaponId);
        weapon.group.scale.setScalar(.72);
        model.add(weapon.group);
        currentWeapon = weaponId;
      }
      actor.position.copy(position);
      actor.position.y += .011 - PLAYER.eye;
      actor.rotation.y = yaw;
      poser.pose(dt, input, weapon);
    },
    fire: poser.fire,
    getMuzzlePosition(target) {
      return weapon.group.localToWorld(target.copy(weapon.muzzle));
    },
    dispose() {
      actor.removeFromParent();
      weapon?.dispose();
      disposeModel(model);
    },
  };
}
