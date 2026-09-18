/**
 * CEILING-PLASTER — procedural skim-coat finish for the default flat's
 * UN-FINISHED ceiling tiles (`apartment/ceiling/Ceiling.tsx`'s flat white
 * planes ONLY — a room the user has FINISHED keeps going through
 * `RoomCeilingTile`/the `MaterialId` catalog, untouched).
 *
 * Why a new painter instead of reusing `patterns/wall.ts:plasterFields`: a
 * ceiling is painted overhead in long roller PASSES, so the tell it leaves is
 * directional STREAKS (elongated along the roller's travel), not the
 * omnidirectional stucco mottle a wall gets — and unlike the wall singleton
 * (tint-only, zero albedo variation), the audit residual this closes
 * (`docs/audit/interaction-sweep-2026-09-18.md` N4: "the frame is still
 * featureless… a ceiling-material content call", `src/scene/CLAUDE.md`
 * PHOTO-GRAIN measuring the ceiling's high-frequency floor at 0.10 against a
 * photographic 0.76-1.49) asks specifically for a little albedo texture, not
 * just a normal/roughness whisper. It DOES reuse the general-purpose
 * roller-nap roughness-drift helper (`plasterSurface.ts:makeRollerNap` —
 * general despite its name, already the shared Path-B roughness map for
 * every tinted wall).
 *
 * MEAN-PRESERVING BY CONSTRUCTION, not by luck: the calibrated
 * `IRRADIANCE_GAIN` / lampBounce / ceiling stop-down were fit against the
 * flat `#fafafa` (linear ~0.947) ceiling colour, so the generated albedo's
 * mean is explicitly re-centred to that value in a first noise pass before
 * the second pass paints pixels — not merely "small coefficients", which is
 * how `plasterFields` does it and why that field's mean only *approximately*
 * tracks its swatch. `ceilingPlaster.test.ts` asserts the mean within 0.5%.
 *
 * Geometry is untouched by any of this, so no lightmap re-bake is triggered
 * (`lightmapKey` hashes world-space VERTICES — `src/scene/CLAUDE.md`
 * LIGHTMAP-KEY-AUDIT — a texture-only change never re-keys).
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { applyAnisotropy } from '../anisotropy'
import { blank, type Fields, setPx, shade } from './fieldKit'
import { getProceduralBaseSize } from './generators'
import { clamp01, hashSeed, heightToNormalRGBA, hexToRgb, makeFbm } from './noise'
import { makeRollerNap } from './plasterSurface'

/** The default flat's flat ceiling colour (`Ceiling.tsx`'s `#fafafa`). Both the
 *  generator and the consuming material must agree on this — it is the value
 *  the calibrated exposure/gain chain was fit against. */
export const CEILING_PLASTER_COLOR = '#fafafa'

/** Metres per texture tile. Large and low-frequency (broad patches + long
 *  roller streaks), so a typical room shows well under two tiles and no seam
 *  reads as a seam at the ~2.6 m viewing distance a ceiling is seen from. */
export const CEILING_PLASTER_TILE_M = 2.8

/** Peak signed albedo factor swing either side of 1.0 — the "±2-3% luminance"
 *  ask, at the bottom of that band for a reason. Applied to a field that is
 *  re-centred to mean 0 AND peak-normalised first (see
 *  {@link ceilingPlasterFields}), so this is the swing the texture actually
 *  ships, not an upper bound the noise never reaches.
 *
 *  **Why 0.02 and not the 0.028 first tried: HEADROOM.** The base is #fafafa =
 *  250/255, so an upward swing has only 5 counts before `shade` clips at white.
 *  At 0.028 the bright half CLIPPED, the clipped energy went missing, and the
 *  mean fell 0.66 % below the flat colour — the exact property this generator
 *  exists to hold. 250 x 1.02 = 255.0 lands precisely on the ceiling of the
 *  byte range, so nothing clips and the mean stays pinned (measured 0.02 %). */
export const CEILING_PLASTER_ALBEDO_AMPLITUDE = 0.02

/** Matte skim-coat base roughness — the 0.9-1.0 band asked for, centred so the
 *  roller-nap drift (±0.035, `plasterSurface.ts`) never leaves the band. */
export const CEILING_PLASTER_BASE_ROUGHNESS = 0.96

/** Tiny bump amplitude — "amplitude tiny" per the brief; a wall's plaster
 *  peel runs `normalStrength` 1.1, this is deliberately under half that. */
const CEILING_NORMAL_STRENGTH = 0.5

/**
 * Pure, deterministic, worker-safe painter: broad low-frequency roller-coverage
 * patches (isotropic, ~the wall painter's `broad` field) plus anisotropic
 * roller STREAKS (elongated along `u`, the tile's long axis) combine into one
 * signed field, which is explicitly re-centred to mean 0 over the WHOLE tile
 * before being scaled into the albedo/height channels — so the shipped mean
 * albedo equals `swatch` regardless of the noise generator's own statistics.
 */
