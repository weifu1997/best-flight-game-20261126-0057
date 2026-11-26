// Keyboard and mouse input. Arrows / WASD fly the jet, Shift and Ctrl work
// the throttle, C swaps the camera, P pauses, M mutes, Enter starts.
// Mouse: hold and drag to steer, wheel for throttle.
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_CAMERA = 'camera';
export const ACTION_MUTE = 'mute';
export const ACTION_RESTART = 'restart';

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyC: ACTION_CAMERA,
  KeyM: ACTION_MUTE,
  KeyR: ACTION_RESTART,
};

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { down: false, x: 0, y: 0, dx: 0, dy: 0 };

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) pressed.add(action);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseDown(event) {
    mouse.down = true;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  }
  function onMouseMove(event) {
    if (!mouse.down) return;
    mouse.dx = event.clientX - mouse.x;
    mouse.dy = event.clientY - mouse.y;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  }
  function onMouseUp() {
    mouse.down = false;
    mouse.dx = 0;
    mouse.dy = 0;
  }
  function onWheel(event) {
    event.preventDefault();
    mouse.dy += event.deltaY * 0.01;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  function axis(neg, pos) {
    return (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
  }

  return {
    /** -1..1 pitch stick (up is negative: pull back to climb). */
    pitch() {
      let value = axis('ArrowUp', 'ArrowDown');
      if (value === 0) value = axis('KeyW', 'KeyS');
      if (mouse.down) value += mouse.dy * 0.02;
      return Math.max(-1, Math.min(1, value));
    },
    /** -1..1 roll stick (left is negative). */
    roll() {
      let value = axis('ArrowLeft', 'ArrowRight');
      if (value === 0) value = axis('KeyA', 'KeyD');
      if (mouse.down) value += mouse.dx * 0.02;
      return Math.max(-1, Math.min(1, value));
    },
    /** Throttle nudges: +1 up, -1 down, 0 none (wheel feeds in too). */
    throttleDelta() {
      let value = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0)
        - (keys.has('ControlLeft') || keys.has('ControlRight') ? 1 : 0);
      if (mouse.dy !== 0) {
        value += mouse.dy > 0 ? -0.5 : 0.5;
        mouse.dy = 0;
      }
      return value;
    },
    /** True once for each press of an action key; consumed by the loop. */
    consume(action) {
      if (!pressed.has(action)) return false;
      pressed.delete(action);
      return true;
    },
    anyKey() {
      return keys.size > 0 || mouse.down;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
    },
  };
}
