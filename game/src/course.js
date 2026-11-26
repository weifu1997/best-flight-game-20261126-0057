// The ring course: ten glowing gates strung along a winding path over the
// valley, ending back at the runway for the landing. Rings are built once
// from the seed; the world only flips their state as the jet passes them.
import { COURSE, RUNWAY } from './config.js';
import { createRandom, clamp, range } from './random.js';
import { groundHeight, riverX } from './terrain.js';

const THREE = window.THREE;

/** Waypoints for the course: one wide serpentine down the valley, each leg
 * long enough to line up on, heights 70-170 m above the ground below. */
export function planCourse(seed = 11) {
  const random = createRandom(seed * 97 + 3);
  const points = [];
  for (let i = 0; i < COURSE.rings; i += 1) {
    const t = i / (COURSE.rings - 1);
    const x = 850 * Math.sin(t * Math.PI * 2.4);
    const z = -1150 + 2300 * t;
    const ground = groundHeight(x, z, seed);
    const y = Math.max(ground + 70, range(random, 90, 175));
    points.push(new THREE.Vector3(x, y, z));
  }
  // Final gate sits on the runway approach so the landing flows from it.
  points[COURSE.rings - 1].set(0, 95, -620);
  return points;
}

/** Build the torus meshes for the gates; index i is gate i. */
export function buildRings(points) {
  const group = new THREE.Group();
  const geo = new THREE.TorusGeometry(COURSE.ringRadius, COURSE.ringTube, 12, 40);
  const meshes = points.map((point, i) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.95 });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(point);
    // Face the gate along the course direction.
    const next = points[Math.min(i + 1, points.length - 1)];
    const prev = points[Math.max(i - 1, 0)];
    const dir = next.clone().sub(prev).normalize();
    ring.lookAt(point.clone().add(dir));
    ring.userData.index = i;
    group.add(ring);
    return ring;
  });
  return { group, meshes };
}

/** Runway threshold the jet aims for on the landing: centre of the strip. */
export function landingTarget() {
  return new THREE.Vector3(RUNWAY.x, 30, 0);
}

export function ringColor(state) {
  return state === 'done' ? 0x37c978 : state === 'next' ? 0xffb020 : 0x8a94a6;
}

/** Keep ring colours and pulse in step with the world's progress. */
export function paintRings(meshes, nextIndex, time) {
  meshes.forEach((ring, i) => {
    const state = i < nextIndex ? 'done' : i === nextIndex ? 'next' : 'later';
    ring.material.color.setHex(ringColor(state));
    if (state === 'next') {
      const pulse = 1 + Math.sin(time * 4) * 0.08;
      ring.scale.setScalar(pulse);
      ring.material.opacity = 0.95;
    } else {
      ring.scale.setScalar(1);
      ring.material.opacity = state === 'done' ? 0.45 : 0.6;
    }
  });
}
