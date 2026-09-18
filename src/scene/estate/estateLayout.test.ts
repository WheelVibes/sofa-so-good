import { describe, expect, it } from 'vitest'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../../apartment/constants'
import {
  blockYRange,
  buildEstateLayout,
  groundYForStorey,
  OWN_BLOCK_STOREYS,
  SERVICE_WELL_D,
  SERVICE_WELL_W,
  STOREY_H,
  sectionCut,
  serviceWell,
  storeyTopAboveGround,
  VIEW_STOREY,
  VOID_DECK_H,
} from './estateLayout'

// The canonical frame: corridor on +z, width along +x (ESTATE-DOOR-SIDE). Which real face
// of a plan that lands on is `estateCorridor.ts`'s job, tested in `estateCorridor.test.ts`.
const input = {
  extent: [APARTMENT_EXT_W, APARTMENT_EXT_D] as const,
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
    expect(L.own.roof!.yMin).toBeGreaterThan(STOREY_H)
    expect(L.own.roof!.yMin).toBeCloseTo(L.groundY + storeyTopAboveGround(OWN_BLOCK_STOREYS))
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
    expect(L.own.above!.yMin).toBeGreaterThanOrEqual(2.6)
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

  it('runs the corridor out to whichever block end the span reaches', () => {
    // Default flat: the span ends at the east edge, so the run continues past the east wing.
    expect(L.own.corridorFloor.x + L.own.corridorFloor.w / 2).toBeGreaterThan(APARTMENT_EXT_W + 20)
    expect(L.own.corridorFloor.x - L.own.corridorFloor.w / 2).toBeCloseTo(9.5)
    // A door at the WEST end (span touching x = 0) runs the other way instead.
    const W = buildEstateLayout({ ...input, corridorSpan: [0, 4.2] })
    expect(W.own.corridorFloor.x - W.own.corridorFloor.w / 2).toBeLessThan(-20)
    expect(W.own.corridorFloor.x + W.own.corridorFloor.w / 2).toBeCloseTo(4.2)
    // The parapet always tracks the floor slab.
    expect(W.own.corridorParapet.x).toBeCloseTo(W.own.corridorFloor.x)
    expect(W.own.corridorParapet.w).toBeCloseTo(W.own.corridorFloor.w)
  })
})

describe('sectionCut (ORBIT-SECTION-CUT)', () => {
  const L = buildEstateLayout(input)
  const cutY = 2.6 + 0.15
  const cut = sectionCut(L, cutY)

  it('removes the storeys above the cut and clamps the wings, leaving everything else untouched', () => {
    expect(cut.own.above).toBeUndefined()
    expect(cut.own.roof).toBeUndefined()
    expect(cut.own.westWing.yMax).toBeCloseTo(cutY)
    expect(cut.own.eastWing.yMax).toBeCloseTo(cutY)
    // No own-block box exceeds the cut plane.
    for (const b of [
      cut.own.westWing,
      cut.own.eastWing,
      cut.own.below,
      cut.own.corridorFloor,
      cut.own.corridorParapet,
    ]) {
      expect(b.yMax).toBeLessThanOrEqual(cutY + 1e-9)
    }
    // Everything not part of the own-block Y range is untouched.
    expect(cut.own.below).toEqual(L.own.below)
    expect(cut.own.corridorFloor).toEqual(L.own.corridorFloor)
    expect(cut.own.corridorParapet).toEqual(L.own.corridorParapet)
    expect(cut.own.footprint).toEqual(L.own.footprint)
    expect(cut.blocks).toEqual(L.blocks)
    expect(cut.trees).toEqual(L.trees)
    expect(cut.roads).toEqual(L.roads)
    expect(cut.groundY).toBe(L.groundY)
  })

  it('a cut at a Y already above the wings is a no-op on their height', () => {
    const high = sectionCut(L, L.own.roof!.yMax + 100)
    expect(high.own.westWing.yMax).toBe(L.own.westWing.yMax)
    expect(high.own.eastWing.yMax).toBe(L.own.eastWing.yMax)
    // above/roof are still removed — the cut always drops them, only the wing height varies.
    expect(high.own.above).toBeUndefined()
    expect(high.own.roof).toBeUndefined()
  })

  it('without a cut, buildEstateLayout is byte-identical to before (own.above/roof present)', () => {
    expect(L.own.above).toBeDefined()
    expect(L.own.roof).toBeDefined()
    expect(L.own.above!.yMin).toBeGreaterThanOrEqual(2.6)
    expect(L.own.roof!.yMin).toBeGreaterThan(STOREY_H)
  })
})

