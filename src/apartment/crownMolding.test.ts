/**
 * Crown molding + kitchen/bath template validity tests (T2).
 *
 * 1. atCeiling predicate — spans at ceiling → crown; below → no crown.
 * 2. wallEndAbutmentThickness corner-extension regression guard.
 * 3. Default kitchen fixture centres lie within room bounds + CLEARANCE.wallGap.
 * 4. Default bathroom fixture centres lie within room bounds + CLEARANCE.wallGap.
 */

import { describe, expect, it } from 'vitest'
import { bathrooms } from '../furniture/defaults/bathrooms'
import { kitchen } from '../furniture/defaults/kitchen'
import { CLEARANCE } from '../layout/designRules'
import type { WallSpec } from './types'
import { wallEndAbutmentThickness } from './wallSegments'

// ── Crown-molding ceiling-predicate helper ──────────────────────────────────

/** Mirrors the atCeiling check in WallSegment.tsx: span.top >= ceilingH - 0.01 */
function atCeiling(spanTop: number, ceilingH: number): boolean {
  return spanTop >= ceilingH - 0.01
}

describe('crownMolding / atCeiling predicate', () => {
  const H = 2.6

  it('is true when span top equals ceiling height', () => {
    expect(atCeiling(H, H)).toBe(true)
  })

  it('is true within 0.01 m tolerance (floating-point)', () => {
    expect(atCeiling(H - 0.005, H)).toBe(true)
  })

  it('is false for a header above a door (partial height)', () => {
    // A header from 2.1→2.6 has top=2.6 (at ceiling); but a span top at
    // door head (2.1) is NOT at ceiling — no crown there.
    expect(atCeiling(2.1, H)).toBe(false)
  })

  it('is false for a sill segment (bottom=0, top=0.95)', () => {
    expect(atCeiling(0.95, H)).toBe(false)
  })

  it('is false for a parapet wall (topHeight < ceilingH)', () => {
    expect(atCeiling(1.0, H)).toBe(false)
  })

  it('is true right at ceiling boundary for bathroom (H=2.4)', () => {
    expect(atCeiling(2.4, 2.4)).toBe(true)
  })
})

// ── Wall-abutment corner-extension (regression guard) ──────────────────────

describe('wallEndAbutmentThickness (corner coverage)', () => {
  const walls: WallSpec[] = [
    { id: 'n', start: [0, 0], end: [4, 0], thickness: 'internal', cutouts: [] },
    { id: 'e', start: [4, 0], end: [4, 3], thickness: 'internal', cutouts: [] },
    { id: 's', start: [4, 3], end: [0, 3], thickness: 'internal', cutouts: [] },
    { id: 'w', start: [0, 3], end: [0, 0], thickness: 'internal', cutouts: [] },
  ]
  const T = 0.1 // FLAT.internalWallThickness

  it('north wall start abuts the west wall → full internal thickness', () => {
    const abut = wallEndAbutmentThickness(walls[0]!, walls, true)
    expect(abut).toBeCloseTo(T, 3)
  })

  it('north wall end abuts the east wall → full internal thickness', () => {
    const abut = wallEndAbutmentThickness(walls[0]!, walls, false)
    expect(abut).toBeCloseTo(T, 3)
  })

  it('a free-standing wall has zero abutment', () => {
    const free: WallSpec[] = [
      { id: 'f', start: [1, 1], end: [3, 1], thickness: 'internal', cutouts: [] },
    ]
    const abut = wallEndAbutmentThickness(free[0]!, free, true)
    expect(abut).toBe(0)
  })
})

// ── Default kitchen fixture placement ──────────────────────────────────────

// Kitchen room: origin=[6.40, 6.80], 3.70 × 2.35 m.
const KIT_X0 = 6.4
const KIT_Z0 = 6.8
const KIT_X1 = 6.4 + 3.7 // 10.10
const KIT_Z1 = 6.8 + 2.35 // 9.15

// Allow up to half the item depth beyond the wall gap (item centre is inside the room).
const ITEM_TOL = 0.5

const KITCHEN_IDS = new Set([
  'default-k-counter-n',
  'default-k-fridge',
  'default-k-stove',
  'default-k-microwave',
  'default-k-hood',
])

