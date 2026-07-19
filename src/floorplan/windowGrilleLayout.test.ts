import { BoxGeometry, CylinderGeometry, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { bakeInstanceMatrix } from '../furniture/primitives/InstancedBoxes'
import {
  grilleBarInstances,
  invisibleGrilleCableInstances,
  louvreSlatCount,
  louvreSlatInstances,
  louvreSlatOffsets,
  verticalBarCount,
  verticalBarOffsets,
} from './windowGrilleLayout'

/** Max abs per-component error between the old per-mesh geometry (real-sized,
 *  translated) and a unit primitive transformed by the baked instance matrix. */
function maxVertexError(
  oldGeom: BoxGeometry | CylinderGeometry,
  unit: BoxGeometry | CylinderGeometry,
  inst: {
    position: [number, number, number]
    size: [number, number, number]
  },
): number {
  unit.applyMatrix4(bakeInstanceMatrix(inst, new Object3D()))
  const a = oldGeom.getAttribute('position').array
  const b = unit.getAttribute('position').array
  let err = 0
  for (let i = 0; i < a.length; i++) err = Math.max(err, Math.abs(a[i] - b[i]))
  return err
}

describe('windowGrilleLayout', () => {
  describe('verticalBarCount / verticalBarOffsets', () => {
    it('matches the inline Math.max(2, Math.round(width/pitch)) formula (grille pitch)', () => {
      for (const width of [0.6, 1.0, 1.3, 2.0, 2.8]) {
        expect(verticalBarCount(width, 0.16)).toBe(Math.max(2, Math.round(width / 0.16)))
      }
    })

    it('emits n-1 interior bars for a grille-pitch window, symmetric about 0', () => {
      const width = 1.3
      const n = verticalBarCount(width, 0.16)
      const offsets = verticalBarOffsets(width, 0.16)
      expect(offsets).toHaveLength(n - 1)
      // Symmetric: reversing + negating reproduces the same set.
      const mirrored = offsets.map((z) => -z).reverse()
      offsets.forEach((z, i) => {
        expect(mirrored[i]).toBeCloseTo(z, 12)
      })
      offsets.forEach((z) => {
        expect(z).toBeGreaterThan(-width / 2)
      })
      offsets.forEach((z) => {
        expect(z).toBeLessThan(width / 2)
      })
    })

    it('uses the denser invisible-grille pitch (~10 cm) — more cables than the visible grille', () => {
      const width = 1.3
      const grilleBars = verticalBarOffsets(width, 0.16)
      const cables = verticalBarOffsets(width, 0.1)
      expect(cables.length).toBeGreaterThan(grilleBars.length)
      // Exact count for this width: n = round(1.3/0.1) = 13 → 12 interior cables.
      expect(cables).toHaveLength(12)
    })

    it('floors the bar count at `min` for a narrow window (never fewer than 2 bays)', () => {
      expect(verticalBarCount(0.05, 0.16)).toBe(2)
      expect(verticalBarOffsets(0.05, 0.16)).toHaveLength(1)
    })
  })

  describe('louvreSlatCount / louvreSlatOffsets', () => {
    it('matches the inline Math.max(3, Math.round(height/pitch)) formula', () => {
      for (const height of [0.5, 1.0, 1.5, 2.3]) {
        expect(louvreSlatCount(height, 0.14)).toBe(Math.max(3, Math.round(height / 0.14)))
      }
    })

    it('emits n slats (every band gets one, unlike the vertical bars), centred per band', () => {
      const height = 1.5
      const n = louvreSlatCount(height, 0.14)
      const offsets = louvreSlatOffsets(height, 0.14)
      expect(offsets).toHaveLength(n)
      const pitch = height / n
      expect(offsets[0]).toBeCloseTo(-height / 2 + pitch / 2, 12)
      expect(offsets[n - 1]).toBeCloseTo(height / 2 - pitch / 2, 12)
    })

    it('floors the slat count at 3 for a short window', () => {
      expect(louvreSlatCount(0.1, 0.14)).toBe(3)
      expect(louvreSlatOffsets(0.1, 0.14)).toHaveLength(3)
    })
  })

  describe('instanced-member equivalence (AE=0 vs. old per-mesh geometry)', () => {
    it('grille bars: one bar per interior offset, each a box at that offset', () => {
      const width = 1.3
      const height = 1.5
      const bars = grilleBarInstances(width, height)
      expect(bars).toHaveLength(verticalBarOffsets(width, 0.16).length)
      // Every bar's baked instance matrix reproduces the old per-bar mesh:
      //   <mesh position={[0,0,z]}><boxGeometry args={[0.018, h*0.98, 0.012]} />
      for (const b of bars) {
        const old = new BoxGeometry(b.size[0], b.size[1], b.size[2])
        old.translate(b.position[0], b.position[1], b.position[2])
        expect(maxVertexError(old, new BoxGeometry(1, 1, 1), b)).toBeLessThan(1e-6)
      }
    })

    it('louvre slats: one slat per band, each a box at that band centre', () => {
      const width = 1.4
      const height = 1.8
      const slats = louvreSlatInstances(width, height)
      expect(slats).toHaveLength(louvreSlatOffsets(height, 0.14).length)
      for (const s of slats) {
        expect(s.size).toEqual([0.05, 0.02, width * 0.98])
        const old = new BoxGeometry(s.size[0], s.size[1], s.size[2])
        old.translate(s.position[0], s.position[1], s.position[2])
        expect(maxVertexError(old, new BoxGeometry(1, 1, 1), s)).toBeLessThan(1e-6)
      }
    })

    it('invisible-grille cables: unit cylinder scaled == old cylinderGeometry(r,r,h*0.98,6)', () => {
      const width = 1.5
      const height = 2.0
      const cables = invisibleGrilleCableInstances(width, height)
      expect(cables).toHaveLength(verticalBarOffsets(width, 0.1).length)
      for (const c of cables) {
        const r = c.size[0]
        const len = c.size[1]
        const old = new CylinderGeometry(r, r, len, 6)
        old.translate(c.position[0], c.position[1], c.position[2])
        expect(maxVertexError(old, new CylinderGeometry(1, 1, 1, 6), c)).toBeLessThan(1e-6)
      }
    })
  })
})
