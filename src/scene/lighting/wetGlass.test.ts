import { describe, expect, it } from 'vitest'
import type { WeatherCondition } from '../../state/slices/timeSlice'
import { beadField, runnelDroplets, runnelField } from './dropletField'
import { type WetGlassOptions, wetGlassAnimates, wetGlassGrade, wetGlassLevel } from './wetGlass'
import { paintDropletNormals } from './wetGlassNormals'

const CONDITIONS: WeatherCondition[] = ['clear', 'partlyCloudy', 'overcast', 'rain']

const opts = (o: Partial<WetGlassOptions> = {}): WetGlassOptions => ({
  condition: 'rain',
  tier: 'realistic',
  enabled: true,
  reduceMotion: false,
  ...o,
})

describe('wetGlassLevel', () => {
  it('is `none` for every condition that is not rain, on every tier', () => {
    for (const condition of CONDITIONS) {
      if (condition === 'rain') continue
      for (const tier of ['performance', 'realistic'] as const) {
        expect(wetGlassLevel(opts({ condition, tier }))).toBe('none')
      }
    }
  })

  it('gives the phone tier a film and the realistic tier droplets', () => {
    expect(wetGlassLevel(opts({ tier: 'performance' }))).toBe('film')
    expect(wetGlassLevel(opts({ tier: 'realistic' }))).toBe('droplets')
  })

  it('is `none` with the flag off, even under rain on the top tier', () => {
    expect(wetGlassLevel(opts({ enabled: false }))).toBe('none')
  })

  it('does NOT ramp with daylight — wetness comes from rain, not from the sun', () => {
    // Rule 8 of `src/scene/CLAUDE.md` scales each term by the source it came from. Every term in
    // `weather.ts` is a DAYLIGHT term and fades to identity at night; this one is not, and the
    // API carries no daylight argument at all so it cannot be wired up by accident.
    expect(wetGlassLevel).toHaveLength(1)
    const keys = Object.keys(opts())
    expect(keys).not.toContain('daylight')
  })
})

describe('wetGlassGrade', () => {
  it('returns the EXACT dry identity when dry — literal zeros, not a computation', () => {
    const g = wetGlassGrade('none', opts({ condition: 'clear' }))
    expect(g).toEqual({
      roughness: 0,
      opacityAdd: 0,
      normalScale: 0,
      trailSpeed: 0,
      maps: false,
    })
  })

  it('binds no maps on the phone tier, and reaches for opacity instead', () => {
    const g = wetGlassGrade('film', opts({ tier: 'performance' }))
    expect(g.maps).toBe(false)
    expect(g.normalScale).toBe(0)
    expect(g.trailSpeed).toBe(0)
    expect(g.opacityAdd).toBeGreaterThan(0)
    expect(g.roughness).toBeGreaterThan(0)
  })

  it('binds maps on the realistic tier, and leaves opacity to the wall-fade compose', () => {
    const g = wetGlassGrade('droplets', opts())
    expect(g.maps).toBe(true)
    expect(g.normalScale).toBeGreaterThan(0)
    expect(g.opacityAdd).toBe(0)
  })

  it('keeps the pane legible — the film is far short of the published hero-material recipe', () => {
    // cprimozic.net's rainy-window material runs roughness 0.64, but its subject IS the glass. On
    // the transmission tier roughness is real blur of the VIEW, which is a showroom's subject.
    const g = wetGlassGrade('droplets', opts())
    expect(g.roughness).toBeLessThan(0.25)
    expect(g.normalScale).toBeLessThan(0.5)
  })

  it('freezes the trails under reduce-motion, and stays WET while frozen', () => {
    const g = wetGlassGrade('droplets', opts({ reduceMotion: true }))
    expect(g.trailSpeed).toBe(0)
    expect(wetGlassAnimates(g)).toBe(false)
    // The request was to remove motion, not to make it stop raining.
    expect(g.maps).toBe(true)
    expect(g.normalScale).toBeGreaterThan(0)
    expect(g.roughness).toBeGreaterThan(0)
  })

  it('freezes the trails on a weak device too', () => {
    const g = wetGlassGrade('droplets', opts({ weakDevice: true }))
    expect(g.trailSpeed).toBe(0)
    expect(wetGlassAnimates(g)).toBe(false)
    expect(g.maps).toBe(true)
  })

  it('animates only when maps are bound AND the trails are running', () => {
    expect(wetGlassAnimates(wetGlassGrade('droplets', opts()))).toBe(true)
    expect(wetGlassAnimates(wetGlassGrade('film', opts({ tier: 'performance' })))).toBe(false)
    expect(wetGlassAnimates(wetGlassGrade('none', opts({ condition: 'clear' })))).toBe(false)
  })

  it('creeps rather than races — an order of magnitude under a game slide speed', () => {
    // Cyanilux's rain breakdown puts game-facing slide speeds at 0.7-1.7 tile-heights/s.
    expect(wetGlassGrade('droplets', opts()).trailSpeed).toBeLessThan(0.07)
    expect(wetGlassGrade('droplets', opts()).trailSpeed).toBeGreaterThan(0)
  })
})

