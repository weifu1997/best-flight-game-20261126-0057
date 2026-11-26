// The valley itself: one deterministic height function shared by the mesh,
// the physics and the screenshots, plus everything built on top of it
// (runway, river, town, trees, clouds, sky).
import { PALETTE, RUNWAY, WORLD } from './config.js';
import { createRandom, clamp, lerp, range } from './random.js';

const THREE = window.THREE;

/** Smooth interpolation for value noise. */
function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Deterministic lattice hash in [-1, 1]. */
function lattice(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634781) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = lattice(ix, iz, seed);
  const b = lattice(ix + 1, iz, seed);
  const c = lattice(ix, iz + 1, seed);
  const d = lattice(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}

/** The river's centreline: a gentle S-curve down the east side of the valley. */
export function riverX(z) {
  return 420 + 260 * Math.sin(z * 0.0011) + 90 * Math.sin(z * 0.0027 + 1.7);
}

/** Distance from a point to the runway strip (0 on the strip). */
function runwayDistance(x, z) {
  const dz = clamp(z, RUNWAY.zMin, RUNWAY.zMax) - z;
  const dx = Math.abs(x - RUNWAY.x);
  return Math.hypot(Math.max(0, dx - RUNWAY.halfWidth), dz);
}

/**
 * Ground height at (x, z). Rolling hills from two octaves of value noise,
 * mountains rising toward the edges, a carved river valley, and a flattened
 * apron around the runway so takeoffs and landings are possible.
 */
export function groundHeight(x, z, seed = 11) {
  const edge = Math.max(Math.abs(x), Math.abs(z)) / WORLD.half;
  const hills =
    valueNoise(x * 0.0016, z * 0.0016, seed) * 34 +
    valueNoise(x * 0.0042, z * 0.0042, seed + 7) * 14;
  const mountains = Math.pow(Math.max(0, edge - 0.62) / 0.38, 2) * 260;
  let h = 8 + hills + mountains;
  // River valley: pull the ground down toward the waterline near the river.
  const riverGap = Math.abs(x - riverX(z));
  const valley = Math.exp(-(riverGap * riverGap) / (2 * 150 * 150));
  h = lerp(h, 1.5, valley * 0.9);
  // Runway apron: flatten to the runway level.
  const apron = 1 - clamp(runwayDistance(x, z) / 260, 0, 1);
  const flat = apron * apron * (3 - 2 * apron);
  return lerp(h, 2, flat);
}

/** Colour of the ground at a point, by height, slope and place. */
function groundColor(x, z, h, slope) {
  const c = new THREE.Color(PALETTE.grass);
  const dry = new THREE.Color(PALETTE.grassDry);
  const forest = new THREE.Color(PALETTE.forest);
  const rock = new THREE.Color(PALETTE.rock);
  const snow = new THREE.Color(PALETTE.snow);
  const sand = new THREE.Color(PALETTE.sand);
  const n = valueNoise(x * 0.01, z * 0.01, 99);
  c.lerp(dry, clamp(0.5 + n * 0.5, 0, 1) * 0.7);
  if (h > 60) c.lerp(forest, clamp((h - 60) / 60, 0, 1) * 0.55);
  if (slope > 0.55) c.lerp(rock, clamp((slope - 0.55) * 2, 0, 1));
  if (h > 150) c.lerp(rock, clamp((h - 150) / 80, 0, 1));
  if (h > 235) c.lerp(snow, clamp((h - 235) / 40, 0, 1));
  const riverGap = Math.abs(x - riverX(z));
  if (riverGap < 26 && h < 12) c.lerp(sand, clamp(1 - riverGap / 26, 0, 1) * 0.8);
  if (runwayDistance(x, z) < 24) c.lerp(new THREE.Color('#7a8a5a'), 0.45);
  return c;
}

function buildTerrainMesh(seed) {
  const size = WORLD.size;
  const seg = WORLD.terrainSegments;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const step = size / seg;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z, seed);
    pos.setY(i, h);
    const slope = Math.max(
      Math.abs(groundHeight(x + step, z, seed) - h),
      Math.abs(groundHeight(x, z + step, seed) - h),
    ) / step;
    const c = groundColor(x, z, h, slope);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

/** A flat ribbon of water following the river, just above the valley floor. */
function buildRiverMesh() {
  const points = [];
  for (let z = -WORLD.half; z <= WORLD.half; z += 100) points.push(z);
  const width = 46;
  const verts = [];
  const idx = [];
  points.forEach((z, i) => {
    const cx = riverX(z);
    verts.push(cx - width / 2, 1.6, z, cx + width / 2, 1.6, z);
    if (i > 0) {
      const b = (i - 1) * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.9 }),
  );
}