export function ceilingPlasterFields(
  base: [number, number, number],
  seed: number,
  S: number,
): Fields {
  const f = blank(S)
  f.normalStrength = CEILING_NORMAL_STRENGTH
  // Distinct seed offsets from every wall/limewash/carpet field in the shared
  // noise space, so a ceiling never correlates with a room's own walls.
  const broad = makeFbm(seed + 401, 3, 4)
  // Anisotropic: low frequency along u (long roller pass), higher across v —
  // the elongation IS the streak. Both axis multipliers below MUST be
  // integers (never a fraction like `0.4`): `makeFbm`'s lattice only wraps
  // exactly at INTEGER multiples of its period, so a fractional sample-axis
  // scale breaks the seamless tiling `noise.ts` otherwise guarantees — caught
  // by `ceilingPlaster.test.ts`'s edge-continuity check, which failed hard
  // (a 10x wrap-step spike) on a first `* 0.4` / `* 3.4` version of this line.
  // `v * 8` vs `u * 1` stretches features 8x along the pass direction.
  const streak = makeFbm(seed + 419, 3, 3)
  const nap = makeRollerNap(seed, 1)

  // Pass 1: raw signed shape only (no swatch, no amplitude) — captured so its
  // exact mean over this S x S tile can be subtracted in pass 2.
  const raw = new Float32Array(S * S)
  let sum = 0
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const br = broad(u, v) - 0.5
      const st = streak(u, v * 8) - 0.5
      const val = br * 0.4 + st * 0.6
      raw[y * S + x] = val
      sum += val
    }
  }
  const mean = sum / (S * S)

  // Pass 1b: PEAK NORMALISATION. `makeFbm`'s summed octaves concentrate hard
  // around 0.5, so `raw - mean` peaks around ±0.15, not ±0.5 — scaling that
  // straight by the amplitude constant shipped a ±0.8 % swing where ±2.8 % was
  // designed, and measured a 0.45-count ON-vs-OFF difference on the phone
  // ceiling crop, i.e. invisible. Dividing the ZERO-MEAN field by its own peak
  // is a scalar multiply, so it cannot disturb the mean the pass above pinned;
  // it only makes `CEILING_PLASTER_ALBEDO_AMPLITUDE` mean what it says.
  let peak = 0
  for (let i = 0; i < raw.length; i++) {
    const a = Math.abs(raw[i] - mean)
    if (a > peak) peak = a
  }
  const norm = peak > 1e-6 ? 1 / peak : 0

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      const u = x / S
      const v = y / S
      const centred = (raw[i] - mean) * norm // exact zero mean over the tile, peak ±1
      // `centred` spans exactly ±1, so this spans exactly 1 ± AMPLITUDE: the
      // darkest texel is 245/255 and the brightest is 255/255, both inside the
      // byte range, so `shade` never clips and the zero-mean field survives
      // quantisation intact. (An earlier `* 2` here doubled the swing to ±4 %,
      // blew the top past 255 and cost the mean its pin.)
      const factor = clamp01(1 + centred * CEILING_PLASTER_ALBEDO_AMPLITUDE)
      const [r, g, b] = shade(base, factor)
      // Height reuses the same shape at a small, independent scale — tiny
      // relief, never near-white blown or near-black.
      const h = clamp01(0.5 + centred * 0.6)
      const rough = clamp01(CEILING_PLASTER_BASE_ROUGHNESS + nap(u, v))
      setPx(f, i, r, g, b, h, rough)
    }
  }
  return f
}

/** Per-pattern resolution cap, mirroring `generators.ts:PATTERN_SIZE_CAP`'s
 *  "smooth / low-frequency — extra pixels add nothing" bucket (the same one
 *  `plaster`/`carpet`/`limewash` sit in). Exposed as a pure function of the
 *  global base size so it is testable without touching module-level state. */
export function effectiveCeilingPlasterSize(baseSize: number): 128 | 256 {
  const cap = 256
  return Math.min(Math.max(baseSize, 128), cap) as 128 | 256
}

interface CeilingPlasterMaps {
  albedo: Texture
  normal: Texture
  roughness: Texture
}

const cache = new Map<number, CeilingPlasterMaps>()

function toTexture(size: number, data: Uint8ClampedArray, srgb: boolean): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  img.data.set(data)
  ctx.putImageData(img, 0, 0)
  const tex = new CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.repeat.set(1 / CEILING_PLASTER_TILE_M, 1 / CEILING_PLASTER_TILE_M)
  if (srgb) tex.colorSpace = SRGBColorSpace
  applyAnisotropy(tex)
  return tex
}

/**
 * The shared ceiling-plaster PBR maps at the tier-resolved size, generated
 * once per size and cached (mirrors `getPlasterNormal`/`getPlasterRoughness`'s
 * shared-singleton shape — one texture set for every un-finished ceiling in
 * the flat, not one per tile).
 */
export function getCeilingPlasterMaps(): CeilingPlasterMaps {
  const size = effectiveCeilingPlasterSize(getProceduralBaseSize())
  const hit = cache.get(size)
  if (hit) return hit
  const seed = hashSeed('ceiling-plaster:shared')
  const base = hexToRgb(CEILING_PLASTER_COLOR)
  const f = ceilingPlasterFields(base, seed, size)
  const albedo = toTexture(size, f.albedo, true)
  const normal = toTexture(size, heightToNormalRGBA(f.height, size, f.normalStrength), false)
  const roughData = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const r = Math.round(clamp01(f.rough[i]) * 255)
    roughData[i * 4] = roughData[i * 4 + 1] = roughData[i * 4 + 2] = r
    roughData[i * 4 + 3] = 255
  }
  const roughness = toTexture(size, roughData, false)
  const maps: CeilingPlasterMaps = { albedo, normal, roughness }
  cache.set(size, maps)
  return maps
}