describe('dropletField', () => {
  it('is deterministic — the same build always paints the same rain', () => {
    expect(beadField().map((d) => [d.cx, d.cy, d.r])).toEqual(
      beadField().map((d) => [d.cx, d.cy, d.r]),
    )
  })

  it('emits wrap duplicates so the tile has no visible seam', () => {
    const drops = beadField(200)
    // Every drop crossing an edge must have a partner one tile over on that axis.
    const crossing = drops.filter((d) => d.cx - d.r < 0 && d.cx >= 0)
    expect(crossing.length).toBeGreaterThan(0)
    for (const d of crossing) {
      expect(drops.some((o) => Math.abs(o.cx - (d.cx + 1)) < 1e-9 && o.cy === d.cy)).toBe(true)
    }
  })

  it('keeps the drops small and mostly sub-millimetre-ish, with a thin coalesced tail', () => {
    const r = beadField().map((d) => d.r)
    expect(Math.max(...r)).toBeLessThanOrEqual(0.031)
    // `u^3` biasing: the median must sit near the bottom of the range, not in the middle.
    const sorted = [...r].sort((a, b) => a - b)
    expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThan(0.011)
  })

  it('is RESTRAINED: a handful of runnels per tile, not a windscreen', () => {
    expect(runnelField().length).toBe(4)
  })

  it('leaves each runnel a real wake, above its head', () => {
    for (const t of runnelField()) {
      expect(t.tail.length).toBeGreaterThan(2)
      // Each wake bead is smaller than the head that shed it.
      expect(Math.max(...t.tail.map((d) => d.r))).toBeLessThan(t.head.r)
    }
    expect(runnelDroplets(runnelField()).length).toBeGreaterThan(runnelField().length)
  })
})

describe('paintDropletNormals', () => {
  const W = 64

  it('leaves untouched texels FLAT — (128, 128, 255), the tangent-space identity', () => {
    const data = new Uint8ClampedArray(W * W * 4)
    paintDropletNormals(data, W, W, [{ cx: 0.5, cy: 0.5, r: 0.1, bulge: 0.7 }])
    // A corner is far outside a drop at the centre.
    expect([data[0], data[1], data[2], data[3]]).toEqual([128, 128, 255, 255])
  })

  it('encodes a unit normal everywhere inside a drop', () => {
    const data = new Uint8ClampedArray(W * W * 4)
    paintDropletNormals(data, W, W, [{ cx: 0.5, cy: 0.5, r: 0.3, bulge: 0.7 }])
    for (let p = 0; p < W * W; p++) {
      const n = [0, 1, 2].map((c) => (data[p * 4 + c] - 127.5) / 127.5)
      expect(Math.hypot(n[0], n[1], n[2])).toBeGreaterThan(0.98)
      expect(Math.hypot(n[0], n[1], n[2])).toBeLessThan(1.02)
      // Tangent-space normals always point out of the surface.
      expect(n[2]).toBeGreaterThan(0)
    }
  })

  it('gets the GREEN sign right: below a drop centre the normal points DOWN', () => {
    // Row index grows downward in the buffer; `flipY` maps row 0 to v = 1, so a texel below the
    // centre must carry a negative +Y component, i.e. green under 128. Wrong here, every runnel
    // would light from the wrong side and nothing about a symmetric bead would give it away.
    const data = new Uint8ClampedArray(W * W * 4)
    paintDropletNormals(data, W, W, [{ cx: 0.5, cy: 0.5, r: 0.3, bulge: 0.7 }])
    const below = (Math.round(W * 0.7) * W + Math.round(W * 0.5)) * 4
    const above = (Math.round(W * 0.3) * W + Math.round(W * 0.5)) * 4
    expect(data[below + 1]).toBeLessThan(128)
    expect(data[above + 1]).toBeGreaterThan(128)
  })

  it('resolves an overlap by SLOPE, so a wrap duplicate cannot cut a flat rectangle', () => {
    const data = new Uint8ClampedArray(W * W * 4)
    // A big shallow drop painted first, a small steep one on top of it.
    paintDropletNormals(data, W, W, [
      { cx: 0.5, cy: 0.5, r: 0.45, bulge: 0.2 },
      { cx: 0.5, cy: 0.5, r: 0.1, bulge: 0.9 },
    ])
    // ...and the same pair in the opposite order must give the same bytes.
    const other = new Uint8ClampedArray(W * W * 4)
    paintDropletNormals(other, W, W, [
      { cx: 0.5, cy: 0.5, r: 0.1, bulge: 0.9 },
      { cx: 0.5, cy: 0.5, r: 0.45, bulge: 0.2 },
    ])
    expect(Array.from(data)).toEqual(Array.from(other))
  })
})
