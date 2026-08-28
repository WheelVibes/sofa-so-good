import { describe, expect, it } from 'vitest'
import type { FurnitureItem } from '../../furniture/types'
import {
  aggregateFixtureLights,
  type FixtureLight,
  fixtureLightsFor,
  MAX_LIVE_FIXTURE_LIGHTS,
  MERGE_RADIUS_M,
} from './fixtureLights'

/**
 * The contract: `lightsMode` on lights EVERY fixture. The set must not depend on
 * the camera in any way — the old nearest-N budget (2 emitters on the default
 * tier) meant walking through the flat switched lamps on and off around you.
 */

const lamp = (
  id: string,
  x: number,
  z: number,
  props: FurnitureItem['props'] = {},
): FurnitureItem => ({
  id,
  defId: 'table-lamp',
  position: [x, z],
  rotation: 0,
  props,
})

const OPTS = { lightMood: 'none' as const, iesEnabled: false }

describe('fixtureLightsFor', () => {
  it('lights every emitter, however far apart they are', () => {
    const items = [lamp('a', 0, 0), lamp('b', 40, 40), lamp('c', -100, 250)]
    expect(fixtureLightsFor(items, OPTS).map((l) => l.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns the same set regardless of where anything sits', () => {
    // Two homes with identical fixtures at wildly different coordinates resolve
    // to the same lights — there is no distance term left to rank on.
    const near = [lamp('a', 0, 0), lamp('b', 1, 1), lamp('c', 2, 2)]
    const far = [lamp('a', 0, 0), lamp('b', 90, 90), lamp('c', 180, 180)]
    expect(fixtureLightsFor(near, OPTS).map((l) => l.id)).toEqual(
      fixtureLightsFor(far, OPTS).map((l) => l.id),
    )
  })

  it('keeps the design order, not any spatial order', () => {
    const items = [lamp('far', 50, 50), lamp('near', 0, 0), lamp('mid', 10, 10)]
    expect(fixtureLightsFor(items, OPTS).map((l) => l.id)).toEqual(['far', 'near', 'mid'])
  })

  it("honours a fixture's OWN switch — that is the only thing that turns one off", () => {
    const items = [lamp('on', 0, 0), lamp('off', 1, 1, { lightOn: 'no' })]
    expect(fixtureLightsFor(items, OPTS).map((l) => l.id)).toEqual(['on'])
  })

  it('lights a non-fixture item the user flagged as a light source', () => {
    const items: FurnitureItem[] = [
      { id: 'x', defId: 'side-table', position: [0, 0], rotation: 0, props: { lightOn: 'yes' } },
      { id: 'y', defId: 'side-table', position: [1, 1], rotation: 0, props: {} },
    ]
    expect(fixtureLightsFor(items, OPTS).map((l) => l.id)).toEqual(['x'])
  })

  it('skips items that emit nothing', () => {
    const items: FurnitureItem[] = [
      lamp('lamp', 0, 0),
      { id: 'sofa', defId: 'sofa-3seat', position: [1, 1], rotation: 0, props: {} },
    ]
    expect(fixtureLightsFor(items, OPTS).map((l) => l.id)).toEqual(['lamp'])
  })

  it('places the bulb at the spec height, rotating any local offset into world space', () => {
    const [l] = fixtureLightsFor([lamp('a', 3, 4)], OPTS)
    expect(l.position[0]).toBeCloseTo(3, 6)
    expect(l.position[2]).toBeCloseTo(4, 6)
    expect(l.position[1]).toBeGreaterThan(0)
  })

  it('takes a per-item bulb colour and intensity override', () => {
    const [l] = fixtureLightsFor(
      [lamp('a', 0, 0, { lightColor: '#00ff00', lightIntensity: 42 })],
      OPTS,
    )
    expect(l.color.toLowerCase()).toBe('#00ff00')
    expect(l.baseIntensity).toBe(42)
  })

  describe('the shader-uniform ceiling', () => {
    it('is far above any real home — the default flat has 19 emitters', () => {
      expect(MAX_LIVE_FIXTURE_LIGHTS).toBeGreaterThanOrEqual(64)
    })

    it('drops the excess in ITEM order, so it can never read as proximity switching', () => {
      const many = Array.from({ length: MAX_LIVE_FIXTURE_LIGHTS + 5 }, (_, i) =>
        // Deliberately placed so that a distance rank would pick a different set:
        // the LAST items are nearest the origin.
        lamp(`l${i}`, 1000 - i, 0),
      )
      const out = fixtureLightsFor(many, OPTS)
      expect(out).toHaveLength(MAX_LIVE_FIXTURE_LIGHTS)
      expect(out[0].id).toBe('l0')
      expect(out[out.length - 1].id).toBe(`l${MAX_LIVE_FIXTURE_LIGHTS - 1}`)
    })
  })
})

describe('aggregateFixtureLights', () => {
  const light = (over: Partial<FixtureLight> & { id: string }): FixtureLight => ({
    defId: 'ceiling-light',
    position: [0, 2.5, 0],
    color: '#ffd9a0',
    baseIntensity: 10,
    distance: 6,
    moodMultiplier: 1,
    ...over,
  })

  it('merges a downlight grid pairwise, halving the light count', () => {
    // Clustering is HEAD-ANCHORED and does not chain: a 0.8 m-spaced row of 4
    // becomes 2 lights, not 1. Chaining would let an arbitrarily long row
    // collapse to a single light at its centre — a real saving bought by
    // moving the light somewhere it isn't.
    const grid = [0, 0.8, 1.6, 2.4].map((x, i) => light({ id: `d${i}`, position: [x, 2.5, 0] }))
    const out = aggregateFixtureLights(grid)
    expect(out).toHaveLength(2)
    expect(out[0].baseIntensity).toBe(20)
    expect(out[0].position[0]).toBeCloseTo(0.4, 6)
    expect(out[1].position[0]).toBeCloseTo(2.0, 6)
    // No emission is lost or invented.
    expect(out.reduce((a, l) => a + l.baseIntensity, 0)).toBe(40)
  })

  it('leaves fixtures further apart than the merge radius alone', () => {
    const spread = [0, 2, 4].map((x, i) => light({ id: `d${i}`, position: [x, 2.5, 0] }))
    expect(aggregateFixtureLights(spread)).toBe(spread)
  })

  it('never merges different kinds of fixture, however close', () => {
    const pair = [
      light({ id: 'sconce', defId: 'wall-sconce', position: [0, 1.45, 0] }),
      light({ id: 'lamp', defId: 'table-lamp', position: [0.1, 1.5, 0] }),
    ]
    expect(aggregateFixtureLights(pair)).toHaveLength(2)
  })

  it('never merges different bulb colours', () => {
    const pair = [
      light({ id: 'a', position: [0, 2.5, 0], color: '#ffd9a0' }),
      light({ id: 'b', position: [0.3, 2.5, 0], color: '#cfe3ff' }),
    ]
    expect(aggregateFixtureLights(pair)).toHaveLength(2)
  })

  it('never merges an IES spot — a photometric cone has no meaningful sum', () => {
    const pair = [
      light({ id: 'a', position: [0, 2.5, 0], spot: { angle: 0.5, penumbra: 0.3 } }),
      light({ id: 'b', position: [0.3, 2.5, 0], spot: { angle: 0.5, penumbra: 0.3 } }),
    ]
    expect(aggregateFixtureLights(pair)).toHaveLength(2)
  })

  it('folds each member mood multiplier into the summed intensity', () => {
    const pair = [
      light({ id: 'a', position: [0, 2.5, 0], baseIntensity: 10, moodMultiplier: 0.5 }),
      light({ id: 'b', position: [0.4, 2.5, 0], baseIntensity: 10, moodMultiplier: 1.5 }),
    ]
    const [merged] = aggregateFixtureLights(pair)
    // The renderer multiplies baseIntensity × level × moodMultiplier, so the
    // aggregate must carry a neutral multiplier and the total emission.
    expect(merged.baseIntensity).toBeCloseTo(20, 6)
    expect(merged.moodMultiplier).toBe(1)
    // …and sit nearer the brighter member.
    expect(merged.position[0]).toBeGreaterThan(0.2)
  })

  it('keeps the reach of the furthest-reaching member', () => {
    const pair = [
      light({ id: 'a', position: [0, 2.5, 0], distance: 4 }),
      light({ id: 'b', position: [0.4, 2.5, 0], distance: 9 }),
    ]
    expect(aggregateFixtureLights(pair)[0].distance).toBe(9)
  })

  it('is camera-independent and stable in item order', () => {
    const a = [0, 0.8].map((x, i) => light({ id: `d${i}`, position: [x, 2.5, 0] }))
    expect(aggregateFixtureLights(a)[0].id).toBe('merged:d0')
    expect(aggregateFixtureLights(a)[0].id).toBe('merged:d0')
  })

  it('changes nothing in the default flat — its fixtures are all distinct or far apart', () => {
    // The saving is for authored designs (a false-ceiling downlight grid), not
    // for the shipped layout; asserted so the claim stays honest.
    const flat = [
      light({ id: 'mb-ceiling', position: [1.7, 2.5, 1.9] }),
      light({ id: 'b2-ceiling', position: [4.7, 2.5, 1.9] }),
      // The tightest pair in the flat: two sconces 1.2 m apart, comfortably
      // outside the 1.0 m radius — they must stay two pools of light.
      light({ id: 'sconce-l', defId: 'wall-sconce', position: [0.9, 1.45, 0.3] }),
      light({ id: 'sconce-r', defId: 'wall-sconce', position: [2.1, 1.45, 0.3] }),
    ]
    expect(MERGE_RADIUS_M).toBeLessThan(1.2)
    expect(aggregateFixtureLights(flat)).toBe(flat)
  })
})
