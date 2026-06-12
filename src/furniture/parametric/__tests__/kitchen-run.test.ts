/**
 * Unit tests for the kitchen-run parametric type (C270).
 *
 * Covers: dimension clamping, toe-kick geometry, worktop position, structural
 * soundness (no floating members), per-bay door/drawer fronts, price
 * monotonicity, and uppers-on vs uppers-off part count.
 */

import { describe, expect, it } from 'vitest'
import { buildParametric, type ParametricModel, type ParametricPart } from '../buildParts'
import { estimatePrice } from '../price'
import { clampSpec, defaultSpec, PARAMETRIC_LIMITS, type ParametricSpec } from '../spec'

const EPS = 1e-9

const minY = (p: ParametricPart) => p.position[1] - p.size[1] / 2
const maxY = (p: ParametricPart) => p.position[1] + p.size[1] / 2
const byRole = (m: ParametricModel, role: ParametricPart['role']) =>
  m.parts.filter((p) => p.role === role)

// ============================================================================
// Clamping
// ============================================================================

describe('kitchen-run clampSpec', () => {
  it('default spec passes through unchanged', () => {
    const s = defaultSpec('kitchen-run')
    const c = clampSpec(s)
    expect(c.type).toBe('kitchen-run')
    expect(c.width).toBe(s.width)
    expect(c.height).toBe(s.height)
    expect(c.depth).toBe(s.depth)
    expect(c.bays).toBe(s.bays)
    expect(c.hasUppers).toBe(s.hasUppers)
  })

  it('width is clamped to [0.6, 3.6]', () => {
    const lim = PARAMETRIC_LIMITS['kitchen-run']
    expect(clampSpec({ type: 'kitchen-run', width: 0 }).width).toBe(lim.width.min)
    expect(clampSpec({ type: 'kitchen-run', width: 99 }).width).toBe(lim.width.max)
    expect(clampSpec({ type: 'kitchen-run', width: 1.8 }).width).toBe(1.8)
  })

  it('height is clamped to [0.85, 0.92]', () => {
    const lim = PARAMETRIC_LIMITS['kitchen-run']
    expect(clampSpec({ type: 'kitchen-run', height: 0.1 }).height).toBe(lim.height.min)
    expect(clampSpec({ type: 'kitchen-run', height: 2.0 }).height).toBe(lim.height.max)
    expect(clampSpec({ type: 'kitchen-run', height: 0.87 }).height).toBeCloseTo(0.87)
  })

  it('depth is clamped to [0.55, 0.65]', () => {
    const lim = PARAMETRIC_LIMITS['kitchen-run']
    expect(clampSpec({ type: 'kitchen-run', depth: 0.1 }).depth).toBe(lim.depth.min)
    expect(clampSpec({ type: 'kitchen-run', depth: 1.0 }).depth).toBe(lim.depth.max)
    expect(clampSpec({ type: 'kitchen-run', depth: 0.6 }).depth).toBeCloseTo(0.6)
  })

  it('bays is clamped to [1, 6]', () => {
    expect(clampSpec({ type: 'kitchen-run', bays: 0 }).bays).toBe(1)
    expect(clampSpec({ type: 'kitchen-run', bays: 99 }).bays).toBe(6)
    expect(clampSpec({ type: 'kitchen-run', bays: 4 }).bays).toBe(4)
  })

  it('hasUppers boolean is preserved', () => {
    expect(clampSpec({ type: 'kitchen-run', hasUppers: true }).hasUppers).toBe(true)
    expect(clampSpec({ type: 'kitchen-run', hasUppers: false }).hasUppers).toBe(false)
  })
})

// ============================================================================
// Geometry
// ============================================================================