/** The runway: dark asphalt, centreline dashes, threshold bars, edge lights. */
function buildRunwayMesh() {
  const group = new THREE.Group();
  const length = RUNWAY.zMax - RUNWAY.zMin;
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.halfWidth * 2, length),
    new THREE.MeshLambertMaterial({ color: PALETTE.runway }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(RUNWAY.x, 2.4, (RUNWAY.zMin + RUNWAY.zMax) / 2);
  strip.receiveShadow = true;
  group.add(strip);
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.runwayLine });
  for (let z = RUNWAY.zMin + 40; z < RUNWAY.zMax - 20; z += 60) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 26), lineMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(RUNWAY.x, 2.5, z);
    group.add(dash);
  }
  for (const z of [RUNWAY.zMin + 12, RUNWAY.zMax - 12]) {
    for (let i = -2; i <= 2; i += 1) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(4, 14), lineMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(RUNWAY.x + i * 6, 2.5, z);
      group.add(bar);
    }
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: '#ffd76a' });
  for (let z = RUNWAY.zMin; z <= RUNWAY.zMax; z += 80) {
    for (const x of [RUNWAY.x - RUNWAY.halfWidth - 2, RUNWAY.x + RUNWAY.halfWidth + 2]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), lightMat);
      light.position.set(x, 3.2, z);
      group.add(light);
    }
  }
  return group;
}

/** A small airfield town: houses with pitched roofs beside the runway. */
function buildTownMesh(random, seed) {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshLambertMaterial({ color: '#e8e2d4' });
  const roofMat = new THREE.MeshLambertMaterial({ color: '#b5533c' });
  const roofMat2 = new THREE.MeshLambertMaterial({ color: '#4a6b8a' });
  for (let i = 0; i < 26; i += 1) {
    const x = 60 + random() * 220;
    const z = -260 + random() * 520;
    if (runwayDistance(x, z) < 40) continue;
    const w = range(random, 10, 18);
    const d = range(random, 10, 16);
    const h = range(random, 6, 12);
    const house = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    walls.position.y = groundHeight(x, z, seed) + h / 2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 4, 4), i % 2 ? roofMat : roofMat2);
    roof.position.y = groundHeight(x, z, seed) + h + 2;
    roof.rotation.y = Math.PI / 4;
    house.add(walls, roof);
    house.position.set(x, 0, z);
    house.rotation.y = random() * Math.PI;
    group.add(house);
  }
  return group;
}

/** Low-poly conifers scattered where the ground is green and flat enough. */
function buildTreesMesh(random, seed) {
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 5, 5);
  const crownGeo = new THREE.ConeGeometry(4.5, 14, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#6b4a2f' });
  const crownMat = new THREE.MeshLambertMaterial({ color: PALETTE.forest });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, 420);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, 420);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  let placed = 0;
  let tries = 0;
  while (placed < 420 && tries < 6000) {
    tries += 1;
    const x = range(random, -1900, 1900);
    const z = range(random, -1900, 1900);
    const h = groundHeight(x, z, seed);
    if (h < 6 || h > 110) continue;
    if (runwayDistance(x, z) < 60) continue;
    if (Math.abs(x - riverX(z)) < 60) continue;
    const scale = range(random, 0.7, 1.6);
    s.set(scale, scale, scale);
    m.compose(new THREE.Vector3(x, h + 2.5 * scale, z), q, s);
    trunks.setMatrixAt(placed, m);
    m.compose(new THREE.Vector3(x, h + (5 + 7) * scale, z), q, s);
    crowns.setMatrixAt(placed, m);
    placed += 1;
  }
  trunks.count = placed;
  crowns.count = placed;
  const group = new THREE.Group();
  group.add(trunks, crowns);
  return group;
}

/** Soft white puffs drifting above the valley. */
function buildCloudsMesh(random) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92 });
  for (let i = 0; i < 16; i += 1) {
    const puff = new THREE.Group();
    const blobs = 3 + Math.floor(random() * 3);
    for (let b = 0; b < blobs; b += 1) {
      const r = range(random, 18, 42);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
      ball.position.set(range(random, -50, 50), range(random, -6, 6), range(random, -24, 24));
      ball.scale.y = 0.45;
      puff.add(ball);
    }
    puff.position.set(range(random, -1800, 1800), range(random, 260, 420), range(random, -1800, 1800));
    puff.userData.drift = range(random, 1.5, 4);
    group.add(puff);
  }
  return group;
}

/** A big gradient dome for the sky, plus the sun disc. */
function buildSkyMesh() {
  const geo = new THREE.SphereGeometry(6000, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      bottom: { value: new THREE.Color(PALETTE.skyHorizon) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bottom; void main(){ float t = clamp(normalize(vP).y * 1.6 + 0.25, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
  });
  const dome = new THREE.Mesh(geo, mat);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(180, 24),
    new THREE.MeshBasicMaterial({ color: '#fff3c4', fog: false }),
  );
  sun.position.set(-2600, 1500, -4200);
  sun.lookAt(0, 0, 0);
  const group = new THREE.Group();
  group.add(dome, sun);
  return group;
}

/** Build every static piece of the valley and return them as a group. */
export function buildValley(seed = 11) {
  const random = createRandom(seed * 31 + 5);
  const group = new THREE.Group();
  group.add(buildTerrainMesh(seed));
  group.add(buildRiverMesh());
  group.add(buildRunwayMesh());
  group.add(buildTownMesh(random, seed));
  group.add(buildTreesMesh(random, seed));
  group.add(buildCloudsMesh(random));
  group.add(buildSkyMesh());
  return group;
}
