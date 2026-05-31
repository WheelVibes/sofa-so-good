const DEG = Math.PI / 180

export interface LightingValues {
  sun: number
  ambient: number
  sunColor: [number, number, number]
  /** Hemisphere sky tint — light arriving from above (RGB 0..1). */
  skyColor: [number, number, number]
  /** Hemisphere ground-bounce tint — light arriving from below (RGB 0..1). */
  groundColor: [number, number, number]
}

export interface SkyValues {
  turbidity: number
  rayleigh: number
  mieCoefficient: number
  mieDirectionalG: number
}

interface LightingKey {
  altDeg: number
  values: LightingValues
}

interface SkyKey {
  altDeg: number
  values: SkyValues
}

/** Sorted by altitude descending. */
const LIGHTING_KEYS: ReadonlyArray<LightingKey> = [
  {
    altDeg: 30,
    values: {
      sun: 1.0,
      ambient: 0.6,
      sunColor: [1.0, 0.96, 0.88],
      skyColor: [0.55, 0.66, 0.92],
      groundColor: [0.42, 0.38, 0.34],
    },
  },
  {
    altDeg: 10,
    values: {
      sun: 0.85,
      ambient: 0.55,
      sunColor: [1.0, 0.92, 0.78],
      skyColor: [0.62, 0.62, 0.78],
      groundColor: [0.4, 0.34, 0.3],
    },
  },
  {
    altDeg: 0,
    values: {
      sun: 0.4,
      ambient: 0.4,
      sunColor: [1.0, 0.72, 0.42],
      skyColor: [0.72, 0.56, 0.46],
      groundColor: [0.34, 0.28, 0.25],
    },
  },
  {
    altDeg: -6,
    values: {
      sun: 0.05,
      ambient: 0.18,
      sunColor: [0.45, 0.5, 0.65],
      skyColor: [0.3, 0.35, 0.52],
      groundColor: [0.18, 0.18, 0.23],
    },
  },
  {
    altDeg: -12,
    values: {
      sun: 0,
      ambient: 0.12,
      sunColor: [0.24, 0.29, 0.42],
      skyColor: [0.16, 0.2, 0.34],
      groundColor: [0.1, 0.11, 0.16],
    },
  },
]

const SKY_KEYS: ReadonlyArray<SkyKey> = [
  {
    altDeg: 30,
    values: { turbidity: 5, rayleigh: 1, mieCoefficient: 0.005, mieDirectionalG: 0.8 },
  },
  {
    altDeg: 10,
    values: { turbidity: 6, rayleigh: 1.5, mieCoefficient: 0.006, mieDirectionalG: 0.82 },
  },
  { altDeg: 0, values: { turbidity: 8, rayleigh: 3, mieCoefficient: 0.01, mieDirectionalG: 0.9 } },
  {
    altDeg: -6,
    values: { turbidity: 9, rayleigh: 1, mieCoefficient: 0.008, mieDirectionalG: 0.85 },
  },
  {
    altDeg: -12,
    values: { turbidity: 10, rayleigh: 0.1, mieCoefficient: 0.005, mieDirectionalG: 0.8 },
  },
]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function interpLighting(a: LightingValues, b: LightingValues, t: number): LightingValues {
  return {
    sun: lerp(a.sun, b.sun, t),
    ambient: lerp(a.ambient, b.ambient, t),
    sunColor: lerp3(a.sunColor, b.sunColor, t),
    skyColor: lerp3(a.skyColor, b.skyColor, t),
    groundColor: lerp3(a.groundColor, b.groundColor, t),
  }
}

function interpSky(a: SkyValues, b: SkyValues, t: number): SkyValues {
  return {
    turbidity: lerp(a.turbidity, b.turbidity, t),
    rayleigh: lerp(a.rayleigh, b.rayleigh, t),
    mieCoefficient: lerp(a.mieCoefficient, b.mieCoefficient, t),
    mieDirectionalG: lerp(a.mieDirectionalG, b.mieDirectionalG, t),
  }
}

/** Find adjacent keyframes for a given altitude (radians) and return
 *  (upper, lower, t) where t∈[0,1] interpolates from `lower` toward `upper`. */
function bracket<T extends { altDeg: number }>(
  keys: ReadonlyArray<T>,
  altRad: number,
): { upper: T; lower: T; t: number } {
  const altDeg = altRad / DEG
  if (altDeg >= keys[0].altDeg) return { upper: keys[0], lower: keys[0], t: 0 }
  if (altDeg <= keys[keys.length - 1].altDeg) {
    const k = keys[keys.length - 1]
    return { upper: k, lower: k, t: 0 }
  }
  for (let i = 0; i < keys.length - 1; i++) {
    const upper = keys[i]
    const lower = keys[i + 1]
    if (altDeg <= upper.altDeg && altDeg >= lower.altDeg) {
      const span = upper.altDeg - lower.altDeg
      const t = span === 0 ? 0 : (altDeg - lower.altDeg) / span
      return { upper, lower, t }
    }
  }
  return { upper: keys[keys.length - 1], lower: keys[keys.length - 1], t: 0 }
}

export function lightingFromAltitude(altRad: number): LightingValues {
  const { upper, lower, t } = bracket(LIGHTING_KEYS, altRad)
  return interpLighting(lower.values, upper.values, t)
}

export function skyFromAltitude(altRad: number): SkyValues {
  const { upper, lower, t } = bracket(SKY_KEYS, altRad)
  return interpSky(lower.values, upper.values, t)
}
