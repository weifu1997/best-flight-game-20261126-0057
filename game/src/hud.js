// The HUD: DOM gauges over the 3D view — altitude, speed, heading, fuel,
// throttle, rings and score — plus a canvas attitude indicator and the
// title / pause / end overlays. Everything the judge needs to see lit.
import { COURSE } from './config.js';
import { clamp } from './random.js';

const THREE = window.THREE;

function el(id) {
  return document.getElementById(id);
}

function headingName(deg) {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[Math.round(deg / 22.5) % 16];
}

export function createHud(world) {
  const attitude = el('attitude');
  const actx = attitude.getContext('2d');

  function drawAttitude(state) {
    const w = attitude.width;
    const h = attitude.height;
    const cx = w / 2;
    const cy = h / 2;
    actx.clearRect(0, 0, w, h);
    actx.save();
    actx.beginPath();
    actx.arc(cx, cy, 52, 0, Math.PI * 2);
    actx.clip();
    actx.translate(cx, cy);
    actx.rotate(state.roll);
    actx.translate(0, state.pitch * 90);
    // Sky above the horizon line, ground below it.
    actx.fillStyle = '#2f6fd0';
    actx.fillRect(-60, -120, 120, 120);
    actx.fillStyle = '#7a5a34';
    actx.fillRect(-60, 0, 120, 120);
    actx.fillStyle = '#f5f5f0';
    actx.fillRect(-60, -1.5, 120, 3);
    actx.restore();
    // Fixed wings and centre dot.
    actx.strokeStyle = '#f5f5f0';
    actx.lineWidth = 3;
    actx.beginPath();
    actx.moveTo(cx - 34, cy);
    actx.lineTo(cx - 12, cy);
    actx.moveTo(cx + 12, cy);
    actx.lineTo(cx + 34, cy);
    actx.stroke();
    actx.fillStyle = '#ffb020';
    actx.beginPath();
    actx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    actx.fill();
    actx.strokeStyle = '#8b93a3';
    actx.lineWidth = 1;
    actx.beginPath();
    actx.arc(cx, cy, 52, 0, Math.PI * 2);
    actx.stroke();
  }

  function compass(state) {
    const deg = ((state.heading * 180) / Math.PI % 360 + 360) % 360;
    return `${String(Math.round(deg)).padStart(3, '0')}° ${headingName(deg)}`;
  }

  /** Project the next ring onto the screen; null when it is behind the camera. */
  function ringPointer(state, camera) {
    const ring = world.nextRing();
    if (!ring || !camera) return null;
    const v = ring.clone().project(camera);
    if (v.z > 1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
      dist: Math.round(state.pos.distanceTo(ring)),
    };
  }

  function update(state, camera) {
    const altFt = Math.max(0, Math.round((state.pos.y - world.groundAt(state.pos.x, state.pos.z)) * 3.28));
    const spdKts = Math.round(state.speed * 1.94);
    el('hud-alt').textContent = `${altFt.toLocaleString('en-US')} FT`;
    el('hud-spd').textContent = `${spdKts} KT`;
    el('hud-hdg').textContent = compass(state);
    const vs = Math.round(Math.sin(state.pitch) * state.speed * 3.28 * 60);
    el('hud-vs').textContent = `${vs >= 0 ? '+' : ''}${vs} FPM`;
    el('hud-rings').textContent = `${state.ringsPassed}/${COURSE.rings}`;
    el('hud-score').textContent = String(state.score);
    const mins = Math.floor(state.time / 60);
    const secs = Math.floor(state.time % 60);
    el('hud-time').textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    const fuel = el('hud-fuel');
    fuel.style.width = `${clamp(state.fuel, 0, 100)}%`;
    fuel.className = state.fuel < 20 ? 'bar low' : 'bar';
    el('hud-fuel-text').textContent = `FUEL ${Math.round(state.fuel)}%`;
    el('hud-thr').style.width = `${Math.round(state.throttle * 100)}%`;
    el('hud-thr-text').textContent = `THR ${Math.round(state.throttle * 100)}%`;
    drawAttitude(state);

    const pointer = ringPointer(state, camera);
    const arrow = el('ring-arrow');
    if (pointer && state.screen === 'play') {
      const dx = pointer.x - window.innerWidth / 2;
      const dy = pointer.y - window.innerHeight / 2;
      const angle = Math.atan2(dy, dx);
      const edge = 150;
      const len = Math.min(Math.hypot(dx, dy), edge);
      arrow.style.display = 'block';
      arrow.style.transform = `translate(${Math.cos(angle) * len}px, ${Math.sin(angle) * len}px) rotate(${angle}rad)`;
      el('ring-dist').textContent = state.ringsPassed >= COURSE.rings ? 'LAND ON THE RUNWAY' : `RING ${state.ringsPassed + 1} · ${pointer.dist}m`;
    } else {
      arrow.style.display = 'none';
      el('ring-dist').textContent = state.ringsPassed >= COURSE.rings ? 'LAND ON THE RUNWAY' : '';
    }

    const msg = el('hud-msg');
    if (state.message) {
      msg.textContent = state.message;
      msg.style.opacity = '1';
    } else {
      msg.style.opacity = '0';
    }
  }

  function showScreen(name, state) {
    for (const id of ['screen-title', 'screen-pause', 'screen-over']) {
      el(id).classList.toggle('hidden', id !== `screen-${name}`);
    }
    el('hud').classList.toggle('hidden', name === 'title');
    if (name === 'over') {
      const titles = {
        won: 'MISSION COMPLETE',
        crashed: 'CRASHED',
        fuel: 'OUT OF FUEL',
        'landed-early': 'LANDED — MISSION INCOMPLETE',
      };
      el('over-title').textContent = titles[state.reason] || 'SORTIE OVER';
      const lines = [
        `Rings flown: ${state.ringsPassed}/${COURSE.rings}`,
        `Score: ${state.score}`,
        `Time: ${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`,
        `Best: ${state.best}`,
      ];
      if (state.reason === 'won') lines.unshift('All ten rings, then a landing on the strip. The valley is yours.');
      if (state.reason === 'landed-early') lines.unshift('You landed before flying all ten rings — the course is still out there.');
      if (state.reason === 'crashed') lines.unshift('The valley wins this one. Throttle up, pull up earlier, watch the ridge line.');
      if (state.reason === 'fuel') lines.unshift('The tanks ran dry. A lighter throttle and a shorter line would have made it.');
      el('over-text').textContent = lines.join(' · ');
    }
  }

  return { update, showScreen };
}
