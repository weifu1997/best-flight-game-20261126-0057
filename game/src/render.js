// The renderer: a Three.js scene holding the valley, the jet and the rings,
// with a chase camera that banks with the jet and a cockpit camera that
// puts the pilot in the seat. The camera never goes under the terrain.
import { PALETTE } from './config.js';
import { clamp, lerp } from './random.js';
import { buildValley } from './terrain.js';
import { buildJet } from './aircraft.js';
import { buildRings, paintRings } from './course.js';
import { forwardVector } from './world.js';

const THREE = window.THREE;

export function createRenderer(canvas, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.fog, 900, 3800);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5d7a4a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.25);
  sun.position.set(-1400, 1800, -900);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 5000;
  scene.add(sun);
  scene.add(sun.target);

  scene.add(buildValley(world.state.seed));
  const jet = buildJet();
  scene.add(jet);
  const { group: ringsGroup, meshes: ringMeshes } = buildRings(world.state.rings);
  scene.add(ringsGroup);

  const camera = new THREE.PerspectiveCamera(68, 1, 0.5, 12000);
  const camPos = new THREE.Vector3(0, 40, 320);
  const camLook = new THREE.Vector3(0, 20, 0);
  let strobeTimer = 0;

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  /** Where the camera wants to be for this state (chase or cockpit). */
  function wantedCamPos(state, out) {
    const forward = forwardVector(state.heading, state.pitch);
    if (state.cameraMode === 'cockpit') {
      // In the seat: the pilot's head, inside the canopy bubble and just
      // above the fuselage — the glass is invisible from inside, the nose
      // sits at the bottom of the frame, the sky ahead.
      out.copy(state.pos)
        .addScaledVector(forward, 1.9)
        .add(new THREE.Vector3(0, 1.15, 0));
    } else if (state.screen === 'title') {
      // Title: closer in, so the jet on the strip fills the frame under the title.
      out.copy(state.pos)
        .addScaledVector(forward, -13)
        .add(new THREE.Vector3(0, 4.5, 0));
      const side = new THREE.Vector3(Math.cos(state.heading), 0, Math.sin(state.heading));
      out.addScaledVector(side, -state.roll * 4);
    } else {
      out.copy(state.pos)
        .addScaledVector(forward, -24)
        .add(new THREE.Vector3(0, 7.5, 0));
      const side = new THREE.Vector3(Math.cos(state.heading), 0, Math.sin(state.heading));
      out.addScaledVector(side, -state.roll * 7);
    }
    return out;
  }

  /** Jump the camera to its wanted spot at once (screenshot staging). */
  function snap(state) {
    wantedCamPos(state, camPos);
  }

  function draw(state, time) {
    // Jet pose: position, heading, pitch, bank. The model faces -z, so a
    // clockwise heading is a negative Y rotation, a climb is a positive X
    // rotation, and a right bank is a negative Z rotation.
    jet.position.copy(state.pos);
    jet.rotation.set(0, 0, 0);
    jet.rotateY(-state.heading);
    jet.rotateX(state.pitch);
    jet.rotateZ(-state.roll);
    // Engine glow and strobe follow the throttle and the clock.
    const nozzle = jet.userData.nozzle;
    const glow = 0.6 + state.throttle * 0.9;
    nozzle.material.color.setRGB(1, 0.55 + state.throttle * 0.2, 0.2);
    nozzle.scale.setScalar(glow);
    strobeTimer += 1 / 60;
    const strobeOn = strobeTimer % 1.2 < 0.12;
    jet.userData.strobe.visible = strobeOn;
    jet.userData.navL.visible = true;
    jet.userData.navR.visible = true;

    paintRings(ringMeshes, state.ringsPassed, time);

    // Sun follows the jet so shadows stay near the action.
    sun.position.set(state.pos.x - 1400, state.pos.y + 1800, state.pos.z - 900);
    sun.target.position.copy(state.pos);

    const forward = forwardVector(state.heading, state.pitch);
    // Ease toward the wanted spot (snap() jumps there at once for screenshots).
    const wanted = wantedCamPos(state, new THREE.Vector3());
    camPos.lerp(wanted, 1 - Math.exp(-5 * (1 / 60)));
    if (state.cameraMode === 'cockpit') {
      camLook.copy(state.pos).addScaledVector(forward, 120);
      camLook.y -= 4;
    } else {
      camLook.copy(state.pos).addScaledVector(forward, 40);
    }
    // Keep the camera out of the hills.
    const ground = world.groundAt(camPos.x, camPos.z);
    camPos.y = Math.max(camPos.y, ground + 3);
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(camLook);
    // Bank the view a little with the jet so turns feel like turns.
    camera.rotateZ(state.cameraMode === 'cockpit' ? state.roll * 0.55 : state.roll * 0.35);
    renderer.render(scene, camera);
  }

  return { draw, resize, camera, snap };
}