describe('kitchen-run geometry', () => {
  it('default spec builds without errors and has finite parts', () => {
    const spec = defaultSpec('kitchen-run')
    const m = buildParametric(spec)
    expect(m.parts.length).toBeGreaterThan(0)
    for (const p of m.parts) {
      for (const v of [...p.position, ...p.size]) expect(Number.isFinite(v)).toBe(true)
      for (const v of p.size) expect(v).toBeGreaterThan(0)
    }
  })

  it('toe-kick (plinth) is at y=0 and exactly 0.1 m tall', () => {
    const m = buildParametric(defaultSpec('kitchen-run'))
    const plinths = byRole(m, 'plinth')
    expect(plinths.length).toBeGreaterThan(0)
    const plinth = plinths[0]
    expect(minY(plinth)).toBeCloseTo(0, 9) // sits on the floor
    expect(plinth.size[1]).toBeCloseTo(0.1, 5) // 0.1 m tall
  })

  it('toe-kick is recessed from the front face (inset ≥ 0)', () => {
    const spec = defaultSpec('kitchen-run')
    const m = buildParametric(spec)
    const plinth = byRole(m, 'plinth')[0]
    // Front face of plinth must be behind carcass front face.
    const plinthFront = plinth.position[2] + plinth.size[2] / 2
    expect(plinthFront).toBeLessThan(spec.depth / 2 + EPS)
  })

  it('worktop top face is at spec.height', () => {
    const spec = defaultSpec('kitchen-run')
    const m = buildParametric(spec)
    const worktops = byRole(m, 'worktop')
    expect(worktops).toHaveLength(1)
    const wt = worktops[0]
    expect(maxY(wt)).toBeCloseTo(spec.height, 5)
  })

  it('worktop overhangs the carcass front', () => {
    const spec = defaultSpec('kitchen-run')
    const m = buildParametric(spec)
    const wt = byRole(m, 'worktop')[0]
    const carcassFront = spec.depth / 2
    const worktopFront = wt.position[2] + wt.size[2] / 2
    expect(worktopFront).toBeGreaterThan(carcassFront - EPS)
  })

  it('no part has minY < 0 (floor-anchored)', () => {
    const spec = defaultSpec('kitchen-run')
    const m = buildParametric(spec)
    for (const p of m.parts) {
      expect(minY(p)).toBeGreaterThanOrEqual(-EPS)
    }
  })

  it('side panels reach the floor (minY ≈ 0)', () => {
    const spec = defaultSpec('kitchen-run')
    const m = buildParametric(spec)
    const sides = byRole(m, 'side')
    expect(sides.length).toBeGreaterThanOrEqual(2)
    for (const s of sides) {
      // Base sides reach floor; upper sides float (y > 0).
      // Filter base sides: those starting near 0.
      if (minY(s) < 0.01) {
        expect(minY(s)).toBeCloseTo(0, 5)
      }
    }
    // At least two base sides reach the floor.
    const baseSides = sides.filter((s) => minY(s) < 0.01)
    expect(baseSides.length).toBeGreaterThanOrEqual(2)
  })

  it('correct number of bay dividers (bays - 1)', () => {
    const spec: ParametricSpec = { ...defaultSpec('kitchen-run'), bays: 4, compartments: [] }
    const m = buildParametric(spec)
    expect(m.bays).toBe(4)
    expect(byRole(m, 'divider')).toHaveLength(3) // bays - 1
  })

  it('bounds height matches spec.height for no-uppers case', () => {
    const spec = defaultSpec('kitchen-run')
    const m = buildParametric(spec)
    expect(m.bounds.h).toBeCloseTo(spec.height, 5)
  })

  it('bounds height is greater than spec.height when hasUppers is true', () => {
    const spec: ParametricSpec = { ...defaultSpec('kitchen-run'), hasUppers: true }
    const m = buildParametric(spec)
    expect(m.bounds.h).toBeGreaterThan(spec.height)
  })
})

// ============================================================================
// Per-bay fronts
// ============================================================================

describe('kitchen-run per-bay styles', () => {
  it('all-door bay spec produces door meshes', () => {
    const spec: ParametricSpec = {
      ...defaultSpec('kitchen-run'),
      bays: 3,
      compartments: [{ style: 'door' }, { style: 'door' }, { style: 'door' }],
    }
    const m = buildParametric(spec)
    expect(byRole(m, 'door').length).toBeGreaterThan(0)
    expect(m.doorCount).toBe(byRole(m, 'door').length)
  })

  it('all-drawer bay spec produces drawer-front meshes', () => {
    const spec: ParametricSpec = {
      ...defaultSpec('kitchen-run'),
      bays: 3,
      compartments: [{ style: 'drawer' }, { style: 'drawer' }, { style: 'drawer' }],
    }
    const m = buildParametric(spec)
    expect(byRole(m, 'drawer-front').length).toBeGreaterThan(0)
    expect(m.drawerCount).toBe(byRole(m, 'drawer-front').length)
    expect(byRole(m, 'door').length).toBe(0)
  })

  it('all-open bay spec produces no door or drawer-front parts', () => {
    const spec: ParametricSpec = {
      ...defaultSpec('kitchen-run'),
      bays: 2,
      doors: false,
      compartments: [{ style: 'open' }, { style: 'open' }],
    }
    const m = buildParametric(spec)
    expect(byRole(m, 'door').length).toBe(0)
    expect(byRole(m, 'drawer-front').length).toBe(0)
    // Open bays get a mid-height shelf each.
    expect(byRole(m, 'shelf').length).toBeGreaterThanOrEqual(2)
  })

  it('mixed bay spec produces correct part types per bay', () => {
    const spec: ParametricSpec = {
      ...defaultSpec('kitchen-run'),
      bays: 3,
      compartments: [{ style: 'door' }, { style: 'drawer' }, { style: 'open' }],
    }
    const m = buildParametric(spec)
    expect(byRole(m, 'door').length).toBeGreaterThan(0)
    expect(byRole(m, 'drawer-front').length).toBeGreaterThan(0)
    // Open bay adds a shelf.
    expect(byRole(m, 'shelf').length).toBeGreaterThanOrEqual(1)
  })

  it('drawer fronts have matching drawer-handle parts', () => {
    const spec: ParametricSpec = {
      ...defaultSpec('kitchen-run'),
      bays: 2,
      compartments: [{ style: 'drawer' }, { style: 'drawer' }],
    }
    const m = buildParametric(spec)
    const fronts = byRole(m, 'drawer-front')
    const handles = byRole(m, 'drawer-handle')
    expect(handles.length).toBe(fronts.length)
  })
})

