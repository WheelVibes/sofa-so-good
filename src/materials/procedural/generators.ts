/**
 * Runtime procedural PBR texture generators. Each pattern paints a single
 * seamlessly-tiling tile (albedo + normal + roughness) on a canvas; the
 * material then repeats it across a surface via UV scale. No network, tiny
 * memory (one tile per material, shared across every mesh that uses it).
 *
 * The per-pattern field painters live in `./patterns/*` (grouped by material
 * family) over the shared `./fieldKit` buffers; this module owns the size/cap
 * logic, the canvas→texture conversion, the `PATTERN_FN` dispatch, and the
 * public `generateProcedural*` API.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { isFeatureEnabled } from '../../features/featureFlags'
import { applyAnisotropy } from '../anisotropy'
import type { ProceduralPattern } from '../types'
import type { Fields } from './fieldKit'
import { clamp01, hashSeed, heightToNormalRGBA, hexToRgb, mix } from './noise'
import { carpetFields, grasscloth, stripeFields } from './patterns/fabric'
import { concreteFields, marbleFields, terrazzoFields } from './patterns/stone'
import {
  brickFields,
  checkerFields,
  hexagonFields,
  subwayFields,
  tileFields,
} from './patterns/tile'
import { battenFields, flutedFields, plasterFields } from './patterns/wall'
import { herringboneFields, parquetFields, woodFields } from './patterns/wood'
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
 * OffscreenCanvas worker generation: see `runProceduralWorker.ts` (C271).
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
  applyAnisotropy(tex)
  return tex
}

/** Build a THREE CanvasTexture from a raw RGBA pixel array and a size.
 *  Used by the main thread to materialise worker-returned pixel buffers. */
export function rawToTexture(data: Uint8ClampedArray, size: number, srgb: boolean): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  img.data.set(data)
  ctx.putImageData(img, 0, 0)
  const tex = new CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = RepeatWrapping
  if (srgb) tex.colorSpace = SRGBColorSpace
  applyAnisotropy(tex)
  return tex
}

const PATTERN_FN: Record<
  ProceduralPattern,
  (base: [number, number, number], seed: number, S: number) => Fields
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

/** Raw PBR pixel data returned by {@link generateProceduralRaw} — no DOM
 *  objects, fully transferable so it can cross a Worker message boundary. */
export interface ProceduralRawResult {
  albedo: Uint8ClampedArray
  normal: Uint8ClampedArray
  roughness: Uint8ClampedArray
  metalness: number
  size: number
}

/**
 * Pure computation: generate the three PBR map pixel buffers for a procedural
 * material WITHOUT touching the DOM or creating any Three.js objects. The
 * returned arrays are regular typed arrays that can be transferred across a
 * Worker message boundary or turned into `CanvasTexture`s on the main thread.
 *
 * The `size` parameter overrides the module-level BASE_SIZE/cap logic so the
 * call is fully deterministic given `{id, pattern, swatch, size}`. Pass
 * `effectivePatternSize(pattern)` for the standard quality-aware size.
 */
export function generateProceduralRaw(
  id: string,
  pattern: ProceduralPattern,
  swatch: string,
  size: number,
): ProceduralRawResult {
  const prev = S
  S = size
  try {
    const seed = hashSeed(`${id}:${pattern}`)
    const base = hexToRgb(swatch)
    const f = PATTERN_FN[pattern](base, seed, S)

    const normalData = heightToNormalRGBA(f.height, S, f.normalStrength)
    const roughData = new Uint8ClampedArray(S * S * 4)
    for (let i = 0; i < S * S; i++) {
      const r = Math.round(clamp01(f.rough[i]) * 255)
      roughData[i * 4] = r
      roughData[i * 4 + 1] = r
      roughData[i * 4 + 2] = r
      roughData[i * 4 + 3] = 255
    }
    return {
      albedo: f.albedo,
      normal: normalData,
      roughness: roughData,
      metalness: f.metalness,
      size: S,
    }
  } finally {
    S = prev
  }
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
  const f = PATTERN_FN[pattern](base, seed, S)

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
//
// MAT-003 — the singleton also bakes a shared roughness-drift map (Path B) from
// the SAME `plasterFields` tile the normal comes from, so every tinted wall reuses
// one 256² roughness map for free (no per-colour generation). The map is a
// MULTIPLIER over the material's base roughness scalar (so it's tint-independent,
// like the normal): `f.rough` carries `base + roller-nap`, so `f.rough / base` is
// the centred-on-1 nap drift. Gated behind `pbrSurfaces` exactly like the other
// PBR micro-maps; off → no map, the legacy flat `roughness = 0.92` scalar. The
// drift is a whisper (±~0.04 of the multiplier) so the wall stays clearly MATTE.
const PLASTER_BASE_ROUGHNESS = 0.92
let plasterNormalTex: Texture | null = null
let plasterRoughTex: Texture | null = null
export function getPlasterNormal(): Texture {
  if (!plasterNormalTex) buildPlasterMaps()
  // `buildPlasterMaps` always populates the normal (only the rough map is gated).
  return plasterNormalTex as Texture
}

/** MAT-003 — the shared roller-nap roughness-drift map for plaster walls, or
 *  `null` when `pbrSurfaces` is off (legacy flat matte). A multiplier over the
 *  material's base roughness scalar (tint-independent, like the normal). */
export function getPlasterRoughness(): Texture | null {
  if (plasterRoughTex) return plasterRoughTex
  buildPlasterMaps()
  return plasterRoughTex
}

function buildPlasterMaps(): void {
  if (plasterNormalTex) return
  const prev = S
  S = 256
  try {
    const f = plasterFields([255, 255, 255], hashSeed('plaster:shared'), S)
    plasterNormalTex = toTexture(heightToNormalRGBA(f.height, S, f.normalStrength), false)
    // Wall faces carry metre UVs and all wall paints tile at 2.5 m.
    plasterNormalTex.repeat.set(1 / 2.5, 1 / 2.5)
    if (isFeatureEnabled('pbrSurfaces')) {
      const roughData = new Uint8ClampedArray(S * S * 4)
      for (let i = 0; i < S * S; i++) {
        // `f.rough` = base + nap drift; divide by base → a centred-on-1 multiplier
        // so the map is tint-/scalar-independent. clamp01 keeps it a valid map.
        const mult = clamp01(f.rough[i] / PLASTER_BASE_ROUGHNESS)
        const c = Math.round(mult * 255)
        roughData[i * 4] = roughData[i * 4 + 1] = roughData[i * 4 + 2] = c
        roughData[i * 4 + 3] = 255
      }
      plasterRoughTex = toTexture(roughData, false)
      plasterRoughTex.repeat.set(1 / 2.5, 1 / 2.5)
    }
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
    const f = PATTERN_FN[pattern](hexToRgb(swatch), seed, S)
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
