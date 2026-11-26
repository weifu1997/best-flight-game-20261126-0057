// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between four screens:
// title, play, paused and game over. C swaps chase and cockpit cameras.
//
// ?seed=N fixes the valley and the ring course. ?shot=takeoff|flight|
// cockpit|landing (with &seed=N) stages that scene instead of running the
// loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createWorld, EVENT_OVER, EVENT_RING, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './world.js';
import { ACTION_CAMERA, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 11;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas, world);
const hud = createHud(world);
const audio = createAudio();
const input = createInput(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

world.state.best = readBest();

// Exposed for local playtesting and screenshot staging only.
window.__world = world;

function runShot(name) {
  const scene = stageShot(name, world);
  renderer.snap(world.state);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, world.state.time);
    hud.update(world.state, renderer.camera);
    hud.showScreen(scene.screen, world.state);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let clock = 0;

  function setScreen(next) {
    screen = next;
    hud.showScreen(next, world.state);
    status.textContent = next === SCREEN_TITLE
      ? 'Meridian Run: fly ten rings over the valley, then land on the runway.'
      : '';
  }

  function stepGame(dt) {
    const controls = {
      pitch: -input.pitch(),
      roll: input.roll(),
      throttleDelta: input.throttleDelta(),
    };
    const events = world.step(dt, controls);
    if (events & EVENT_RING) audio.ring();
    if (events & EVENT_OVER) {
      audio.crash();
      if (world.state.reason === 'won') audio.win();
      const best = Math.max(world.state.best, world.state.score);
      world.state.best = best;
      saveBest(best);
      setScreen(SCREEN_OVER);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    clock += frameDt;
    audio.unlock();

    if (input.consume(ACTION_MUTE)) {
      const muted = audio.toggleMute();
      world.say(muted ? 'SOUND OFF' : 'SOUND ON', 1);
    }
    if (input.consume(ACTION_CAMERA)) {
      world.state.cameraMode = world.state.cameraMode === 'cockpit' ? 'chase' : 'cockpit';
    }
    if (input.consume(ACTION_PAUSE)) {
      if (screen === SCREEN_PLAY) {
        world.pause();
        setScreen(SCREEN_PAUSED);
      } else if (screen === SCREEN_PAUSED) {
        world.resume();
        setScreen(SCREEN_PLAY);
      }
    }
    if (input.consume(ACTION_RESTART) && (screen === SCREEN_OVER || screen === SCREEN_PAUSED)) {
      world.start();
      setScreen(SCREEN_PLAY);
    }
    if (input.consume(ACTION_CONFIRM)) {
      if (screen === SCREEN_TITLE) {
        world.start();
        setScreen(SCREEN_PLAY);
      } else if (screen === SCREEN_OVER) {
        world.start();
        setScreen(SCREEN_PLAY);
      } else if (screen === SCREEN_PAUSED) {
        world.resume();
        setScreen(SCREEN_PLAY);
      }
    }

    if (screen === SCREEN_PLAY) {
      accumulator += frameDt;
      while (accumulator >= STEP) {
        stepGame(STEP);
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) break;
      }
    }
    audio.update({ throttle: world.state.throttle, speed: world.state.speed, flying: screen === SCREEN_PLAY });
    renderer.draw(world.state, clock);
    hud.update(world.state, renderer.camera);
  }

  setScreen(SCREEN_TITLE);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
