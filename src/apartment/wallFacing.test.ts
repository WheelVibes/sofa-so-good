import { Vector2 } from 'three'
import { describe, expect, it } from 'vitest'
import { WALL_FACE_THRESHOLD, wallFacesAway } from './wallFacing'

// The pure camera-facing reveal decision used by RoomShell + PlanRoomShell.
// `wallFacesAway` is assigned straight to `mesh.visible`, mirroring the old
// inline `m.visible = camDir.dot(normal) <= 0.05` (camDir = cam - mid projected
// to the ground plane). It returns TRUE (wall stays visible) until the camera
// sits firmly on the wall's OUTWARD side, where it returns FALSE (wall hides).
describe('wallFacesAway', () => {
  const mid = { x: 5, z: 5 }
  // A wall whose outward normal points +X (room centre is to the -X side).
  const normal = { x: 1, y: 0 }

  it('hides the wall (false) when the camera is on the outward side', () => {
    // Camera well to the +X side of the wall mid → dot large positive → hide.
    expect(wallFacesAway(10, 5, mid.x, mid.z, normal)).toBe(false)
  })

  it('keeps the wall visible (true) when the camera is on the interior side', () => {
    // Camera to the -X side → dot negative, below threshold → stay visible.
    expect(wallFacesAway(0, 5, mid.x, mid.z, normal)).toBe(true)
  })

  it('ignores the perpendicular (Z) component for an +X-facing wall', () => {
    // Pure +Z offset has zero dot with the +X normal → 0 <= 0.05 → visible.
    expect(wallFacesAway(5, 50, mid.x, mid.z, normal)).toBe(true)
  })

  describe('threshold boundary (default 0.05)', () => {
    // dot == camX - mid.x against the unit +X normal. Use mid at the origin so
    // camX *is* the dot value with no large-magnitude rounding.
    const m = { x: 0, z: 0 }

    it('dot exactly at the threshold stays visible (<= is inclusive)', () => {
      expect(wallFacesAway(WALL_FACE_THRESHOLD, 0, m.x, m.z, normal)).toBe(true)
    })

    it('dot just above the threshold hides the wall', () => {
      expect(wallFacesAway(WALL_FACE_THRESHOLD + 1e-6, 0, m.x, m.z, normal)).toBe(false)
    })

    it('dot just below the threshold stays visible', () => {
      expect(wallFacesAway(WALL_FACE_THRESHOLD - 1e-6, 0, m.x, m.z, normal)).toBe(true)
    })

    it('accepts a custom threshold', () => {
      // With threshold 0, a dot of 0.02 now faces toward; with 0.05 it faces away.
      expect(wallFacesAway(0.02, 0, m.x, m.z, normal, 0)).toBe(false)
      expect(wallFacesAway(0.02, 0, m.x, m.z, normal, 0.05)).toBe(true)
    })
  })

  it('byte-matches the original Vector2 dot test across a probe sweep', () => {
    // Diagonal/normalised normal (PlanRoomShell uses a general perpendicular).
    const n = new Vector2(-1, 2).normalize()
    for (let camX = -3; camX <= 13; camX += 0.7) {
      for (let camZ = -3; camZ <= 13; camZ += 0.7) {
        const camDir = new Vector2(camX - mid.x, camZ - mid.z)
        const old = camDir.dot(n) <= 0.05
        expect(wallFacesAway(camX, camZ, mid.x, mid.z, n)).toBe(old)
      }
    }
  })
})
