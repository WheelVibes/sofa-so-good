import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProceduralPattern } from '../types'
import {
  effectivePatternSize,
  generateProceduralRaw,
  getProceduralBaseSize,
  PATTERN_SIZE_CAP,
  setProceduralBaseSize,
} from './generators'

describe('quality-aware base size (PERF9)', () => {
  it('round-trips the configured base size (generation itself needs a real canvas)', () => {
    expect(getProceduralBaseSize()).toBe(512) // module default
    setProceduralBaseSize(256)
    expect(getProceduralBaseSize()).toBe(256)
    setProceduralBaseSize(512)
    expect(getProceduralBaseSize()).toBe(512)
  })
})

describe('per-pattern size registry (PERF9 tail)', () => {
  // Save/restore the global base size around each test.
  let savedBase: number
  beforeEach(() => {
    savedBase = getProceduralBaseSize()
  })
  afterEach(() => {
    setProceduralBaseSize(savedBase as 256 | 512)
  })

  const SMOOTH_PATTERNS: ProceduralPattern[] = [
    'carpet',
    'concrete',
    'marble',
    'terrazzo',
    'batten',
    'fluted',
    'plaster',
  ]
  const DETAILED_PATTERNS: ProceduralPattern[] = [
    'wood',
    'tile',
    'hexagon',
    'checker',
    'parquet',
    'herringbone',
    'subway',
    'brick',
    'grasscloth',
    'stripe',
  ]

  it('PATTERN_SIZE_CAP covers every ProceduralPattern with no unknown keys', () => {
    const allPatterns: ProceduralPattern[] = [...SMOOTH_PATTERNS, ...DETAILED_PATTERNS]
    for (const p of allPatterns) {
      const cap = PATTERN_SIZE_CAP[p]
      expect(cap, `${p} has no cap`).toBeDefined()
      expect([256, 512]).toContain(cap)
    }
  })

  it('smooth patterns cap at 256 regardless of BASE_SIZE', () => {
    for (const tier of [256, 512] as const) {
      setProceduralBaseSize(tier)
      for (const p of SMOOTH_PATTERNS) {
        expect(effectivePatternSize(p), `${p} at BASE_SIZE=${tier}`).toBe(256)
      }
    }
  })

  it('high-frequency patterns use BASE_SIZE on Performance (256) and 512 on Medium+', () => {
    setProceduralBaseSize(256) // Performance tier
    for (const p of DETAILED_PATTERNS) {
      expect(effectivePatternSize(p), `${p} on Performance`).toBe(256)
    }
    setProceduralBaseSize(512) // Medium/High/Maximum
    for (const p of DETAILED_PATTERNS) {
      expect(effectivePatternSize(p), `${p} on Medium+`).toBe(512)
    }
  })

  it('effectivePatternSize never returns a value above the pattern cap', () => {
    setProceduralBaseSize(512)
    for (const p of Object.keys(PATTERN_SIZE_CAP) as ProceduralPattern[]) {
      const cap = PATTERN_SIZE_CAP[p]
      const effective = effectivePatternSize(p)
      expect(effective, `${p} exceeds cap`).toBeLessThanOrEqual(cap)
    }
  })

  it('effectivePatternSize never returns a value above BASE_SIZE', () => {
    setProceduralBaseSize(256)
    for (const p of Object.keys(PATTERN_SIZE_CAP) as ProceduralPattern[]) {
      const effective = effectivePatternSize(p)
      expect(effective, `${p} exceeds BASE_SIZE=256`).toBeLessThanOrEqual(256)
    }
  })
})

// `generateProceduralRaw` is the pure, DOM-free pixel path (no canvas) — so the
// actual generated maps can be inspected directly here.
describe('procedural detail: grout aging + roughness micro-detail (RZ4)', () => {
  it('is deterministic — identical inputs produce byte-identical maps', () => {
    for (const p of ['tile', 'wood', 'marble'] as const) {
      const a = generateProceduralRaw('x', p, '#cfd2d4', 96)
      const b = generateProceduralRaw('x', p, '#cfd2d4', 96)
      expect(Array.from(a.albedo)).toEqual(Array.from(b.albedo))
      expect(Array.from(a.roughness)).toEqual(Array.from(b.roughness))
      expect(Array.from(a.normal)).toEqual(Array.from(b.normal))
    }
  })

  it('tile grout joints are aged — joint pixels span a range of darkness, not one flat tone', () => {
    const { albedo } = generateProceduralRaw('grout', 'tile', '#ffffff', 128)
    // Grout is markedly darker than the bright ceramic face (~240+); collect the
    // dark joint cluster and confirm it carries varied dirt rather than one tone.
    const groutLum = new Set<number>()
    for (let i = 0; i < albedo.length; i += 4) {
      const r = albedo[i]
      if (r < 190) groutLum.add(r)
    }
    expect(groutLum.size).toBeGreaterThan(4)
  })

  it('roughness maps carry micro-detail (not a single flat value) for tile + marble', () => {
    for (const p of ['tile', 'marble'] as const) {
      const { roughness } = generateProceduralRaw('r', p, '#d8d8d8', 96)
      const vals = new Set<number>()
      for (let i = 0; i < roughness.length; i += 4) vals.add(roughness[i])
      expect(vals.size, `${p} roughness reads flat`).toBeGreaterThan(8)
    }
  })
})
