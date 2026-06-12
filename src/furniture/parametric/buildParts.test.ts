import { describe, expect, it } from 'vitest'
import {
  autoShelfCount,
  bayCount,
  buildParametric,
  doorLeafCount,
  drawerStackCount,
  type ParametricModel,
  type ParametricPart,
} from './buildParts'
import { estimatePrice } from './price'
import { defaultSpec, MAX_DOOR_LEAF, type ParametricSpec } from './spec'

const EPS = 1e-9

const minY = (p: ParametricPart) => p.position[1] - p.size[1] / 2
const maxY = (p: ParametricPart) => p.position[1] + p.size[1] / 2
const byRole = (m: ParametricModel, role: ParametricPart['role']) =>
  m.parts.filter((p) => p.role === role)

/** Structural invariants every generated model must satisfy. */
function expectSound(m: ParametricModel, spec: ParametricSpec) {
  // No NaN anywhere.
  for (const p of m.parts) {
    for (const v of [...p.position, ...p.size]) expect(Number.isFinite(v)).toBe(true)
    for (const v of p.size) expect(v).toBeGreaterThan(0)
  }
  // Floor-anchored: the lowest part touches y=0, nothing dips below it.
  const lows = m.parts.map(minY)
  expect(Math.min(...lows)).toBeCloseTo(0, 9)
  // The supports (sides or legs) reach the floor.
  const supports = spec.type === 'sideboard' && spec.base === 'legs' ? 'leg' : 'side'
  for (const p of byRole(m, supports)) expect(minY(p)).toBeCloseTo(0, 9)
  // Nothing pokes above the declared height.
  expect(Math.max(...m.parts.map(maxY))).toBeLessThanOrEqual(m.bounds.h + EPS)
  // Footprint-centred on X; on Z the carcass spans ±depth/2 with only the
  // proud doors/handles in front (≤ 6 cm — same convention as cabinetModel,
  // whose bounds also absorb the front panel without re-centring).
  for (const p of m.parts) {
    expect(Math.abs(p.position[0]) + p.size[0] / 2).toBeLessThanOrEqual(m.bounds.w / 2 + EPS)
    expect(p.position[2] - p.size[2] / 2).toBeGreaterThanOrEqual(-spec.depth / 2 - EPS)
    expect(p.position[2] + p.size[2] / 2).toBeLessThanOrEqual(spec.depth / 2 + 0.06)
  }
  // Declared bounds cover the carcass + any proud fronts.
  expect(m.bounds.w).toBeCloseTo(spec.width, 9)
  expect(m.bounds.h).toBeCloseTo(spec.height, 9)
  expect(m.bounds.d).toBeGreaterThanOrEqual(spec.depth - EPS)
  // Shelves span exactly between their bay's panels (no unsupported spans,
  // no clipping through the sides): each shelf's width equals the bay width.
  const sides = byRole(m, 'side')
  expect(sides).toHaveLength(2)
  const innerW = m.bounds.w - 2 * sides[0].size[0]
  const dividers = byRole(m, 'divider')
  expect(dividers).toHaveLength(m.bays - 1)
  const bayW = (innerW - dividers.length * 0.018) / m.bays
  for (const s of byRole(m, 'shelf')) expect(s.size[0]).toBeCloseTo(bayW, 9)
  // Back panel is inset between the sides.
  const back = byRole(m, 'back')[0]
  expect(back).toBeDefined()
  expect(back.size[0]).toBeCloseTo(innerW, 9)
  expect(back.position[2] - back.size[2] / 2).toBeCloseTo(-spec.depth / 2, 9)
}

