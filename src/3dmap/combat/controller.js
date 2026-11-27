import {Vector3} from 'three';
import {createCombatMovement} from './movement.js';
import {createPracticeRange} from './range.js';
import {createCombatSession, getSpread, WEAPONS} from './session.js';
import {createViewmodel} from './viewmodel.js';

export function createCombatController(scene, viewCamera, physicsWorld, {onHit, onBuyPhase, onShot} = {}) {
  const session = createCombatSession();
  const movement = createCombatMovement();
  const rig = createViewmodel(viewCamera);
  const range = createPracticeRange(scene, physicsWorld, {
    onHit(event) {
      session.hit(event);
      onHit?.(event.killed ? 'kill' : event.critical ? 'head' : 'body');
    }
  });
  range.setVisible(false);

  const direction = new Vector3();
  const muzzle = new Vector3();
  let pose = {speed: 0, grounded: true, crouched: false, sprinting: false, eyeOffset: 0, roll: 0};
  let shopOpen = true;
  let aimHeld = false;
  let crouchHeld = false;
  let fireHeld = false;
  let fireQueued = false;
  let gamepadFire = false;
  let gamepadReload = false;
  let aiming = false;
  let lookX = 0;
  let lookY = 0;

  function clearInput() {
    aimHeld = crouchHeld = fireHeld = fireQueued = aiming = false;
    lookX = lookY = 0;
  }

  function setShopOpen(open) {
    shopOpen = open && session.state.phase === 'buy';
    clearInput();
  }

  function deploy(position, yaw) {
    if (!session.deploy()) return false;
    setShopOpen(false);
    movement.reset();
    range.reset(position, yaw);
    range.setVisible(true);
    return true;
  }

  function move(state, input, dt) {
    aiming = session.state.phase === 'live' && !shopOpen && Boolean(aimHeld || input.aim);
    const controls = shopOpen ? {} : {...input, aim: aiming, crouch: crouchHeld || input.crouch};
    pose = movement.step(state, physicsWorld, controls, dt);
    return pose;
  }

  function update(dt, camera, pad, elapsed, character = null) {
    const weapon = WEAPONS[session.state.weaponId];
    const firing = Boolean(pad?.buttons[7]?.pressed);
    const reloading = Boolean(pad?.buttons[2]?.pressed);
    rig.setVisible(!character);
    rig.setWeapon(weapon.id);
    rig.update(dt, {...pose, aiming, reloadProgress: session.state.reloadProgress, lookX, lookY});
    lookX = lookY = 0;

    if (session.state.phase === 'live') {
      range.update(dt, camera.position);
      session.update(elapsed);
      if (session.state.phase === 'buy') {
        range.setVisible(false);
        setShopOpen(true);
        onBuyPhase?.();
      } else {
        if (reloading && !gamepadReload) session.reload();
        if (fireQueued || (weapon.automatic && (fireHeld || firing)) || (firing && !gamepadFire)) {
          const shot = session.fire({...pose, aiming});
          if (shot) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.sqrt(Math.random()) * shot.spread;
            direction.set(Math.cos(angle) * radius, Math.sin(angle) * radius, -1).normalize().applyQuaternion(camera.quaternion);
            const muzzlePosition = character ? character.getMuzzlePosition(muzzle) : rig.getMuzzlePosition(muzzle);
            range.fire({origin: camera.position, muzzle: muzzlePosition, direction, ...shot});
            rig.fire();
            character?.fire();
            onShot?.(weapon);
          }
        }
      }
    }
    gamepadFire = firing;
    gamepadReload = reloading;
    fireQueued = false;
  }

  return {
    session, move, update, deploy, setShopOpen, clearInput,
    get shopOpen() { return shopOpen; },
    get info() {
      return {...pose, aiming, spread: getSpread(session.state.weaponId, {...pose, aiming, bloom: session.state.bloom}), targetCount: range.targetCount};
    },
    setAim(held) { aimHeld = held; },
    setCrouch(held) { crouchHeld = held; },
    setFire(held) {
      if (held && !fireHeld && !shopOpen) fireQueued = true;
      fireHeld = held;
    },
    look(dx, dy) {
      lookX += dx;
      lookY += dy;
      return aiming ? .62 : 1;
    },
    dispose() {
      rig.dispose();
      range.dispose();
    }
  };
}
