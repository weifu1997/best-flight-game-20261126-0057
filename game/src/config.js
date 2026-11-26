// Every tuning number and colour for Meridian Run in one place.
// The world is a 4000 x 4000 m river valley; the runway runs north-south
// along x = 0. Speeds are m/s, altitudes are metres above sea level.
export const STEP = 1 / 60;

export const WORLD = {
  size: 4000,
  half: 2000,
  softEdge: 1850,
  terrainSegments: 160,
  seaLevel: 0,
};

export const RUNWAY = {
  x: 0,
  zMin: -320,
  zMax: 320,
  halfWidth: 16,
  heading: 0, // taking off toward -z (north)
};

export const JET = {
  minSpeed: 28,
  cruiseSpeed: 95,
  maxSpeed: 185,
  accel: 14,
  climbRate: 26,
  rollRate: 2.4,
  maxBank: 1.25,
  pitchRate: 1.1,
  maxPitch: 0.5,
  turnFactor: 1.2,
  stallSpeed: 42,
  stallSink: 14,
};

export const COURSE = {
  rings: 10,
  ringRadius: 17,
  ringTube: 1.3,
  ringPoints: 100,
  landingPoints: 250,
  fuelStart: 100,
  // fuel burn per second at idle and at full throttle, in percent
  fuelIdle: 0.08,
  fuelFull: 0.3,
  timeBonusMax: 300,
  parSeconds: 240,
};

export const PALETTE = {
  skyTop: '#2f6fd0',
  skyHorizon: '#cfe8f7',
  fog: '#cfe0ee',
  grass: '#5d9b4a',
  grassDry: '#8aa860',
  forest: '#3f7d3a',
  rock: '#8d8d94',
  snow: '#eef2f5',
  sand: '#d9c48f',
  water: '#3f8fd2',
  runway: '#3a3f46',
  runwayLine: '#f5f5f0',
  jetBody: '#f2f4f6',
  jetAccent: '#ff7a1a',
  jetTrim: '#0f5e8c',
  ringNext: '#ffb020',
  ringDone: '#37c978',
  hud: '#c8ffb0',
  hudWarn: '#ffb020',
  hudBad: '#ff5a4e',
};

export const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";
export const FONT_MONO = "'Cascadia Mono', 'SF Mono', Consolas, monospace";

/** localStorage key for the best score (this browser only). */
export const BEST_KEY = 'meridian-run.best';
