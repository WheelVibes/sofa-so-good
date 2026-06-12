/**
 * Runtime procedural PBR texture generators. Each pattern paints a single
 * seamlessly-tiling tile (albedo + normal + roughness) on a canvas; the
 * material then repeats it across a surface via UV scale. No network, tiny
 * memory (one tile per material, shared across every mesh that uses it).
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import type { ProceduralPattern } from '../types'
import { clamp01, hashSeed, heightToNormalRGBA, hexToRgb, makeFbm, mix, mulberry32 } from './noise'

// Single source of truth lives in `../types` (the pure-types module). Re-exported
// here so the many `from '.../procedural/generators'` importers keep working —
// previously the union was duplicated in both files and drifted on every change.
export type { ProceduralPattern }

export interface ProceduralResult {
  albedo: Texture
  normal: Texture
  roughness: Texture
  metalness: number
}

let S = 512

/** Base texture edge (px) for full material generation. The Performance tier
 *  (the app default) drops to 256² — quarter the pixels per map, visually
 *  near-identical at typical floor/wall viewing distances — while Medium+
 *  keeps 512². Set by QualityController; applies to NEW generations (existing
 *  textures keep their size until regenerated — cache keys carry the size). */
let BASE_SIZE = 512

export function setProceduralBaseSize(px: 256 | 512): void {
  BASE_SIZE = px
}

export function getProceduralBaseSize(): number {
  return BASE_SIZE
}

/**
 * Per-pattern texture size registry — declares the maximum useful resolution
 * for each procedural pattern. When BASE_SIZE would exceed the cap the
 * generator clamps down, saving GPU memory without visible quality loss.
 *
 * Decision rationale (verified against before/after screenshots at typical
 * room-viewing distances):
 *
 * CAP 256 — smooth / low-frequency patterns where extra pixels add nothing:
 *   carpet    — broad FBM fibre + blotch noise; no fine structure that benefits.
 *   concrete  — mottle freq ~5, pores are tiny pinpoints; 256 vs 512 indistinct.
 *   marble    — veins are wide sinusoidal curves (turbulence-warped); no crisp edge.
 *   terrazzo  — chip radii ≥3 px at 256; background noise is smooth.
 *   batten    — 6 battens with a 3 % bevel ramp (~7.5 px at 256); reads cleanly.
 *   fluted    — 16 ribs, sine profile; one rib = 16 px at 256, fully resolved.
 *   plaster   — already a shared 256 singleton (getPlasterNormal); listed for
 *               completeness — generateProcedural skips plaster.
 *
 * CAP 512 — high-frequency / geometric patterns where 256 visibly degrades:
 *   wood       — grain bands at ~9× period + open pores; 256 noticeably blurs.
 *   tile       — grout line ≈1.8 % of tile width (~4.6 px at 256); blurry grout.
 *   hexagon    — 3.5 px grout threshold; at 256 grout reads too wide/soft.
 *   checker    — 1.5 px grout; sub-pixel at 256 → aliased edge.
 *   parquet    — 4 planks per block, fine wood grain; 256 loses plank detail.
 *   herringbone — 16 plank-widths; grain clarity needs 512 to stay sharp.
 *   subway     — thin grout + bevel band; grout <2 px at 256 loses definition.
 *   brick      — mortar joint ≈S/110 ≈2.3 px at 256; keep 512 for definition.
 *   grasscloth — horizontal weave lines ~220 per tile; 256 aliases badly.
 *   stripe     — 2 px seam; 1 px at 256 looks harsh.
 *
 * OffscreenCanvas worker generation is deferred (still-open PERF9 tail).
 */
export const PATTERN_SIZE_CAP: Record<ProceduralPattern, 256 | 512> = {
  // Smooth noise-based — 256 is the useful cap even on Medium/High/Maximum
  carpet: 256,
  concrete: 256,
  marble: 256,
  terrazzo: 256,
  batten: 256,
  fluted: 256,
  plaster: 256,
  // High-frequency geometric — needs 512 on Medium+ for crisp edges/grain
  wood: 512,
  tile: 512,
  hexagon: 512,
  checker: 512,
  parquet: 512,
  herringbone: 512,
  subway: 512,
  brick: 512,
  grasscloth: 512,
  stripe: 512,
}

/**
 * Effective generation size for a given pattern: the smaller of the global
 * BASE_SIZE and the pattern's useful-resolution cap. Smooth patterns stay at
 * 256 even when the tier is Medium/High/Maximum (saving GPU memory with no
 * visible difference), while high-frequency patterns respect the full BASE_SIZE
 * on those tiers for crisp grain/grout lines.
 */
