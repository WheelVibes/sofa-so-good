/**
 * The albedo census and its scalar fill scale. Tested on OUTPUT properties and on the shipped
 * catalogue's real swatches, because the whole point is that a dark repaint has to move the fill.
 */

import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import type { PlanRoom } from '../../floorplan/types'
import {
  albedoFillScale,
  REFERENCE_RHO,
  roomAlbedoLuminance,
  sceneRoomAlbedo,
  swatchLuminance,
} from './albedoFill'

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

describe('sceneRoomAlbedo (v0.31.7.120)', () => {
  const box = (
    w: number,
    h: number,
    d: number,
    hex: string,
    textured: boolean,
    at: [number, number, number],
  ) => {
    const m = new Mesh(new BoxGeometry(w, h, d), new MeshStandardMaterial({ color: hex }))
    if (textured) {
      // The `.273` shape: albedo lives in a texture, `color` is left white.
      ;(m.material as MeshStandardMaterial).color.set('#ffffff')
      ;(m.material as MeshStandardMaterial).userData.albedoSwatch = hex
      ;(m.material as MeshStandardMaterial).userData.albedoSwatchIsEffective = true
    }
    m.position.set(...at)
    return m
  }
  const ROOM = { id: 'r', name: 'r', origin: [0, 0], width: 6, depth: 6 } as PlanRoom

  it('IGNORES a swatch not marked effective -- a recoloured finish reflects far more than it', () => {
    // `v0.31.7.136`: `wall-paint-terracotta`'s swatch is luminance 0.294 while the rendered wall
    // reads ~0.62, because FINISH-RECOLOR is luminance-preserving. Trusting the swatch put a
    // room's rho 28 % low, so an unqualified swatch is worse than `material.color`.
    const root = new Object3D()
    const m = new Mesh(new BoxGeometry(4, 0.1, 4), new MeshStandardMaterial({ color: '#ffffff' }))
    ;(m.material as MeshStandardMaterial).userData.albedoSwatch = '#111111'
    // No `albedoSwatchIsEffective`, so the dark swatch must NOT be used.
    m.position.set(3, 0, 3)
    root.add(m)
    expect(sceneRoomAlbedo(root, ROOM)!).toBeGreaterThan(0.8)
  })

  it('prefers userData.albedoSwatch over material.color, so a TEXTURED floor counts correctly', () => {
    // The whole point of `.273`: reading `material.color` here would return ~1.0 (white) for a
    // mid-brown oak floor. This is the assertion that the swatch wins.
    const root = new Object3D()
    root.add(box(4, 0.1, 4, '#b88f5d', true, [3, 0, 3]))
    const rho = sceneRoomAlbedo(root, ROOM)
    expect(rho).not.toBeNull()
    expect(rho!).toBeCloseTo(swatchLuminance('#b88f5d'), 3)
    expect(rho!).toBeLessThan(0.6) // NOT white
  })

  it('falls back to material.color when no swatch was stamped', () => {
    const root = new Object3D()
    root.add(box(4, 0.1, 4, '#808080', false, [3, 0, 3]))
    // `material.color` is already linear in three, so compare against the linear grey.
    expect(sceneRoomAlbedo(root, ROOM)!).toBeGreaterThan(0)
  })

  it('EXCLUDES meshes outside the room -- bounce is local', () => {
    // `.271` measured a whole-flat census predicting 2.6 % darkening against a measured 16-20 %.
    const root = new Object3D()
    root.add(box(4, 0.1, 4, '#111111', true, [3, 0, 3])) // inside, near-black
    root.add(box(4, 0.1, 4, '#ffffff', true, [3, 0, 30])) // far away, white
    const rho = sceneRoomAlbedo(root, ROOM)!
    expect(rho).toBeLessThan(0.1)
  })

  it('area-weights, so a large pale surface outweighs a small dark one', () => {
    const root = new Object3D()
    root.add(box(5, 0.1, 5, '#ffffff', true, [3, 0, 3]))
    root.add(box(0.3, 0.3, 0.3, '#000000', true, [3, 1, 3]))
    expect(sceneRoomAlbedo(root, ROOM)!).toBeGreaterThan(0.85)
  })

  it('returns NULL for an empty census rather than pretending the room is neutral', () => {
    // A broken traversal and a white room must not look the same to the caller.
    expect(sceneRoomAlbedo(new Object3D(), ROOM)).toBeNull()
  })

  it('counts a SCALED instance at its rendered size', () => {
    const root = new Object3D()
    const small = box(1, 0.1, 1, '#000000', true, [3, 0, 3])
    const big = box(1, 0.1, 1, '#ffffff', true, [3, 1, 3])
    big.scale.set(4, 1, 4)
    root.add(small, big)
    // The white plane is 16x the area once scaled, so it must dominate.
    expect(sceneRoomAlbedo(root, ROOM)!).toBeGreaterThan(0.7)
  })
})
