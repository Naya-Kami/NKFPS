import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCombatSession, getSpread, KILL_CREDITS, MAX_CREDITS,
  ROUND_BONUS, ROUND_SECONDS, STARTING_CREDITS, WEAPONS,
} from '../src/3dmap/combat/session.js';

test('prep purchases can be reversed and a carried weapon can be restored at no cost', () => {
  const session = createCombatSession();
  const {state} = session;
  assert.equal(state.weaponId, 'sidearm');
  assert.equal(session.fire(), null);
  assert.equal(session.buy('toString'), false);
  assert.equal(session.buy('rifle'), false);
  assert.equal(session.buy('smg'), true);
  assert.equal(state.credits, STARTING_CREDITS - WEAPONS.smg.price);
  assert.equal(state.refundableCredits, WEAPONS.smg.price);
  assert.equal(session.buy('marksman'), false);
  assert.equal(state.weaponId, 'smg');
  assert.equal(session.sell(), true);
  assert.equal(state.credits, STARTING_CREDITS);
  assert.equal(session.buy('smg'), true);
  assert.equal(session.deploy(), true);
  assert.equal(session.buy('sidearm'), false);
  assert.equal(session.sell(), false);
  session.finishRound();
  assert.equal(state.weaponId, 'smg');
  assert.equal(state.refundableCredits, 0);
  const carriedCredits = state.credits;
  assert.equal(session.buy('sidearm'), true);
  assert.equal(session.sell(), true);
  assert.equal(state.weaponId, 'smg');
  assert.equal(state.credits, carriedCredits);
});

test('shot cadence and reload conserve reserve ammo through partial reloads', () => {
  const session = createCombatSession();
  const {state} = session;
  const weapon = WEAPONS.sidearm;
  const interval = 60 / weapon.rpm;
  session.deploy();
  assert.equal(session.reload(), false);
  const shot = session.fire();
  assert.equal(shot.weaponId, weapon.id);
  assert.equal(shot.bodyDamage, weapon.bodyDamage);
  assert.equal(shot.gravity, weapon.gravity);
  assert.equal(session.fire(), null);
  session.update(interval / 2);
  assert.equal(session.fire(), null);
  session.update(interval / 2);
  assert.ok(session.fire());
  assert.equal(state.ammo, weapon.magazine - 2);
  assert.equal(session.reload(), true);
  assert.equal(session.reload(), false);
  session.update(weapon.reloadTime / 2);
  assert.equal(state.reloadProgress, .5);
  assert.equal(session.fire(), null);
  session.update(weapon.reloadTime / 2);
  assert.equal(state.ammo, weapon.magazine);
  assert.equal(state.reserve, weapon.reserve - 2);
  assert.equal(state.reloadProgress, null);
});

test('hits award credits and the clock advances and refreshes the round', () => {
  const session = createCombatSession();
  const {state} = session;
  const hit = {damage: WEAPONS.sidearm.headDamage, killed: true};
  assert.equal(session.hit(hit), false);
  session.update(ROUND_SECONDS * 2);
  assert.equal(state.timeLeft, ROUND_SECONDS);
  session.deploy();
  assert.equal(session.hit(hit), false);
  session.fire();
  assert.equal(session.hit(hit), true);
  assert.equal(session.hit(hit), false);
  assert.equal(state.credits, STARTING_CREDITS + KILL_CREDITS);
  session.reload();
  session.update(ROUND_SECONDS);
  assert.equal(state.phase, 'buy');
  assert.equal(state.round, 2);
  assert.equal(state.credits, STARTING_CREDITS + KILL_CREDITS + ROUND_BONUS);
  assert.equal(state.ammo, WEAPONS.sidearm.magazine);
  assert.equal(state.reloadProgress, null);
  assert.equal(state.roundKills, 0);
  assert.equal(state.kills, 1);
  assert.deepEqual(state.lastRound, {round: 1, bonus: ROUND_BONUS, shots: 1, hits: 1, kills: 1});
  for (let i = 0; i < 10; i++) {
    session.deploy();
    session.finishRound();
  }
  assert.equal(state.credits, MAX_CREDITS);
  assert.equal(state.lastRound.bonus, 0);
  session.reset();
  assert.equal(state.kills, 0);
  assert.equal(state.round, 1);
});

test('automatic fire preserves its firing rate at 30 frames per second', () => {
  const session = createCombatSession();
  session.buy('smg');
  session.deploy();
  session.fire();
  for (let frame = 0; frame < 30; frame++) {
    session.update(1 / 30);
    session.fire();
  }
  assert.equal(session.state.shots, 1 + WEAPONS.smg.rpm / 60);
});

test('movement and the jump increase spread and aim and crouch improve standing accuracy', () => {
  for (const {id} of Object.values(WEAPONS)) {
    const standing = getSpread(id);
    const moving = getSpread(id, {speed: 4.1});
    assert.ok(moving > standing);
    assert.ok(getSpread(id, {speed: 4.1, grounded: false}) > moving);
    assert.ok(getSpread(id, {aiming: true, crouched: true}) < standing);
  }
});

test('sustained fire widens the shot cone until the weapon settles', () => {
  const session = createCombatSession();
  session.buy('smg');
  session.deploy();
  const first = session.fire();
  session.update(60 / WEAPONS.smg.rpm);
  const second = session.fire();
  assert.ok(second.spread > first.spread);
  session.update(1);
  assert.equal(session.fire().spread, first.spread);
});
