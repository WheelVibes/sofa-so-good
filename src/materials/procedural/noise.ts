/**
 * Tiny seeded value-noise toolkit for runtime procedural textures.
 *
 * Everything here is deterministic given a seed so a material id always
 * regenerates the same texture (important for the cache and for layouts
 * that round-trip through save/load). Designed to tile seamlessly: the
 * value-noise lattice wraps on a power-of-two period.
 */

/** Mulberry32 — fast, decent-quality seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash a 32-bit string to a stable numeric seed. */
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * Seamlessly-tiling value noise on an integer lattice of `period` cells.
 * Returns a sampler over continuous (x, y) in lattice space.
 */
export function makeValueNoise(period: number, seed: number): (x: number, y: number) => number {
  const rand = mulberry32(seed)
  const grid = new Float32Array(period * period)
  for (let i = 0; i < grid.length; i++) grid[i] = rand()
  const at = (ix: number, iy: number) => {
    const x = ((ix % period) + period) % period
    const y = ((iy % period) + period) % period
    return grid[y * period + x]
  }
  return (x: number, y: number) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = smooth(x - x0)
    const fy = smooth(y - y0)
    const v00 = at(x0, y0)
    const v10 = at(x0 + 1, y0)
    const v01 = at(x0, y0 + 1)
    const v11 = at(x0 + 1, y0 + 1)
    const a = v00 + (v10 - v00) * fx
    const b = v01 + (v11 - v01) * fx
    return a + (b - a) * fy
  }
}

/**
 * Fractal Brownian motion over tiling value noise. `baseFreq` is in lattice
 * cells across the whole texture; each octave doubles frequency (and the
 * lattice period) so the result still tiles.
 */
export function makeFbm(
  seed: number,
  octaves: number,
  baseFreq: number,
): (u: number, v: number) => number {
  const layers = Array.from({ length: octaves }, (_, i) => {
    const period = baseFreq * 2 ** i
    return { noise: makeValueNoise(period, seed + i * 1013), period }
  })
  let norm = 0
  for (let i = 0; i < octaves; i++) norm += 0.5 ** i
  return (u: number, v: number) => {
    let sum = 0
    for (let i = 0; i < octaves; i++) {
      const { noise, period } = layers[i]
      sum += 0.5 ** i * noise(u * period, v * period)
    }
    return sum / norm
  }
}

/** Convert a height field (row-major, values 0..1) into an RGBA normal-map
 *  buffer via central differences. `strength` scales bump intensity. */
export function heightToNormalRGBA(
  height: Float32Array,
  size: number,
  strength: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4)
  const h = (x: number, y: number) =>
    height[(((y % size) + size) % size) * size + (((x % size) + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength
      // Normal = normalize(-dx, -dy, 1)
      let nx = -dx
      let ny = -dy
      const nz = 1
      const len = Math.hypot(nx, ny, nz) || 1
      nx /= len
      ny /= len
      const nzl = nz / len
      const i = (y * size + x) * 4
      out[i] = (nx * 0.5 + 0.5) * 255
      out[i + 1] = (ny * 0.5 + 0.5) * 255
      out[i + 2] = nzl * 255
      out[i + 3] = 255
    }
  }
  return out
}

/** Parse a #rrggbb hex string to [r, g, b] in 0..255. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  )
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}
