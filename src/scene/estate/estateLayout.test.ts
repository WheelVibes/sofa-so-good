import { describe, expect, it } from 'vitest'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../../apartment/constants'
import {
  blockYRange,
  buildEstateLayout,
  groundYForStorey,
  OWN_BLOCK_STOREYS,
  STOREY_H,
  storeyTopAboveGround,
  VIEW_STOREY,
  VOID_DECK_H,
} from './estateLayout'

const input = {
  extent: [APARTMENT_EXT_W, APARTMENT_EXT_D] as const,
  corridorSide: '+z' as const,
  corridorSpan: [9.5, APARTMENT_EXT_W] as const,
}

function overlaps(
  a: { x: number; z: number; w: number; d: number },
  b: { x: number; z: number; w: number; d: number },
  margin = 0,
) {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + margin && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + margin
  )
}

describe('storey arithmetic', () => {
  it('void deck first, then 2.8 m floors', () => {
    expect(storeyTopAboveGround(1)).toBe(VOID_DECK_H)
    expect(storeyTopAboveGround(2)).toBeCloseTo(VOID_DECK_H + STOREY_H)
  })
  it('a flat on #08 has its floor 20.4 m above the ground', () => {
    expect(groundYForStorey(VIEW_STOREY)).toBeCloseTo(-(VOID_DECK_H + 6 * STOREY_H))
    expect(groundYForStorey(2)).toBeCloseTo(-VOID_DECK_H)
  })
})

describe('buildEstateLayout', () => {
  const L = buildEstateLayout(input)

  it('is deterministic', () => {
    expect(buildEstateLayout(input)).toEqual(L)
    expect(buildEstateLayout({ ...input, seed: 99 })).not.toEqual(L)
  })

  it('puts the ground below the flat and the own-block roof above it', () => {
    expect(L.groundY).toBeLessThan(-15)
    expect(L.own.roof.yMin).toBeGreaterThan(STOREY_H)
    expect(L.own.roof.yMin).toBeCloseTo(L.groundY + storeyTopAboveGround(OWN_BLOCK_STOREYS))
  })

  it('the own block never intrudes into the flat itself', () => {
    const flat = {
      x: APARTMENT_EXT_W / 2,
      z: APARTMENT_EXT_D / 2,
      w: APARTMENT_EXT_W,
      d: APARTMENT_EXT_D,
    }
    // Wings sit entirely outside the flat's X range.
    expect(L.own.westWing.x + L.own.westWing.w / 2).toBeLessThanOrEqual(0 + 1e-9)
    expect(L.own.eastWing.x - L.own.eastWing.w / 2).toBeGreaterThanOrEqual(APARTMENT_EXT_W - 1e-9)
    // Below/above boxes clear the flat's floor (0) and ceiling (2.6 m) with slab room.
    expect(L.own.below.yMax).toBeLessThanOrEqual(0)
    expect(L.own.above.yMin).toBeGreaterThanOrEqual(2.6)
    // The corridor is outside the +z face, in front of the main-door span only.
    expect(L.own.corridorFloor.z - L.own.corridorFloor.d / 2).toBeGreaterThanOrEqual(
      APARTMENT_EXT_D - 1e-9,
    )
    expect(L.own.corridorFloor.x - L.own.corridorFloor.w / 2).toBeGreaterThanOrEqual(9.5 - 1e-9)
    expect(overlaps(flat, { ...L.own.corridorFloor })).toBe(false)
  })

  it('neighbour blocks keep HDB spacing from the own block and from each other', () => {
    for (const b of L.blocks) {
      expect(overlaps(L.own.footprint, b, 25), `${b.id} too close to own block`).toBe(false)
    }
    for (let i = 0; i < L.blocks.length; i++)
      for (let j = i + 1; j < L.blocks.length; j++)
        expect(overlaps(L.blocks[i], L.blocks[j], 8), `${L.blocks[i].id}/${L.blocks[j].id}`).toBe(
          false,
        )
  })

  it('neighbours are plausible HDB blocks', () => {
    expect(L.blocks.length).toBeGreaterThanOrEqual(5)
    for (const b of L.blocks) {
      expect(b.storeys).toBeGreaterThanOrEqual(10)
      expect(b.storeys).toBeLessThanOrEqual(30)
      expect(b.w).toBeGreaterThanOrEqual(20)
      expect(b.w).toBeLessThanOrEqual(100)
      const { deckTop, roofY } = blockYRange(L.groundY, b.storeys)
      expect(deckTop).toBeCloseTo(L.groundY + VOID_DECK_H)
      expect(roofY).toBeGreaterThan(deckTop)
    }
  })

  it('trees stand on open ground, never inside a block or on a road', () => {
    expect(L.trees.length).toBeGreaterThan(30)
    for (const t of L.trees) {
      const pt = { x: t.x, z: t.z, w: 0, d: 0 }
      expect(overlaps(pt, L.own.footprint, 2), 'tree in own block').toBe(false)
      for (const b of L.blocks) expect(overlaps(pt, b, 2), `tree in ${b.id}`).toBe(false)
      for (const r of L.roads) expect(overlaps(pt, r), 'tree on road').toBe(false)
      expect(t.h).toBeGreaterThan(8)
    }
  })

  it('mirrors when the corridor is on the −z face', () => {
    const M = buildEstateLayout({ ...input, corridorSide: '-z' })
    expect(M.own.corridorFloor.z + M.own.corridorFloor.d / 2).toBeLessThanOrEqual(1e-9)
    // The first window-side neighbour flips to the +z side.
    const n1 = M.blocks.find((b) => b.id === 'n1')!
    expect(n1.z).toBeGreaterThan(APARTMENT_EXT_D)
  })
})
