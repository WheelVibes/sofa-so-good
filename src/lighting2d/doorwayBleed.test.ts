import { describe, expect, it } from 'vitest'
import type { PlanOpening, PlanRoom, PlanWall } from '../floorplan/types'
import {
  APERTURE_FACTOR_CAP,
  apertureFactor,
  BLEED_TRANSMISSION,
  bleedMeanLux,
  type DoorOpenMap,
  directionalBleedWeight,
  interRoomDoorwaySources,
  REFERENCE_APERTURE,
} from './doorwayBleed'

describe('apertureFactor', () => {
  it('is 1 for a reference-sized door leaf', () => {
    expect(apertureFactor(REFERENCE_APERTURE)).toBeCloseTo(1, 6)
  })
  it('scales linearly with aperture and clamps at the cap', () => {
    expect(apertureFactor(REFERENCE_APERTURE / 2)).toBeCloseTo(0.5, 6)
    expect(apertureFactor(REFERENCE_APERTURE * 10)).toBe(APERTURE_FACTOR_CAP)
  })
  it('is 0 for a degenerate (non-positive) aperture', () => {
    expect(apertureFactor(0)).toBe(0)
    expect(apertureFactor(-1)).toBe(0)
  })
})

describe('bleedMeanLux', () => {
  it('is a documented fraction of the neighbour ambient through a reference door', () => {
    expect(bleedMeanLux(200, REFERENCE_APERTURE, true)).toBeCloseTo(200 * BLEED_TRANSMISSION, 6)
  })
  it('scales with aperture', () => {
    const full = bleedMeanLux(200, REFERENCE_APERTURE, true)
    const half = bleedMeanLux(200, REFERENCE_APERTURE / 2, true)
    expect(half).toBeCloseTo(full / 2, 6)
  })
  it('is 0 when the door is closed (the default) — no bleed, no regression', () => {
    expect(bleedMeanLux(200, REFERENCE_APERTURE, false)).toBe(0)
  })
  it('is 0 when the neighbour is dark', () => {
    expect(bleedMeanLux(0, REFERENCE_APERTURE, true)).toBe(0)
  })
})

describe('directionalBleedWeight', () => {
  const center: [number, number] = [0, 0]
  const inward: [number, number] = [0, 1] // doorway opens toward +z

  it('is strongest directly in front of the doorway, weaker off to the side', () => {
    const front = directionalBleedWeight(center, inward, 0, 1) // straight ahead
    const side = directionalBleedWeight(center, inward, 1, 0.0001) // ~90° off-axis, same-ish range
    expect(front).toBeGreaterThan(side)
    expect(side).toBeLessThan(front * 0.2)
  })

  it('is 0 behind the doorway plane (facing the other room)', () => {
    expect(directionalBleedWeight(center, inward, 0, -1)).toBe(0)
  })

  it('decays with distance straight ahead (inverse-square-ish)', () => {
    const near = directionalBleedWeight(center, inward, 0, 1)
    const far = directionalBleedWeight(center, inward, 0, 4)
    expect(far).toBeLessThan(near)
    expect(far).toBeGreaterThan(0)
  })

  it('gives full forward weight at the doorway line itself (no divide-by-zero)', () => {
    const w = directionalBleedWeight(center, inward, 0, 0)
    expect(w).toBeCloseTo(1, 6)
    expect(Number.isFinite(w)).toBe(true)
  })
})

// --- interRoomDoorwaySources: two rooms sharing a wall with a door ---------
// Rooms A [0..4]×[0..4] and B [0..4]×[4..8] share the horizontal wall at z=4.
const roomA: PlanRoom = { id: 'A', name: 'Living Room', origin: [0, 0], width: 4, depth: 4 }
const roomB: PlanRoom = { id: 'B', name: 'Kitchen', origin: [0, 4], width: 4, depth: 4 }
const sharedWall: PlanWall = { id: 'w', start: [0, 4], end: [4, 4], thickness: 'internal' }
const doorOnShared: PlanOpening = {
  id: 'd1',
  kind: 'door',
  wallId: 'w',
  offset: 1.5,
  width: 0.9,
  sill: 0,
  head: 2.1,
}

describe('interRoomDoorwaySources', () => {
  it('links both rooms when the shared door is OPEN (bleed flows both ways)', () => {
    const doors: DoorOpenMap = { d1: { open: true } }
    const links = interRoomDoorwaySources([roomA, roomB], [sharedWall], [doorOnShared], doors)
    expect(links).toHaveLength(2)
    const aFromB = links.find((l) => l.receiverId === 'A')
    const bFromA = links.find((l) => l.receiverId === 'B')
    expect(aFromB?.sourceId).toBe('B')
    expect(bFromA?.sourceId).toBe('A')
    // Door centre is at x = offset + width/2 = 1.95, z = 4.
    expect(aFromB?.center[0]).toBeCloseTo(1.95, 6)
    expect(aFromB?.center[1]).toBeCloseTo(4, 6)
    // Room A is on the −z side, so its inward normal points toward −z.
    expect(aFromB?.inwardNormal[1]).toBeLessThan(0)
    expect(bFromA?.inwardNormal[1]).toBeGreaterThan(0)
    expect(aFromB?.aperture).toBeCloseTo(0.9 * 2.1, 6)
  })

  it('produces NO links when the door is closed (default) — adjacency alone is not bleed', () => {
    expect(interRoomDoorwaySources([roomA, roomB], [sharedWall], [doorOnShared], {})).toHaveLength(
      0,
    )
    expect(
      interRoomDoorwaySources([roomA, roomB], [sharedWall], [doorOnShared], {
        d1: { open: false },
      }),
    ).toHaveLength(0)
  })

  it('ignores windows (only doors bleed) and openings on non-shared walls', () => {
    const win: PlanOpening = { ...doorOnShared, id: 'win', kind: 'window', sill: 0.95 }
    const doors: DoorOpenMap = { win: { open: true } }
    expect(interRoomDoorwaySources([roomA, roomB], [sharedWall], [win], doors)).toHaveLength(0)
  })

  it('drops a door that does not bridge two distinct rooms (e.g. external)', () => {
    // A door on the far wall of A only borders room A (nothing on the other side).
    const extWall: PlanWall = { id: 'e', start: [0, 0], end: [4, 0], thickness: 'external' }
    const extDoor: PlanOpening = { ...doorOnShared, id: 'e1', wallId: 'e' }
    const doors: DoorOpenMap = { e1: { open: true } }
    expect(interRoomDoorwaySources([roomA, roomB], [extWall], [extDoor], doors)).toHaveLength(0)
  })

  it('skips a degenerate zero-area doorway', () => {
    const flat: PlanOpening = { ...doorOnShared, head: 0, sill: 0 }
    const doors: DoorOpenMap = { d1: { open: true } }
    expect(interRoomDoorwaySources([roomA, roomB], [sharedWall], [flat], doors)).toHaveLength(0)
  })
})
