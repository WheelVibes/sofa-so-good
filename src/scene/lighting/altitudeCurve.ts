const DEG = Math.PI / 180;

export interface LightingValues {
  sun: number;
  ambient: number;
  sunColor: [number, number, number];
  /** Multiplier on `gl.toneMappingExposure`. 1.0 = neutral. */
  exposure: number;
  /**
   * Multiplier on the IBL environment map contribution. Attenuates HDRI
   * brightness so e.g. drei's `night` preset doesn't overlight a dark room.
   */
  envIntensity: number;
}

export interface SkyValues {
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
}

interface LightingKey {
  altDeg: number;
  values: LightingValues;
}

interface SkyKey {
  altDeg: number;
  values: SkyValues;
}

/** Sorted by altitude descending. */
const LIGHTING_KEYS: ReadonlyArray<LightingKey> = [
  { altDeg: 80, values: { sun: 1.15, ambient: 0.18, sunColor: [1.0, 0.99, 0.96], exposure: 1.1, envIntensity: 0.30 } },
  { altDeg: 30, values: { sun: 1.0,  ambient: 0.14, sunColor: [1.0, 0.96, 0.88], exposure: 1.0, envIntensity: 0.27 } },
  { altDeg: 15, values: { sun: 0.65, ambient: 0.11, sunColor: [1.0, 0.92, 0.80], exposure: 0.9, envIntensity: 0.20 } },
  { altDeg: 6,  values: { sun: 0.3,  ambient: 0.07, sunColor: [1.0, 0.78, 0.55], exposure: 0.72, envIntensity: 0.13 } },
  { altDeg: 0,  values: { sun: 0.08, ambient: 0.05, sunColor: [1.0, 0.60, 0.32], exposure: 0.6, envIntensity: 0.09 } },
  { altDeg: -6, values: { sun: 0.02, ambient: 0.04, sunColor: [0.45, 0.50, 0.65], exposure: 0.55, envIntensity: 0.09 } },
  { altDeg: -12, values: { sun: 0,   ambient: 0.03, sunColor: [0.24, 0.29, 0.42], exposure: 0.6, envIntensity: 0.05 } },
];

// Tropics baseline turbidity is higher than temperate latitudes (humid haze).
const SKY_KEYS: ReadonlyArray<SkyKey> = [
  { altDeg: 80, values: { turbidity: 6, rayleigh: 0.9, mieCoefficient: 0.005, mieDirectionalG: 0.8 } },
  { altDeg: 30, values: { turbidity: 7, rayleigh: 1, mieCoefficient: 0.005, mieDirectionalG: 0.8 } },
  { altDeg: 10, values: { turbidity: 8, rayleigh: 1.5, mieCoefficient: 0.006, mieDirectionalG: 0.82 } },
  { altDeg: 0, values: { turbidity: 8, rayleigh: 3, mieCoefficient: 0.01, mieDirectionalG: 0.9 } },
  { altDeg: -6, values: { turbidity: 9, rayleigh: 1, mieCoefficient: 0.008, mieDirectionalG: 0.85 } },
  { altDeg: -12, values: { turbidity: 10, rayleigh: 0.1, mieCoefficient: 0.005, mieDirectionalG: 0.8 } },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpLighting(a: LightingValues, b: LightingValues, t: number): LightingValues {
  return {
    sun: lerp(a.sun, b.sun, t),
    ambient: lerp(a.ambient, b.ambient, t),
    sunColor: [
      lerp(a.sunColor[0], b.sunColor[0], t),
      lerp(a.sunColor[1], b.sunColor[1], t),
      lerp(a.sunColor[2], b.sunColor[2], t),
    ],
    exposure: lerp(a.exposure, b.exposure, t),
    envIntensity: lerp(a.envIntensity, b.envIntensity, t),
  };
}

function interpSky(a: SkyValues, b: SkyValues, t: number): SkyValues {
  return {
    turbidity: lerp(a.turbidity, b.turbidity, t),
    rayleigh: lerp(a.rayleigh, b.rayleigh, t),
    mieCoefficient: lerp(a.mieCoefficient, b.mieCoefficient, t),
    mieDirectionalG: lerp(a.mieDirectionalG, b.mieDirectionalG, t),
  };
}

/** Find adjacent keyframes for a given altitude (radians) and return
 *  (upper, lower, t) where t∈[0,1] interpolates from `lower` toward `upper`. */
function bracket<T extends { altDeg: number }>(keys: ReadonlyArray<T>, altRad: number): { upper: T; lower: T; t: number } {
  const altDeg = altRad / DEG;
  if (altDeg >= keys[0].altDeg) return { upper: keys[0], lower: keys[0], t: 0 };
  if (altDeg <= keys[keys.length - 1].altDeg) {
    const k = keys[keys.length - 1];
    return { upper: k, lower: k, t: 0 };
  }
  for (let i = 0; i < keys.length - 1; i++) {
    const upper = keys[i];
    const lower = keys[i + 1];
    if (altDeg <= upper.altDeg && altDeg >= lower.altDeg) {
      const span = upper.altDeg - lower.altDeg;
      const t = span === 0 ? 0 : (altDeg - lower.altDeg) / span;
      return { upper, lower, t };
    }
  }
  return { upper: keys[keys.length - 1], lower: keys[keys.length - 1], t: 0 };
}

export function lightingFromAltitude(altRad: number): LightingValues {
  const { upper, lower, t } = bracket(LIGHTING_KEYS, altRad);
  return interpLighting(lower.values, upper.values, t);
}

export function skyFromAltitude(altRad: number): SkyValues {
  const { upper, lower, t } = bracket(SKY_KEYS, altRad);
  return interpSky(lower.values, upper.values, t);
}

const ADMITTANCE_KEYS: ReadonlyArray<{ altDeg: number; v: number }> = [
  { altDeg: 30, v: 1.0 },
  { altDeg: 15, v: 0.85 },
  { altDeg: 6,  v: 0.55 },
  { altDeg: 0,  v: 0.25 },
  { altDeg: -6, v: 0.0 },
];

export function daylightAdmittance(altRad: number): number {
  const altDeg = altRad / DEG;
  if (altDeg >= ADMITTANCE_KEYS[0].altDeg) return ADMITTANCE_KEYS[0].v;
  if (altDeg <= ADMITTANCE_KEYS[ADMITTANCE_KEYS.length - 1].altDeg) return 0;
  for (let i = 0; i < ADMITTANCE_KEYS.length - 1; i++) {
    const upper = ADMITTANCE_KEYS[i];
    const lower = ADMITTANCE_KEYS[i + 1];
    if (altDeg <= upper.altDeg && altDeg >= lower.altDeg) {
      const span = upper.altDeg - lower.altDeg;
      const t = span === 0 ? 0 : (altDeg - lower.altDeg) / span;
      return lerp(lower.v, upper.v, t);
    }
  }
  return 0;
}
