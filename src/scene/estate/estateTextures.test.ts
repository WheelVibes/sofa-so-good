// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BAY_W, STOREY_H } from './estateLayout'
import {
  FACADE_TILE_H,
  FACADE_TILE_W,
  paintFacadeTile,
  paintGroundTile,
  paintRoadTile,
  paintTreeSprite,
  TILE_BAYS,
  TILE_H_M,
  TILE_STOREYS,
  TILE_W_M,
  WALL_PAINTS,
} from './estateTextures'

// happy-dom has no real 2D context, so these assert the canvas contract (size, no
// throw) — the same posture as `backdropEquirect.test.ts`. Pixel content is judged
// by looking (real-GPU scenario), like every backdrop change in this repo.
describe('estate texture painters', () => {
  it('façade tile is sized to the bay × storey period at the stated texel density', () => {
    expect(TILE_W_M).toBeCloseTo(3.6 * TILE_BAYS)
    expect(TILE_H_M).toBeCloseTo(2.8 * TILE_STOREYS)
    expect(FACADE_TILE_W / FACADE_TILE_H).toBeCloseTo(TILE_W_M / TILE_H_M, 1)
    for (const paint of WALL_PAINTS.keys()) {
      for (const kind of ['windows', 'corridor'] as const) {
        for (const night of [false, true]) {
          const c = paintFacadeTile({ kind, paint, night })
          expect(c.width).toBe(FACADE_TILE_W)
          expect(c.height).toBe(FACADE_TILE_H)
        }
      }
    }
  })
  it('ground, road and tree sprites do not throw and are square', () => {
    for (const c of [paintGroundTile(), paintRoadTile(), paintTreeSprite(0), paintTreeSprite(2)]) {
      expect(c.width).toBe(c.height)
      expect(c.width).toBeGreaterThanOrEqual(256)
    }
  })
})

// ── ESTATE-CORRIDOR-NIGHT: real pixel sampling ──────────────────────────────────
//
// happy-dom's `getContext('2d')` returns null, so the tests above only assert the
// canvas CONTRACT (size, no throw). Judging the corridor night mask's actual pixel
// values needs a real paint surface, so this block installs a minimal but REAL 2D
// context — solid `fillRect` + a vertical `createLinearGradient`/`addColorStop`
// (the only two drawing calls the corridor-night branch makes), alpha-composited
// into a real pixel buffer — scoped to just these tests via `beforeEach`/`afterEach`
// so the tests above keep running against the default happy-dom stub.

interface FakeCtx2D {
  fillStyle: string | { __gradient: true; y0: number; y1: number; stops: Stop[] }
  globalAlpha: number
  createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => GradientHandle
  fillRect: (x: number, y: number, w: number, h: number) => void
  getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray }
}
interface Stop {
  offset: number
  color: [number, number, number, number]
}
interface GradientHandle {
  __gradient: true
  y0: number
  y1: number
  stops: Stop[]
  addColorStop: (offset: number, color: string) => void
}

function parseColor(style: string): [number, number, number, number] {
  if (style.startsWith('#')) {
    let hex = style.slice(1)
    if (hex.length === 3)
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('')
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
      1,
    ]
  }
  const m = style.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const [r, g, b, a = 1] = m[1].split(',').map((s) => Number.parseFloat(s.trim()))
    return [r, g, b, a]
  }
  return [0, 0, 0, 1]
}