describe('buildParametric — bookshelf', () => {
  it('default bookshelf is structurally sound with auto shelves', () => {
    const spec = defaultSpec('bookshelf')
    const m = buildParametric(spec)
    expectSound(m, spec)
    expect(m.bays).toBe(1)
    expect(m.doorCount).toBe(0)
    // Auto spacing lands in the comfortable band (innerH / (n+1) ≈ 0.32–0.38).
    const innerH = 2.0 - 0.06 - 2 * 0.018
    const spacing = innerH / (m.shelvesPerBay + 1)
    expect(spacing).toBeGreaterThanOrEqual(0.3)
    expect(spacing).toBeLessThanOrEqual(0.4)
    // Shelves are evenly spaced.
    const ys = byRole(m, 'shelf')
      .map((p) => p.position[1])
      .sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeCloseTo(spacing, 9)
  })

  it('shelf count 0 yields an open cube (no shelf parts)', () => {
    const spec = { ...defaultSpec('bookshelf'), shelves: 0 as const }
    const m = buildParametric(spec)
    expectSound(m, spec)
    expect(byRole(m, 'shelf')).toHaveLength(0)
    expect(m.shelvesPerBay).toBe(0)
  })

  it('a wide bookshelf gains a centre divider so shelves stay supported', () => {
    const spec = { ...defaultSpec('bookshelf'), width: 2.0 }
    const m = buildParametric(spec)
    expectSound(m, spec)
    expect(m.bays).toBe(2)
    expect(byRole(m, 'divider')).toHaveLength(1)
    // Divider runs bottom panel → top panel.
    const div = byRole(m, 'divider')[0]
    expect(minY(div)).toBeCloseTo(0.06 + 0.018, 9)
    expect(maxY(div)).toBeCloseTo(2.0 - 0.018, 9)
  })

  it('extreme aspect (max width, min height) still builds soundly', () => {
    const spec = { ...defaultSpec('bookshelf'), width: 2.4, height: 0.6 }
    const m = buildParametric(spec)
    expectSound(m, spec)
    expect(m.bays).toBeGreaterThanOrEqual(2)
  })
})

describe('buildParametric — wardrobe', () => {
  it('default wardrobe has doors, a rail and a top shelf per bay', () => {
    const spec = defaultSpec('wardrobe')
    const m = buildParametric(spec)
    expectSound(m, spec)
    expect(m.doorCount).toBe(2) // 1.2 m → two ≤0.6 m leaves
    expect(byRole(m, 'rail')).toHaveLength(m.bays)
    expect(byRole(m, 'shelf')).toHaveLength(m.bays)
    // Doors sit proud of the carcass front and within bounds.
    for (const d of byRole(m, 'door')) {
      expect(d.position[2] - d.size[2] / 2).toBeCloseTo(spec.depth / 2, 9)
      expect(d.size[0]).toBeLessThanOrEqual(MAX_DOOR_LEAF + EPS)
    }
    // One handle per leaf.
    expect(byRole(m, 'handle')).toHaveLength(m.doorCount)
    // Bounds include the proud door depth.
    expect(m.bounds.d).toBeGreaterThan(spec.depth)
  })

  it('doors off = open front (no door/handle parts, depth = carcass)', () => {
    const spec = { ...defaultSpec('wardrobe'), doors: false }
    const m = buildParametric(spec)
    expectSound(m, spec)
    expect(m.doorCount).toBe(0)
    expect(byRole(m, 'door')).toHaveLength(0)
    expect(byRole(m, 'handle')).toHaveLength(0)
    expect(m.bounds.d).toBeCloseTo(spec.depth, 9)
  })

  it('a 3 m wardrobe splits into enough ≤0.6 m leaves and ≥2 bays', () => {
    const spec = { ...defaultSpec('wardrobe'), width: 3.0 }
    const m = buildParametric(spec)
    expectSound(m, spec)
    expect(m.bays).toBeGreaterThanOrEqual(3)
    // Every door leaf fits within the per-leaf size limit.
    for (const d of byRole(m, 'door')) expect(d.size[0]).toBeLessThanOrEqual(MAX_DOOR_LEAF + EPS)
    // One handle per door leaf (vertical bar handle).
    expect(byRole(m, 'handle')).toHaveLength(m.doorCount)
    // Leaves correctly reported by doorCount.
    expect(byRole(m, 'door')).toHaveLength(m.doorCount)
  })

  it('the hanging rail sits below its shelf, inside the carcass', () => {
    const m = buildParametric(defaultSpec('wardrobe'))
    const shelf = byRole(m, 'shelf')[0]
    const rail = byRole(m, 'rail')[0]
    expect(rail.position[1]).toBeLessThan(shelf.position[1])
    expect(rail.position[1]).toBeGreaterThan(1.0) // hanging height, not at the floor
  })
})

