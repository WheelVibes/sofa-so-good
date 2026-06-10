import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import {
  buildRenoTimeline,
  MAX_TOTAL_DAYS,
  MIN_TOTAL_DAYS,
  RENO_PHASES,
  type RenoTimelineInput,
} from './renoTimeline'

describe('buildRenoTimeline', () => {
  it('produces a non-empty, ordered phase list matching the table', () => {
    const t = buildRenoTimeline({ totalAreaSqm: 90, rooms: 6 })
    expect(t.phases.length).toBeGreaterThan(0)
    // With hacking + carpentry on (defaults) every spec phase is present, in order.
    expect(t.phases.map((p) => p.id)).toEqual(RENO_PHASES.map((s) => s.id))
  })

  it('keeps phases contiguous (each startDay == previous endDay, starting at 0)', () => {
    const t = buildRenoTimeline({ totalAreaSqm: 110, rooms: 7 })
    expect(t.phases[0].startDay).toBe(0)
    for (let i = 1; i < t.phases.length; i++) {
      expect(t.phases[i].startDay).toBe(t.phases[i - 1].endDay)
    }
    for (const p of t.phases) {
      expect(p.endDay).toBe(p.startDay + p.days)
      expect(p.days).toBeGreaterThanOrEqual(1)
    }
  })

  it('totalDays equals the last phase endDay and totalWeeks is consistent', () => {
    const t = buildRenoTimeline({ totalAreaSqm: 95, rooms: 6 })
    expect(t.totalDays).toBe(t.phases[t.phases.length - 1].endDay)
    expect(t.totalWeeks).toBeCloseTo(Math.round((t.totalDays / 6) * 10) / 10, 5)
  })

  it('is monotonic in area: a larger flat takes at least as long', () => {
    const small = buildRenoTimeline({ totalAreaSqm: 60, rooms: 4 })
    const big = buildRenoTimeline({ totalAreaSqm: 140, rooms: 4 })
    expect(big.totalDays).toBeGreaterThan(small.totalDays)
  })

  it('handles zero / empty input without throwing and yields totalDays > 0', () => {
    for (const input of [{}, { totalAreaSqm: 0, rooms: 0 }] as RenoTimelineInput[]) {
      const t = buildRenoTimeline(input)
      expect(t.totalDays).toBeGreaterThan(0)
      expect(t.phases.length).toBeGreaterThan(0)
    }
  })

  it('tolerates negative / NaN input gracefully', () => {
    const t = buildRenoTimeline({ totalAreaSqm: Number.NaN, rooms: -5 })
    expect(t.totalDays).toBeGreaterThan(0)
    expect(t.phases[0].startDay).toBe(0)
  })

  it('clamps the total within the sane band', () => {
    const huge = buildRenoTimeline({ totalAreaSqm: 100000, rooms: 200 })
    expect(huge.totalDays).toBeLessThanOrEqual(MAX_TOTAL_DAYS)
    const tiny = buildRenoTimeline({
      totalAreaSqm: 1,
      rooms: 1,
      hasHacking: false,
      hasCarpentry: false,
    })
    expect(tiny.totalDays).toBeGreaterThanOrEqual(MIN_TOTAL_DAYS)
  })

  it('drops the hacking and carpentry phases when not in scope', () => {
    const refresh = buildRenoTimeline({
      totalAreaSqm: 90,
      rooms: 6,
      hasHacking: false,
      hasCarpentry: false,
    })
    const ids = refresh.phases.map((p) => p.id)
    expect(ids).not.toContain('protection-hacking')
    expect(ids).not.toContain('carpentry')
    // Removing trades should not make the schedule longer than the full one.
    const full = buildRenoTimeline({ totalAreaSqm: 90, rooms: 6 })
    expect(refresh.totalDays).toBeLessThanOrEqual(full.totalDays)
  })

  it('accepts a FloorPlan directly and derives area + room count', () => {
    const plan: FloorPlan = {
      id: 'p1',
      name: 'Test',
      ceilingHeight: 2.6,
      extent: [10, 10],
      walls: [],
      openings: [],
      rooms: [
        { id: 'living', name: 'Living', origin: [0, 0], width: 5, depth: 4 },
        { id: 'bed', name: 'Bedroom', origin: [5, 0], width: 4, depth: 3 },
      ],
    }
    const t = buildRenoTimeline(plan)
    expect(t.phases.length).toBeGreaterThan(0)
    expect(t.totalDays).toBeGreaterThan(0)
  })
})
