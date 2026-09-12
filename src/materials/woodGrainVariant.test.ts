// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest'
import {
  contrastVaryFromNoise,
  FURNITURE_WOOD_RINGS,
  FURNITURE_WOOD_WAVER,
  getWoodMaterial,
  woodBandEdges,
  woodGrainParams,
} from './furnitureMaterials'

/**
 * DOOR-LEAF-REALISM (a) — the door leaves rendered with the FURNITURE cabinet wood, whose figure
 * meanders `FURNITURE_WOOD_WAVER * FURNITURE_WOOD_RINGS` = 28 % of a band, stretched 2.6x up a
 * 0.8 x 2.1 m leaf by an isotropic `repeat`. It read as rippling water rather than timber. These
 * assert the pure derivation for BOTH flag states: `furniture` is the values that shipped (so the
 * flag's off state is byte-identical) and `door` is a straight-grain veneer.
 */

// happy-dom has no real 2D context; stub the minimum the canvas bakes need (the same shim the
// MAT-004 / metalNoIbl / woodGloss material tests use).
beforeAll(() => {
  const proto = globalThis.HTMLCanvasElement?.prototype as unknown as {
    getContext: unknown
  }
  if (!proto) return
  proto.getContext = () => ({
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    putImageData: () => {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    fillRect: () => {},
    drawImage: () => {},
  })
})

describe('woodGrainParams — furniture (the flag-off state)', () => {
  it('is exactly the shipped Wave 4A values, so no furniture pixel can move', () => {
    expect(woodGrainParams('furniture', false)).toEqual({
      rings: FURNITURE_WOOD_RINGS,
      waver: FURNITURE_WOOD_WAVER,
      latePower: 4,
      lateDepth: 0.2,
      poreDepth: 0.1,
      figureDepth: 0.05,
      // Exactly 0: the albedo adds `+ tone` with `tone` pinned to 0.0, which is a float addition
      // of zero and therefore bit-for-bit the pre-variant value.
      toneDepth: 0,
      // Exactly 0 so `woodBandEdges` returns null and the band remap is the IDENTITY — returning
      // `u` itself, not an arithmetically-equal expression. See the test below.
      jitter: 0,
      planks: 1,
      reliefScale: 3,
      normalScale: 0.45,
      // false: the door-only slow contrast modulation must not touch furniture.
      contrastVary: false,
      // The literals the bake carried inline before GLOSS-BAND-FLAT made them per-variant — a
      // sawn board's open latewood pores really do scatter more than its earlywood.
      roughLate: 0.24,
      roughPore: 0.2,
    })
  })

  it('keeps the plank split on `pbrSurfaces`, not on the door flag', () => {
    expect(woodGrainParams('furniture', true).planks).toBe(3)
    expect(woodGrainParams('furniture', false).planks).toBe(1)
    // A door leaf is ONE sheet of veneer either way — `pbrSurfaces` must not plank it.
    expect(woodGrainParams('door', true).planks).toBe(1)
    expect(woodGrainParams('door', false).planks).toBe(1)
  })
})

describe('woodGrainParams — door (straight grain)', () => {
  const door = woodGrainParams('door', false)
  const furniture = woodGrainParams('furniture', false)

  it('wanders a FEW PERCENT of a band, where the furniture wood wandered 28 %', () => {
    // The meander is `waver * rings` half-cycles (the unit `woodGloss.test.ts` established).
    const doorWander = door.waver * door.rings
    const furnitureWander = furniture.waver * furniture.rings
    expect(furnitureWander).toBeCloseTo(0.28, 6)
    expect(doorWander).toBeLessThan(0.06)
    // ...but not zero: a perfectly ruled grid reads as printed paper, not a sliced veneer.
    expect(doorWander).toBeGreaterThan(0)
    expect(doorWander).toBeLessThan(furnitureWander / 4)
  })

  it('lays a FINER figure than the furniture wood, and stays inside the tile Nyquist', () => {
    expect(door.rings).toBeGreaterThan(furniture.rings)
    // `rings` half-cycles across a 256 px tile. Under ~8 px per cycle the bake aliases into noise
    // instead of hairlines — the WOOD-PORE-NYQUIST failure, from the other direction.
    expect(256 / (door.rings / 2)).toBeGreaterThan(8)
  })

  it('softens the latewood into tonal banding and adds the across-grain tone bands', () => {
    expect(door.latePower).toBeLessThan(furniture.latePower)
    expect(door.lateDepth).toBeLessThan(furniture.lateDepth)
    // Wide tone bands across the leaf; absent (0) on furniture.
    expect(door.toneDepth).toBeGreaterThan(0)
  })

  it('is FLATTER and LOWER-CONTRAST than the cabinet wood, in relief and in pores', () => {
    // A laminate door is nearly flat, so relief is nearly nothing (3 -> 0.8 -> 0.4, normalScale
    // 0.45 -> 0.28 -> 0.14). GLOSS-BAND-FLAT's A/B showed the relief was never what made the leaf
    // read as corduroy — these values stand on the physical argument alone.
    expect(door.reliefScale).toBeLessThan(furniture.reliefScale / 4)
    expect(door.normalScale).toBeLessThan(furniture.normalScale / 2)
    expect(door.poreDepth).toBeLessThan(furniture.poreDepth)
  })

  it('darkens its rings and pores FAR less than the cabinet wood (GLOSS-BAND-FLAT)', () => {
    // The measured cause #1 of the residual ribbing. A 0.3x sweep step was the knee: below it the
    // whole-leaf rib RMS asymptotes on the roughness term's floor. Keep both terms scaled
    // together, so the ring/pore balance the earlier rounds settled is preserved.
    expect(door.lateDepth).toBeLessThan(furniture.lateDepth / 4)
    expect(door.poreDepth).toBeLessThan(furniture.poreDepth / 3)
    expect(door.lateDepth / door.poreDepth).toBeCloseTo(0.11 / 0.09, 1)
  })

  it('holds its GLOSS nearly uniform across the figure, unlike the sawn board (GLOSS-BAND-FLAT)', () => {
    // The measured cause #2, and the one that kept the TOP of the leaf ribbed after the albedo was
    // cut — that is where the light rakes, so a roughness swing shows there first. A laminate leaf
    // is a printed sheet under one continuous wear layer: the figure is under the gloss, not in it.
    expect(door.roughLate).toBeLessThan(furniture.roughLate / 3)
    expect(door.roughPore).toBeLessThan(furniture.roughPore / 3)
    // Not zero: the sweep showed nothing below 0.3x buys anything, and a real wear layer does
    // follow the print a little.
    expect(door.roughLate).toBeGreaterThan(0)
    expect(door.roughPore).toBeGreaterThan(0)
  })

  it('modulates the ring/pore contrast across the tile, unlike the cabinet wood (BAND-CONTRAST-VARY)', () => {
    // Real veneer's colour figure waxes and wanes across the sheet; a constant amplitude read as
    // uniform corduroy even after relief was cut. Furniture keeps a flat, constant amplitude.
    expect(door.contrastVary).toBe(true)
    expect(furniture.contrastVary).toBe(false)
    // On its own it was not enough — a 0.7x mean multiplier against an amplitude that needed 3x.
    // `lateDepth`/`poreDepth` carry the cut; this carries the wax-and-wane.
    expect(contrastVaryFromNoise(0.5)).toBeGreaterThan(1 / 3)
  })

  it('jitters the band PITCH, which is what separates veneer from corrugated rib', () => {
    expect(door.jitter).toBeGreaterThan(0.2)
    const edges = woodBandEdges(door.rings, door.jitter)
    if (!edges) throw new Error('the door variant must have a jittered band layout')
    // Tiling: the remap must be the identity at both ends of the tile, or the grain seams.
    expect(edges[0]).toBe(0)
    expect(edges[door.rings]).toBe(1)
    // Monotone, so it is a reparametrisation of u and not a second lateral term — `waver` stays
    // the only thing that bends a band sideways.
    for (let k = 0; k < door.rings; k++) expect(edges[k + 1]).toBeGreaterThan(edges[k])
    const widths = Array.from({ length: door.rings }, (_, k) => edges[k + 1] - edges[k])
    // NO TWO ADJACENT BANDS THE SAME WIDTH — the whole point.
    for (let k = 1; k < widths.length; k++)
      expect(Math.abs(widths[k] - widths[k - 1])).toBeGreaterThan(1e-4)
    // And the spread is the ±40 % that was asked for, not a token wobble.
    const nominal = 1 / door.rings
    const spread = (Math.max(...widths) - Math.min(...widths)) / nominal
    expect(spread).toBeGreaterThan(0.4)
    // The envelope is `(1 ± jitter) / mean(w)`, and the renormalisation divides by the SAMPLED
    // mean rather than 1 — so the achievable bound is the ratio of the extremes, not `1 ± jitter`.
    const envelope = (1 + door.jitter) / (1 - door.jitter)
    expect(Math.max(...widths) / nominal).toBeLessThanOrEqual(envelope)
    expect(Math.min(...widths) / nominal).toBeGreaterThanOrEqual(1 / envelope)
  })

  it('contrastVaryFromNoise maps 0..1 onto the 0.4-1.0 band-contrast range', () => {
    expect(contrastVaryFromNoise(0)).toBeCloseTo(0.4, 6)
    expect(contrastVaryFromNoise(1)).toBeCloseTo(1.0, 6)
    expect(contrastVaryFromNoise(0.5)).toBeCloseTo(0.7, 6)
    // Monotone, and clamped so an out-of-range noise sample can't invert the figure.
    expect(contrastVaryFromNoise(-1)).toBe(contrastVaryFromNoise(0))
    expect(contrastVaryFromNoise(2)).toBe(contrastVaryFromNoise(1))
  })

  it('returns NO band table for the furniture wood, so its remap is the identity', () => {
    // `k + (u - k/rings) * rings` is not bit-identical to `u * rings`, so an all-ones width table
    // would silently move the furniture albedo. `null` is the guard.
    expect(woodBandEdges(furniture.rings, furniture.jitter)).toBeNull()
    expect(woodBandEdges(22, 0)).toBeNull()
  })
})

describe('getWoodMaterial variant plumbing', () => {
  it('caches the two variants separately and defaults to furniture', () => {
    const furniture = getWoodMaterial('#a9825c', 2)
    const door = getWoodMaterial('#a9825c', 2, undefined, 'door')
    // A shared cache key would have handed the door the furniture grain (or vice versa) — the
    // whole fix, silently undone.
    expect(door).not.toBe(furniture)
    expect(getWoodMaterial('#a9825c', 2, undefined, 'furniture')).toBe(furniture)
    expect(getWoodMaterial('#a9825c', 2, undefined, 'door')).toBe(door)
  })

  it('stamps the variant normalScale onto the material', () => {
    expect(getWoodMaterial('#b1875f', 2).normalScale.x).toBeCloseTo(
      woodGrainParams('furniture', false).normalScale,
      6,
    )
    expect(getWoodMaterial('#b1875f', 2, undefined, 'door').normalScale.x).toBeCloseTo(
      woodGrainParams('door', false).normalScale,
      6,
    )
  })
})