function makeFakeCanvasContext(width: number, height: number): FakeCtx2D {
  const data = new Uint8ClampedArray(width * height * 4) // starts fully transparent
  function setPixel(px: number, py: number, r: number, g: number, b: number, a: number) {
    if (px < 0 || py < 0 || px >= width || py >= height) return
    const i = (py * width + px) * 4
    const dr = data[i]
    const dg = data[i + 1]
    const db = data[i + 2]
    const da = data[i + 3] / 255
    const outA = a + da * (1 - a)
    if (outA <= 0) {
      data[i] = 0
      data[i + 1] = 0
      data[i + 2] = 0
      data[i + 3] = 0
      return
    }
    data[i] = (r * a + dr * da * (1 - a)) / outA
    data[i + 1] = (g * a + dg * da * (1 - a)) / outA
    data[i + 2] = (b * a + db * da * (1 - a)) / outA
    data[i + 3] = outA * 255
  }
  const ctx: FakeCtx2D = {
    fillStyle: '#000000',
    globalAlpha: 1,
    createLinearGradient(_x0, y0, _x1, y1) {
      const stops: Stop[] = []
      return {
        __gradient: true,
        y0,
        y1,
        stops,
        addColorStop(offset, color) {
          stops.push({ offset, color: parseColor(color) })
        },
      }
    },
    fillRect(x, y, w, h) {
      const x0 = Math.max(0, Math.floor(x))
      const x1 = Math.min(width, Math.ceil(x + w))
      const y0 = Math.max(0, Math.floor(y))
      const y1 = Math.min(height, Math.ceil(y + h))
      const style = this.fillStyle
      if (typeof style !== 'string' && style.__gradient) {
        const { y0: gy0, y1: gy1, stops } = style
        for (let py = y0; py < y1; py++) {
          let t = gy1 === gy0 ? 0 : (py - gy0) / (gy1 - gy0)
          t = Math.max(0, Math.min(1, t))
          let s0 = stops[0]
          let s1 = stops[stops.length - 1]
          for (let i = 0; i < stops.length - 1; i++) {
            if (t >= stops[i].offset && t <= stops[i + 1].offset) {
              s0 = stops[i]
              s1 = stops[i + 1]
              break
            }
          }
          const span = s1.offset - s0.offset || 1
          const lt = (t - s0.offset) / span
          const r = s0.color[0] + (s1.color[0] - s0.color[0]) * lt
          const g = s0.color[1] + (s1.color[1] - s0.color[1]) * lt
          const b = s0.color[2] + (s1.color[2] - s0.color[2]) * lt
          const a = (s0.color[3] + (s1.color[3] - s0.color[3]) * lt) * this.globalAlpha
          for (let px = x0; px < x1; px++) setPixel(px, py, r, g, b, a)
        }
      } else {
        const [r, g, b, a0] = parseColor(style as string)
        const a = a0 * this.globalAlpha
        for (let py = y0; py < y1; py++)
          for (let px = x0; px < x1; px++) setPixel(px, py, r, g, b, a)
      }
    },
    getImageData(x, y, w, h) {
      const out = new Uint8ClampedArray(w * h * 4)
      for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
          const si = ((y + row) * width + (x + col)) * 4
          const di = (row * w + col) * 4
          out[di] = data[si]
          out[di + 1] = data[si + 1]
          out[di + 2] = data[si + 2]
          out[di + 3] = data[si + 3]
        }
      }
      return { data: out }
    },
  }
  return ctx
}

