import { afterEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../features/featureFlags'
import {
  advanceOpen,
  DOOR_OPEN_ANGLE,
  doorHingePivot,
  drawerSlideDistance,
  easeInOut,
  isCabinetOpen,
  OPEN_SECONDS,
  OPENABLE_CABINET_PRIMITIVES,
  supportsCabinetOpen,
} from './cabinetOpen'
import type { FurnitureDef, ParametricDef, PrimitiveKind } from './types'

const parametric = (primitive: PrimitiveKind): ParametricDef => ({
  kind: 'parametric',
  id: `test-${primitive}`,
  name: primitive,
  category: 'storage',
  primitive,
  defaultFootprint: { w: 1, d: 0.6, h: 1 },
  paramSchema: [],
})

describe('easeInOut', () => {
  it('pins the endpoints and clamps out-of-range input', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(-5)).toBe(0)
    expect(easeInOut(5)).toBe(1)
  })

  it('is symmetric about the midpoint and passes through 0.5 there', () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1)
  })

  it('is monotonic increasing with eased (slow) ends', () => {
    let prev = -1
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const v = easeInOut(t)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    // Slow start: at t=0.1 well under linear 0.1.
    expect(easeInOut(0.1)).toBeLessThan(0.1)
  })
})

describe('advanceOpen — fixed-duration raw progress', () => {
  it('reaches the target after exactly OPEN_SECONDS of steps', () => {
    let p = 0
    const dt = OPEN_SECONDS / 4
    for (let i = 0; i < 4; i++) p = advanceOpen(p, 1, dt)
    expect(p).toBe(1)
  })

  it('steps proportionally to dt and never overshoots', () => {
    expect(advanceOpen(0, 1, OPEN_SECONDS / 2)).toBeCloseTo(0.5)
    // A huge dt snaps to the target rather than passing it.
    expect(advanceOpen(0, 1, 999)).toBe(1)
    expect(advanceOpen(1, 0, 999)).toBe(0)
  })

  it('moves toward a lower target when closing', () => {
    expect(advanceOpen(1, 0, OPEN_SECONDS / 2)).toBeCloseTo(0.5)
  })

  it('is a no-op for degenerate dt/seconds (returns target)', () => {
    expect(advanceOpen(0.3, 1, 0)).toBe(1)
    expect(advanceOpen(0.3, 1, 0.1, 0)).toBe(1)
  })
})

describe('doorHingePivot — leaf stays attached to its hinge edge', () => {
  it('left-hinged leaf pivots on its −X edge and swings negative', () => {
    // Leaf centred at 0.3, width 0.4 → left edge at 0.1.
    const { pivotX, swingSign } = doorHingePivot(0.3, 0.4, 'left')
    expect(pivotX).toBeCloseTo(0.1)
    expect(swingSign).toBe(-1)
  })

  it('right-hinged leaf pivots on its +X edge and swings positive', () => {
    const { pivotX, swingSign } = doorHingePivot(0.3, 0.4, 'right')
    expect(pivotX).toBeCloseTo(0.5)
    expect(swingSign).toBe(1)
  })

  it('swings the free edge toward +Z (into the room) at full open', () => {
    // Approximate the wrapper: rotate the leaf-centre offset from the pivot by
    // swingSign*angle about Y and check the resulting Z is positive (outward).
    const cx = 0.3
    const w = 0.4
    for (const hinge of ['left', 'right'] as const) {
      const { pivotX, swingSign } = doorHingePivot(cx, w, hinge)
      const offX = cx - pivotX // leaf-centre X relative to the hinge
      const theta = swingSign * DOOR_OPEN_ANGLE
      // Ry(theta): z' = -x*sin(theta)
      const zAtFullOpen = -offX * Math.sin(theta)
      expect(zAtFullOpen).toBeGreaterThan(0)
    }
  })
})

