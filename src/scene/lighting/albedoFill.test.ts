/**
 * The albedo census and its scalar fill scale. Tested on OUTPUT properties and on the shipped
 * catalogue's real swatches, because the whole point is that a dark repaint has to move the fill.
 */
import { describe, expect, it } from 'vitest'
import type { PlanRoom } from '../../floorplan/types'
import { albedoFillScale, REFERENCE_RHO, roomAlbedoLuminance, swatchLuminance } from './albedoFill'

const room = (patch: Partial<PlanRoom> = {}): PlanRoom =>
  ({ id: 'r', name: 'r', origin: [0, 0], width: 4, depth: 5, ...patch }) as PlanRoom

describe('swatchLuminance', () => {
  it('linearises sRGB rather than averaging the bytes', () => {
    // The error this prevents: mid-grey is 0.216 in linear light, not 0.5. Averaging sRGB bytes
    // would systematically over-credit dark finishes and under-predict how much they darken a room.
    expect(swatchLuminance('#808080')).toBeCloseTo(0.2159, 3)
    expect(swatchLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(swatchLuminance('#000000')).toBeCloseTo(0, 5)
  })

  it('survives a malformed swatch instead of returning NaN', () => {
    // A NaN would propagate into a light intensity and blank the scene.
    expect(swatchLuminance('nope')).toBe(0.5)
  })
})

describe('roomAlbedoLuminance', () => {
  it('reads the CATALOGUE, so a textured floor counts as its real albedo', () => {
    // `v0.31.5.273`: the living/dining floor is `#ffffff` with `map: true`, so a scene-graph
    // census counted mid-brown oak as pure white. Oak's swatch is `#b88f5d`.
    const oak = roomAlbedoLuminance(room({ floor: 'floor-wood-oak' }))
    const white = roomAlbedoLuminance(room({ floor: 'floor-tile-white' }))
    expect(oak).toBeLessThan(white)
  })

  it('drops when the walls are repainted dark, and walls dominate', () => {
    const base = roomAlbedoLuminance(room())
    const navy = roomAlbedoLuminance(room({ wall: 'wall-paint-navy' }))
    expect(navy).toBeLessThan(base)
    // Walls are the largest surface in a normal room, so a wall repaint must move ρ more than a
    // floor repaint of the same darkness. This is what makes the effect read as "the room".
    const darkFloor = roomAlbedoLuminance(room({ floor: 'floor-wood-walnut' }))
    expect(base - navy).toBeGreaterThan(base - darkFloor)
  })

  it('scales area weights with ceiling height', () => {
    // A tall room is mostly wall, so the wall finish should count for more.
    const tall = roomAlbedoLuminance(room({ wall: 'wall-paint-navy', ceilingHeight: 4.5 }))
    const low = roomAlbedoLuminance(room({ wall: 'wall-paint-navy', ceilingHeight: 2.2 }))
    expect(tall).toBeLessThan(low)
  })

  it('uses an explicit polygon area when present', () => {
    const poly = room({
      polygon: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
    })
    expect(roomAlbedoLuminance(poly)).toBeGreaterThan(0)
  })

  it('returns the reference rather than NaN for a degenerate room', () => {
    expect(roomAlbedoLuminance(room({ width: 0, depth: 0 }))).toBe(REFERENCE_RHO)
  })
})

describe('albedoFillScale', () => {
  it('is 1 only for the ONE room shape REFERENCE_RHO is derived from -- a known blocker', () => {
    // The scope boundary. Every existing fill measurement in this arc was taken in the default
    // shell; a change there would be a silent re-grade, not a new feature.
    expect(albedoFillScale(REFERENCE_RHO)).toBeCloseTo(1, 10)
    expect(albedoFillScale(roomAlbedoLuminance(room()))).toBeCloseTo(1, 10)
    // Asserted as a LIMITATION, not a property: rho moves with the wall/floor area ratio, so a
    // differently shaped room is NOT neutral. When the census is made shape-independent this
    // expectation should start failing and be deleted.
    expect(albedoFillScale(roomAlbedoLuminance(room({ width: 4.6, depth: 6.2 })))).not.toBeCloseTo(
      1,
      2,
    )
  })

  it('SATURATES for every real repaint -- the blocker that stopped this shipping', () => {
    // terracotta, navy and navy+walnut all pin to MIN_SCALE, against .271/.272's measured ~0.65
    // and ~0.40. A model that cannot separate a warm mid-tone from a dark blue is not modelling.
    const scales = [
      { wall: 'wall-paint-terracotta' },
      { wall: 'wall-paint-navy' },
      { wall: 'wall-paint-navy', floor: 'floor-wood-walnut' },
    ].map((p) => albedoFillScale(roomAlbedoLuminance(room(p))))
    expect(new Set(scales.map((s) => s.toFixed(4))).size).toBe(1)
    expect(scales[0]).toBeCloseTo(0.45, 4)
  })

  it('DARKENS the fill for a dark room -- the actual user-visible claim', () => {
    // ".268: paint a feature wall dark and the rest of the room does not notice." This is the
    // assertion that it now does.
    const navy = albedoFillScale(roomAlbedoLuminance(room({ wall: 'wall-paint-navy' })))
    expect(navy).toBeLessThan(0.95)
  })

  it('is monotonic in albedo', () => {
    const rhos = [0.1, 0.2, 0.35, 0.5, 0.65, 0.8]
    const scales = rhos.map((r) => albedoFillScale(r))
    for (let i = 1; i < scales.length; i += 1) {
      expect(scales[i]!).toBeGreaterThanOrEqual(scales[i - 1]!)
    }
  })

  it('clamps, because rho/(1-rho) diverges', () => {
    // A fill that collapses to zero or doubles is a worse error than no colour bleed at all.
    expect(albedoFillScale(0.999)).toBeLessThanOrEqual(1.35)
    expect(albedoFillScale(0.0001)).toBeGreaterThanOrEqual(0.45)
    expect(Number.isFinite(albedoFillScale(1))).toBe(true)
  })
})
