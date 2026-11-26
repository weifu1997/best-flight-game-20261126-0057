// The screenshot scenes behind ?shot=takeoff|flight|cockpit|landing. Each
// one plays the real rules forward from a fresh world for a fixed time,
// steered by a simple autopilot (bank toward the next ring, pitch toward
// its height, throttle up on the straights), so the frame is what a real
// sortie looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { angleDelta, clamp } from './random.js';
import { headingTo } from './world.js';

const TAKEOFF_SECONDS = 6;
const FLIGHT_SECONDS = 40;
const COCKPIT_SECONDS = 48;
const LAND_LIMIT_SECONDS = 600;

/**
 * Steer the jet toward `target`: bank into the heading error, pitch toward
 * the height error, and ease the throttle off on the final approach.
 */
export function autopilot(state, target) {
  const wantedHeading = headingTo(state.pos, target);
  const headingError = angleDelta(state.heading, wantedHeading);
  const roll = clamp(headingError * 1.8, -1, 1);
  const heightError = target.y - state.pos.y;
  const pitch = clamp(heightError * 0.018, -0.7, 0.7);
  // Slow down for the gate itself: a tighter turn lines the pass up.
  const dist = state.pos.distanceTo(target);
  const cruise = dist < 250 ? 0.55 : 0.85;
  const throttleDelta = clamp((cruise - state.throttle) * 2, -1, 1);
  return { pitch, roll, throttleDelta };
}

/**
 * Steer the landing: line up on the strip from whichever end is nearer,
 * descend on a shallow glide at approach speed, flare over the numbers.
 * The strip takes a landing from either direction. The heading target is
 * always far ahead down the strip, never the touchdown point itself —
 * aiming at a fixed point makes the jet orbit it instead of landing.
 */
/**
 * Steer the landing: fly the extended centreline, not a point — aiming at
 * a fixed point makes the jet orbit it instead of landing. Line up on the
 * strip from whichever end is nearer, descend on a shallow glide at
 * approach speed, flare over the numbers. The strip takes a landing from
 * either direction. A blown approach climbs out and comes back for another.
 */
export function landingPilot(state) {
  // Land from the side the jet is on: north of the strip, land heading
  // south; south of it, land heading north. The side is latched when the
  // landing starts and never re-derived: re-deciding it every step flips
  // the wanted heading each time the jet crosses the strip's centre and
  // the approach spins in circles around it.
  if (state.landSouthbound === null || state.landSouthbound === undefined) {
    state.landSouthbound = state.pos.z < 0;
  }
  const southbound = state.landSouthbound;
  const dir = southbound ? 1 : -1;
  const runwayHeading = southbound ? Math.PI : 0;
  const thresholdZ = southbound ? -320 : 320;
  const fixZ = southbound ? -560 : 560;
  // Distance still to fly to the threshold, along the approach (negative past it).
  const along = (thresholdZ - state.pos.z) * dir;

  // Bank with a PD controller on heading: the rate term stops the wings
  // hunting around the wanted heading (a plain proportional bank oscillates).
  const dt = 1 / 60;
  const prevHdg = state._prevHdg ?? state.heading;
  const headingRate = angleDelta(prevHdg, state.heading) / dt;
  state._prevHdg = state.heading;
  const bankTo = (wanted) => clamp(
    angleDelta(state.heading, wanted) * 1.4 - headingRate * 0.5, -1, 1,
  );

  // Go around: past the far end without touching down, climb out and rejoin.
  if (along < -620) state.goAround = true;
  if (state.goAround) {
    if (along > 300 && Math.abs(state.pos.x) < 150) state.goAround = false;
    else {
      const wantedHeading = headingTo(state.pos, { x: 0, y: 80, z: fixZ });
      const roll = bankTo(wantedHeading);
      const pitch = clamp((80 - state.pos.y) * 0.02, -0.2, 0.35);
      const throttleDelta = clamp((65 - state.speed) * 0.03, -1, 1);
      return { pitch, roll, throttleDelta };
    }
  }

  // Final: hold the centreline, descend on the glide path, flare low.
  // Steer by cross-track error against the fixed runway heading: the
  // wanted heading changes only as fast as the jet drifts off the line,
  // so the bank settles instead of hunting (a moving lookahead point
  // chases its own tail). Stay above 25 m while far off the line, so a
  // late correction never puts the jet on the grass beside the strip.
  const desiredHeading = runwayHeading + clamp(state.pos.x * 0.005 * dir, -0.6, 0.6);
  let desiredY = clamp(4 + Math.max(0, along) * 0.1, 4, 70);
  if (Math.abs(state.pos.x) > 60) desiredY = Math.max(desiredY, 25);
  const speedTarget = along > 300 ? 58 : 50;
  const roll = bankTo(desiredHeading);
  let pitch = clamp((desiredY - state.pos.y) * 0.02, -0.45, 0.3);
  // Bleed speed with pitch when fast.
  pitch += clamp((state.speed - speedTarget) * 0.012, 0, 0.18);
  // Flare: a gentle sink and a closed throttle over the numbers. A nose-up
  // flare here would climb the jet back off the runway instead of settling.
  let flare = false;
  if (along < 150 && along > -620 && state.pos.y < 6) {
    pitch = -0.03;
    flare = true;
  }
  const throttleDelta = clamp(((flare ? 42 : speedTarget) - state.speed) * 0.03, -1, 1);
  return { pitch: clamp(pitch, -0.5, 0.4), roll, throttleDelta };
}

