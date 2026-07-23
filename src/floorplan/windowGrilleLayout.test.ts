import { BoxGeometry, CylinderGeometry, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { bakeInstanceMatrix } from '../furniture/primitives/InstancedBoxes'
import {
  glassBlockInstances,
  grilleBarInstances,
  horizontalRailCount,
  horizontalRailOffsets,
  invisibleGrilleCableInstances,
  louvreSlatCount,
  louvreSlatInstances,
  louvreSlatOffsets,
  sashFrameInstances,
  sashOpenTilt,
  verticalBarCount,
  verticalBarOffsets,
  windowGlassKindParams,
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

  describe('horizontalRailCount / horizontalRailOffsets', () => {
    it('matches the Math.max(3, Math.round(height/pitch)) formula (rail pitch)', () => {
      for (const height of [0.9, 1.4, 1.85, 2.2]) {
        expect(horizontalRailCount(height, 0.45)).toBe(Math.max(3, Math.round(height / 0.45)))
      }
    })

    it('emits n-1 interior rails for a typical 1.85 m window (3-4 rail spec)', () => {
      const height = 1.85
      const n = horizontalRailCount(height, 0.45)
      const offsets = horizontalRailOffsets(height, 0.45)
      expect(offsets).toHaveLength(n - 1)
      expect(offsets.length).toBeGreaterThanOrEqual(2)
      // Symmetric about 0, like verticalBarOffsets.
      const mirrored = offsets.map((y) => -y).reverse()
      offsets.forEach((y, i) => {
        expect(mirrored[i]).toBeCloseTo(y, 12)
      })
      offsets.forEach((y) => {
        expect(y).toBeGreaterThan(-height / 2)
        expect(y).toBeLessThan(height / 2)
      })
    })

    it('floors the rail count at `min` for a short window (never fewer than 2 interior rails)', () => {
      expect(horizontalRailCount(0.3, 0.45)).toBe(3)
      expect(horizontalRailOffsets(0.3, 0.45)).toHaveLength(2)
    })
  })

  describe('instanced-member equivalence (AE=0 vs. old per-mesh geometry)', () => {
    it('grille bars: verticals unchanged, PLUS horizontal rails (approved SNV grid design)', () => {
      const width = 1.3
      const height = 1.85
      const bars = grilleBarInstances(width, height)
      const vOffsets = verticalBarOffsets(width, 0.16)
      const hOffsets = horizontalRailOffsets(height, 0.45)
      expect(bars).toHaveLength(vOffsets.length + hOffsets.length)

      const verticals = bars.filter((b) => b.size[1] === height * 0.98)
      const horizontals = bars.filter((b) => b.size[2] === width * 0.98)
      expect(verticals).toHaveLength(vOffsets.length)
      expect(horizontals).toHaveLength(hOffsets.length)

      // Verticals: byte-identical to the pre-existing per-bar mesh
      //   <mesh position={[0,0,z]}><boxGeometry args={[0.018, h*0.98, 0.012]} />
      for (const b of verticals) {
        const old = new BoxGeometry(b.size[0], b.size[1], b.size[2])
        old.translate(b.position[0], b.position[1], b.position[2])
        expect(maxVertexError(old, new BoxGeometry(1, 1, 1), b)).toBeLessThan(1e-6)
      }
      // Horizontal rails: a box spanning the width at each interior height offset.
      for (const b of horizontals) {
        expect(b.size).toEqual([0.018, 0.012, width * 0.98])
        expect(b.position[0]).toBe(0)
        expect(b.position[2]).toBe(0)
        expect(hOffsets).toContainEqual(b.position[1])
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

  describe('sashFrameInstances (sash-type window styles)', () => {
    it('returns [] for non-sash styles (plain/grille/louvre/invisible-grille/undefined)', () => {
      for (const style of ['plain', 'grille', 'louvre', 'invisible-grille', undefined]) {
        expect(sashFrameInstances(1.2, 1.4, style)).toEqual([])
      }
    })

    it('emits exactly 4 perimeter members for awning/hopper (single sash)', () => {
      for (const style of ['awning', 'hopper']) {
        expect(sashFrameInstances(1.2, 1.4, style)).toHaveLength(4)
      }
    })

    it('casement adds a 5th central stile only when width > 0.8', () => {
      expect(sashFrameInstances(0.7, 1.4, 'casement')).toHaveLength(4)
      expect(sashFrameInstances(0.8, 1.4, 'casement')).toHaveLength(4)
      const wide = sashFrameInstances(1.0, 1.4, 'casement')
      expect(wide).toHaveLength(5)
      const stile = wide[4]
      expect(stile.position).toEqual([0, 0, 0])
    })

    it('sliding adds a double-depth centre stile (two overlapping sashes)', () => {
      const members = sashFrameInstances(1.2, 1.0, 'sliding')
      expect(members).toHaveLength(5)
      const stile = members[4]
      expect(stile.position[0]).toBe(0)
      expect(stile.size[2]).toBeGreaterThan(members[0].size[2])
    })

    it('transom adds a 5th horizontal rail near the top', () => {
      const height = 1.5
      const members = sashFrameInstances(1.2, height, 'transom')
      expect(members).toHaveLength(5)
      const rail = members[4]
      expect(rail.position[1]).toBeCloseTo(height / 2 - height * 0.28, 12)
    })

    it('perimeter members stay inside the opening bounds', () => {
      const width = 1.3
      const height = 1.6
      for (const m of sashFrameInstances(width, height, 'awning')) {
        expect(Math.abs(m.position[0]) + m.size[0] / 2).toBeLessThanOrEqual(width / 2 + 1e-9)
        expect(Math.abs(m.position[1]) + m.size[1] / 2).toBeLessThanOrEqual(height / 2 + 1e-9)
      }
    })
  })

  describe('sashOpenTilt', () => {
    it('awning: top-hinged, positive angle (swings outward)', () => {
      const tilt = sashOpenTilt('awning')
      expect(tilt).not.toBeNull()
      expect(tilt?.pivotY).toBe(1)
      expect(tilt?.angleRad).toBeGreaterThan(0)
    })

    it('hopper: bottom-hinged, positive angle', () => {
      const tilt = sashOpenTilt('hopper')
      expect(tilt).not.toBeNull()
      expect(tilt?.pivotY).toBe(-1)
      expect(tilt?.angleRad).toBeGreaterThan(0)
    })

    it('returns null for every other style, including casement/transom', () => {
      for (const style of ['plain', 'grille', 'louvre', 'casement', 'transom', undefined]) {
        expect(sashOpenTilt(style)).toBeNull()
      }
    })
  })

  describe('glassBlockInstances', () => {
    it('cols/rows are round(size/pitch) floored at 1', () => {
      const width = 1.0 // round(1.0/0.2) = 5
      const height = 0.5 // round(0.5/0.2) = 3 (round(2.5)=3 in JS banker-less rounding... verify below)
      const blocks = glassBlockInstances(width, height)
      const cols = Math.max(1, Math.round(width / 0.2))
      const rows = Math.max(1, Math.round(height / 0.2))
      expect(blocks).toHaveLength(cols * rows)
    })

    it('floors at 1×1 for a tiny opening', () => {
      expect(glassBlockInstances(0.05, 0.05)).toHaveLength(1)
    })

    it('blocks are inset by the joint gap and cover the opening without overlap', () => {
      const width = 0.8
      const height = 0.6
      const blocks = glassBlockInstances(width, height)
      const cols = Math.max(1, Math.round(width / 0.2))
      const rows = Math.max(1, Math.round(height / 0.2))
      const cellW = width / cols
      const cellH = height / rows
      for (const b of blocks) {
        expect(b.size[0]).toBeCloseTo(cellW - 0.012, 12)
        expect(b.size[1]).toBeCloseTo(cellH - 0.012, 12)
        expect(b.size[2]).toBe(0.08)
        // Every block sits within the opening bounds.
        expect(Math.abs(b.position[0]) + b.size[0] / 2).toBeLessThanOrEqual(width / 2 + 1e-9)
        expect(Math.abs(b.position[1]) + b.size[1] / 2).toBeLessThanOrEqual(height / 2 + 1e-9)
      }
    })
  })

  describe('windowGlassKindParams', () => {
    it('defaults to the clear look for undefined/unknown kinds', () => {
      const clear = { color: '#bcd4e6', roughness: 0.1, opacityCheap: 0.32, transmission: 0.9 }
      expect(windowGlassKindParams(undefined)).toEqual(clear)
      expect(windowGlassKindParams('clear')).toEqual(clear)
      expect(windowGlassKindParams('bogus')).toEqual(clear)
    })

    it('frosted/textured/glass-block each have their own distinct params', () => {
      const frosted = windowGlassKindParams('frosted')
      const textured = windowGlassKindParams('textured')
      const glassBlock = windowGlassKindParams('glass-block')
      const clear = windowGlassKindParams('clear')
      const all = [frosted, textured, glassBlock, clear]
      // No two kinds share the exact same param set.
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          expect(all[i]).not.toEqual(all[j])
        }
      }
      expect(frosted.transmission).toBeLessThan(clear.transmission)
      expect(frosted.roughness).toBeGreaterThan(clear.roughness)
    })
  })
})
