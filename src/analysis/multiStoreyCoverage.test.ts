/**
 * Whole-home coverage for the analysis layer (F13).
 *
 * `plan.rooms`/`plan.walls`/`plan.openings` are GROUND-ONLY. Every module here
 * is a WHOLE-HOME analysis called with the whole plan (never a `levelAsPlan`
 * result), so reading those directly silently omitted every upper storey.
 * `docs/research/multi-level-design.md` predicted this exact class of bug in its
 * Risks section; these tests are the ratchet that keeps it fixed.
 *
 * Each test is verified to FAIL without its fix — a regression test that would
 * have passed before is decoration.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import { buildAccessibilityReport } from './accessibility'
import { buildComplianceReport } from './hdbCompliance'
import { buildRenoTimeline } from './renoTimeline'

/**
 * Ground floor with one room + one narrow door, plus an upper storey with its
 * own room and an even narrower door. Every check below must see BOTH.
 */
function twoStorey(): FloorPlan {
  return {
    id: 'p',
    name: 'Two storey',
    extent: [6, 5],
    ceilingHeight: 2.6,
    walls: [{ id: 'g-w', start: [0, 0], end: [6, 0], thickness: 'external' }],
    openings: [{ id: 'g-door', wallId: 'g-w', kind: 'door', offset: 1, width: 0.9 }],
    rooms: [{ id: 'g-living', name: 'Living', origin: [0, 0], width: 6, depth: 5 }],
    upperLevels: [
      {
        id: 'upper',
        name: 'Upper storey',
        elevation: 3,
        walls: [{ id: 'u-w', start: [0, 0], end: [6, 0], thickness: 'external' }],
        // Deliberately BELOW the 0.85 m accessible-door bar, and narrower than
        // the ground door, so an omission cannot hide behind the ground result.
        openings: [{ id: 'u-door', wallId: 'u-w', kind: 'door', offset: 1, width: 0.6 }],
        // A realistic second storey that CROSSES the scheduler's baselines.
        // `phaseDays` only accrues time above `BASELINE_ROOMS` (6) and a
        // baseline area, so a token upstairs room cannot move `totalDays` —
        // measured 41 days either way with a 1.7 m2 closet. A maisonette that
        // is above baseline as a whole home but below it on the ground floor
        // alone is exactly the case the ground-only read got wrong.
        rooms: [
          { id: 'u-bath', name: 'Bath/WC 2', origin: [0, 0], width: 1.6, depth: 1.6 },
          { id: 'u-bed1', name: 'Bedroom 2', origin: [2, 0], width: 3.4, depth: 3.4 },
          { id: 'u-bed2', name: 'Bedroom 3', origin: [6, 0], width: 3.4, depth: 3.4 },
          { id: 'u-bed3', name: 'Bedroom 4', origin: [2, 4], width: 3.4, depth: 3.4 },
          { id: 'u-bed4', name: 'Bedroom 5', origin: [6, 4], width: 3.4, depth: 3.4 },
          { id: 'u-study', name: 'Study', origin: [10, 0], width: 3, depth: 3 },
          { id: 'u-hall', name: 'Landing', origin: [10, 4], width: 3, depth: 3 },
        ],
      },
    ],
  } as unknown as FloorPlan
}

describe('accessibility covers every storey', () => {
  it('assesses an UPPER-storey door', () => {
    const r = buildAccessibilityReport(twoStorey())
    expect(r.doors.map((d) => d.id).sort()).toEqual(['g-door', 'u-door'])
  })

  it('fails the narrow upstairs door rather than reporting all-clear', () => {
    const r = buildAccessibilityReport(twoStorey())
    const upstairs = r.doors.find((d) => d.id === 'u-door')!
    expect(upstairs.pass).toBe(false)
    // Ground-only would have reported 1/1 doors passing — a clean bill of health
    // for a home with a 600 mm upstairs door.
    expect(r.doorPassCount).toBe(1)
    expect(r.doors).toHaveLength(2)
  })

  it('assesses an UPPER-storey room', () => {
    const r = buildAccessibilityReport(twoStorey())
    expect(r.rooms.map((x) => x.roomId)).toContain('u-bath')
  })
})

describe('HDB compliance covers every storey', () => {
  it('advises on an UPPER-storey external wall', () => {
    const r = buildComplianceReport(twoStorey())
    const ids = r.advisories.map((a) => a.id).join(' ')
    expect(ids).toContain('u-w')
  })

  it('advises on an UPPER-storey wet area', () => {
    const r = buildComplianceReport(twoStorey())
    expect(r.advisories.map((a) => a.id)).toContain('wet-area:u-bath')
  })
})

describe('renovation timeline counts every storey', () => {
  it('schedules LONGER for two storeys than for the ground floor alone', () => {
    // Room count and floor area both scale the programme, and both were
    // ground-only: a maisonette was scheduled as if the upstairs did not exist.
    // Asserting the user-visible output rather than an internal field.
    const two = buildRenoTimeline(twoStorey())
    const groundOnly = buildRenoTimeline({
      ...twoStorey(),
      upperLevels: [],
    } as unknown as FloorPlan)
    expect(two.totalDays).toBeGreaterThan(groundOnly.totalDays)
  })
})