/** Fly the world forward with the autopilot until `stop` says enough. */
function flyForward(world, seconds, stop) {
  const state = world.state;
  const trace = [];
  for (let i = 0; i < seconds / STEP; i += 1) {
    if (state.screen !== 'play') break;
    const landing = state.ringsPassed >= state.rings.length;
    const controls = landing ? landingPilot(state) : autopilot(state, world.objective());
    world.step(STEP, controls);
    if (i % 600 === 0) {
      trace.push({
        t: Math.round(state.time), rings: state.ringsPassed,
        x: Math.round(state.pos.x), y: Math.round(state.pos.y), z: Math.round(state.pos.z),
        spd: Math.round(state.speed), fuel: Math.round(state.fuel),
        hdg: Math.round(((state.heading * 180) / Math.PI % 360 + 360) % 360),
        roll: Math.round((state.roll * 180) / Math.PI), pitch: Math.round((state.pitch * 180) / Math.PI),
      });
    }
    if (stop && stop(state)) break;
  }
  window.__shotTrace = trace;
}

/**
 * Set the world to the named scene and return the screen to draw over it.
 * Any other name stages the takeoff scene.
 */
export function stageShot(name, world) {
  const state = world.state;
  if (name === 'flight' || name === 'cockpit') {
    world.start();
    // The cockpit shot is the flight scene from the pilot's seat: same
    // moment, same ring ahead, only the camera moves.
    const seconds = FLIGHT_SECONDS;
    flyForward(world, seconds);
    state.cameraMode = name === 'cockpit' ? 'cockpit' : 'chase';
    return { screen: 'play' };
  }
  if (name === 'landing') {
    world.start();
    state.cameraMode = 'chase';
    flyForward(world, LAND_LIMIT_SECONDS, (s) => s.screen !== 'play');
    window.__landingTrace = window.__shotTrace;
    window.__shotLog = {
      scene: 'landing', screen: state.screen, reason: state.reason,
      rings: state.ringsPassed, time: Math.round(state.time),
      score: state.score, fuel: Math.round(state.fuel),
    };
    if (state.screen !== 'over') {
      // The autopilot did not finish the course in time: show the flight instead.
      world.start();
      flyForward(world, FLIGHT_SECONDS);
      return { screen: 'play' };
    }
    return { screen: 'over' };
  }
  // takeoff: on the strip, engines running, title screen over the scene.
  world.toTitle();
  state.throttle = 0.55;
  for (let i = 0; i < TAKEOFF_SECONDS / STEP; i += 1) {
    state.time += STEP;
  }
  return { screen: 'title' };
}