/**
 * YARD-ESTATE (audit finding S4). The well is what turns the yard's outlook from a blank wing
 * wall 4.9 m away into a real service shaft, so the properties tested are the ones a viewer in
 * the yard depends on: the void is EMPTY, it sits at the corridor end next to the flat, and
 * nothing else in the estate moved.
 */
describe('serviceWell', () => {
  const L = buildEstateLayout(input)
  const W = serviceWell(L)
  const pw = APARTMENT_EXT_W
  const pd = APARTMENT_EXT_D

  /** Is (x, z) inside any own-block wing box of a layout? */
  const inWing = (l: typeof L, x: number, z: number) =>
    [l.own.westWing, l.own.eastWing, l.own.westWingFar, l.own.eastWingFar].some(
      (b) => !!b && Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2,
    )

  it('empties the void the flat’s own service yard looks into, and only that', () => {
    // A point 2 m west of the flat at the yard's own z — solid before, open after.
    expect(inWing(L, -2, pd - 1)).toBe(true)
    expect(inWing(W, -2, pd - 1)).toBe(false)
    // …and the same x deeper into the block (away from the corridor) is still solid.
    expect(inWing(W, -2, 1)).toBe(true)
    // Beyond the well's width the wing is unbroken at every depth.
    expect(inWing(W, -SERVICE_WELL_W - 2, pd - 1)).toBe(true)
    expect(inWing(W, -SERVICE_WELL_W - 2, 1)).toBe(true)
  })

  it('mirrors the void on the east wing', () => {
    expect(inWing(L, pw + 2, pd - 1)).toBe(true)
    expect(inWing(W, pw + 2, pd - 1)).toBe(false)
    expect(inWing(W, pw + 2, 1)).toBe(true)
  })

  it('the near bay and the far remainder tile the original wing footprint exactly', () => {
    for (const [near, far, edge, sign] of [
      [W.own.westWing, W.own.westWingFar!, 0, -1],
      [W.own.eastWing, W.own.eastWingFar!, pw, 1],
    ] as const) {
      expect(near.w).toBe(SERVICE_WELL_W)
      expect(near.x).toBeCloseTo(edge + (sign * SERVICE_WELL_W) / 2, 9)
      expect(near.d).toBeCloseTo(pd - SERVICE_WELL_D, 9)
      // The void is taken off the CORRIDOR (+z) end: the near bay still starts at z = 0.
      expect(near.z - near.d / 2).toBeCloseTo(0, 9)
      expect(far.w).toBeCloseTo(L.own.westWing.w - SERVICE_WELL_W, 9)
      expect(far.d).toBe(pd)
      const farInner = far.x - (sign * far.w) / 2
      expect(farInner).toBeCloseTo(edge + sign * SERVICE_WELL_W, 9)
    }
  })

  it('keeps the wings’ full height and leaves every other part untouched', () => {
    expect(W.own.westWing.yMin).toBe(L.own.westWing.yMin)
    expect(W.own.westWing.yMax).toBe(L.own.westWing.yMax)
    expect(W.own.westWingFar!.yMax).toBe(L.own.westWing.yMax)
    expect(W.own.below).toEqual(L.own.below)
    expect(W.own.above).toEqual(L.own.above)
    expect(W.own.roof).toEqual(L.own.roof)
    expect(W.own.corridorFloor).toEqual(L.own.corridorFloor)
    expect(W.own.corridorParapet).toEqual(L.own.corridorParapet)
    expect(W.own.footprint).toEqual(L.own.footprint)
    expect(W.blocks).toEqual(L.blocks)
    expect(W.trees).toEqual(L.trees)
    expect(W.roads).toEqual(L.roads)
    expect(W.groundY).toBe(L.groundY)
  })

  it('refuses a degenerate well rather than emitting an inside-out box', () => {
    expect(serviceWell(L, 0)).toBe(L)
    expect(serviceWell(L, L.own.westWing.w + 1)).toBe(L)
    expect(serviceWell(L, SERVICE_WELL_W, 0)).toBe(L)
    // Deeper than the plan is clamped, not refused — and never inverts the near bay.
    const deep = serviceWell(L, SERVICE_WELL_W, 1000)
    expect(deep.own.westWing.d).toBeGreaterThan(0)
    expect(deep.own.westWing.d).toBeCloseTo(pd * 0.6, 9)
  })

  it('leaves the plain (un-welled) layout untouched', () => {
    expect(L.own.westWingFar).toBeUndefined()
    expect(L.own.eastWingFar).toBeUndefined()
    expect(sectionCut(L, 2.75).own.westWingFar).toBeUndefined()
  })
})