describe('default kitchen fixture positions', () => {
  it('every kitchen item centre lies within the kitchen room bounds', () => {
    for (const item of kitchen) {
      if (!KITCHEN_IDS.has(item.id)) continue
      const [x, z] = item.position
      expect(x).toBeGreaterThanOrEqual(KIT_X0 - ITEM_TOL)
      expect(x).toBeLessThanOrEqual(KIT_X1 + ITEM_TOL)
      expect(z).toBeGreaterThanOrEqual(KIT_Z0 - ITEM_TOL)
      expect(z).toBeLessThanOrEqual(KIT_Z1 + ITEM_TOL)
    }
  })

  it('counter back face is within CLEARANCE.wallGap of the kitchen north wall', () => {
    const counter = kitchen.find((i) => i.id === 'default-k-counter-n')!
    // Counter depth 0.6 m; rotation=0 → back face at z - 0.3.
    const backFaceZ = counter.position[1] - 0.3
    // North wall inner face at z=6.80; back face should be at most wallGap+small tolerance.
    expect(backFaceZ).toBeGreaterThanOrEqual(KIT_Z0)
    expect(backFaceZ).toBeLessThanOrEqual(KIT_Z0 + CLEARANCE.wallGap + 0.1)
  })

  it('fridge back face is within CLEARANCE.wallGap of the kitchen south wall', () => {
    const fridge = kitchen.find((i) => i.id === 'default-k-fridge')!
    // Fridge depth 0.7 m; rotation=π means back is at z + 0.35.
    const backFaceZ = fridge.position[1] + 0.35
    expect(Math.abs(backFaceZ - KIT_Z1)).toBeLessThanOrEqual(CLEARANCE.wallGap + 0.1)
  })

  it('stove back face is within CLEARANCE.wallGap of the kitchen south wall', () => {
    const stove = kitchen.find((i) => i.id === 'default-k-stove')!
    // Stove depth 0.6 m; rotation=π means back is at z + 0.30.
    const backFaceZ = stove.position[1] + 0.3
    expect(Math.abs(backFaceZ - KIT_Z1)).toBeLessThanOrEqual(CLEARANCE.wallGap + 0.1)
  })
})

// ── Default bathroom fixture positions ─────────────────────────────────────

// Bath 1: origin=[1.45, 5.10], 2.40 × 1.60 m (inner faces after wall thickness)
const BATH1_X0 = 1.45
const BATH1_Z0 = 5.1
const BATH1_X1 = 1.45 + 2.4 // 3.85
const BATH1_Z1 = 5.1 + 1.6 // 6.70

// Bath 2: origin=[3.95, 5.10], 2.05 × 1.60 m (inner faces after wall thickness)
const BATH2_X0 = 3.95
const BATH2_Z0 = 5.1
const BATH2_X1 = 3.95 + 2.05 // 6.00
const BATH2_Z1 = 5.1 + 1.6 // 6.70

describe('default bathroom fixture positions', () => {
  it('bath1 fixtures lie within bath1 bounds', () => {
    const bath1Items = bathrooms.filter((i) => i.id.startsWith('default-bath1'))
    expect(bath1Items.length).toBeGreaterThan(0)
    for (const item of bath1Items) {
      if (item.defId === 'bathroom-mirror') continue // mirrors are wall-mounted, can be at the face
      const [x, z] = item.position
      expect(x).toBeGreaterThanOrEqual(BATH1_X0 - ITEM_TOL)
      expect(x).toBeLessThanOrEqual(BATH1_X1 + ITEM_TOL)
      expect(z).toBeGreaterThanOrEqual(BATH1_Z0 - ITEM_TOL)
      expect(z).toBeLessThanOrEqual(BATH1_Z1 + ITEM_TOL)
    }
  })

  it('bath2 fixtures lie within bath2 bounds', () => {
    const bath2Items = bathrooms.filter((i) => i.id.startsWith('default-bath2'))
    expect(bath2Items.length).toBeGreaterThan(0)
    for (const item of bath2Items) {
      if (item.defId === 'bathroom-mirror') continue
      const [x, z] = item.position
      expect(x).toBeGreaterThanOrEqual(BATH2_X0 - ITEM_TOL)
      expect(x).toBeLessThanOrEqual(BATH2_X1 + ITEM_TOL)
      expect(z).toBeGreaterThanOrEqual(BATH2_Z0 - ITEM_TOL)
      expect(z).toBeLessThanOrEqual(BATH2_Z1 + ITEM_TOL)
    }
  })

  it('bath1 wc stays in south half (near south wall)', () => {
    const wc = bathrooms.find((i) => i.id === 'default-bath1-wc')!
    // WC should be close to the south wall (z > room midpoint z=5.9)
    expect(wc.position[1]).toBeGreaterThan((BATH1_Z0 + BATH1_Z1) / 2)
  })

  it('bath2 wc stays in south half (near south wall)', () => {
    const wc = bathrooms.find((i) => i.id === 'default-bath2-wc')!
    expect(wc.position[1]).toBeGreaterThan((BATH2_Z0 + BATH2_Z1) / 2)
  })

  it('service yard items stay within service yard bounds', () => {
    // Service yard: origin=[3.90, 6.80], 2.40 × 2.35 m
    const SY_X0 = 3.9
    const SY_Z0 = 6.8
    const SY_X1 = 3.9 + 2.4 // 6.30
    const SY_Z1 = 6.8 + 2.35 // 9.15
    const syItems = kitchen.filter((i) => i.id.startsWith('default-sy'))
    expect(syItems.length).toBeGreaterThan(0)
    for (const item of syItems) {
      const [x, z] = item.position
      expect(x).toBeGreaterThanOrEqual(SY_X0 - ITEM_TOL)
      expect(x).toBeLessThanOrEqual(SY_X1 + ITEM_TOL)
      expect(z).toBeGreaterThanOrEqual(SY_Z0 - ITEM_TOL)
      expect(z).toBeLessThanOrEqual(SY_Z1 + ITEM_TOL)
    }
  })
})
