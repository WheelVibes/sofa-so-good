import { describe, expect, it } from 'vitest'
import {
  analyzeDirection,
  axisProfile,
  axisProfileSimilarity,
  grayFromRgba,
  structureCoherence,
} from './textureDirection'

const SIZE = 64

/** Build a SIZE×SIZE grayscale image from a per-pixel function. */
function make(fn: (x: number, y: number) => number): Float32Array {
  const g = new Float32Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) g[y * SIZE + x] = fn(x, y)
  return g
}

/** Deterministic value noise — no Math.random (tests must be reproducible). */
function hash(x: number, y: number): number {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  return ((h ^ (h >>> 13)) >>> 0) / 0xffffffff
}

// Planks: long boards running along X with seams every 16 px across.
const planks = make((_x, y) => (y % 16 < 1 ? 0.25 : 0.75))
// Square ceramic grid: grout every 16 px on BOTH axes.
const squareTile = make((x, y) => (x % 16 < 1 || y % 16 < 1 ? 0.3 : 0.8))
// Random aggregate (terrazzo / concrete): no direction, no lattice.
const noise = make((x, y) => hash(x, y))
// Staggered / hex-like lattice: periods differ across the axes.
const staggered = make((x, y) => ((x + (y % 24 < 12 ? 0 : 4)) % 8 < 1 || y % 24 < 1 ? 0.3 : 0.8))

describe('structureCoherence', () => {
  it('reads planks as strongly directional', () => {
    expect(structureCoherence(planks, SIZE, SIZE).coherence).toBeGreaterThan(0.7)
  })

  it('reads a square grid and random noise as having no dominant direction', () => {
    expect(structureCoherence(squareTile, SIZE, SIZE).coherence).toBeLessThan(0.15)
    expect(structureCoherence(noise, SIZE, SIZE).coherence).toBeLessThan(0.15)
  })

  it('is finite on a flat image (no gradients at all)', () => {
    const flat = make(() => 0.5)
    const r = structureCoherence(flat, SIZE, SIZE)
    expect(r.coherence).toBe(0)
    expect(Number.isFinite(r.angle)).toBe(true)
  })
})

const scaleOf = (g: Float32Array) => {
  const mean = g.reduce((a, b) => a + b, 0) / g.length
  return Math.sqrt(g.reduce((a, b) => a + (b - mean) ** 2, 0) / g.length)
}
const similarity = (g: Float32Array) =>
  axisProfileSimilarity(
    axisProfile(g, SIZE, SIZE, 'x'),
    axisProfile(g, SIZE, SIZE, 'y'),
    scaleOf(g),
    SIZE,
  )

describe('axisProfileSimilarity — is the lattice square?', () => {
  it('accepts a square grid (both axes carry the same grid lines)', () => {
    const r = similarity(squareTile)
    expect(r.compatible).toBe(true)
    expect(r.similarity).toBeGreaterThan(0.6)
  })

  it('accepts a random field — no lattice on either axis to misalign', () => {
    const r = similarity(noise)
    expect(r.compatible).toBe(true)
    expect(r.similarity).toBeNull()
  })

  it('refuses a one-sided lattice (planks: seams across, nothing along)', () => {
    expect(similarity(planks).compatible).toBe(false)
  })

  it('refuses a staggered / hex-like lattice', () => {
    // Its grid lines do not survive a quarter turn even where the gradient
    // energy is spread — this is the signal coherence alone cannot give.
    expect(similarity(staggered).compatible).toBe(false)
  })
})

describe('analyzeDirection — the quarter-turn verdict', () => {
  it('planks: NOT safe to quarter-turn (the wood-patchwork bug)', () => {
    expect(analyzeDirection(planks, SIZE, SIZE).quarterTurnSafe).toBe(false)
  })

  it('square ceramic grid: safe', () => {
    expect(analyzeDirection(squareTile, SIZE, SIZE).quarterTurnSafe).toBe(true)
  })

  it('random aggregate (terrazzo / concrete): safe', () => {
    expect(analyzeDirection(noise, SIZE, SIZE).quarterTurnSafe).toBe(true)
  })

  it('staggered / non-square lattice (hex, running bond): NOT safe', () => {
    // No single dominant direction, but the lattice is not square — the case a
    // coherence-only test would get wrong.
    const a = analyzeDirection(staggered, SIZE, SIZE)
    expect(a.quarterTurnSafe).toBe(false)
  })

  it('is pure — same pixels, same verdict', () => {
    expect(analyzeDirection(planks, SIZE, SIZE)).toEqual(analyzeDirection(planks, SIZE, SIZE))
  })
})

describe('grayFromRgba', () => {
  it('converts RGBA bytes to 0..1 luma', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])
    const g = grayFromRgba(rgba, 2, 1)
    expect(g[0]).toBeCloseTo(1, 5)
    expect(g[1]).toBeCloseTo(0, 5)
  })
})