export function effectivePatternSize(pattern: ProceduralPattern): 256 | 512 {
  const cap = PATTERN_SIZE_CAP[pattern] ?? 512
  // BASE_SIZE is either 256 (Performance) or 512 (Medium+).
  // If the cap is lower than BASE_SIZE, clamp to the cap.
  return BASE_SIZE <= cap ? (BASE_SIZE as 256 | 512) : cap
}

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  return c
}

function toTexture(data: Uint8ClampedArray, srgb: boolean): CanvasTexture {
  const canvas = makeCanvas()
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(S, S)
  img.data.set(data)
  ctx.putImageData(img, 0, 0)
  const tex = new CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = RepeatWrapping
  if (srgb) tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

interface Fields {
  /** RGBA albedo, 0..255. */
  albedo: Uint8ClampedArray
  /** Height field 0..1 for normal-map derivation. */
  height: Float32Array
  /** Per-texel roughness 0..1. */
  rough: Float32Array
  /** Bump strength fed to the normal derivation. */
  normalStrength: number
  metalness: number
}

function blank(): Fields {
  return {
    albedo: new Uint8ClampedArray(S * S * 4),
    height: new Float32Array(S * S),
    rough: new Float32Array(S * S),
    normalStrength: 1,
    metalness: 0,
  }
}

function setPx(f: Fields, i: number, r: number, g: number, b: number, h: number, rough: number) {
  f.albedo[i * 4] = r
  f.albedo[i * 4 + 1] = g
  f.albedo[i * 4 + 2] = b
  f.albedo[i * 4 + 3] = 255
  f.height[i] = h
  f.rough[i] = rough
}

function shade(rgb: [number, number, number], factor: number): [number, number, number] {
  return [rgb[0] * factor, rgb[1] * factor, rgb[2] * factor]
}

// ── Patterns ───────────────────────────────────────────────────────────────

function woodFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 9
  const rand = mulberry32(seed)
  const planks = 6 // boards stacked across the tile
  const plankH = S / planks
  // Per-plank tint with correlated warmth (real boards vary in hue + value).
  const plank = Array.from({ length: planks }, () => {
    const val = 0.86 + rand() * 0.24 // brightness
    const warm = 0.94 + rand() * 0.16 // >1 warmer (more red, less blue)
    const phase = rand() * 10
    // A couple of knots per board at random positions along its length.
    const knots =
      rand() < 0.6 ? [{ u: rand(), v: 0.25 + rand() * 0.5, r: 0.012 + rand() * 0.02 }] : []
    return { val, warm, phase, knots }
  })
  // Cathedral grain: low-freq along the board, tight bands across it.
  const grainAlong = makeFbm(seed + 7, 4, 3)
  const fineGrain = makeFbm(seed + 99, 3, 28)
  for (let y = 0; y < S; y++) {
    const pi = Math.floor(y / plankH)
    const yInPlank = (y % plankH) / plankH // 0..1
    const pk = plank[pi]
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      // Bands run along the board (x); warp them with low-freq noise so the
      // grain meanders like real timber rather than ruled lines.
      const warp = grainAlong(u * 1.2 + pk.phase, v * 1.5) - 0.5
      const band = Math.abs(Math.sin((yInPlank + warp * 0.6) * Math.PI * 9 + pk.phase))
      const fg = fineGrain(u * 4, v)
      // Grain lines darken; fine noise adds tooth.
      let factor = pk.val * (0.92 - band * 0.16 + (fg - 0.5) * 0.06)

      // Knots: dark elliptical cores with a tight ring.
      let knotH = 0
      for (const k of pk.knots) {
        const du = u - k.u
        const dv = (yInPlank - k.v) * 0.6
        const d = Math.hypot(du, dv)
        if (d < k.r * 3) {
          const core = d < k.r ? 1 : 0
          const ring = Math.abs(Math.sin((d / k.r) * 3.5)) * (1 - d / (k.r * 3))
          factor *= 1 - core * 0.55 - ring * 0.25
          knotH = Math.max(knotH, ring * 0.4 + core * 0.5)
        }
      }

      // Plank groove (dark + recessed bevel between boards).
      const edge = Math.min(yInPlank, 1 - yInPlank)
      const groove = edge < 0.035 ? edge / 0.035 : 1
      factor *= 0.45 + 0.55 * groove

      // Apply warmth: scale R up / B down around the value.
      const r = base[0] * factor * pk.warm
      const g = base[1] * factor
      const b = base[2] * factor * (2 - pk.warm)
      const h = clamp01(0.55 * groove + band * 0.3 + knotH)
      // Satin-varnished boards: fairly glossy, grain lines slightly rougher.
      const rough = clamp01(0.42 + band * 0.16 + (1 - groove) * 0.2)
      setPx(f, y * S + x, r, g, b, h, rough)
    }
  }
  return f
}

function tileFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 22
  const tilesPerRow = 2
  const cell = S / tilesPerRow
  const groutW = S * 0.018
  const rand = mulberry32(seed)
  const cellTint: number[] = []
  for (let i = 0; i < tilesPerRow * tilesPerRow; i++) cellTint.push(0.94 + rand() * 0.12)
  const speck = makeFbm(seed + 3, 3, 50)
  const grout: [number, number, number] = [base[0] * 0.62, base[1] * 0.62, base[2] * 0.6]
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cx = Math.floor(x / cell)
      const cy = Math.floor(y / cell)
      const inX = x - cx * cell
      const inY = y - cy * cell
      const distEdge = Math.min(inX, cell - inX, inY, cell - inY)
      const i = y * S + x
      if (distEdge < groutW) {
        // Recessed grout line.
        const t = distEdge / groutW
        setPx(f, i, grout[0], grout[1], grout[2], 0.05 + t * 0.1, 0.9)
      } else {
        const tint = cellTint[cy * tilesPerRow + cx]
        const sp = (speck(x / S, y / S) - 0.5) * 0.06
        const factor = clamp01(tint + sp)
        const [r, g, b] = shade(base, factor)
        // Glossy ceramic: low roughness, slight variance.
        setPx(f, i, r, g, b, 0.85, 0.18 + Math.abs(sp) * 1.5)
      }
    }
  }
  return f
}

/**
 * Honeycomb hexagon tile (a kitchen/bath staple). Voronoi cells over an offset
 * triangular lattice give hexagons; grout lines fall where the nearest two cell
 * centres are roughly equidistant. Seamless: the lattice is periodic over the
 * tile (cols/rows divide it, rows even so the half-row offset wraps) and centre
 * distances are measured toroidally, so cells crossing the edge match up.
 */
function hexagonFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 20
  const cols = 5
  const rows = 6 // even → the alternate-row x-offset wraps cleanly
  const dx = S / cols
  const dy = S / rows
  const rand = mulberry32(seed)
  const tint: number[] = []
  for (let i = 0; i < cols * rows; i++) tint.push(0.92 + rand() * 0.14)
  const speck = makeFbm(seed + 3, 3, 50)
  const grout: [number, number, number] = [base[0] * 0.6, base[1] * 0.6, base[2] * 0.58]
  const groutW = 3.5 // px threshold on the gap between the two nearest centres
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let best = Infinity
      let second = Infinity
      let bestCol = 0
      let bestRow = 0
      const cyApprox = Math.round(y / dy)
      for (let rr = -1; rr <= 1; rr++) {
        const rowRaw = cyApprox + rr
        const row = ((rowRaw % rows) + rows) % rows
        const offX = row % 2 ? 0.5 : 0
        const colApprox = Math.round(x / dx - offX)
        for (let cc = -1; cc <= 1; cc++) {
          const colRaw = colApprox + cc
          const centerX = (colRaw + offX) * dx
          const centerY = rowRaw * dy
          let ddx = x - centerX
          ddx -= S * Math.round(ddx / S)
          let ddy = y - centerY
          ddy -= S * Math.round(ddy / S)
          const d = ddx * ddx + ddy * ddy
          const colW = ((colRaw % cols) + cols) % cols
          if (d < best) {
            second = best
            best = d
            bestCol = colW
            bestRow = row
          } else if (d < second) {
            second = d
          }
        }
      }
      const edge = Math.sqrt(second) - Math.sqrt(best)
      const i = y * S + x
      if (edge < groutW) {
        const t = edge / groutW
        setPx(f, i, grout[0], grout[1], grout[2], 0.05 + t * 0.1, 0.9)
      } else {
        const tt = tint[bestRow * cols + bestCol]
        const sp = (speck(x / S, y / S) - 0.5) * 0.05
        const [r, g, b] = shade(base, clamp01(tt + sp))
        setPx(f, i, r, g, b, 0.82, 0.2 + Math.abs(sp) * 1.5)
      }
    }
  }
  return f
}

function carpetFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 6
  const fibre = makeFbm(seed + 11, 4, 110)
  const blotch = makeFbm(seed + 31, 3, 8)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const fib = fibre(u, v)
      const bl = blotch(u, v)
      const factor = 0.82 + fib * 0.3 + (bl - 0.5) * 0.1
      const [r, g, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, g, b, fib, 0.93 + fib * 0.05)
    }
  }
  return f
}

function concreteFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 7
  const mottle = makeFbm(seed + 5, 5, 5)
  const pores = makeFbm(seed + 41, 4, 90)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const m = mottle(u, v)
      const p = pores(u, v)
      const pore = p > 0.86 ? (p - 0.86) / 0.14 : 0
      const factor = 0.86 + (m - 0.5) * 0.22 - pore * 0.25
      const [r, g, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, g, b, clamp01(m * 0.6 + pore), 0.78 + (m - 0.5) * 0.1)
    }
  }
  return f
}

function marbleFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 4
  const turb = makeFbm(seed + 13, 5, 4)
  const fine = makeFbm(seed + 71, 4, 30)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      // Veins: a warped sinusoid threshold.
      const t = turb(u, v)
      const vein = Math.abs(Math.sin((u + v) * 6.28 * 2 + t * 6.0))
      const veinMask = vein < 0.12 ? 1 - vein / 0.12 : 0
      const baseFac = 0.96 + (fine(u, v) - 0.5) * 0.08
      // Veins darken slightly with a cool tint.
      const factor = clamp01(baseFac - veinMask * 0.28)
      const [r, g, b] = shade(base, factor)
      setPx(f, y * S + x, r, g, b, veinMask * 0.4, 0.22 + veinMask * 0.1)
    }
  }
  return f
}

function plasterFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  // Very gentle orange-peel: low bump, near-uniform colour so walls read as
  // clean matte paint rather than noisy stucco.
  f.normalStrength = 1.1
  const peel = makeFbm(seed + 17, 3, 48)
  const broad = makeFbm(seed + 23, 3, 5)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const pk = peel(u, v)
      const br = broad(u, v)
      const factor = 0.985 + (br - 0.5) * 0.022 + (pk - 0.5) * 0.012
      const [r, g, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, g, b, pk * 0.5, 0.92)
    }
  }
  return f
}

function terrazzoFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 2
  const rand = mulberry32(seed)
  const grain = makeFbm(seed + 9, 3, 60)
  // Light cement matrix with faint noise.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const g = grain(x / S, y / S)
      const factor = 0.96 + (g - 0.5) * 0.06
      const [r, gg, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, gg, b, 0.1, 0.42 + (g - 0.5) * 0.08)
    }
  }
  // Scattered polished chips (with edge wrap so the tile is seamless).
  const CHIP_COLS: [number, number, number][] = [
    [196, 188, 174],
    [120, 96, 78],
    [150, 120, 110],
    [90, 110, 96],
    [86, 92, 110],
    [170, 150, 120],
    [60, 60, 64],
    [210, 205, 196],
  ]
  const chips = Math.round((S * S) / 1400)
  for (let c = 0; c < chips; c++) {
    const cxp = rand() * S
    const cyp = rand() * S
    const radius = 3 + rand() * (S / 70)
    const col = CHIP_COLS[Math.floor(rand() * CHIP_COLS.length)]
    const squish = 0.7 + rand() * 0.6
    const rad = Math.ceil(radius) + 1
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const d = Math.hypot(dx, dy / squish)
        if (d > radius) continue
        const px = (((Math.round(cxp) + dx) % S) + S) % S
        const py = (((Math.round(cyp) + dy) % S) + S) % S
        const i = py * S + px
        const edge = d > radius - 1 ? 0.8 : 1 // slight dark rim
        f.albedo[i * 4] = col[0] * edge
        f.albedo[i * 4 + 1] = col[1] * edge
        f.albedo[i * 4 + 2] = col[2] * edge
        f.height[i] = 0.5
        f.rough[i] = 0.28
      }
    }
  }
  return f
}

/** Tone-on-tone vertical stripe wallpaper — alternating slightly lighter
 *  bands over a faint paper texture. Subtle, tasteful (an accent wall). */
function stripeFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 0.7
  const stripes = 6
  const sw = S / stripes
  const paper = makeFbm(seed + 11, 3, 40)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const band = Math.floor(x / sw) % 2
      const edge = Math.min(x % sw, sw - (x % sw)) < 2 ? 0.97 : 1 // faint seam
      const alt = band === 0 ? 1.0 : 1.07
      const n = paper(x / S, y / S)
      const factor = alt * edge * (0.99 + (n - 0.5) * 0.02)
      const [r, g, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, g, b, 0.2 + n * 0.1, 0.86)
    }
  }
  return f
}

/** Grasscloth wallpaper — fine horizontal woven striation with subtle warp,
 *  reading as a natural textured paper. */
function grasscloth(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 1.4
  const warp = makeFbm(seed + 7, 3, 70)
  const slub = makeFbm(seed + 13, 2, 14)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const line = Math.sin(v * S * 0.85 + warp(u, v) * 3) * 0.5 + 0.5 // horizontal weave
      const sl = slub(u, v)
      const factor = 0.95 + line * 0.05 + (sl - 0.5) * 0.05
      const [r, g, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, g, b, line * 0.5, 0.82 + line * 0.06)
    }
  }
  return f
}