describe('buildParametric — sideboard', () => {
  it('legs base: four legs reach the floor inside the footprint', () => {
    const spec = defaultSpec('sideboard') // base: legs
    const m = buildParametric(spec)
    expectSound(m, spec)
    const legs = byRole(m, 'leg')
    expect(legs).toHaveLength(4)
    for (const leg of legs) {
      expect(minY(leg)).toBeCloseTo(0, 9)
      expect(maxY(leg)).toBeCloseTo(0.12, 9) // carcass underside
      expect(Math.abs(leg.position[0])).toBeLessThan(spec.width / 2)
      expect(Math.abs(leg.position[2])).toBeLessThan(spec.depth / 2)
    }
    expect(byRole(m, 'plinth')).toHaveLength(0)
  })

  it('plinth base: recessed kick on the floor, sides reach the floor', () => {
    const spec = { ...defaultSpec('sideboard'), base: 'plinth' as const }
    const m = buildParametric(spec)
    expectSound(m, spec)
    expect(byRole(m, 'leg')).toHaveLength(0)
    const plinth = byRole(m, 'plinth')[0]
    expect(minY(plinth)).toBeCloseTo(0, 9)
    // Recessed behind the front face.
    expect(plinth.position[2] + plinth.size[2] / 2).toBeLessThan(spec.depth / 2)
  })

  it('a 2.4 m sideboard divides into ≤0.6 m door leaves with parity to bays', () => {
    const spec = { ...defaultSpec('sideboard'), width: 2.4 }
    const m = buildParametric(spec)
    expectSound(m, spec)
    expect(m.doorCount).toBe(doorLeafCount(2.4 - 2 * 0.018))
    for (const d of byRole(m, 'door')) expect(d.size[0]).toBeLessThanOrEqual(MAX_DOOR_LEAF + EPS)
  })
})

describe('helpers', () => {
  it('bayCount adds a divider past 1.2 m spans', () => {
    expect(bayCount(0.8)).toBe(1)
    expect(bayCount(1.2)).toBe(1)
    expect(bayCount(1.21)).toBe(2)
    expect(bayCount(2.9)).toBe(3)
  })
  it('autoShelfCount targets ~0.35 m spacing', () => {
    expect(autoShelfCount(0.2)).toBe(0)
    expect(autoShelfCount(0.7)).toBe(1)
    expect(autoShelfCount(1.75)).toBe(4)
  })
  it('doorLeafCount keeps each leaf ≤ 0.6 m', () => {
    expect(doorLeafCount(0.5)).toBe(1)
    expect(doorLeafCount(0.61)).toBe(2)
    expect(doorLeafCount(2.96)).toBe(5)
  })
})

describe('robustness', () => {
  it('never throws and always emits a sound model for malformed specs', () => {
    const evil: Array<Partial<ParametricSpec>> = [
      {},
      { type: 'wardrobe', width: Number.NaN, height: Number.POSITIVE_INFINITY },
      { type: 'sideboard', depth: -3, shelves: 99 },
      // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed
      { type: 'bogus' as any, width: '12' as any },
      { type: 'desk', deskLegs: 'pedestal' as const, pedestalDrawers: 99 },
    ]
    for (const raw of evil) {
      const m = buildParametric(raw as ParametricSpec)
      expect(m.parts.length).toBeGreaterThan(0)
      for (const p of m.parts) {
        for (const v of [...p.position, ...p.size]) expect(Number.isFinite(v)).toBe(true)
      }
    }
  })
})

// ============================================================================
// Drawers
// ============================================================================

