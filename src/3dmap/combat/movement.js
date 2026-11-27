import {bodyIsClear, PLAYER, stepPlayer} from '../maps/physics.js';

const CROUCH_HEIGHT = 1.16;
const CROUCH_EYE = 1.08;
const STAND_SPEED = 4.25;
const SPRINT_SPEED = 6.6;
const CROUCH_SPEED = 2.05;
const AIM_SPEED = 2.75;
const damp = (value, target, rate, dt) => target + (value - target) * Math.exp(-rate * dt);

export function createCombatMovement() {
  let velocityX, velocityZ, stanceOffset, stride, sway, roll, landing, sprintLocked;

  function reset() {
    velocityX = 0;
    velocityZ = 0;
    stanceOffset = 0;
    stride = 0;
    sway = 0;
    roll = 0;
    landing = 0;
    sprintLocked = false;
  }

  function step(state, physicsWorld, input, dt) {
    const {x = 0, z = 0, jump = false, crouch = false, sprint = false, aim = false} = input;
    const position = state.position;
    const previousX = position.x;
    const previousZ = position.z;
    const previousGrounded = state.onGround;
    const previousVertical = state.verticalVelocity;
    const previousRecoveries = state.recoveries;
    const crouched = crouch || !bodyIsClear(physicsWorld, previousX, previousZ, position.y - PLAYER.eye);
    const effort = Math.hypot(x, z);
    const stamina = state.sprint ?? 100;
    if (!sprint) sprintLocked = false;
    else if (stamina <= 0) sprintLocked = true;
    const sprinting = sprint && !sprintLocked && !crouched && !aim && previousGrounded && effort > 0.1;
    state.sprint = Math.max(0, Math.min(100, stamina + dt * (sprinting ? -19 : 13)));

    const maxSpeed = crouched ? CROUCH_SPEED : aim ? AIM_SPEED : sprinting ? SPRINT_SPEED : STAND_SPEED;
    const norm = Math.max(1, effort);
    const cos = Math.cos(state.yaw);
    const sin = Math.sin(state.yaw);
    const desiredX = (x * cos + z * sin) * maxSpeed / norm;
    const desiredZ = (z * cos - x * sin) * maxSpeed / norm;
    const acceleration = previousGrounded ? (effort > 0.01 ? 28 : 42) : 10;
    const changeX = desiredX - velocityX;
    const changeZ = desiredZ - velocityZ;
    const change = Math.hypot(changeX, changeZ);
    if (change > 0) {
      const blend = Math.min(1, acceleration * dt / change);
      velocityX += changeX * blend;
      velocityZ += changeZ * blend;
    }
    stepPlayer(state, physicsWorld, {
      x: velocityX,
      z: velocityZ,
      jump,
      height: crouched ? CROUCH_HEIGHT : PLAYER.height,
    }, dt);

    const recovered = state.recoveries !== previousRecoveries;
    if (recovered) reset();
    const actualX = dt > 0 && !recovered ? (position.x - previousX) / dt : 0;
    const actualZ = dt > 0 && !recovered ? (position.z - previousZ) / dt : 0;
    const speed = Math.hypot(actualX, actualZ);
    state.moving = speed > 0.1;

    // Keep the camera's standing anchor for map queries, spawns, and recovery.
    const crouchOffset = CROUCH_EYE - PLAYER.eye;
    stanceOffset = damp(stanceOffset, crouched ? crouchOffset : 0, 15, dt);
    if (crouched && !bodyIsClear(physicsWorld, position.x, position.z, position.y - PLAYER.eye, PLAYER.eye + stanceOffset + 0.07)) {
      stanceOffset = crouchOffset;
    }
    const weight = state.onGround ? Math.min(1, speed / STAND_SPEED) : 0;
    stride = (stride + speed * dt * 2.2) % (2 * Math.PI);
    sway = damp(sway, Math.sin(stride) * weight * (aim ? 0.012 : 0.031), 18, dt);
    const lateral = actualX * cos - actualZ * sin;
    const tilt = Math.max(-0.022, Math.min(0.022, -lateral * 0.004));
    roll = damp(roll, tilt * (aim ? 0.45 : 1), 12, dt);
    landing = damp(landing, 0, 16, dt);
    if (!recovered && !previousGrounded && state.onGround) landing = Math.max(0, Math.min(0.09, -previousVertical * 0.013));

    return {speed, velocityX: actualX, velocityZ: actualZ, grounded: state.onGround, crouched, sprinting, eyeOffset: stanceOffset + sway - landing, roll};
  }

  reset();
  return {reset, step};
}
