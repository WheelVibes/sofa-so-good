import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanOpening, PlanWall } from '../../floorplan/types'
import { planThresholdRects, roomShellThresholdRects } from './planThresholdRects'
import { THRESHOLD_OVERLAP } from './thresholdRects'

function wall(partial: Partial<PlanWall> & Pick<PlanWall, 'id' | 'start' | 'end'>): PlanWall {
  return { thickness: 'internal', ...partial }
}

function door(
  partial: Partial<PlanOpening> & Pick<PlanOpening, 'id' | 'wallId' | 'offset' | 'width'>,
): PlanOpening {
  return { kind: 'door', sill: 0, head: 2.1, ...partial }
}

function plan(
  walls: PlanWall[],
  openings: PlanOpening[],
  wallThickness?: FloorPlan['wallThickness'],
): Pick<FloorPlan, 'walls' | 'openings' | 'wallThickness'> {
  return { walls, openings, wallThickness }
}

describe('planThresholdRects', () => {
  it('emits one patch per floor-level plan door, centred in the opening', () => {
    const w = wall({ id: 'w1', start: [2, 5], end: [8, 5] }) // +X wall
    const o = door({ id: 'd1', wallId: 'w1', offset: 1.5, width: 0.9 })
    const rects = planThresholdRects(plan([w], [o]))
    expect(rects).toHaveLength(1)
    const r = rects[0]
    expect(r.cx).toBeCloseTo(2 + 1.5 + 0.45)
    expect(r.cz).toBeCloseTo(5)
    expect(r.length).toBeCloseTo(0.9)
    // Internal default thickness 0.1 m + tuck-under overlap both sides.
    expect(r.depth).toBeCloseTo(0.1 + 2 * THRESHOLD_OVERLAP)
    expect(r.wallId).toBe('w1')
    // Same yaw convention as Skirting/thresholdRects: atan2(ux, uz).
    expect(r.angle).toBeCloseTo(Math.atan2(1, 0))
  })

  it('skips windows and raised-sill doors (they keep a solid sill segment)', () => {
    const w = wall({ id: 'w2', start: [0, 0], end: [6, 0] })
    const rects = planThresholdRects(
      plan(
        [w],
        [
          { id: 'win', kind: 'window', wallId: 'w2', offset: 1, width: 1.4, sill: 0.95, head: 2.1 },
          door({ id: 'step', wallId: 'w2', offset: 3, width: 0.9, sill: 0.5 }),
        ],
      ),
    )
    expect(rects).toHaveLength(0)
  })

  it('resolves thickness: per-wall thicknessM > plan default > built-in category', () => {
    const walls = [
      wall({ id: 'ext', start: [0, 0], end: [4, 0], thickness: 'external' }),
      wall({ id: 'ovr', start: [0, 2], end: [4, 2], thicknessM: 0.15 }),
      wall({ id: 'int', start: [0, 4], end: [4, 4] }),
    ]
    const openings = walls.map((w) => door({ id: `d-${w.id}`, wallId: w.id, offset: 1, width: 1 }))
    const rects = planThresholdRects(plan(walls, openings, { internal: 0.12 }))
    const byWall = new Map(rects.map((r) => [r.wallId, r]))
    expect(byWall.get('ext')?.depth).toBeCloseTo(0.2 + 2 * THRESHOLD_OVERLAP) // built-in external
    expect(byWall.get('ovr')?.depth).toBeCloseTo(0.15 + 2 * THRESHOLD_OVERLAP) // per-wall override
    expect(byWall.get('int')?.depth).toBeCloseTo(0.12 + 2 * THRESHOLD_OVERLAP) // plan default
  })

  it('clamps an over-running opening span into its wall (mirrors wallBoxes)', () => {
    const w = wall({ id: 'w3', start: [0, 0], end: [3, 0] })
    const [r] = planThresholdRects(
      plan([w], [door({ id: 'd3', wallId: 'w3', offset: 2.5, width: 1 })]),
    )
    expect(r.cx).toBeCloseTo(2.75) // clamped span [2.5, 3]
    expect(r.length).toBeCloseTo(0.5)
  })

  it('skips zero-length walls and doors whose clamped span collapses', () => {
    const degenerate = wall({ id: 'w4', start: [1, 1], end: [1, 1] })
    const short = wall({ id: 'w5', start: [0, 0], end: [2, 0] })
    const rects = planThresholdRects(
      plan(
        [degenerate, short],
        [
          door({ id: 'd4', wallId: 'w4', offset: 0, width: 0.9 }),
          door({ id: 'd5', wallId: 'w5', offset: 2, width: 0.9 }), // entirely past the end
        ],
      ),
    )
    expect(rects).toHaveLength(0)
  })

  it('places a curved-wall door patch on the chord under the opening, keyed to the host wall', () => {
    // Half-circle-ish bulge: chord along +X, arc bulging toward +Z.
    const w = wall({ id: 'arc', start: [0, 0], end: [4, 0], arc: 1 })
    const [r] = planThresholdRects(
      plan([w], [door({ id: 'da', wallId: 'arc', offset: 1.8, width: 0.9 })]),
    )
    expect(r).toBeDefined()
    expect(r.wallId).toBe('arc') // pseudo-wall id collapsed back to the host wall
    // The patch sits ON the arc (bulge side of the chord), roughly mid-wall.
    expect(r.cz).toBeGreaterThan(0.5)
    expect(r.cx).toBeGreaterThan(1)
    expect(r.cx).toBeLessThan(3)
    // Chord under the door is a hair shorter than the arc-length width.
    expect(r.length).toBeGreaterThan(0.8)
    expect(r.length).toBeLessThanOrEqual(0.9 + 1e-6)
    expect(r.depth).toBeCloseTo(0.1 + 2 * THRESHOLD_OVERLAP)
  })
})

describe('roomShellThresholdRects', () => {
  const thick = (wallId: string) => (wallId === 'ext' ? 0.2 : 0.1)

  it('emits a patch per floor-level door entry at its resolved centre/heading', () => {
    const rects = roomShellThresholdRects(
      [
        {
          opening: { kind: 'door', sill: 0, width: 0.9, wallId: 'ext' },
          center: [3, 5],
          angle: Math.atan2(1, 0),
        },
        {
          opening: { kind: 'window', sill: 0.9, width: 1.2, wallId: 'ext' },
          center: [6, 5],
          angle: 0,
        },
        {
          opening: { kind: 'door', sill: 0.4, width: 0.9, wallId: 'int' },
          center: [1, 2],
          angle: 0,
        },
      ],
      thick,
    )
    expect(rects).toHaveLength(1)
    const r = rects[0]
    expect(r.cx).toBe(3)
    expect(r.cz).toBe(5)
    expect(r.length).toBeCloseTo(0.9)
    expect(r.depth).toBeCloseTo(0.2 + 2 * THRESHOLD_OVERLAP)
    expect(r.angle).toBeCloseTo(Math.atan2(1, 0))
    expect(r.wallId).toBe('ext')
  })
})