describe('drawer-front parts', () => {
  it('sideboard with per-bay drawer style emits drawer-front + drawer-handle parts', () => {
    const spec: ParametricSpec = {
      ...defaultSpec('sideboard'),
      doors: false,
      compartments: [{ style: 'drawer' }],
    }
    const m = buildParametric(spec)
    expectSound(m, spec)
    const fronts = byRole(m, 'drawer-front')
    const handles = byRole(m, 'drawer-handle')
    expect(fronts.length).toBeGreaterThan(0)
    expect(handles).toHaveLength(fronts.length)
    // Drawer fronts sit proud of the carcass front (z > depth/2 - small).
    for (const f of fronts) {
      expect(f.position[2] + f.size[2] / 2).toBeGreaterThan(spec.depth / 2 - EPS)
    }
    // Reported in drawerCount.
    expect(m.drawerCount).toBe(fronts.length)
  })

  it('wardrobe bay set to drawer has fronts but no rail (rail would be hidden)', () => {
    const spec: ParametricSpec = {
      ...defaultSpec('wardrobe'),
      doors: true,
      compartments: [{ style: 'drawer' }], // bay 0 is drawers; bay 1 (if any) is door
    }
    const m = buildParametric(spec)
    expectSound(m, spec)
    const fronts = byRole(m, 'drawer-front')
    expect(fronts.length).toBeGreaterThan(0)
    // Rails are omitted for drawer bays.
    expect(byRole(m, 'rail').length).toBeLessThanOrEqual(m.bays - 1)
    expect(m.drawerCount).toBe(fronts.length)
  })

  it('drawer fronts are floor→top stacked (no gap above top, no clip below bottom)', () => {
    const spec: ParametricSpec = {
      ...defaultSpec('sideboard'),
      base: 'plinth' as const,
      doors: false,
      compartments: [{ style: 'drawer' }],
    }
    const m = buildParametric(spec)
    const fronts = byRole(m, 'drawer-front').sort((a, b) => a.position[1] - b.position[1])
    // Lowest front starts above (or at) the inner bottom.
    const innerBottom = 0.06 + 0.018 // PLINTH_H + PANEL_T
    expect(minY(fronts[0])).toBeGreaterThanOrEqual(innerBottom - EPS)
    // Highest front top ≤ inner top.
    const innerTop = spec.height - 0.018
    expect(maxY(fronts[fronts.length - 1])).toBeLessThanOrEqual(innerTop + EPS)
  })

  it('all-drawer sideboard has no door/handle parts', () => {
    const spec: ParametricSpec = {
      ...defaultSpec('sideboard'),
      width: 1.6,
      doors: false,
      compartments: [{ style: 'drawer' }, { style: 'drawer' }],
    }
    const m = buildParametric(spec)
    expectSound(m, spec)
    expect(byRole(m, 'door')).toHaveLength(0)
    expect(byRole(m, 'handle')).toHaveLength(0)
    expect(m.doorCount).toBe(0)
    expect(m.drawerCount).toBeGreaterThan(0)
  })

  it('price increases when drawers replace open bays', () => {
    const open: ParametricSpec = { ...defaultSpec('sideboard'), doors: false, compartments: [] }
    const withDrawers: ParametricSpec = {
      ...open,
      compartments: [{ style: 'drawer' }],
    }
    const pOpen = estimatePrice(buildParametric(open))
    const pDrawer = estimatePrice(buildParametric(withDrawers))
    expect(pDrawer).toBeGreaterThan(pOpen)
  })
})

// ============================================================================
// Per-compartment config
// ============================================================================

describe('per-compartment configuration', () => {
  it('mixed wardrobe: bay 0 open, bay 1 door, bay 2 drawer (if 3 bays)', () => {
    // Need 3 bays → width > 2 * MAX_BAY_SPAN
    const spec: ParametricSpec = {
      ...defaultSpec('wardrobe'),
      width: 2.5,
      doors: true,
      compartments: [{ style: 'open' }, { style: 'door' }, { style: 'drawer' }],
    }
    const m = buildParametric(spec)
    expectSound(m, spec)
    expect(m.bays).toBeGreaterThanOrEqual(3)
    // 'open' bay → no door, no drawer-front for bay 0
    // 'door' bay → at least 1 door leaf
    expect(m.doorCount).toBeGreaterThan(0)
    // 'drawer' bay → at least 1 drawer-front
    expect(m.drawerCount).toBeGreaterThan(0)
  })

  it('compartments shorter than bays: extra bays fall back to global default', () => {
    const spec: ParametricSpec = {
      ...defaultSpec('sideboard'),
      width: 2.0,
      doors: true,
      // Only 1 override; remaining bays inherit 'door' from `doors: true`
      compartments: [{ style: 'drawer' }],
    }
    const m = buildParametric(spec)
    expectSound(m, spec)
    // Bay 0 → drawers; remaining bays → doors (global default).
    expect(m.drawerCount).toBeGreaterThan(0)
    expect(m.doorCount).toBeGreaterThan(0)
  })

  it('empty compartments array uses global doors flag', () => {
    const specDoors: ParametricSpec = {
      ...defaultSpec('sideboard'),
      doors: true,
      compartments: [],
    }
    const specOpen: ParametricSpec = {
      ...defaultSpec('sideboard'),
      doors: false,
      compartments: [],
    }
    const mDoors = buildParametric(specDoors)
    const mOpen = buildParametric(specOpen)
    expect(mDoors.doorCount).toBeGreaterThan(0)
    expect(mOpen.doorCount).toBe(0)
    expect(mOpen.drawerCount).toBe(0)
  })
})