/** Checkerboard tile floor — `base` is the light square, a dark derivative the
 *  other, with grout seams. Polished (low roughness). */
function checkerFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 0.6
  const cells = 4
  const cs = S / cells
  const grain = makeFbm(seed + 3, 3, 30)
  const dark: [number, number, number] = [base[0] * 0.26, base[1] * 0.26, base[2] * 0.28]
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cell = (Math.floor(x / cs) + Math.floor(y / cs)) % 2
      const col = cell === 0 ? base : dark
      const g = grain(x / S, y / S)
      const ex = Math.min(x % cs, cs - (x % cs))
      const ey = Math.min(y % cs, cs - (y % cs))
      const grout = Math.min(ex, ey) < 1.5 ? 0.8 : 1
      const [r, gg, b] = shade(col, clamp01((0.98 + (g - 0.5) * 0.04) * grout))
      setPx(f, y * S + x, r, gg, b, grout < 1 ? 0.2 : 0.08, 0.32)
    }
  }
  return f
}

/**
 * Basketweave parquet: a grid of square blocks, each holding K parallel wood
 * planks, with block orientation alternating like a checkerboard (horizontal /
 * vertical). Seamless because the block grid divides the tile evenly. The plank
 * shading reuses the wood look (warped latewood bands + tinted boards + recessed
 * grooves at plank/block edges), oriented per block.
 */
function parquetFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 9
  const nb = 2 // blocks per axis — keeps the tile seamless
  const K = 4 // planks per block
  const B = S / nb // block size (px)
  const pw = B / K // plank width (px)
  const grain = makeFbm(seed + 7, 4, 3)
  const fine = makeFbm(seed + 99, 3, 28)
  // Deterministic per-plank hash → tint variation without a stateful RNG stream.
  const hsh = (n: number) => {
    let t = (n * 2654435761) >>> 0
    t ^= t >>> 15
    t = (t * 2246822519) >>> 0
    return (t >>> 8) / 16777216
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const bx = Math.floor(x / B)
      const by = Math.floor(y / B)
      const horizontal = ((bx + by) & 1) === 0
      const lx = x - bx * B
      const ly = y - by * B
      // across = position across the plank width (0..1); along = down its length.
      let across: number
      let along: number
      let plankIdx: number
      if (horizontal) {
        plankIdx = Math.floor(ly / pw)
        across = (ly - plankIdx * pw) / pw
        along = lx / B
      } else {
        plankIdx = Math.floor(lx / pw)
        across = (lx - plankIdx * pw) / pw
        along = ly / B
      }
      const pid = bx * 7 + by * 13 + plankIdx * 31
      const val = 0.84 + hsh(pid) * 0.26
      const warm = 0.95 + hsh(pid + 1) * 0.12
      // Latewood bands run along the plank length; warp them so they meander.
      const warp = grain(along * 1.2 + (pid % 11), across * 1.5) - 0.5
      const band = Math.abs(Math.sin((across + warp * 0.5) * Math.PI * 7 + (pid % 7)))
      const fg = fine(along * 4, across)
      let factor = val * (0.92 - band * 0.14 + (fg - 0.5) * 0.06)
      // Recessed grooves between planks (across) and at plank ends (along).
      const edgeAcross = Math.min(across, 1 - across)
      const grooveA = edgeAcross < 0.06 ? edgeAcross / 0.06 : 1
      const edgeAlong = Math.min(along, 1 - along)
      const grooveB = edgeAlong < 0.03 ? edgeAlong / 0.03 : 1
      const groove = Math.min(grooveA, grooveB)
      factor *= 0.5 + 0.5 * groove
      const r = base[0] * factor * warm
      const g = base[1] * factor
      const b = base[2] * factor * (2 - warm)
      const h = clamp01(0.5 * groove + band * 0.3)
      const rough = clamp01(0.42 + band * 0.16 + (1 - groove) * 0.2)
      setPx(f, y * S + x, r, g, b, h, rough)
    }
  }
  return f
}

/**
 * Running-bond exposed brick: rows of bricks offset by half a brick each row,
 * with recessed mortar joints and per-brick colour/value variation. Seamless —
 * the column count divides the tile and the row count is even so the half-offset
 * alternation wraps. `base` is the brick colour; mortar is a fixed warm grey.
 */
/**
 * Glossy ceramic subway/metro tile — running-bond 2:1 rectangles with thin grout
 * and a soft bevel at each tile edge (the classic kitchen-backsplash / bathroom
 * wall finish). Distinct from `brick` (matte, earthy, thick mortar): high tint,
 * low roughness, crisp thin joints. Seamless — cols divide the tile, rows even so
 * the half-offset running bond wraps.
 */
function subwayFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 14
  const cols = 4
  const tw = S / cols // tile width
  const rows = 8 // even → half-offset running bond wraps; 2:1 tiles (tw = 2·th)
  const th = S / rows
  const grout = Math.max(2, Math.round(S / 150)) // thin joint
  const bevel = Math.max(3, Math.round(S / 90)) // soft edge bevel band
  const groutRgb: [number, number, number] = [218, 214, 206]
  const speck = makeFbm(seed + 7, 3, 60)
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / th)
    const yIn = y - row * th
    const offset = (row & 1) * (tw / 2)
    for (let x = 0; x < S; x++) {
      const xs = (((x + offset) % S) + S) % S
      const col = Math.floor(xs / tw)
      const xIn = xs - col * tw
      const edge = Math.min(xIn, tw - xIn, yIn, th - yIn)
      const i = y * S + x
      if (edge < grout) {
        // Recessed grout joint.
        setPx(f, i, groutRgb[0], groutRgb[1], groutRgb[2], 0.05, 0.8)
        continue
      }
      // Ceramic face — bright, low roughness; a bevel band near the joint catches
      // light (raised height) so each tile reads as proud + glossy.
      const onBevel = edge < grout + bevel
      const bv = onBevel ? (edge - grout) / bevel : 1
      const sp = (speck(x / S, y / S) - 0.5) * 0.04
      const factor = clamp01(0.97 + sp + (onBevel ? (1 - bv) * 0.06 : 0))
      const [r, g, b] = shade(base, factor)
      const height = onBevel ? 0.5 + bv * 0.45 : 0.95
      setPx(f, i, r, g, b, height, 0.12 + Math.abs(sp) * 1.2)
    }
  }
  return f
}

function brickFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 5
  const cols = 5
  const bw = S / cols // brick width (px) — divides S → seamless horizontally
  const rows = 12 // even → the per-row half-offset wraps seamlessly
  const bh = S / rows // brick height (px)
  const mortar = Math.max(2, Math.round(S / 110)) // joint thickness (px)
  const mortarRgb: [number, number, number] = [188, 182, 172]
  const grain = makeFbm(seed + 5, 3, 26)
  const hsh = (n: number) => {
    let t = (n * 2654435761) >>> 0
    t ^= t >>> 15
    t = (t * 2246822519) >>> 0
    return (t >>> 8) / 16777216
  }
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / bh)
    const yIn = y - row * bh
    const offset = (row & 1) * (bw / 2)
    for (let x = 0; x < S; x++) {
      const xs = (((x + offset) % S) + S) % S
      const col = Math.floor(xs / bw)
      const xIn = xs - col * bw
      const inMortar = xIn < mortar || xIn > bw - mortar || yIn < mortar || yIn > bh - mortar
      const i = y * S + x
      if (inMortar) {
        const g = grain(x / S, y / S)
        const c = 0.92 + (g - 0.5) * 0.08
        setPx(f, i, mortarRgb[0] * c, mortarRgb[1] * c, mortarRgb[2] * c, 0.12, 0.85)
        continue
      }
      const id = row * 53 + col * 17
      // Per-brick value + warmth variation, plus fine intra-brick speckle.
      const val = 0.8 + hsh(id) * 0.35
      const warm = 0.96 + hsh(id + 1) * 0.1
      const speck = grain(x / S + id, y / S) - 0.5
      const factor = val * (1 + speck * 0.08)
      const r = base[0] * factor * warm
      const g = base[1] * factor
      const b = base[2] * factor * (2 - warm)
      // Bricks bulge slightly proud of the mortar; rougher than mortar.
      setPx(f, i, r, g, b, 0.6 + speck * 0.1, clamp01(0.7 + speck * 0.15))
    }
  }
  return f
}

/**
 * Board-and-batten panelling: a flat painted panel with evenly-spaced vertical
 * raised battens (with bevelled edges in the height map). Seamless — the batten
 * count divides the tile. `base` is the paint colour.
 */
function battenFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 7
  const battens = 6 // battens across the tile (divides S → seamless)
  const period = S / battens
  const bw = period * 0.16 // batten width
  const bevel = period * 0.03 // bevel ramp at each batten edge
  const grain = makeFbm(seed + 4, 3, 20)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const xIn = x % period
      // Height: raised on the batten, ramped through the bevel, flat on panel.
      let h: number
      if (xIn < bevel) h = 0.3 + (xIn / bevel) * 0.5
      else if (xIn < bw - bevel) h = 0.8
      else if (xIn < bw) h = 0.8 - ((xIn - (bw - bevel)) / bevel) * 0.5
      else h = 0.3
      const onBatten = xIn < bw
      const g = grain(x / S, y / S)
      // Battens catch a touch more light; subtle painted-surface noise.
      const factor = (onBatten ? 1.02 : 0.95) * (0.98 + (g - 0.5) * 0.03)
      setPx(
        f,
        y * S + x,
        base[0] * factor,
        base[1] * factor,
        base[2] * factor,
        h,
        0.55, // matte paint
      )
    }
  }
  return f
}

/**
 * Fluted / reeded panel — close-packed rounded vertical ribs (no flat gaps,
 * unlike `batten`'s spaced slats), the on-trend feature-wall finish. A half-sine
 * height profile per rib gives the rounded relief (the normal map does the work);
 * the albedo carries faint lengthwise wood grain + a touch of groove shading.
 * Seamless — the rib count divides the tile.
 */
function flutedFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 20
  const ribs = 16 // divides S → seamless
  const period = S / ribs
  const grain = makeFbm(seed + 6, 3, 80)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const frac = (x % period) / period // 0..1 across one rib
      // Half-sine bump: groove (0) at rib edges, peak (1) at rib centre.
      const h = Math.sin(Math.PI * frac)
      const g = grain(x / S, y / S) - 0.5
      // Rib faces catch light (lighter toward the peak); grooves sit darker.
      const factor = 0.88 + h * 0.14 + g * 0.04
      const [r, gg, b] = shade(base, clamp01(factor))
      setPx(f, y * S + x, r, gg, b, 0.15 + h * 0.85, 0.6 + g * 0.1)
    }
  }
  return f
}

/**
 * Herringbone parquet: rectangular wood planks (length L = n·W) laid in the
 * classic interlocking 45° zigzag — horizontal planks (L wide × W tall) and
 * vertical planks (W wide × L tall) alternate in diagonal bands. The plank a
 * texel belongs to is found from the orientation field `g = (⌊x⌋+⌊y⌋) mod 2n`
 * (in plank-width units; `g < n` → horizontal), then the run within that band.
 * Plank IDs use the run's canonical start position (mod the tile period) so the
 * per-plank tint + grain tile **seamlessly**, including planks that straddle the
 * tile edge. Shading reuses the wood look (latewood bands across the width,
 * per-plank warmth/value, recessed grooves at plank joints).
 */
function herringboneFields(base: [number, number, number], seed: number): Fields {
  const f = blank()
  f.normalStrength = 9
  const across = 16 // plank-widths across the tile (divides S → seamless)
  const W = S / across // plank width (px)
  const n = 4 // plank length L = n·W
  const P = 2 * n // orientation period in W-units; across (16) is a multiple → seamless
  const grain = makeFbm(seed + 7, 4, 3)
  const fine = makeFbm(seed + 99, 3, 28)
  const hsh = (k: number) => {
    let t = (k * 2654435761) >>> 0
    t ^= t >>> 15
    t = (t * 2246822519) >>> 0
    return (t >>> 8) / 16777216
  }
  const wrap = (v: number) => ((v % across) + across) % across
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const xw = x / W
      const yw = y / W
      const fx = Math.floor(xw)
      const fy = Math.floor(yw)
      const g = (((fx + fy) % P) + P) % P
      const horizontal = g < n
      let acrossF: number
      let alongF: number
      let pid: number
      if (horizontal) {
        // Horizontal plank: spans n cells along x; `g` is the offset within it.
        acrossF = yw - fy
        alongF = (g + (xw - fx)) / n
        pid = wrap(fx - g) * 131 + wrap(fy) * 17 + 1
      } else {
        // Vertical plank: spans n cells along y; offset within it is g − n.
        const go = g - n
        acrossF = xw - fx
        alongF = (go + (yw - fy)) / n
        pid = wrap(fx) * 271 + wrap(fy - go) * 29 + 7
      }
      const val = 0.84 + hsh(pid) * 0.26
      const warm = 0.94 + hsh(pid + 1) * 0.14
      // Latewood bands run along the plank length; warp so they meander.
      const warp2 = grain(alongF * 1.2 + (pid % 11), acrossF * 1.5) - 0.5
      const band = Math.abs(Math.sin((acrossF + warp2 * 0.5) * Math.PI * 7 + (pid % 7)))
      const fg = fine(alongF * 4, acrossF)
      let factor = val * (0.92 - band * 0.14 + (fg - 0.5) * 0.06)
      // Recessed grooves: across the width (plank sides) + at the butt ends.
      const edgeAcross = Math.min(acrossF, 1 - acrossF)
      const grooveA = edgeAcross < 0.07 ? edgeAcross / 0.07 : 1
      const edgeAlong = Math.min(alongF, 1 - alongF)
      const grooveB = edgeAlong < 0.05 ? edgeAlong / 0.05 : 1
      const groove = Math.min(grooveA, grooveB)
      factor *= 0.5 + 0.5 * groove
      const r = base[0] * factor * warm
      const gg = base[1] * factor
      const b = base[2] * factor * (2 - warm)
      const h = clamp01(0.5 * groove + band * 0.3)
      const rough = clamp01(0.42 + band * 0.16 + (1 - groove) * 0.2)
      setPx(f, y * S + x, r, gg, b, h, rough)
    }
  }
  return f
}

