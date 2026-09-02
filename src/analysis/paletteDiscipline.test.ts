import { describe, expect, it } from 'vitest'
import type { FinishTotal } from '../floorplan/finishSchedule'
import {
  buildPaletteDiscipline,
  PALETTE_NOISE_THRESHOLD,
  PALETTE_SWEET_SPOT,
} from './paletteDiscipline'

const t = (code: string, name: string, kind: FinishTotal['kind'], area: number): FinishTotal =>
  ({ code, name, kind, area }) as FinishTotal

const floors = (...areas: number[]) =>
  areas.map((a, i) => t(`FL-0${i + 1}`, `Floor ${i + 1}`, 'floor', a))

describe('buildPaletteDiscipline — the rule of three', () => {
  it('is content within the sweet spot', () => {
    const r = buildPaletteDiscipline(floors(40, 20, 10))
    expect(r.floor.count).toBe(3)
    expect(r.floor.overSweetSpot).toBe(false)
    expect(r.hasFinding).toBe(false)
    expect(r.floor.consolidationCandidates).toEqual([])
  })

  it('flags a fourth finish', () => {
    const r = buildPaletteDiscipline(floors(40, 20, 10, 5))
    expect(r.floor.overSweetSpot).toBe(true)
    expect(r.floor.overwhelming).toBe(false)
    expect(r.hasFinding).toBe(true)
  })

  it('escalates at the published noise threshold', () => {
    const r = buildPaletteDiscipline(floors(40, 20, 10, 5, 2))
    expect(r.floor.count).toBe(PALETTE_NOISE_THRESHOLD)
    expect(r.floor.overwhelming).toBe(true)
  })
})

describe('buildPaletteDiscipline — naming what to drop', () => {
  it('nominates the SMALLEST finishes, not the first-listed ones', () => {
    // "You have six finishes" is a complaint; naming the small ones is an
    // action. Input deliberately unsorted.
    const r = buildPaletteDiscipline(floors(2, 40, 5, 20, 10, 1))
    expect(r.floor.finishes.map((f) => f.area)).toEqual([40, 20, 10, 5, 2, 1])
    expect(r.floor.consolidationCandidates.map((f) => f.area)).toEqual([5, 2, 1])
  })

  it('reports how little area the candidates cover', () => {
    // 5 + 2 + 1 of 78 total ≈ 10.3%.
    const r = buildPaletteDiscipline(floors(2, 40, 5, 20, 10, 1))
    expect(r.floor.candidateSharePct).toBeGreaterThan(9)
    expect(r.floor.candidateSharePct).toBeLessThan(12)
  })

  it('shares sum to about 100% for one kind', () => {
    const r = buildPaletteDiscipline(floors(40, 20, 10))
    const sum = r.floor.finishes.reduce((s, f) => s + f.sharePct, 0)
    expect(sum).toBeGreaterThan(99.5)
    expect(sum).toBeLessThan(100.5)
  })
})

describe('buildPaletteDiscipline — kinds', () => {
  it('counts accent walls as part of the WALL palette', () => {
    // An accent wall IS another wall finish to the eye, whatever the schedule
    // codes it as.
    const r = buildPaletteDiscipline([
      t('WL-01', 'Paint', 'wall', 100),
      t('WL-02', 'Tile', 'wall', 20),
      t('AW-01', 'Teal', 'accent', 8),
      t('AW-02', 'Rust', 'accent', 6),
    ])
    expect(r.wall.count).toBe(4)
    expect(r.wall.overSweetSpot).toBe(true)
  })

  it('keeps floor and wall palettes separate', () => {
    const r = buildPaletteDiscipline([...floors(40, 20), t('WL-01', 'Paint', 'wall', 100)])
    expect(r.floor.count).toBe(2)
    expect(r.wall.count).toBe(1)
  })

  it('ignores ceilings — a painted ceiling is not part of the palette question', () => {
    const r = buildPaletteDiscipline([...floors(40), t('CL-01', 'Ceiling paint', 'ceiling', 60)])
    expect(r.floor.count).toBe(1)
    expect(r.wall.count).toBe(0)
  })
})

describe('buildPaletteDiscipline — honesty', () => {
  it('drops zero-area finishes rather than counting them against the limit', () => {
    const r = buildPaletteDiscipline(floors(40, 20, 10, 0))
    expect(r.floor.count).toBe(3)
    expect(r.floor.overSweetSpot).toBe(false)
  })

  it('frames it as an observation with legitimate exceptions', () => {
    // A wet-room change of material or a deliberate contrast is not a defect,
    // and a check that calls it one gets switched off.
    const r = buildPaletteDiscipline(floors(40, 20, 10, 5))
    expect(r.note).toMatch(/observation, not a rule/i)
    expect(r.note).toMatch(/wet-room change of material/i)
    expect(r.note).toContain(String(PALETTE_SWEET_SPOT))
  })

  it('handles an empty schedule without a finding', () => {
    const r = buildPaletteDiscipline([])
    expect(r.hasFinding).toBe(false)
    expect(r.floor.count).toBe(0)
  })

  it('does not throw on a malformed input', () => {
    expect(() => buildPaletteDiscipline(null as never)).not.toThrow()
  })
})
