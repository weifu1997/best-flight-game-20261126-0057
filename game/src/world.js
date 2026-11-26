// The simulation: one jet, one valley, ten rings and a runway. Fixed 1/60 s
// steps, arcade physics (bank to turn, throttle for speed, pitch trades
// speed for altitude), fuel that runs out, and three ways a sortie ends:
// a crash, an early landing, or all ten rings and a landing on the strip.
import { BEST_KEY, COURSE, JET, RUNWAY, STEP, WORLD } from './config.js';
import { angleDelta, clamp, lerp } from './random.js';
import { groundHeight } from './terrain.js';
import { landingTarget, planCourse } from './course.js';

const THREE = window.THREE;

export const EVENT_RING = 1;
export const EVENT_OVER = 2;
export const EVENT_LANDED = 4;

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** Forward vector for a heading (0 = north, clockwise) and pitch (up +). */
export function forwardVector(heading, pitch) {
  const cp = Math.cos(pitch);
  return new THREE.Vector3(Math.sin(heading) * cp, Math.sin(pitch), -Math.cos(heading) * cp);
}

/** Heading (clockwise from north) that points from `from` toward `to`. */
export function headingTo(from, to) {
  return Math.atan2(to.x - from.x, -(to.z - from.z));
}

export function createWorld(seed = 11) {
  const rings = planCourse(seed);
  const state = {
    screen: SCREEN_TITLE,
    reason: null,
    seed,
    pos: new THREE.Vector3(0, 0, 260),
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: COURSE.fuelStart,
    score: 0,
    ringsPassed: 0,
    time: 0,
    airborne: false,
    message: '',
    messageUntil: 0,
    best: 0,
    cameraMode: 'chase',
    landSouthbound: null,
    rings,
  };

  function say(text, seconds = 3) {
    state.message = text;
    state.messageUntil = state.time + seconds;
  }

  function reset() {
    state.screen = SCREEN_TITLE;
    state.reason = null;
    state.pos.set(RUNWAY.x, groundHeight(RUNWAY.x, 260, seed) + 1.4, 260);
    state.heading = 0;
    state.pitch = 0;
    state.roll = 0;
    state.speed = 0;
    state.throttle = 0;
    state.fuel = COURSE.fuelStart;
    state.score = 0;
    state.ringsPassed = 0;
    state.time = 0;
    state.airborne = false;
    state.message = '';
    state.messageUntil = 0;
    state.cameraMode = 'chase';
    state.landSouthbound = null;
  }

  function nextRing() {
    return state.ringsPassed < rings.length ? rings[state.ringsPassed] : null;
  }

  /** Where the jet should head now: the next ring, or the runway. */
  function objective() {
    const ring = nextRing();
    if (ring) return ring;
    return landingTarget();
  }

  function land(complete) {
    state.airborne = false;
    state.speed = 0;
    state.throttle = 0;
    if (complete) {
      const timeBonus = Math.min(COURSE.timeBonusMax, Math.max(0, Math.round((COURSE.parSeconds - state.time) * 1.25)));
      const fuelBonus = Math.round(state.fuel);
      state.score += COURSE.landingPoints + timeBonus + fuelBonus;
      state.reason = 'won';
      state.screen = SCREEN_OVER;
      return EVENT_OVER | EVENT_LANDED;
    }
    state.reason = 'landed-early';
    state.screen = SCREEN_OVER;
    return EVENT_OVER | EVENT_LANDED;
  }

  function crash() {
    state.reason = state.fuel <= 0 ? 'fuel' : 'crashed';
    state.screen = SCREEN_OVER;
    return EVENT_OVER;
  }

  /**
   * One fixed step. `controls` is { pitch, roll, throttleDelta } with pitch
   * and roll in -1..1 (pitch +1 is stick back, climb; roll +1 banks right).
   * Returns an event bitmask.
   */
  function step(dt, controls) {
    if (state.screen !== SCREEN_PLAY) return 0;
    let events = 0;
    state.time += dt;

    // Throttle: the stick nudges it, fuel empty forces it to idle.
    if (state.fuel > 0) {
      state.throttle = clamp(state.throttle + controls.throttleDelta * dt * 0.55, 0, 1);
    } else {
      state.throttle = Math.max(0, state.throttle - dt * 0.5);
    }
    state.fuel = Math.max(0, state.fuel - (COURSE.fuelIdle + (COURSE.fuelFull - COURSE.fuelIdle) * state.throttle) * dt);
    if (state.fuel < 20 && state.fuel > 0 && Math.floor(state.time * 2) !== Math.floor((state.time - dt) * 2)) {
      say('LOW FUEL — LAND SOON', 1);
    }

    // Attitude: bank and pitch chase the stick, with a little inertia.
    const rollTarget = controls.roll * JET.maxBank;
    const pitchAuthority = state.speed < JET.stallSpeed ? 0.45 : 1;
    const pitchTarget = controls.pitch * JET.maxPitch * pitchAuthority;
    state.roll = lerp(state.roll, rollTarget, 1 - Math.exp(-dt * 3.2));
    state.pitch = lerp(state.pitch, pitchTarget, 1 - Math.exp(-dt * 2.6));

    // Banked turn: heading follows the bank; a level jet flies straight.
    const turnRate = Math.sin(state.roll) * JET.turnFactor * (0.35 + state.speed / JET.maxSpeed);
    state.heading += turnRate * dt;

    // Speed: throttle sets the target, a dive adds speed, a climb spends it.
    const diveBonus = -Math.sin(state.pitch) * 42;
    const targetSpeed = JET.minSpeed + state.throttle * (JET.maxSpeed - JET.minSpeed) + diveBonus;
    const accel = state.speed < targetSpeed ? JET.accel : JET.accel * 1.6;
    state.speed += clamp(targetSpeed - state.speed, -accel * dt, accel * dt);
    if (!state.airborne && state.speed > 62 && state.pitch > 0.04) {
      state.airborne = true;
      say('AIRBORNE', 2);
    }

    // Move, then let a slow jet sink.
    const forward = forwardVector(state.heading, state.pitch);
    state.pos.addScaledVector(forward, state.speed * dt);
    if (state.airborne && state.speed < JET.stallSpeed) {
      const sink = JET.stallSink * (1 - state.speed / JET.stallSpeed);
      state.pos.y -= sink * dt;
      if (Math.floor(state.time * 2) !== Math.floor((state.time - dt) * 2)) say('STALL — NOSE DOWN, THROTTLE UP', 1);
    }

    // Soft edge of the world: warn, and steer gently back toward the valley.
    const outside = Math.abs(state.pos.x) > WORLD.softEdge || Math.abs(state.pos.z) > WORLD.softEdge;
    if (outside) {
      say('TURN BACK — LEAVING THE VALLEY', 1);
      const home = headingTo(state.pos, new THREE.Vector3(0, state.pos.y, 0));
      state.heading += angleDelta(state.heading, home) * dt * 0.35;
    }

    // Rings: fly through the glowing gate (a little forgiveness beyond the rim).
    const ring = nextRing();
    if (ring && state.pos.distanceTo(ring) < COURSE.ringRadius * 1.6) {
      state.ringsPassed += 1;
      state.score += COURSE.ringPoints;
      events |= EVENT_RING;
      if (state.ringsPassed >= rings.length) say('ALL RINGS — LAND ON THE RUNWAY', 4);
      else say(`RING ${state.ringsPassed}/${rings.length}  +${COURSE.ringPoints}`, 2);
    }

    // Ground: a gentle touchdown on the strip is a landing, anything else is a crash.
    // A jet climbing away from the runway is neither: only a descent can end a flight.
    const ground = groundHeight(state.pos.x, state.pos.z, seed);
    if (state.pos.y <= ground + 1.3) {
      const onStrip = Math.abs(state.pos.x - RUNWAY.x) < RUNWAY.halfWidth
        && state.pos.z > RUNWAY.zMin && state.pos.z < RUNWAY.zMax;
      const gentle = state.speed < 62 && Math.abs(state.pitch) < 0.22 && Math.abs(state.roll) < 0.4;
      const climbingAway = state.airborne && forward.y * state.speed > 1;
      if (!state.airborne) {
        // Still rolling: stay on the ground, keep rolling (and rotating for takeoff).
        state.pos.y = ground + 1.3;
      } else if (climbingAway) {
        state.pos.y = ground + 1.3;
      } else if (onStrip && gentle) {
        state.pos.y = ground + 1.3;
        return events | land(state.ringsPassed >= rings.length);
      } else {
        state.pos.y = ground + 1.3;
        return events | crash();
      }
    }
    if (state.message && state.time > state.messageUntil) state.message = '';
    return events;
  }

  function start() {
    reset();
    state.screen = SCREEN_PLAY;
  }

  function pause() {
    if (state.screen === SCREEN_PLAY) state.screen = SCREEN_PAUSED;
  }

  function resume() {
    if (state.screen === SCREEN_PAUSED) state.screen = SCREEN_PLAY;
  }

  function toTitle() {
    reset();
  }

  reset();
  return {
    state,
    step,
    start,
    pause,
    resume,
    toTitle,
    nextRing,
    objective,
    say,
    groundAt(x, z) {
      return groundHeight(x, z, seed);
    },
  };
}
