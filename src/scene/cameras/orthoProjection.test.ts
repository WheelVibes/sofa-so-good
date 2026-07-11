import { describe, expect, it } from 'vitest'
import {
  ORTHO_MAX_ZOOM,
  ORTHO_MIN_ZOOM,
  orthoZoomForPerspective,
  perspectiveDistanceForOrthoZoom,
} from './orthoProjection'

const fov45 = (45 * Math.PI) / 180

describe('orthoZoomForPerspective', () => {
  it('matches the closed-form zoom = H / (2·d·tan(fov/2))', () => {
    const d = 12
    const h = 800
    const expected = h / (2 * d * Math.tan(fov45 / 2))
    expect(orthoZoomForPerspective(d, fov45, h)).toBeCloseTo(expected, 6)
  })

  it('a closer pivot (smaller distance) yields a larger zoom', () => {
    const near = orthoZoomForPerspective(5, fov45, 800)
    const far = orthoZoomForPerspective(20, fov45, 800)
    expect(near).toBeGreaterThan(far)
  })

  it('clamps to a sane range for degenerate inputs', () => {
    // Effectively-zero distance would blow up → clamp to MAX.
    expect(orthoZoomForPerspective(0, fov45, 800)).toBe(ORTHO_MAX_ZOOM)
    // Enormous distance would collapse → clamp to MIN.
    expect(orthoZoomForPerspective(1e9, fov45, 800)).toBe(ORTHO_MIN_ZOOM)
  })

  it('is safe when the viewport height is 0 (SSR / not-yet-measured)', () => {
    expect(Number.isFinite(orthoZoomForPerspective(12, fov45, 0))).toBe(true)
  })
})

describe('perspectiveDistanceForOrthoZoom', () => {
  it('is the exact inverse of orthoZoomForPerspective (round-trips)', () => {
    for (const d of [4, 8, 15, 30, 55]) {
      const z = orthoZoomForPerspective(d, fov45, 900)
      expect(perspectiveDistanceForOrthoZoom(z, fov45, 900)).toBeCloseTo(d, 4)
    }
  })

  it('a larger zoom maps to a shorter (closer) perspective distance', () => {
    const closer = perspectiveDistanceForOrthoZoom(80, fov45, 900)
    const farther = perspectiveDistanceForOrthoZoom(20, fov45, 900)
    expect(closer).toBeLessThan(farther)
  })
})