// ============================================================================
// Desk
// ============================================================================

describe('buildParametric — desk', () => {
  it('default desk (four legs) is structurally sound', () => {
    const spec = defaultSpec('desk')
    const m = buildParametric(spec)
    // Floor-anchored.
    const lows = m.parts.map(minY)
    expect(Math.min(...lows)).toBeCloseTo(0, 9)
    // No NaN, all sizes positive.
    for (const p of m.parts) {
      for (const v of [...p.position, ...p.size]) expect(Number.isFinite(v)).toBe(true)
      for (const v of p.size) expect(v).toBeGreaterThan(0)
    }
    // Worktop at the top.
    const tops = byRole(m, 'worktop')
    expect(tops).toHaveLength(1)
    expect(maxY(tops[0])).toBeCloseTo(spec.height, 5)
    // Four legs reaching the floor.
    const legs = byRole(m, 'leg')
    expect(legs).toHaveLength(4)
    for (const l of legs) expect(minY(l)).toBeCloseTo(0, 9)
    // Legs inside the footprint.
    for (const l of legs) {
      expect(Math.abs(l.position[0]) + l.size[0] / 2).toBeLessThanOrEqual(spec.width / 2 + EPS)
      expect(Math.abs(l.position[2]) + l.size[2] / 2).toBeLessThanOrEqual(spec.depth / 2 + EPS)
    }
    // Bounds match spec.
    expect(m.bounds.w).toBeCloseTo(spec.width, 9)
    expect(m.bounds.h).toBeCloseTo(spec.height, 9)
    expect(m.bounds.d).toBeCloseTo(spec.depth, 9)
  })

  it('pedestal desk has stacked drawer fronts + left legs, structurally sound', () => {
    const spec: ParametricSpec = {
      ...defaultSpec('desk'),
      deskLegs: 'pedestal',
      pedestalDrawers: 2,
    }
    const m = buildParametric(spec)
    const lows = m.parts.map(minY)
    expect(Math.min(...lows)).toBeCloseTo(0, 9)
    // Drawer fronts present.
    const fronts = byRole(m, 'drawer-front')
    expect(fronts.length).toBeGreaterThanOrEqual(1)
    expect(m.drawerCount).toBe(fronts.length)
    // Worktop still at the top.
    const tops = byRole(m, 'worktop')
    expect(tops).toHaveLength(1)
    expect(maxY(tops[0])).toBeCloseTo(spec.height, 5)
    // Some legs (the left side)
    const legs = byRole(m, 'leg')
    expect(legs.length).toBeGreaterThan(0)
  })

  it('desk dimension clamping works', () => {
    const spec = defaultSpec('desk')
    expect(spec.height).toBeGreaterThanOrEqual(0.68)
    expect(spec.height).toBeLessThanOrEqual(0.82)
    expect(spec.width).toBeGreaterThanOrEqual(0.6)
    expect(spec.depth).toBeGreaterThanOrEqual(0.5)
  })

  it('desk price is positive, rounded to $5, and reasonable for HDB home office', () => {
    const price = estimatePrice(buildParametric(defaultSpec('desk')))
    expect(price).toBeGreaterThan(0)
    expect(price % 5).toBe(0)
    // A simple desk should be $50–$800 range.
    expect(price).toBeGreaterThan(50)
    expect(price).toBeLessThan(800)
  })

  it('pedestal desk costs more than legs-only desk (extra drawers)', () => {
    const legsPrice = estimatePrice(buildParametric({ ...defaultSpec('desk'), deskLegs: 'legs' }))
    const pedPrice = estimatePrice(
      buildParametric({ ...defaultSpec('desk'), deskLegs: 'pedestal', pedestalDrawers: 2 }),
    )
    expect(pedPrice).toBeGreaterThan(legsPrice)
  })
})

describe('helpers (extended)', () => {
  it('drawerStackCount targets ~0.18 m drawer height', () => {
    // 0.45 m inner height → ~2–3 drawers
    expect(drawerStackCount(0.45)).toBeGreaterThanOrEqual(2)
    // Very tall: more drawers
    expect(drawerStackCount(0.9)).toBeGreaterThan(drawerStackCount(0.45))
    // Minimum 1
    expect(drawerStackCount(0.05)).toBe(1)
  })
})
