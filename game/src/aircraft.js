// The Meridian jet: a low-poly single-engine jet built from primitives,
// white with a teal stripe and orange accents. Returns a group whose
// `userData` carries the parts the renderer banks and the lights it blinks.
import { PALETTE } from './config.js';

const THREE = window.THREE;

function lambert(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

/** Build the jet. Forward is -z, up is +y, wingspan along x. */
export function buildJet() {
  const jet = new THREE.Group();
  const body = lambert(PALETTE.jetBody);
  const accent = lambert(PALETTE.jetAccent);
  const trim = lambert(PALETTE.jetTrim);
  const glass = new THREE.MeshPhongMaterial({ color: '#10283e', shininess: 120, specular: '#9fd8ff' });

  // Fuselage: a tapered tube with a pointed nose.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 6.4, 12), body);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.4;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.7, 12), body);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -4.15;
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 1.6, 10), trim);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 4.3;

  // Canopy: a dark glass bubble on top of the nose.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), glass);
  canopy.scale.set(0.85, 0.62, 1.9);
  canopy.position.set(0, 0.72, -1.6);

  // Main wings, swept back a touch; tailplane and fin.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.16, 2.1), body);
  wing.position.set(0, -0.05, 0.9);
  wing.rotation.y = 0.1;
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.6), accent);
  wingTipL.position.set(-4.7, -0.05, 1.15);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 4.7;
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 1.1), trim);
  tailplane.position.set(0, 0.28, 4.1);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 1.5), trim);
  fin.position.set(0, 0.95, 4.2);
  fin.rotation.x = -0.25;

  // Intake and exhaust: dark mouth, glowing nozzle.
  const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10), lambert('#1c222b'));
  intake.rotation.x = Math.PI / 2;
  intake.position.set(0, -0.35, -2.2);
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.5, 0.7, 10),
    new THREE.MeshBasicMaterial({ color: '#ff9a3c' }),
  );
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0, 5.0);

  // Navigation lights: red port, green starboard, white tail strobe.
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2e2e' }));
  navL.position.set(-4.85, -0.05, 1.15);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: '#2eff5a' }));
  navR.position.set(4.85, -0.05, 1.15);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  strobe.position.set(0, 0.4, 5.2);

  jet.add(fuselage, nose, tail, canopy, wing, wingTipL, wingTipR, tailplane, fin, intake, nozzle, navL, navR, strobe);
  jet.traverse((part) => {
    if (part.isMesh) part.castShadow = true;
  });
  jet.userData.nozzle = nozzle;
  jet.userData.strobe = strobe;
  jet.userData.navL = navL;
  jet.userData.navR = navR;
  return jet;
}
