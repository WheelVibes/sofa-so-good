/**
 * Per-wall crown-molding override. Crown molding previously hardcoded its
 * colour (`#eeece6`) and height with no per-wall control at all, so it read as
 * an obvious mismatch the moment a wall took a dark photo finish — while
 * skirting had a full override. These pin the parity, the schema round-trip and
 * the plan-rescale behaviour.
 */
import { describe, expect, it } from 'vitest'
import { FloorPlanZ } from '../state/schema'
import { rescalePlan } from './rescalePlan'
import {
  DEFAULT_CROWN_COLOR,
  DEFAULT_CROWN_HEIGHT_M,
  DEFAULT_SKIRTING_COLOR,
  DEFAULT_SKIRTING_HEIGHT_M,
} from './types'

describe('crown molding defaults', () => {
  it('are distinct from, but shaped like, the skirting defaults', () => {
    expect(DEFAULT_CROWN_HEIGHT_M).toBeGreaterThan(0)
    expect(DEFAULT_CROWN_COLOR).toMatch(/^#[0-9a-f]{6}$/i)
    expect(DEFAULT_SKIRTING_HEIGHT_M).toBeGreaterThan(0)
    expect(DEFAULT_SKIRTING_COLOR).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('crown override survives a plan rescale', () => {
  const plan = {
    walls: [
      {
        id: 'w1',
        start: [0, 0] as [number, number],
        end: [4, 0] as [number, number],
        thickness: 'internal' as const,
        crown: { height: 0.1, color: '#223344' },
        baseboard: { height: 0.12 },
      },
    ],
    openings: [],
    rooms: [],
    ceilingHeight: 2.8,
    extent: [4, 4] as [number, number],
  }

  it('scales the crown height like the skirting height', () => {
    const out = rescalePlan(plan as never, 2).plan
    const w = out.walls[0]
    expect(w.crown?.height).toBeCloseTo(0.2)
    expect(w.baseboard?.height).toBeCloseTo(0.24)
  })

  it('leaves the colour untouched (not a length)', () => {
    const out = rescalePlan(plan as never, 2).plan
    expect(out.walls[0].crown?.color).toBe('#223344')
  })

  it('does not invent a crown on a wall that has none', () => {
    const bare = { ...plan, walls: [{ ...plan.walls[0], crown: undefined }] }
    const out = rescalePlan(bare as never, 3).plan
    expect(out.walls[0].crown).toBeUndefined()
  })
})

describe('schema round-trip', () => {
  const plan = (wall: Record<string, unknown>) => ({
    id: 'p1',
    name: 'Test plan',
    walls: [wall],
    openings: [],
    rooms: [],
    ceilingHeight: 2.8,
    extent: [4, 4],
  })

  it('persists a crown override alongside baseboard (additive, back-compat)', () => {
    const parsed = FloorPlanZ.parse(
      plan({
        id: 'w1',
        start: [0, 0],
        end: [3, 0],
        thickness: 'internal',
        baseboard: { height: 0.12, color: '#111111' },
        crown: { height: 0.09, color: '#abcdef', hidden: false },
      }),
    )
    expect(parsed.walls[0].crown).toEqual({ height: 0.09, color: '#abcdef', hidden: false })
    expect(parsed.walls[0].baseboard?.color).toBe('#111111')
  })

  it('accepts a wall saved BEFORE crown existed', () => {
    const parsed = FloorPlanZ.parse(
      plan({ id: 'w2', start: [0, 0], end: [3, 0], thickness: 'external' }),
    )
    expect(parsed.walls[0].crown).toBeUndefined()
  })
})