const PATTERN_FN: Record<
  ProceduralPattern,
  (base: [number, number, number], seed: number) => Fields
> = {
  wood: woodFields,
  checker: checkerFields,
  tile: tileFields,
  carpet: carpetFields,
  concrete: concreteFields,
  marble: marbleFields,
  plaster: plasterFields,
  terrazzo: terrazzoFields,
  stripe: stripeFields,
  grasscloth,
  parquet: parquetFields,
  herringbone: herringboneFields,
  brick: brickFields,
  batten: battenFields,
  hexagon: hexagonFields,
  subway: subwayFields,
  fluted: flutedFields,
}

/** Generate the three PBR maps for a procedural material. Browser-only
 *  (uses canvas / ImageData). */
export function generateProcedural(
  id: string,
  pattern: ProceduralPattern,
  swatch: string,
): ProceduralResult {
  S = effectivePatternSize(pattern)
  const seed = hashSeed(`${id}:${pattern}`)
  const base = hexToRgb(swatch)
  const f = PATTERN_FN[pattern](base, seed)

  const albedo = toTexture(f.albedo, true)
  const normal = toTexture(heightToNormalRGBA(f.height, S, f.normalStrength), false)
  const roughData = new Uint8ClampedArray(S * S * 4)
  for (let i = 0; i < S * S; i++) {
    const r = Math.round(clamp01(f.rough[i]) * 255)
    roughData[i * 4] = r
    roughData[i * 4 + 1] = r
    roughData[i * 4 + 2] = r
    roughData[i * 4 + 3] = 255
  }
  const roughness = toTexture(roughData, false)
  return { albedo, normal, roughness, metalness: f.metalness }
}

// Shared orange-peel normal for ALL plaster (wall-paint) materials. Plaster
// is near-flat and varies only by tint, so every wall colour reuses this one
// 256² normal map (tinted via material.color) instead of generating its own
// full 512² albedo+normal+roughness set — a big memory saving for the palette.
let plasterNormalTex: Texture | null = null
export function getPlasterNormal(): Texture {
  if (plasterNormalTex) return plasterNormalTex
  const prev = S
  S = 256
  try {
    const f = plasterFields([255, 255, 255], hashSeed('plaster:shared'))
    plasterNormalTex = toTexture(heightToNormalRGBA(f.height, S, f.normalStrength), false)
    // Wall faces carry metre UVs and all wall paints tile at 2.5 m.
    plasterNormalTex.repeat.set(1 / 2.5, 1 / 2.5)
    return plasterNormalTex
  } finally {
    S = prev
  }
}

const thumbCache = new Map<string, string>()
/** LRU cap — browsing the full remote/generated catalog can mint many thumbnail
 *  data-URLs over a long session; bound the cache so it can't grow unbounded. */
const THUMB_CACHE_MAX = 300

/** Cheap albedo-only preview (default 64²) as a data URL, cached per id —
 *  used by the finish picker so procedural materials show a real texture
 *  swatch instead of a flat colour. */
export function proceduralThumbnailDataUrl(
  id: string,
  pattern: ProceduralPattern,
  swatch: string,
  size = 64,
): string {
  const cached = thumbCache.get(id)
  if (cached) {
    // LRU touch: re-insert so frequently-used thumbnails survive eviction.
    thumbCache.delete(id)
    thumbCache.set(id, cached)
    return cached
  }
  const prev = S
  S = size
  try {
    const seed = hashSeed(`${id}:${pattern}`)
    const f = PATTERN_FN[pattern](hexToRgb(swatch), seed)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(size, size)
    img.data.set(f.albedo)
    ctx.putImageData(img, 0, 0)
    const url = canvas.toDataURL()
    thumbCache.set(id, url)
    if (thumbCache.size > THUMB_CACHE_MAX) {
      const oldest = thumbCache.keys().next().value
      if (oldest !== undefined) thumbCache.delete(oldest)
    }
    return url
  } finally {
    S = prev
  }
}

export { mix }
