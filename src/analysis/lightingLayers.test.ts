import { describe, expect, it } from 'vitest'
import type { PlanRoom, RoomCategory } from '../floorplan/types'
import {
  buildLightingLayersReport,
  IALD_STARTING_MIX,
  type LayerFixtureInput,
} from './lightingLayers'

const room = (id: string, name: string, category: RoomCategory): PlanRoom =>
  ({ id, name, origin: [0, 0], width: 4, depth: 4, category }) as unknown as PlanRoom

const fx = (
  roomId: string,
  layer: LayerFixtureInput['layer'],
  lumens = 1000,
): LayerFixtureInput => ({
  roomId,
  layer,
  lumens,
})

const living = room('liv', 'Living', 'living')

describe('buildLightingLayersReport — missing layers', () => {
  it('flags the two missing layers for a room lit only by a ceiling fixture', () => {
    // The case average illuminance cannot see: this room can hit its
    // recommended lux and still be unlayered.
    const r = buildLightingLayersReport([living], [fx('liv', 'ambient')]).rooms[0]!
    expect(r.present).toEqual(['ambient'])
    expect(r.missing).toEqual(['task', 'accent'])
  })

  it('reports nothing missing once all three are present', () => {
    const r = buildLightingLayersReport(
      [living],
      [fx('liv', 'ambient'), fx('liv', 'task'), fx('liv', 'accent')],
    ).rooms[0]!
    expect(r.missing).toEqual([])
    expect(r.present).toEqual(['ambient', 'task', 'accent'])
  })

  it('includes an UNLIT room with all three missing, rather than dropping it', () => {
    // Dropping it would make the report quietest exactly where it should be
    // loudest.
    const r = buildLightingLayersReport([living], []).rooms[0]!
    expect(r.missing).toEqual(['ambient', 'task', 'accent'])
    expect(r.lumens).toBe(0)
  })
})

describe('buildLightingLayersReport — layer share', () => {
  it('weights by lumens, so a token uplighter is not an equal third', () => {
    const r = buildLightingLayersReport(
      [living],
      [fx('liv', 'ambient', 1350), fx('liv', 'task', 600), fx('liv', 'accent', 50)],
    ).rooms[0]!
    // The API rounds each share to 2 dp, so assert the ROUNDED value: 0.675
    // becomes 0.68, which sits exactly on `toBeCloseTo(…, 2)`'s tolerance and
    // made the first version of this test fail on a boundary rather than on a
    // defect.
    expect(r.share.ambient).toBe(0.68)
    expect(r.share.accent).toBe(0.03)
    // Not 1/3 each.
    expect(r.share.accent).toBeLessThan(0.1)
  })

  it('sums the shares to 1 for a lit room', () => {
    const r = buildLightingLayersReport(
      [living],
      [fx('liv', 'ambient', 1000), fx('liv', 'task', 500)],
    ).rooms[0]!
    expect(r.share.ambient + r.share.task + r.share.accent).toBeCloseTo(1, 2)
  })

  it('leaves every share at 0 for an unlit room rather than dividing by zero', () => {
    const r = buildLightingLayersReport([living], []).rooms[0]!
    expect(r.share).toEqual({ ambient: 0, task: 0, accent: 0 })
  })

  it('does NOT score the mix against the IALD starting ratio', () => {
    // The sources call 50/30/20 a starting point adjusted per room, so scoring
    // against it would be confident noise about the designer's own judgement.
    // A missing layer is a fact; a 55/25/20 split is a preference.
    const lopsided = buildLightingLayersReport(
      [living],
      [fx('liv', 'ambient', 5000), fx('liv', 'task', 100), fx('liv', 'accent', 100)],
    ).rooms[0]!
    expect(lopsided.missing).toEqual([])
    expect(IALD_STARTING_MIX.ambient).toBe(0.5)
  })
})

describe('buildLightingLayersReport — scope', () => {
  it('checks living, dining, bedroom and study', () => {
    const rooms = [
      room('a', 'Living', 'living'),
      room('b', 'Dining', 'dining'),
      room('c', 'Bedroom', 'bedroom'),
      room('d', 'Master', 'masterBedroom'),
      room('e', 'Study', 'study'),
    ]
    expect(buildLightingLayersReport(rooms, []).checked).toBe(5)
  })

  it('skips rooms that do not want an accent layer', () => {
    // Demanding accent lighting in a corridor or a yard is the kind of check
    // that gets switched off, taking the useful findings with it.
    const rooms = [
      room('a', 'Corridor', 'foyer'),
      room('b', 'Bath', 'bath'),
      room('c', 'Kitchen', 'kitchen'),
      room('d', 'Yard', 'serviceYard'),
      room('e', 'Store', 'storeroom'),
    ]
    expect(buildLightingLayersReport(rooms, []).rooms).toEqual([])
  })

  it('infers the use from the NAME when no category is set', () => {
    const named = { ...room('x', 'Living / Dining', undefined as never) }
    expect(buildLightingLayersReport([named], []).checked).toBe(1)
  })

  it('counts what was CHECKED and carries the context caveat', () => {
    const rep = buildLightingLayersReport([living], [])
    expect(rep.checked).toBe(1)
    expect(rep.note).toMatch(/context, not a target/i)
    expect(rep.note).toMatch(/only a MISSING layer is flagged/i)
    // And says plainly that lux is a different question.
    expect(rep.note).toMatch(/still be unlayered/i)
  })
})
