export const ROUND_SECONDS = 60;
export const STARTING_CREDITS = 1200;
export const MAX_CREDITS = 5500;
export const KILL_CREDITS = 120;
export const ROUND_BONUS = 650;

export const WEAPONS = Object.freeze({
  sidearm: Object.freeze({
    id: 'sidearm', name: 'ARC-6', category: 'サイドアーム', price: 0,
    magazine: 12, reserve: 36, rpm: 300, automatic: false, reloadTime: 1.15,
    bodyDamage: 34, headDamage: 70, speed: 65, gravity: 11, range: 70,
    spread: .006, movingSpread: .032, shotBloom: .014, color: 0xffc26c,
  }),
  smg: Object.freeze({
    id: 'smg', name: 'KITE-9', category: 'SMG', price: 850,
    magazine: 24, reserve: 72, rpm: 720, automatic: true, reloadTime: 1.55,
    bodyDamage: 24, headDamage: 48, speed: 80, gravity: 13, range: 85,
    spread: .012, movingSpread: .024, shotBloom: .011, color: 0x74f1dc,
  }),
  rifle: Object.freeze({
    id: 'rifle', name: 'MICA-24', category: 'ライフル', price: 1700,
    magazine: 20, reserve: 60, rpm: 600, automatic: true, reloadTime: 1.9,
    bodyDamage: 41, headDamage: 96, speed: 110, gravity: 9, range: 115,
    spread: .0045, movingSpread: .046, shotBloom: .019, color: 0xff946c,
  }),
  marksman: Object.freeze({
    id: 'marksman', name: 'ORBIT-5', category: 'マークスマン', price: 2200,
    magazine: 5, reserve: 20, rpm: 180, automatic: false, reloadTime: 2.25,
    bodyDamage: 72, headDamage: 140, speed: 145, gravity: 7, range: 150,
    spread: .002, movingSpread: .06, shotBloom: .029, color: 0xaca1ff,
  }),
});

function findWeapon(id) {
  return Object.hasOwn(WEAPONS, id) ? WEAPONS[id] : null;
}

// Returns the shot cone's half-angle in radians from current movement and stance.
export function getSpread(id, {speed = 0, grounded = true, crouched = false, aiming = false, bloom = 0} = {}) {
  const weapon = findWeapon(id) ?? WEAPONS.sidearm;
  const movement = Number.isFinite(speed) ? Math.min(1, Math.max(0, speed / 6.6)) : 0;
  const base = weapon.spread * (aiming ? .43 : 1) * (crouched ? .76 : 1);
  const movementPenalty = weapon.movingSpread * movement * (aiming ? .76 : 1);
  return base + movementPenalty + bloom * (aiming ? .66 : 1) + (grounded ? 0 : .06);
}

export function createCombatSession() {
  const state = {};
  let cooldown;
  let reloadRemaining;

  function refill(id = state.weaponId) {
    const weapon = WEAPONS[id];
    state.weaponId = id;
    state.ammo = weapon.magazine;
    state.reserve = weapon.reserve;
    state.reloadProgress = null;
    state.bloom = 0;
    reloadRemaining = 0;
    cooldown = 0;
  }

  function reset() {
    Object.assign(state, {
      phase: 'buy', round: 1, timeLeft: ROUND_SECONDS, credits: STARTING_CREDITS,
      shots: 0, hits: 0, kills: 0, roundShots: 0, roundHits: 0, roundKills: 0,
      lastRound: null, refundableCredits: 0, buyStartWeaponId: 'sidearm',
    });
    refill(state.buyStartWeaponId);
  }

  function buy(id) {
    const weapon = findWeapon(id);
    if (state.phase !== 'buy' || !weapon || id === state.weaponId) return false;
    const price = id === state.buyStartWeaponId ? 0 : weapon.price;
    const available = state.credits + state.refundableCredits;
    if (price > available) return false;
    state.credits = available - price;
    state.refundableCredits = price;
    refill(id);
    return true;
  }

  function sell() {
    return buy(state.buyStartWeaponId);
  }

  function deploy() {
    if (state.phase !== 'buy') return false;
    state.phase = 'live';
    state.refundableCredits = 0;
    return true;
  }

  function finishRound() {
    if (state.phase !== 'live') return false;
    const bonus = Math.min(ROUND_BONUS, MAX_CREDITS - state.credits);
    state.credits += bonus;
    state.lastRound = {
      round: state.round, bonus, shots: state.roundShots,
      hits: state.roundHits, kills: state.roundKills,
    };
    state.phase = 'buy';
    state.round++;
    state.timeLeft = ROUND_SECONDS;
    state.roundShots = 0;
    state.roundHits = 0;
    state.roundKills = 0;
    state.buyStartWeaponId = state.weaponId;
    refill();
    return true;
  }

  function update(dt) {
    if (state.phase !== 'live' || !Number.isFinite(dt) || dt <= 0) return;
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    if (state.timeLeft <= 1e-7) {
      finishRound();
      return;
    }
    // Carry a frame's timing overshoot into the next continuous shot.
    cooldown = cooldown > 0 ? cooldown - dt : 0;
    state.bloom = Math.max(0, state.bloom - dt * .072);
    if (state.reloadProgress === null) return;
    const weapon = WEAPONS[state.weaponId];
    reloadRemaining -= dt;
    if (reloadRemaining > 1e-7) {
      state.reloadProgress = 1 - reloadRemaining / weapon.reloadTime;
      return;
    }
    const loaded = Math.min(weapon.magazine - state.ammo, state.reserve);
    state.ammo += loaded;
    state.reserve -= loaded;
    state.reloadProgress = null;
  }

  function reload() {
    const weapon = WEAPONS[state.weaponId];
    if (state.phase !== 'live' || state.reloadProgress !== null || !state.reserve || state.ammo === weapon.magazine) return false;
    reloadRemaining = weapon.reloadTime;
    state.reloadProgress = 0;
    return true;
  }

  function fire(movement) {
    if (state.phase !== 'live' || state.reloadProgress !== null || cooldown > 1e-7 || state.ammo === 0) return null;
    const {id: weaponId, rpm, bodyDamage, headDamage, speed, gravity, range, color, shotBloom} = WEAPONS[state.weaponId];
    const spread = getSpread(weaponId, {...movement, bloom: state.bloom});
    state.bloom = Math.min(.069, state.bloom + shotBloom);
    state.ammo--;
    state.shots++;
    state.roundShots++;
    const interval = 60 / rpm;
    cooldown = interval + Math.max(-interval / 2, cooldown);
    return {weaponId, spread, bodyDamage, headDamage, speed, gravity, range, color};
  }

  function hit({damage, killed = false} = {}) {
    if (state.phase !== 'live' || state.roundHits >= state.roundShots || !Number.isFinite(damage) || damage <= 0) return false;
    state.hits++;
    state.roundHits++;
    if (killed) {
      state.kills++;
      state.roundKills++;
      state.credits = Math.min(MAX_CREDITS, state.credits + KILL_CREDITS);
    }
    return true;
  }

  reset();
  return {state, reset, buy, sell, deploy, finishRound, update, reload, fire, hit};
}