// ============================================================================
// Upper cabinets
// ============================================================================

describe('kitchen-run upper cabinets', () => {
  it('hasUppers: true produces more parts than false', () => {
    const baseSpec = defaultSpec('kitchen-run')
    const withUppers: ParametricSpec = { ...baseSpec, hasUppers: true }
    const withoutUppers: ParametricSpec = { ...baseSpec, hasUppers: false }
    const mWith = buildParametric(withUppers)
    const mWithout = buildParametric(withoutUppers)
    expect(mWith.parts.length).toBeGreaterThan(mWithout.parts.length)
  })

  it('upper cabinet parts float above the worktop', () => {
    const spec: ParametricSpec = { ...defaultSpec('kitchen-run'), hasUppers: true }
    const m = buildParametric(spec)
    // Find parts above spec.height (worktop top face).
    const upperParts = m.parts.filter((p) => minY(p) >= spec.height - EPS)
    // Worktop itself is just at spec.height; upper parts are well above.
    const aboveWorktop = upperParts.filter((p) => minY(p) > spec.height + 0.1)
    expect(aboveWorktop.length).toBeGreaterThan(0)
  })

  it('no part is below y=0 even with uppers', () => {
    const spec: ParametricSpec = { ...defaultSpec('kitchen-run'), hasUppers: true }
    const m = buildParametric(spec)
    for (const p of m.parts) {
      expect(minY(p)).toBeGreaterThanOrEqual(-EPS)
    }
  })
})

// ============================================================================
// Price monotonicity
// ============================================================================

describe('kitchen-run price', () => {
  it('price is positive and rounded to $5', () => {
    const price = estimatePrice(buildParametric(defaultSpec('kitchen-run')))
    expect(price).toBeGreaterThan(0)
    expect(price % 5).toBe(0)
  })

  it('price increases with more bays (monotonicity)', () => {
    const priceFor = (bays: number) =>
      estimatePrice(buildParametric(clampSpec({ type: 'kitchen-run', bays })))
    const p1 = priceFor(1)
    const p3 = priceFor(3)
    const p6 = priceFor(6)
    expect(p3).toBeGreaterThan(p1)
    expect(p6).toBeGreaterThan(p3)
  })

  it('price increases with more width (monotonicity)', () => {
    const priceFor = (width: number) =>
      estimatePrice(buildParametric(clampSpec({ type: 'kitchen-run', width })))
    const p1 = priceFor(0.6)
    const p2 = priceFor(1.8)
    const p3 = priceFor(3.6)
    expect(p2).toBeGreaterThan(p1)
    expect(p3).toBeGreaterThan(p2)
  })

  it('uppers add to the price', () => {
    const pBase = estimatePrice(
      buildParametric(clampSpec({ type: 'kitchen-run', hasUppers: false })),
    )
    const pUppers = estimatePrice(
      buildParametric(clampSpec({ type: 'kitchen-run', hasUppers: true })),
    )
    expect(pUppers).toBeGreaterThan(pBase)
  })

  it('price is in a reasonable range for a default HDB kitchen run', () => {
    const price = estimatePrice(buildParametric(defaultSpec('kitchen-run')))
    // 1.8 m run with 3 door bays: expect $100–$3000 band
    expect(price).toBeGreaterThan(100)
    expect(price).toBeLessThan(3000)
  })
})
