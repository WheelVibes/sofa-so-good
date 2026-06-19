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

  it('concrete carries broad tonal variation (cloudy staining + mottle), deterministically', () => {
    const a = generateProceduralRaw('c', 'concrete', '#b8b6b2', 96)
    const b = generateProceduralRaw('c', 'concrete', '#b8b6b2', 96)
    expect(Array.from(a.albedo)).toEqual(Array.from(b.albedo)) // deterministic
    const lum = new Set<number>()
    for (let i = 0; i < a.albedo.length; i += 4) lum.add(a.albedo[i])
    expect(lum.size).toBeGreaterThan(12) // not a flat slab
  })

  it('brick mortar joints are aged — light mortar pixels span a range of darkness', () => {
    // Dark brick body so the light mortar (≈188 grey) is the bright cluster.
    const { albedo } = generateProceduralRaw('mortar', 'brick', '#5a2f24', 128)
    const mortarLum = new Set<number>()
    for (let i = 0; i < albedo.length; i += 4) {
      const r = albedo[i]
      if (r > 150) mortarLum.add(r) // mortar band (dark brick face is well below)
    }
    expect(mortarLum.size).toBeGreaterThan(4)
  })
})

// MAT-002: glazed ceramic micro-detail — orange-peel glaze micro-normal on the
// face + a roughness contrast between the glossy glaze and the matte grout,
// aligned with the painter's existing grout grid.
describe('procedural detail: tile glaze micro-normal + glaze↔grout roughness (MAT-002)', () => {
  const S = 128

  // `tileFields` lays a 2×2 grid: grout joints fall on the cell edges (x/y near
  // 0, S/2, S). A face column sits mid-cell (x ≈ S/4). Sample the central rough
  // value (R channel of the greyscale roughness map) down a whole column so the
  // grid band — not per-texel noise — dominates the mean.
  const colRoughMean = (rough: Uint8ClampedArray, x: number) => {
    let sum = 0
    for (let y = 0; y < S; y++) sum += rough[(y * S + x) * 4]
    return sum / S
  }

  it('grout column reads markedly rougher than a glaze-face column (and the band aligns with the grid)', () => {
    const { roughness } = generateProceduralRaw('mat002', 'tile', '#cfd2d4', S)
    const groutCol = colRoughMean(roughness, Math.round(S / 2)) // on the centre seam
    const faceCol = colRoughMean(roughness, Math.round(S / 4)) // mid-tile glaze
    // Grout (matte cement) must read clearly rougher than the glossy glaze, and
    // the rougher band lands exactly on the grid edge → normal/roughness align.
    expect(groutCol).toBeGreaterThan(faceCol + 40)
  })

  it('the glaze face carries a non-flat micro-normal (orange-peel perturbs the normal map)', () => {
    const { normal } = generateProceduralRaw('mat002n', 'tile', '#d8d8d8', S)
    // Collect normal R values away from the grout seams (mid-tile faces) — the
    // glaze peel should make the face normal vary rather than sit dead-flat.
    const faceNormR = new Set<number>()
    for (let y = 0; y < S; y++) {
      for (const x of [Math.round(S / 4), Math.round((3 * S) / 4)]) {
        faceNormR.add(normal[(y * S + x) * 4])
      }
    }
    expect(faceNormR.size, 'glaze face normal reads flat').toBeGreaterThan(4)
  })

  it('hexagon + subway ceramic also carry the glaze↔grout roughness contrast', () => {
    for (const p of ['hexagon', 'subway'] as const) {
      const { roughness } = generateProceduralRaw('mat002', p, '#cfd2d4', S)
      const vals = new Set<number>()
      let min = 255
      let max = 0
      for (let i = 0; i < roughness.length; i += 4) {
        const r = roughness[i]
        vals.add(r)
        if (r < min) min = r
        if (r > max) max = r
      }
      // A wide glaze(low)→grout(high) roughness spread, not a near-flat sheen.
      expect(max - min, `${p} lacks glaze↔grout contrast`).toBeGreaterThan(80)
    }
  })

  it('stays deterministic with the glaze micro-detail added', () => {
    const a = generateProceduralRaw('det', 'tile', '#cfd2d4', 96)
    const b = generateProceduralRaw('det', 'tile', '#cfd2d4', 96)
    expect(Array.from(a.normal)).toEqual(Array.from(b.normal))
    expect(Array.from(a.roughness)).toEqual(Array.from(b.roughness))
  })
})