/**
 * LIGHT-WELL-ORBIT (item (ag), v0.35.9.0): the dollhouse now shows the same notch walk mode
 * does — `Estate.tsx` composes `sectionCut(serviceWell(layout), cutY)`. The far-wing remainder
 * `serviceWell` produces carries the SAME `yMax` as the un-split wing (full `OWN_BLOCK_STOREYS`
 * tall), so without `sectionCut` also clamping it, composing the two would leave a full-height
 * tower standing beside the correctly-cut near bay.
 */
describe('serviceWell composed with sectionCut (LIGHT-WELL-ORBIT)', () => {
  const L = buildEstateLayout(input)
  const cutY = 2.6 + 0.15
  const composed = sectionCut(serviceWell(L), cutY)

  it('clamps the far-wing remainder to the cut plane, same as the near bay', () => {
    expect(composed.own.westWingFar).toBeDefined()
    expect(composed.own.eastWingFar).toBeDefined()
    expect(composed.own.westWingFar!.yMax).toBeCloseTo(cutY)
    expect(composed.own.eastWingFar!.yMax).toBeCloseTo(cutY)
    // No own-block box — including the far remainders — exceeds the cut plane.
    for (const b of [
      composed.own.westWing,
      composed.own.eastWing,
      composed.own.westWingFar!,
      composed.own.eastWingFar!,
    ]) {
      expect(b.yMax).toBeLessThanOrEqual(cutY + 1e-9)
    }
  })

  it('still removes the storeys above the cut and keeps the well itself open', () => {
    expect(composed.own.above).toBeUndefined()
    expect(composed.own.roof).toBeUndefined()
    // The near bay is still narrower than the original wing — the well is still cut.
    expect(composed.own.westWing.w).toBe(SERVICE_WELL_W)
  })

  it('order-independence: clamping first then splitting reaches the same far-wing height', () => {
    const otherOrder = serviceWell(sectionCut(L, cutY))
    // sectionCut alone never touches westWingFar/eastWingFar (they don't exist yet), so
    // splitting a pre-cut wing gives the far remainder the ALREADY-clamped height directly —
    // the composed (well-then-cut) path reaches the same number via the explicit clamp above.
    expect(otherOrder.own.westWingFar!.yMax).toBeCloseTo(cutY)
    expect(composed.own.westWingFar!.yMax).toBeCloseTo(otherOrder.own.westWingFar!.yMax)
  })
})
