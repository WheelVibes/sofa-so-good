import { describe, expect, it } from 'vitest'
import {
  battenCount,
  battenOffset,
  battenStep,
  dryingRackCylinders,
  pitchedCount,
  pitchedOffsets,
  VENETIAN_SLAT_TILT,
  venetianSlatCount,
  venetianSlatInstances,
} from './slatLayout'

describe('slatLayout', () => {
  describe('battenCount', () => {
    it('matches the inline Math.max(1, Math.round(...)) formula', () => {
      // RoomDivider slat default: innerW = 1.6 - 0.1 = 1.5, battenW 0.035, gap 0.075.
      const span = 1.5
      const battenW = 0.035
      const gap = 0.075
      const expected = Math.max(1, Math.round((span - battenW) / (battenW + gap)))
      expect(battenCount(span, battenW, gap)).toBe(expected)
    })

    it('never drops below 1 for a tiny span', () => {
      expect(battenCount(0.04, 0.035, 0.075)).toBe(1)
      expect(battenCount(0, 0.035, 0.075)).toBe(1)
    })
  })

  describe('battenStep + battenOffset', () => {
    it('reproduces the -span/2 + battenW/2 + i*step centres exactly', () => {
      const span = 1.5
      const battenW = 0.035
      const n = battenCount(span, battenW, 0.075)
      const step = battenStep(span, battenW, n)
      for (let i = 0; i < n; i++) {
        const inline = -span / 2 + battenW / 2 + i * step
        expect(battenOffset(span, battenW, step, i)).toBeCloseTo(inline, 12)
      }
    })

    it('first and last battens sit battenW/2 inside the span ends', () => {
      const span = 1.5
      const battenW = 0.035
      const n = battenCount(span, battenW, 0.075)
      const step = battenStep(span, battenW, n)
      expect(battenOffset(span, battenW, step, 0)).toBeCloseTo(-span / 2 + battenW / 2, 12)
      expect(battenOffset(span, battenW, step, n - 1)).toBeCloseTo(span / 2 - battenW / 2, 12)
    })

    it('step is 0 for a single batten (and 0 count)', () => {
      expect(battenStep(0.04, 0.035, 1)).toBe(0)
      expect(battenStep(1.0, 0.035, 0)).toBe(0)
      // A single batten is centred.
      expect(battenOffset(0.04, 0.035, 0, 0)).toBeCloseTo(-0.04 / 2 + 0.035 / 2, 12)
    })
  })

  describe('pitchedCount + pitchedOffsets', () => {
    it('matches the feature-wall Math.max(min, Math.round(width/pitch)) formula', () => {
      // FeatureWall slat: pitch 0.09, min 6.
      expect(pitchedCount(1.8, 0.09, 6)).toBe(Math.max(6, Math.round(1.8 / 0.09)))
      // Narrow panel floors at the minimum.
      expect(pitchedCount(0.3, 0.09, 6)).toBe(6)
      // Wide panel scales up.
      expect(pitchedCount(3.0, 0.09, 6)).toBe(Math.round(3.0 / 0.09))
    })

    it('reproduces the -width/2 + step/2 + i*step batten centres exactly', () => {
      const width = 1.8
      const n = pitchedCount(width, 0.09, 6)
      const step = width / n
      const offsets = pitchedOffsets(width, n)
      expect(offsets).toHaveLength(n)
      offsets.forEach((x, i) => {
        expect(x).toBeCloseTo(-width / 2 + step / 2 + i * step, 12)
      })
    })

    it('battens are symmetric about the panel centre', () => {
      const width = 1.8
      const n = pitchedCount(width, 0.09, 6)
      const offsets = pitchedOffsets(width, n)
      for (let i = 0; i < n; i++) {
        expect(offsets[i]).toBeCloseTo(-offsets[n - 1 - i], 12)
      }
    })
  })

  describe('venetianSlatCount', () => {
    it('matches the inline Math.max(4, Math.round(maxDrop/0.08)) formula', () => {
      for (const maxDrop of [0.3, 0.8, 1.7, 2.3, 3.0]) {
        expect(venetianSlatCount(maxDrop)).toBe(Math.max(4, Math.round(maxDrop / 0.08)))
      }
    })

    it('floors at 4 slats for a tiny / degenerate drop', () => {
      expect(venetianSlatCount(0.05)).toBe(4)
      expect(venetianSlatCount(0)).toBe(4)
      expect(venetianSlatCount(-1)).toBe(4)
    })
  })

  describe('venetianSlatInstances', () => {
    it('reproduces the per-mesh slat transforms exactly (width, drop, tilt)', () => {
      const width = 1.3
      const maxDrop = 1.7
      const insts = venetianSlatInstances(width, maxDrop)
      const n = venetianSlatCount(maxDrop)
      expect(insts).toHaveLength(n)
      insts.forEach((inst, i) => {
        // Old mesh: position [0, -(maxDrop/n)*(i+0.5), 0.045], rotation [0.5,0,0],
        // boxGeometry [width, 0.006, 0.06].
        expect(inst.position[0]).toBe(0)
        expect(inst.position[1]).toBeCloseTo(-(maxDrop / n) * (i + 0.5), 12)
        expect(inst.position[2]).toBeCloseTo(0.045, 12)
        expect(inst.rotation).toEqual([VENETIAN_SLAT_TILT, 0, 0])
        expect(inst.size).toEqual([width, 0.006, 0.06])
      })
    })

    it('spans (0, -maxDrop): first slat near the top, last near the bottom', () => {
      const maxDrop = 2.3
      const insts = venetianSlatInstances(1.0, maxDrop)
      const n = insts.length
      const pitch = maxDrop / n
      expect(insts[0].position[1]).toBeCloseTo(-pitch * 0.5, 12)
      expect(insts[n - 1].position[1]).toBeCloseTo(-pitch * (n - 0.5), 12)
      // Even pitch between consecutive slats.
      for (let i = 1; i < n; i++) {
        expect(insts[i].position[1] - insts[i - 1].position[1]).toBeCloseTo(-pitch, 12)
      }
    })

    it('honours a custom tilt across extremes (flat-open 0 → closed ~PI/2)', () => {
      for (const tilt of [0, 0.5, Math.PI / 2, -0.4]) {
        const insts = venetianSlatInstances(1.2, 1.5, tilt)
        expect(insts.every((s) => s.rotation?.[0] === tilt)).toBe(true)
      }
    })

    it('stays valid at a degenerate size (floored count, zero width)', () => {
      const insts = venetianSlatInstances(0, 0)
      expect(insts).toHaveLength(4)
      // maxDrop 0 → pitch 0 → all slats stack at y=0 (no NaN).
      expect(insts.every((s) => Number.isFinite(s.position[1]))).toBe(true)
      expect(insts.every((s) => s.size[0] === 0)).toBe(true)
    })
  })

  describe('dryingRackCylinders', () => {
    it('emits 2 frames × (2 legs + 1 rail) + (2 top rails + 3 cross bars) = 11 rods', () => {
      expect(dryingRackCylinders(0.9)).toHaveLength(11)
    })

    it('legs splayed ±0.32 rad; foot + top rails horizontal about Z; cross bars span about X', () => {
      const rods = dryingRackCylinders(0.9)
      const legs = rods.filter((r) => Math.abs(r.rotation?.[2] ?? 0) === 0.32)
      const zRails = rods.filter((r) => r.rotation?.[2] === Math.PI / 2)
      const crossBars = rods.filter((r) => r.rotation?.[0] === Math.PI / 2)
      expect(legs).toHaveLength(4) // 2 per frame
      expect(zRails).toHaveLength(4) // 2 foot rails + 2 top rails (run along X)
      expect(crossBars).toHaveLength(3) // drying bars run along Z, frame-to-frame
      // Mirrored leg pairs: both signs of splay present.
      expect(legs.some((l) => l.rotation?.[2] === 0.32)).toBe(true)
      expect(legs.some((l) => l.rotation?.[2] === -0.32)).toBe(true)
    })

    it('top rails run along X at each frame (z = ±spread/2); cross bars span Z at z = 0', () => {
      const width = 1.2
      const rods = dryingRackCylinders(width)
      // Top rails: horizontal about Z, at the top, one per frame end.
      const topRails = rods.filter(
        (r) => r.rotation?.[2] === Math.PI / 2 && r.position[1] > 0.5 && r.size[0] === 0.008,
      )
      expect(topRails).toHaveLength(2)
      topRails.forEach((r) => {
        expect(r.position[1]).toBeCloseTo(0.91, 12)
        expect(r.size[1]).toBeCloseTo(width * 0.78, 12)
        expect(Math.abs(r.position[2])).toBeCloseTo(0.25, 12) // ±spread/2
      })
      // Cross drying bars: run along Z (rotated about X), centred at z = 0, each
      // as long as the frame separation so the ends meet both top rails.
      const crossBars = rods.filter((r) => r.rotation?.[0] === Math.PI / 2)
      expect(crossBars).toHaveLength(3)
      crossBars.forEach((bar) => {
        expect(bar.position[1]).toBeCloseTo(0.91, 12)
        expect(bar.position[2]).toBeCloseTo(0, 12)
        expect(bar.size[1]).toBeCloseTo(0.5, 12) // RACK_SPREAD
      })
    })

    it('scales rod length with width (foot rails 80%, top rails 78%; cross bars fixed span)', () => {
      const rods = dryingRackCylinders(2.0)
      const rail = rods.find((r) => r.size[0] === 0.012)
      const topRail = rods.find(
        (r) => r.rotation?.[2] === Math.PI / 2 && r.position[1] > 0.5 && r.size[0] === 0.008,
      )
      const crossBar = rods.find((r) => r.rotation?.[0] === Math.PI / 2)
      expect(rail?.size[1]).toBeCloseTo(2.0 * 0.8, 12)
      expect(topRail?.size[1]).toBeCloseTo(2.0 * 0.78, 12)
      expect(crossBar?.size[1]).toBeCloseTo(0.5, 12)
    })

    it('stays finite for a degenerate zero width', () => {
      const rods = dryingRackCylinders(0)
      expect(rods).toHaveLength(11)
      expect(rods.every((r) => r.position.every(Number.isFinite))).toBe(true)
      expect(rods.every((r) => r.size.every(Number.isFinite))).toBe(true)
    })
  })
})
