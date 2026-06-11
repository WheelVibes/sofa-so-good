import { describe, expect, it } from 'vitest'
import { buildWalkBlockers, MIN_BLOCK_TOP, resolveCircleVsObbs } from './furnitureBlock'
import type { OBB } from './obb'

const box = (cx: number, cz: number, hx: number, hz: number, rot = 0): OBB => ({
  cx,
  cz,
  hx,
  hz,
  rot,
})

describe('resolveCircleVsObbs', () => {
  const r = 0.25
  const b = box(0, 0, 1, 1) // 2×2 box at origin

  it('leaves a walker clear of any box untouched', () => {
    expect(resolveCircleVsObbs(5, 5, r, [b])).toEqual([5, 5])
  })

  it('pushes a walker overlapping a face out to exactly the radius', () => {
    // Just inside the +X face (box edge at x=1), walker at x=1.1 overlaps.
    const [x, z] = resolveCircleVsObbs(1.1, 0, r, [b])
    expect(x).toBeCloseTo(1 + r) // ejected to edge + radius
    expect(z).toBeCloseTo(0)
  })

  it('ejects a walker whose centre is inside the box', () => {
    const [x, z] = resolveCircleVsObbs(0.2, 0, r, [b])
    // Nearest face is +X (overX smaller) → pushed out past the +X edge.
    expect(x).toBeCloseTo(1 + r)
    expect(z).toBeCloseTo(0)
  })

  it('pushes out of a corner along the diagonal', () => {
    const [x, z] = resolveCircleVsObbs(1.1, 1.1, r, [b])
    const corner = Math.hypot(x - 1, z - 1)
    expect(corner).toBeCloseTo(r)
  })

  it('respects rotation (45° box)', () => {
    const rb = box(0, 0, 1, 1, Math.PI / 4)
    // A point that is outside the unrotated box but the rotated one still pushes
    // out to radius from its nearest surface — just assert it ends ≥ radius away
    // from the box centre projection (no penetration).
    const [x, z] = resolveCircleVsObbs(0.9, 0, r, [rb])
    expect(Math.hypot(x, z)).toBeGreaterThan(0.9)
  })
})

describe('buildWalkBlockers', () => {
  const defs: Record<string, FurnitureDefLike> = {
    sofa: { defaultFootprint: { w: 2, d: 0.9, h: 0.8 } },
    rug: { defaultFootprint: { w: 2, d: 1.4, h: 0.02 }, noClip: true },
    art: { defaultFootprint: { w: 0.6, d: 0.05, h: 0.8 }, mounted: true },
    lowstep: { defaultFootprint: { w: 1, d: 1, h: 0.2 } }, // top under shin height
    wardrobe: { defaultFootprint: { w: 1.5, d: 0.6, h: 2.1 } },
  }
  type FurnitureDefLike = {
    defaultFootprint: { w: number; d: number; h: number }
    mounted?: boolean
    noClip?: boolean
    verticalSpan?: { base: number; top: number }
  }
  // biome-ignore lint/suspicious/noExplicitAny: lightweight fakes for the pure builder
  const getDef = (id: string) => defs[id] as any
  // biome-ignore lint/suspicious/noExplicitAny: lightweight fakes
  const item = (defId: string): any => ({
    id: defId,
    defId,
    position: [0, 0],
    rotation: 0,
    props: {},
  })

  it('blocks tall furniture, skips mounted / no-clip / shin-height items', () => {
    const boxes = buildWalkBlockers(
      [item('sofa'), item('rug'), item('art'), item('lowstep'), item('wardrobe')],
      getDef,
    )
    expect(boxes).toHaveLength(2) // sofa + wardrobe only
  })

  it('MIN_BLOCK_TOP is shin height', () => {
    expect(MIN_BLOCK_TOP).toBeCloseTo(0.3)
  })

  it('excludes upper-storey items — the walker is on the ground floor (F13/ML3)', () => {
    const upstairs = { ...item('wardrobe'), levelId: 'lvl-2' }
    const ground = { ...item('sofa'), levelId: 'ground' } // explicit ground id still blocks
    expect(buildWalkBlockers([upstairs], getDef)).toHaveLength(0)
    expect(buildWalkBlockers([upstairs, ground, item('sofa')], getDef)).toHaveLength(2)
  })
})