describe('supportsCabinetOpen — capability gate', () => {
  it('is true for every openable cabinet-family primitive', () => {
    for (const kind of OPENABLE_CABINET_PRIMITIVES) {
      expect(supportsCabinetOpen(parametric(kind))).toBe(true)
    }
    expect(OPENABLE_CABINET_PRIMITIVES.size).toBe(6)
  })

  it('is false for a non-cabinet parametric primitive', () => {
    expect(supportsCabinetOpen(parametric('Sofa'))).toBe(false)
    expect(supportsCabinetOpen(parametric('DiningTable'))).toBe(false)
  })

  it('is false for a GLB/upload/pack def (fronts are baked)', () => {
    const gltf = {
      kind: 'gltf',
      source: 'builtin',
      id: 'x',
      name: 'x',
      category: 'storage',
      url: '/x.glb',
      license: 'CC0',
      defaultFootprint: { w: 1, d: 1, h: 1 },
    } as unknown as FurnitureDef
    expect(supportsCabinetOpen(gltf)).toBe(false)
  })
})

describe('supportsCabinetOpen — config-aware (nothing to animate → false)', () => {
  it('is false for a sliding or open-style wardrobe (no hinged leaf/drawer)', () => {
    expect(supportsCabinetOpen(parametric('Wardrobe'), { doorStyle: 'sliding' })).toBe(false)
    expect(supportsCabinetOpen(parametric('Wardrobe'), { doorStyle: 'open' })).toBe(false)
  })

  it('is true for a hinged wardrobe (explicit or default)', () => {
    expect(supportsCabinetOpen(parametric('Wardrobe'), { doorStyle: 'hinged' })).toBe(true)
    expect(supportsCabinetOpen(parametric('Wardrobe'))).toBe(true) // default = hinged
  })

  it('is false for an open-front cabinet, true for every hinged/drawer front', () => {
    for (const kind of ['CabinetBase', 'CabinetWall', 'CabinetTall'] as const) {
      expect(supportsCabinetOpen(parametric(kind), { front: 'open' })).toBe(false)
      for (const front of ['slab', 'shaker', 'drawers', 'glass'])
        expect(supportsCabinetOpen(parametric(kind), { front })).toBe(true)
      expect(supportsCabinetOpen(parametric(kind))).toBe(true) // default = slab
    }
  })

  it('is true for dresser + sideboard regardless of config (always drawers/doors)', () => {
    expect(supportsCabinetOpen(parametric('Dresser'), { front: 'open' })).toBe(true)
    expect(supportsCabinetOpen(parametric('Sideboard'), {})).toBe(true)
  })
})

describe('drawerSlideDistance — one shared formula', () => {
  it('scales with depth and caps at 0.45 m', () => {
    expect(drawerSlideDistance(0.5)).toBeCloseTo(0.3)
    expect(drawerSlideDistance(0.6)).toBeCloseTo(0.36)
    expect(drawerSlideDistance(1)).toBe(0.45) // capped
    expect(drawerSlideDistance(0.42)).toBeCloseTo(0.252)
  })
})

describe('isCabinetOpen', () => {
  // Restore the module flag snapshot to defaults (cabinetOpen on) after each case.
  afterEach(() => setResolvedFlags(resolveFlags(false, {}, false, 'simple')))

  it('reads props.open, defaulting closed when absent/other (flag on)', () => {
    setResolvedFlags(resolveFlags(false, {}, false, 'simple'))
    expect(isCabinetOpen({ open: 'yes' })).toBe(true)
    expect(isCabinetOpen({ open: 'no' })).toBe(false)
    expect(isCabinetOpen({})).toBe(false)
  })

  it('reads closed when the cabinetOpen flag is OFF, even with open:yes persisted', () => {
    // Kill-switch: a privileged override forces the flag off (see resolveFlags).
    setResolvedFlags(resolveFlags(true, { cabinetOpen: false }, false, 'simple'))
    expect(isCabinetOpen({ open: 'yes' })).toBe(false)
  })
})

describe('cabinetOpen feature flag — simple tier, on in BOTH modes', () => {
  it('is enabled in Simple mode (the app default)', () => {
    expect(resolveFlags(false, {}, false, 'simple').cabinetOpen).toBe(true)
  })
  it('is enabled in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').cabinetOpen).toBe(true)
  })
})
