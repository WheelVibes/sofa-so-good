import { describe, expect, it } from 'vitest'
import type { PlanOpening } from '../floorplan/types'
import {
  BELOW_SILL_DROP_M,
  buildCurtainSchedule,
  CURTAIN_SCOPE_NOTE,
  curtainSpecForOpening,
  FLOOR_HEM_CLEARANCE_M,
  FULLNESS,
  TRACK_ABOVE_HEAD_M,
} from './curtainSchedule'

/** A typical SG bedroom window: 1.5 m wide, sill 0.9, head 2.1. */
const win = (over: Partial<PlanOpening> = {}): PlanOpening =>
  ({
    id: 'w1',
    wallId: 'n',
    kind: 'window',
    offset: 1,
    width: 1.5,
    sill: 0.9,
    head: 2.1,
    ...over,
  }) as PlanOpening

describe('curtainSpecForOpening — drops', () => {
  const row = () => curtainSpecForOpening(win(), 'Bedroom', 2.6)!

  it('assumes the track sits above the head, capped at the ceiling', () => {
    // 2.1 head + 0.1 = 2.2, below the 2.6 ceiling.
    expect(row().trackHeightM).toBeCloseTo(2.1 + TRACK_ABOVE_HEAD_M, 6)
    // A head close to the ceiling cannot push the track through it.
    const tall = curtainSpecForOpening(win({ head: 2.55 }), 'Bedroom', 2.6)!
    expect(tall.trackHeightM).toBeCloseTo(2.6, 6)
  })

  it('measures the sill drop from the track to just above the sill', () => {
    // 2.2 track − 0.9 sill − 0.01 clearance = 1.29.
    expect(row().drops.find((d) => d.style === 'sill')!.dropM).toBeCloseTo(1.29, 6)
  })

  it('drops below-sill a further 150 mm, per the published band', () => {
    const sillDrop = row().drops.find((d) => d.style === 'sill')!.dropM
    const below = row().drops.find((d) => d.style === 'below-sill')!.dropM
    // The below-sill figure has no hem clearance, so the delta is the 150 mm
    // plus the 10 mm the sill style clears by.
    expect(below - sillDrop).toBeCloseTo(BELOW_SILL_DROP_M + 0.01, 6)
  })

  it('measures the floor drop to the FLOOR, not to the sill', () => {
    // 2.2 track − 0.015 hem clearance = 2.185. The commonest mistake is to
    // measure a floor-length curtain from the sill.
    expect(row().drops.find((d) => d.style === 'floor')!.dropM).toBeCloseTo(
      2.1 + TRACK_ABOVE_HEAD_M - FLOOR_HEM_CLEARANCE_M,
      6,
    )
  })

  it('keeps the hem clear of the floor rather than resting on it', () => {
    const floor = row().drops.find((d) => d.style === 'floor')!.dropM
    expect(floor).toBeLessThan(row().trackHeightM)
  })
})

describe('curtainSpecForOpening — fabric width', () => {
  it('applies both published fullness ratios to the opening width', () => {
    const r = curtainSpecForOpening(win(), 'Bedroom', 2.6)!
    expect(r.fabricWidthM.standard).toBeCloseTo(1.5 * FULLNESS.standard, 6)
    expect(r.fabricWidthM.full).toBeCloseTo(1.5 * FULLNESS.full, 6)
  })

  it('derives from the OPENING width, and says so — no invented track extension', () => {
    // A track normally runs wider than its opening, but no source consulted
    // gives that side extension in mm, so it is not estimated. The one nearby
    // published figure (150 mm single-track) is a recess DEPTH — a different
    // dimension, and substituting it would be a fabricated number.
    const r = curtainSpecForOpening(win(), 'Bedroom', 2.6)!
    expect(r.openingWidthM).toBeCloseTo(1.5, 6)
    expect(CURTAIN_SCOPE_NOTE).toMatch(/MINIMUM/)
    expect(CURTAIN_SCOPE_NOTE).toMatch(/installer/)
  })
})

describe('curtainSpecForOpening — honesty guards', () => {
  it('ignores a DOOR', () => {
    expect(curtainSpecForOpening(win({ kind: 'door' }), 'R', 2.6)).toBeNull()
  })

  it('ignores a degenerate width', () => {
    expect(curtainSpecForOpening(win({ width: 0 }), 'R', 2.6)).toBeNull()
  })

  it('ignores an opening whose head is at or below its sill', () => {
    expect(curtainSpecForOpening(win({ head: 0.9 }), 'R', 2.6)).toBeNull()
  })

  it('drops a style whose computed drop is not positive rather than printing it', () => {
    // A ceiling BELOW the sill is degenerate; nothing should be quoted.
    expect(curtainSpecForOpening(win(), 'R', 0.5)).toBeNull()
  })

  it('states the track-height assumption every time', () => {
    const s = buildCurtainSchedule([{ opening: win(), roomName: 'R', ceilingHeightM: 2.6 }])
    expect(s.note).toMatch(/confirm the actual track height/i)
    expect(s.note).toMatch(/hems, headings and pattern repeat/i)
  })
})

describe('buildCurtainSchedule', () => {
  it('keeps the input order and skips what cannot be specified', () => {
    const s = buildCurtainSchedule([
      { opening: win({ id: 'a' }), roomName: 'Bedroom', ceilingHeightM: 2.6 },
      { opening: win({ id: 'skip', kind: 'door' }), roomName: 'Hall', ceilingHeightM: 2.6 },
      { opening: win({ id: 'b' }), roomName: 'Living', ceilingHeightM: 3 },
    ])
    expect(s.rows.map((r) => r.openingId)).toEqual(['a', 'b'])
  })

  it("uses each room's OWN ceiling height for the floor drop", () => {
    const s = buildCurtainSchedule([
      { opening: win({ id: 'a' }), roomName: 'Bedroom', ceilingHeightM: 2.6 },
      { opening: win({ id: 'b' }), roomName: 'Loft', ceilingHeightM: 2.2 },
    ])
    // The loft's 2.2 m ceiling caps its track below the 2.2 the head+0.1 wants.
    expect(s.rows[1]!.trackHeightM).toBeLessThanOrEqual(2.2)
    expect(s.rows[0]!.trackHeightM).toBeGreaterThan(s.rows[1]!.trackHeightM - 1e-9)
  })

  it('returns nothing for an empty input rather than a placeholder row', () => {
    expect(buildCurtainSchedule([]).rows).toEqual([])
  })
})