/** Rec.709 luma (matches the img-diff/saturation probes used elsewhere in this repo). */
function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('ESTATE-CORRIDOR-NIGHT mask (real pixel sampling)', () => {
  const ctxCache = new WeakMap<HTMLCanvasElement, FakeCtx2D>()
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      let ctx = ctxCache.get(this)
      if (!ctx) {
        ctx = makeFakeCanvasContext(this.width, this.height)
        ctxCache.set(this, ctx)
      }
      return ctx as unknown as ReturnType<HTMLCanvasElement['getContext']>
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Geometry shared by the corridor branch (`paintFacadeTile`'s `pxm`/`stoPx`/`bayPx`),
  // derived from the exported constants rather than duplicating the magic number 72 —
  // storey s=1 (middle storey) and bay b=0 keep every sampled point well clear of the
  // canvas edges.
  const pxm = FACADE_TILE_W / TILE_W_M
  const stoPx = STOREY_H * pxm
  const bayPx = BAY_W * pxm
  const s = 1
  const x0 = 0 // bay 0
  const yFloor = FACADE_TILE_H - s * stoPx
  const yCeil = yFloor - stoPx
  const parapetTop = yFloor - 1.1 * pxm
  const slabBottom = yCeil + 0.25 * pxm
  const voidH = parapetTop - slabBottom

  function sample(canvas: HTMLCanvasElement, x: number, y: number) {
    const ctx = canvas.getContext('2d') as unknown as FakeCtx2D
    const { data } = ctx.getImageData(Math.round(x), Math.round(y), 1, 1)
    return { r: data[0], g: data[1], b: data[2], a: data[3] / 255 }
  }

  it('flag ON: tube stays a thin, dim line — the brightest corridor feature, but not saturating', () => {
    const c = paintFacadeTile({ kind: 'corridor', paint: 0, night: true, corridorNightMask: true })
    // Tube: fillRect(x0 + 0.9*pxm, slabBottom + 0.05*pxm, 1.2*pxm, 0.05*pxm) — sample its centre.
    const tubeX = x0 + 0.9 * pxm + 0.6 * pxm
    const tubeY = slabBottom + 0.05 * pxm + 0.025 * pxm
    const px = sample(c, tubeX, tubeY)
    // Opaque fill (alpha 1) at rgb(200,215,230) — dimmer than the legacy
    // rgb(225,240,255) tube (luma ~237.9) so ×2.4 + AgX no longer saturates, but still
    // the brightest thing in the corridor void (opaque, unlike the alpha-blended spill).
    expect(px.a).toBeCloseTo(1, 1)
    expect(px.r).toBeCloseTo(200, 0)
    expect(px.g).toBeCloseTo(215, 0)
    expect(px.b).toBeCloseTo(230, 0)
    const l = luma(px.r, px.g, px.b)
    expect(l).toBeGreaterThan(190)
    expect(l).toBeLessThan(225)
  })

  it('flag ON: the tube is at most 0.06 m tall (does not extend past its opaque rect)', () => {
    const c = paintFacadeTile({ kind: 'corridor', paint: 0, night: true, corridorNightMask: true })
    const tubeX = x0 + 0.9 * pxm + 0.6 * pxm
    // The soft wash starts at the same slabBottom origin as the tube and shares its
    // colour, so it also tints the column below the tube — that overlap is by design
    // (a real fluorescent tube sits at the top of its own spill) and is not what this
    // test checks. What it checks is that the OPAQUE tube rect itself is <= 0.06 m: a
    // point just past that ceiling must read at or below the wash's own peak
    // contribution (~0.18 alpha at the slab, luma < 40), never the near-opaque tube
    // luma (~213).
    const pastCeilingY = slabBottom + 0.05 * pxm + 0.061 * pxm
    const px = sample(c, tubeX, pastCeilingY)
    expect(luma(px.r, px.g, px.b)).toBeLessThan(60)
  })

  it('flag ON: a back-wall pixel at mid-void height is dim', () => {
    const c = paintFacadeTile({ kind: 'corridor', paint: 0, night: true, corridorNightMask: true })
    const midX = x0 + bayPx / 2
    const midY = slabBottom + voidH * 0.5
    const px = sample(c, midX, midY)
    const l = luma(px.r, px.g, px.b)
    expect(l).toBeGreaterThanOrEqual(0)
    expect(l).toBeLessThan(40)
  })

  it('flag ON: a parapet-band pixel (below parapetTop) is black', () => {
    const c = paintFacadeTile({ kind: 'corridor', paint: 0, night: true, corridorNightMask: true })
    const midX = x0 + bayPx / 2
    // Comfortably inside the 1.1 m parapet band, not right at the parapetTop edge.
    const parapetY = parapetTop + 0.3 * pxm
    const px = sample(c, midX, parapetY)
    expect(px.r).toBe(0)
    expect(px.g).toBe(0)
    expect(px.b).toBe(0)
  })

  it('flag ON: the wash is confined to the upper ~60% of the void and fades to 0 before the parapet', () => {
    const c = paintFacadeTile({ kind: 'corridor', paint: 0, night: true, corridorNightMask: true })
    const midX = x0 + bayPx / 2
    // Just below the tube, near the slab: highest wash alpha (~0.18), so still a
    // measurable lift over pure black.
    const nearSlabY = slabBottom + 0.1 * pxm
    const nearSlab = sample(c, midX, nearSlabY)
    expect(luma(nearSlab.r, nearSlab.g, nearSlab.b)).toBeGreaterThan(5)
    // Just above the parapet band (in the void, near its bottom edge): the wash has
    // already reached 0 well before this point (it only covers the upper 60%).
    const nearParapetVoidY = parapetTop - 0.05 * pxm
    const nearParapetVoid = sample(c, midX, nearParapetVoidY)
    expect(luma(nearParapetVoid.r, nearParapetVoid.g, nearParapetVoid.b)).toBeLessThan(2)
  })

  // The legacy spill's own fillRect spans the FULL bay width (x0..x0+bayPx), so — by
  // design, unchanged by this fix — it always overlaps the tube's own rect (which sits
  // well inside that width) and is drawn on top of it. A sampled tube pixel is therefore
  // the tube colour composited with whatever spill alpha reaches that exact y, never the
  // bare constant. This mirrors the legacy gradient exactly (0.55 at slabBottom fading
  // linearly to 0.05 at parapetTop) so the expected composite can be derived rather than
  // guessed, and still fails if either the tube or the spill constants drift.
  function legacySpillAlphaAt(y: number, slabBottomY: number, parapetTopY: number): number {
    const t = Math.max(0, Math.min(1, (y - slabBottomY) / (parapetTopY - slabBottomY)))
    return 0.55 + (0.05 - 0.55) * t
  }

  it('flag OFF: the legacy tube/spill values still hold (regression guard the flag is live)', () => {
    const legacy = paintFacadeTile({
      kind: 'corridor',
      paint: 0,
      night: true,
      corridorNightMask: false,
    })
    const implicit = paintFacadeTile({ kind: 'corridor', paint: 0, night: true }) // option omitted entirely
    for (const c of [legacy, implicit]) {
      // Legacy tube: rgb(225,240,255), 1.2 x 0.08 m, opaque — composited with the
      // spill's own alpha at that y (see `legacySpillAlphaAt` above).
      const tubeX = x0 + 0.9 * pxm + 0.6 * pxm
      const tubeY = slabBottom + 0.05 * pxm + 0.04 * pxm
      const tube = sample(c, tubeX, tubeY)
      const aSpillAtTube = legacySpillAlphaAt(tubeY, slabBottom, parapetTop)
      expect(tube.r).toBeCloseTo(200 * aSpillAtTube + 225 * (1 - aSpillAtTube), 0)
      expect(tube.g).toBeCloseTo(215 * aSpillAtTube + 240 * (1 - aSpillAtTube), 0)
      expect(tube.b).toBeCloseTo(235 * aSpillAtTube + 255 * (1 - aSpillAtTube), 0)
      expect(tube.a).toBeCloseTo(1, 1)
      // Legacy spill at the slab: rgba(200,215,235,0.55), composited over black — sampled
      // OUTSIDE the tube's x-span (x0+0.9..2.1*pxm) so nothing else contaminates it.
      // Composited over an opaque black background, the resulting colour IS
      // `srcColor * srcAlpha` (black contributes nothing), so the source alpha is
      // recovered from the colour, not the (always-1) composited alpha channel.
      const nearSlabY = slabBottom + 1
      const nearSlabX = x0 + 3.0 * pxm
      const nearSlab = sample(c, nearSlabX, nearSlabY)
      const impliedAlpha = nearSlab.r / 200
      expect(impliedAlpha).toBeGreaterThan(0.5)
      expect(impliedAlpha).toBeLessThanOrEqual(0.56)
      // And unlike the new mask, the legacy spill still reaches all the way to the
      // parapet (nonzero, not confined to the upper 60% of the void).
      const nearParapetVoidY = parapetTop - 0.05 * pxm
      const nearParapetVoid = sample(c, nearSlabX, nearParapetVoidY)
      expect(luma(nearParapetVoid.r, nearParapetVoid.g, nearParapetVoid.b)).toBeGreaterThan(2)
    }
  })
})
