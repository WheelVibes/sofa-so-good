/**
 * Tintable procedural micro-textures for furniture surfaces — a soft fabric
 * weave normal and a wood-grain albedo+normal. The greyscale/neutral maps are
 * generated once and shared; a MeshStandardMaterial is cached per (kind, tint)
 * so many pieces reuse the same GPU texture and only differ by colour.
 * Browser-only (canvas).
 */
import {
  CanvasTexture,
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three'
import { isFeatureEnabled } from '../features/featureFlags'
import type { RenderTier } from '../scene/quality'
import { applyAnisotropy } from './anisotropy'
import { anisotropyRotationForNormal, type Vec3 } from './brushAxis'
import { getBuiltMaterial } from './cache'
import {
  applianceFinish as applianceFinishLogic,
  hash01,
  liftedSheenRgb,
  sheenRough,
} from './furnitureMaterialLogic'
import { registerCappedMetal } from './iblSignal'
import { LruCache } from './materialLru'
import { clearcoatLayer, glassConfig, type SheenLayer, sheenLayer } from './materialRealism'
import { buildBrushedMetalFields, DEFAULT_BRUSH_PARAMS } from './procedural/metalBrush'
import { clamp01, heightToNormalRGBA, hexToRgb, makeFbm } from './procedural/noise'
import { DEFAULT_STONE_SURFACE_PARAMS, makeRoughDrift } from './procedural/stoneSurface'
import { buildUpholsteryHeight, DEFAULT_SEAM_PARAMS } from './procedural/upholsterySeams'
import { makeWoodPore } from './procedural/woodPore'

/** A furniture finish that points at a catalog/DLC material is encoded as
 *  `mat:<materialId>`. The material itself is built (from its procedural
 *  generator or its downloaded CC0 PBR textures) by FurnitureMaterialLoader
 *  into the shared cache under this furniture-scoped id. */
export const FURNITURE_MAT_PREFIX = 'mat:'
export const furnitureMaterialCacheId = (materialId: string) => `furn:${materialId}`
export function parseFurnitureMaterialFinish(finish: string): string | null {
  return finish.startsWith(FURNITURE_MAT_PREFIX) ? finish.slice(FURNITURE_MAT_PREFIX.length) : null
}

const N = 256

function canvasFrom(data: Uint8ClampedArray): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = N
  c.height = N
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(N, N)
  img.data.set(data)
  ctx.putImageData(img, 0, 0)
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  applyAnisotropy(t)
  return t
}

let fabricNormal: Texture | null = null
function getFabricNormal(): Texture {
  if (fabricNormal) return fabricNormal
  // PR6: a perfectly regular sin-grid reads synthetic. RZ6: on top of the warped
  // weave + slubs, add a soft fabric wrinkle (broad gathered creases) and faint
  // seam stitching (panel-edge channels + topstitch) so upholstery reads as real
  // sewn cloth, not a flat plastic shell. The richer height field lives in the
  // dedicated `upholsterySeams` generator (pure + unit-tested). Off → legacy
  // clean grid (still a normal map, so even Performance never reads dead-flat).
  const richWeave = isFeatureEnabled('pbrSurfaces')
  if (richWeave) {
    const height = buildUpholsteryHeight(N, 0x4242, DEFAULT_SEAM_PARAMS)
    // Gentler bump than the legacy weave: the richer field already carries the
    // seam + wrinkle relief, so a softer strength keeps light upholstery from
    // reading as a loud waffle.
    fabricNormal = canvasFrom(heightToNormalRGBA(height, N, 2.0))
    return fabricNormal
  }
  const fine = makeFbm(4242, 4, 120)
  const height = new Float32Array(N * N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N
      const v = y / N
      // Soft over/under weave: a fine grid modulated by noise.
      const weave = 0.5 + 0.5 * Math.sin(x * 0.9) * Math.sin(y * 0.9)
      height[y * N + x] = weave * 0.6 + fine(u, v) * 0.4
    }
  }
  fabricNormal = canvasFrom(heightToNormalRGBA(height, N, 2.2))
  return fabricNormal
}

let woodMaps: { albedo: Texture; normal: Texture; rough: Texture } | null = null
/**
 * Sideways meander of the furniture wood's growth rings, in u-units (WOOD-BANDS).
 *
 * Wave 4A calmed this wood by cutting the rings 11 -> 7 and the waver 0.25 -> 0.12, and
 * `FURNITURE_WOOD_COARSEN` halves the repeat so the grain does not squish into a busy
 * watermark on a tall panel. Those two together left each ring VERY wide — and at 0.12 the
 * waver still shifted a ring by ~0.84 of a half-cycle (0.12 x 7), nearly a whole band, while
 * varying with `v`. A wide band that snakes almost a full band-width as it rises does not
 * read as figure; it reads as a hard zigzag CHEVRON repeating identically across every
 * panel — printed wallpaper, not timber. On the default main-bedroom wardrobe that was the
 * most obviously synthetic surface left in the flat once WOOD-GLOSS fixed the shine, and it
 * is the same "zebra moiré" SNV-BOARDS warns about, reached from the other direction.
 *
 * A sawn board's rings run essentially PARALLEL; the figure comes from ring spacing and
 * latewood contrast, not from lateral wander. So the meander is cut rather than the ring
 * count (raising the count would undo Wave 4A's fix for the busy watermark) and rather than
 * the coarsen factor (FURNITURE-WOOD-SCALE, settled across all 21 defs).
 *
 * FLOORS ARE UNAFFECTED: this painter serves the furniture `wood` finish only — the floor
 * uses the separate `woodFields` painter in `procedural/patterns/wood.ts`.
 */
export const FURNITURE_WOOD_WAVER = 0.04

function getWoodMaps(): { albedo: Texture; normal: Texture; rough: Texture } {
  if (woodMaps) return woodMaps
  // Layered noise: low-freq warp bends the growth rings into cathedral
  // arches; mid-freq carries figure; high-freq scratches the surface and
  // draws open pores along the grain.
  const warpN = makeFbm(7777, 4, 3)
  const figureN = makeFbm(0x51ed, 4, 8)
  // Pores: high frequency across the grain, very low along it → fine streaks
  // that run lengthwise (the v axis) instead of an isotropic speckle. The field
  // lives in the pure `woodPore.ts` because its frequency has to stay inside the
  // 256² tile's Nyquist limit and that is easy to get catastrophically wrong:
  // the original `makeFbm(0x2c7a, 3, 48)` sampled at `u * 18` put even its
  // COARSEST octave at 3.4 cycles per texel, so it baked white noise instead of
  // hairlines and every wood surface read as pebbly moulded plastic
  // (WOOD-PORE-NYQUIST).
  const poreN = makeWoodPore()
  const albedo = new Uint8ClampedArray(N * N * 4)
  const height = new Float32Array(N * N)
  const rough = new Uint8ClampedArray(N * N * 4)
  // PR6: lay the grain out as discrete planks — each with its own value tone,
  // grain phase + a darker groove at the seam — so a tiled top reads as real
  // boards instead of one uniform sheet. Off → the legacy single-sheet grain.
  const planked = isFeatureEnabled('pbrSurfaces')
  const PLANKS = 3
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N
      const v = y / N
      // Per-plank: index across u, a value offset, a grain-phase shift so the
      // figure doesn't line up across boards, and a seam groove at the edges.
      let plankTone = 0
      let groove = 0
      let phase = 0
      if (planked) {
        const pp = u * PLANKS
        const idx = Math.floor(pp)
        const frac = pp - idx
        plankTone = (hash01(idx * 1.7 + 0.3) - 0.5) * 0.16 // ±0.08 board-to-board
        phase = hash01(idx * 3.1 + 1.2) * 0.9 // de-align grain across boards
        const edge = Math.min(frac, 1 - frac)
        groove = edge < 0.012 ? (1 - edge / 0.012) * 0.6 : 0
      }
      // Straight grain running along v, with only a slight lengthwise waver so
      // the lines stay parallel (clean sawn board, not a knotty burl).
      // Wave 4A: this furniture-only wood (the `wood` finish token; the FLOOR
      // uses the separate `woodFields` painter) read as a busy wavy watermark —
      // worst on dark tints (tv-console/crib). Fewer, calmer, straighter grain
      // lines (waver 0.25→0.12, 11→7 rings) and a shallower latewood darkening
      // (so a dark tint keeps its value range instead of crushing to near-black).
      const waver = (warpN(u * 0.6, v * 2.5) - 0.5) * FURNITURE_WOOD_WAVER
      const ring = (u + waver + phase) * Math.PI * 7
      // Latewood lines: sharp dark bands where the ring turns over. Raising
      // the sine to a power tightens the dark line so earlywood stays pale.
      const s = Math.abs(Math.sin(ring))
      const late = s ** 4 // 0 earlywood … 1 dark latewood line
      // Long open pores streaking along the grain (sampled wide in u, narrow
      // in v so the noise smears into lengthwise hairlines, not dots).
      const pore = poreN(u, v)
      const figure = (figureN(u * 1.2, v * 3) - 0.5) * 0.05
      // White-ish luminance so material.color tints it into real wood; the
      // latewood lines, pores, per-board tone + seam grooves darken it. The
      // grain-darkening terms are held gentle (late 0.3→0.2, groove 0.45→0.34)
      // so a dark-stained board keeps a plausible tonal range.
      const lum = clamp01(0.99 + plankTone - late * 0.2 - pore * 0.1 + figure - groove * 0.34)
      const i = y * N + x
      const c = Math.round(lum * 255)
      albedo[i * 4] = c
      albedo[i * 4 + 1] = c
      albedo[i * 4 + 2] = c
      albedo[i * 4 + 3] = 255
      // Pores + latewood + seam grooves sit slightly recessed for a tactile
      // normal (latewood relief eased with the albedo so it doesn't emboss).
      height[i] = late * 0.32 + pore * 0.4 + figure + groove * 0.8
      // Open pores and latewood scatter more (rougher); earlywood is smoother.
      const r = clamp01(0.4 + late * 0.24 + pore * 0.2)
      const rc = Math.round(r * 255)
      rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = rc
      rough[i * 4 + 3] = 255
    }
  }
  const a = canvasFrom(albedo)
  // Albedo is a colour map → sRGB (the other albedo maps in this file all tag it;
  // wood was missing it, rendering its grain with linear-instead-of-sRGB gamma).
  // The normal + roughness maps stay linear (the CanvasTexture default).
  a.colorSpace = SRGBColorSpace
  const n = canvasFrom(heightToNormalRGBA(height, N, 3))
  const rg = canvasFrom(rough)
  woodMaps = { albedo: a, normal: n, rough: rg }
  return woodMaps
}

// ---- Stone / marble -------------------------------------------------------
// Turbulent veins on a pale ground. Like wood, the albedo is near-white
// luminance so the material colour tints it (white marble, green, etc.).
let marbleMaps: { albedo: Texture; normal: Texture; rough: Texture | null } | null = null
function getMarbleMaps(): { albedo: Texture; normal: Texture; rough: Texture | null } {
  if (marbleMaps) return marbleMaps
  const baseN = makeFbm(0x5a17, 5, 4)
  const veinWarp = makeFbm(0x7d31, 4, 6)
  const grime = makeFbm(0x1133, 4, 20)
  // PR6: broad low-freq tonal clouding so a slab isn't a uniform white field
  // between veins (real stone has soft light/dark drifts). Tint-preserving.
  const pbr = isFeatureEnabled('pbrSurfaces')
  const cloudN = pbr ? makeFbm(0x2f6b, 4, 2.2) : null
  // MAT-001 — polished roughness drift: a broad low-freq variation so the slab
  // isn't a dead-uniform mirror (glossier/honed patches). Gated behind
  // `pbrSurfaces` exactly like the cloud clouding above; off → no rough map (the
  // legacy uniform `roughness` scalar). The drift only ever makes patches a
  // touch GLOSSIER than the base (encoded as a 0..1 roughness multiplier ≤ 1),
  // so it never regresses the polished baseline to matte.
  const drift = pbr ? makeRoughDrift(0x5a17, DEFAULT_STONE_SURFACE_PARAMS.roughDrift) : null
  const albedo = new Uint8ClampedArray(N * N * 4)
  const height = new Float32Array(N * N)
  const roughData = drift ? new Uint8ClampedArray(N * N * 4) : null
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N
      const v = y / N
      // A directional coordinate warped by turbulence; veins fall where the
      // warped sine crosses zero, giving thin meandering cracks.
      const warp = (veinWarp(u * 2, v * 2) - 0.5) * 2.2
      const field = Math.sin((u * 2.2 + v * 0.6 + warp) * Math.PI * 2.5)
      const vein = clamp01(1 - Math.abs(field) * 7) // thin ridge near 0
      // Secondary fainter vein network at a different angle.
      const warp2 = (baseN(u * 3 + 4, v * 3) - 0.5) * 2.5
      const field2 = Math.sin((v * 1.8 - u * 0.4 + warp2) * Math.PI * 3.1)
      const vein2 = clamp01(1 - Math.abs(field2) * 11) * 0.5
      const mottle = (grime(u * 4, v * 4) - 0.5) * 0.06
      const cloud = cloudN ? (cloudN(u, v) - 0.5) * 0.1 : 0
      const lum = clamp01(0.97 - vein * 0.4 - vein2 * 0.22 + mottle + cloud)
      const i = y * N + x
      const c = Math.round(lum * 255)
      albedo[i * 4] = albedo[i * 4 + 1] = albedo[i * 4 + 2] = c
      albedo[i * 4 + 3] = 255
      // Vein normal-relief: the height follows BOTH visible vein networks, so the
      // baked normal catches light exactly where the albedo veins are (MAT-001
      // alignment; the existing relief — left as-is to avoid double-stacking).
      height[i] = vein * 0.4 + vein2 * 0.2
      if (roughData && drift) {
        // Roughness multiplier (the material `roughness` scalar multiplies this
        // map's value). `drift` is signed (±~0.05); clamp the multiplier at 1 so
        // the drift only ever makes patches a touch glossier than the polished
        // base — never matter. Linear roughness map (no sRGB tag).
        const rc = Math.round(clamp01(1 + drift(u, v)) * 255)
        roughData[i * 4] = roughData[i * 4 + 1] = roughData[i * 4 + 2] = rc
        roughData[i * 4 + 3] = 255
      }
    }
  }
  const a = canvasFrom(albedo)
  a.colorSpace = SRGBColorSpace
  const n = canvasFrom(heightToNormalRGBA(height, N, 1.6))
  const rough = roughData ? canvasFrom(roughData) : null
  marbleMaps = { albedo: a, normal: n, rough }
  return marbleMaps
}

/** Environment-map reflection strength for the glossy upholstery / stone /
 *  lacquer finishes. >1 makes them catch more of the IBL probe so marble,
 *  leather, velvet and clearcoated surfaces read premium + photographic (vs the
 *  flat default of 1). Matte finishes keep the default — extra reflection would
 *  only muddy them. The IBL itself is only present from the Medium tier up, so
 *  this is free on Performance and never regresses the flat default. */
export const GLOSSY_ENV_INTENSITY = 1.3

/** Polished stone / marble material tinted to `color` (near-white veins on a
 *  tinted ground). Low roughness + faint metalness give a polished sheen;
 *  `rough` overrides for honed/matte stone. */
export function getStoneMaterial(color: string, repeat = 1, rough = 0.12): MeshStandardMaterial {
  const key = `stone:${color}:${repeat}:${rough.toFixed(2)}`
  const hit = cache.get(key)
  if (hit) return hit
  const maps = getMarbleMaps()
  const map = own(applyAnisotropy(maps.albedo.clone()))
  const normal = own(applyAnisotropy(maps.normal.clone()))
  map.repeat.set(repeat, repeat)
  normal.repeat.set(repeat, repeat)
  map.needsUpdate = normal.needsUpdate = true
  // MAT-001 — polished roughness drift map (present only under `pbrSurfaces`).
  const roughnessMap = maps.rough ? own(applyAnisotropy(maps.rough.clone())) : null
  if (roughnessMap) {
    roughnessMap.repeat.set(repeat, repeat)
    roughnessMap.needsUpdate = true
  }
  const [r, g, b] = hexToRgb(color)
  const m = new MeshPhysicalMaterial({
    color: `rgb(${r},${g},${b})`,
    roughness: rough,
    metalness: 0.04,
    map,
    normalMap: normal,
    roughnessMap,
    envMapIntensity: GLOSSY_ENV_INTENSITY,
  })
  m.normalScale.set(0.3, 0.3)
  // Polished stone reads wet/lacquered under a faint clearcoat film.
  const coat = clearcoatLayer('stone')
  if (coat) {
    m.clearcoat = coat.clearcoat
    m.clearcoatRoughness = coat.clearcoatRoughness
  }
  cache.set(key, m)
  return m
}

// Polished / micro-cement concrete: a near-uniform grey ground carrying a faint
// cloudy mottle and sparse darker aggregate specks, over a fine-pore normal — the
// matte industrial look for worktops, table tops and cabinet carcasses.
let concreteMaps: { albedo: CanvasTexture; normal: CanvasTexture } | null = null
function getConcreteMaps(): { albedo: CanvasTexture; normal: CanvasTexture } {
  if (concreteMaps) return concreteMaps
  const cloud = makeFbm(0x3c0f, 5, 5)
  const speck = makeFbm(0x71b3, 4, 80)
  const pore = makeFbm(0x4d29, 4, 64)
  const albedo = new Uint8ClampedArray(N * N * 4)
  const height = new Float32Array(N * N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N
      const v = y / N
      const i = y * N + x
      // Broad tonal clouds + faint fine grain → a luminance the colour tints.
      const mottle = (cloud(u, v) - 0.5) * 0.12 + (pore(u, v) - 0.5) * 0.04
      const sp = speck(u, v)
      const spot = sp > 0.82 ? -(sp - 0.82) * 1.4 : 0 // sparse dark aggregate
      const lum = clamp01(0.86 + mottle + spot)
      const c = Math.round(lum * 255)
      albedo[i * 4] = albedo[i * 4 + 1] = albedo[i * 4 + 2] = c
      albedo[i * 4 + 3] = 255
      // Shallow surface relief: fine pores + the odd deeper pit at a speck.
      height[i] = clamp01(pore(u, v) * 0.5 + (sp > 0.86 ? 0.5 : 0))
    }
  }
  const a = canvasFrom(albedo)
  a.colorSpace = SRGBColorSpace
  const n = canvasFrom(heightToNormalRGBA(height, N, 1.1))
  concreteMaps = { albedo: a, normal: n }
  return concreteMaps
}

/** Matte concrete / micro-cement tinted to `color` (defaults to a neutral grey
 *  at the call site). High roughness, no sheen; `repeat` tiles to the piece. */
export function getConcreteMaterial(color: string, repeat = 1, rough = 0.85): MeshStandardMaterial {
  const key = `concrete:${color}:${repeat}:${rough.toFixed(2)}`
  const hit = cache.get(key)
  if (hit) return hit
  const maps = getConcreteMaps()
  const map = own(applyAnisotropy(maps.albedo.clone()))
  const normal = own(applyAnisotropy(maps.normal.clone()))
  map.repeat.set(repeat, repeat)
  normal.repeat.set(repeat, repeat)
  map.needsUpdate = normal.needsUpdate = true
  const [r, g, b] = hexToRgb(color)
  const m = new MeshStandardMaterial({
    color: `rgb(${r},${g},${b})`,
    roughness: rough,
    metalness: 0,
    map,
    normalMap: normal,
  })
  m.normalScale.set(0.4, 0.4)
  cache.set(key, m)
  return m
}

// Painted / laminate micro-texture: a very faint orange-peel + roller stipple so
// a matte painted panel catches grazing light instead of reading as dead-flat
// plastic. One shared, subtle normal (PR6).
let paintNormal: Texture | null = null
function getPaintNormal(): Texture {
  if (paintNormal) return paintNormal
  const peel = makeFbm(0x4ab1, 4, 26) // broad orange-peel undulation
  const stipple = makeFbm(0x77c5, 3, 110) // fine roller stipple
  const height = new Float32Array(N * N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N
      const v = y / N
      height[y * N + x] = (peel(u, v) - 0.5) * 0.6 + (stipple(u, v) - 0.5) * 0.4
    }
  }
  // Low strength — paint relief is subtle; just enough to break specular.
  paintNormal = canvasFrom(heightToNormalRGBA(height, N, 0.5))
  return paintNormal
}

let leatherNormal: Texture | null = null
function getLeatherNormal(): Texture {
  if (leatherNormal) return leatherNormal
  // Fine pebbled grain (small cells) for a leather hide look.
  const coarse = makeFbm(0x1ea7, 4, 18)
  const fine = makeFbm(0x9a13, 3, 60)
  const height = new Float32Array(N * N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N
      const v = y / N
      height[y * N + x] = coarse(u, v) * 0.6 + fine(u, v) * 0.4
    }
  }
  leatherNormal = canvasFrom(heightToNormalRGBA(height, N, 1.4))
  return leatherNormal
}

// PR6: leather had a pebble normal but a flat tint — real hide has tonal
// mottle + faint creases/burnish. A near-white greyscale albedo (so the
// material colour still tints it) carrying broad mottle + a few darker creases.
let leatherAlbedo: Texture | null = null
function getLeatherAlbedo(): Texture {
  if (leatherAlbedo) return leatherAlbedo
  const mottle = makeFbm(0x3b9c, 4, 7) // broad hide tone variation
  const grain = makeFbm(0x1ea7, 4, 18) // align faint shading with the pebble
  const crease = makeFbm(0x6f22, 3, 4) // long creases / burnish bands
  const data = new Uint8ClampedArray(N * N * 4)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N
      const v = y / N
      // Creases: where the warped sine is near zero → a darker fold line.
      const cf = Math.sin((u * 1.6 + v * 0.5 + (crease(u, v) - 0.5) * 2.4) * Math.PI * 2.2)
      const fold = clamp01(1 - Math.abs(cf) * 9) * 0.16
      const lum = clamp01(0.96 + (mottle(u, v) - 0.5) * 0.14 - (grain(u, v) - 0.5) * 0.06 - fold)
      const i = (y * N + x) * 4
      const c = Math.round(lum * 255)
      data[i] = data[i + 1] = data[i + 2] = c
      data[i + 3] = 255
    }
  }
  const t = canvasFrom(data)
  t.colorSpace = SRGBColorSpace
  leatherAlbedo = t
  return leatherAlbedo
}

// Velvet pile (PR6): smooth, dense pile — NOT a woven grid (so it must not reuse
// the slubby fabric weave). A very fine isotropic nap normal + a faint low-freq
// albedo clumping so the sheen lobe varies across the pile like real velvet.
let velvetMaps: { albedo: Texture; normal: Texture } | null = null
function getVelvetMaps(): { albedo: Texture; normal: Texture } {
  if (velvetMaps) return velvetMaps
  const nap = makeFbm(0x5e1d, 4, 150) // dense fine pile
  const clump = makeFbm(0x2a44, 3, 7) // soft directional clumping
  const height = new Float32Array(N * N)
  const albedo = new Uint8ClampedArray(N * N * 4)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N
      const v = y / N
      height[y * N + x] = nap(u, v) * 0.7 + clump(u, v) * 0.3
      // Pile clumping subtly lightens/darkens the body so the sheen reads uneven.
      const lum = clamp01(0.95 + (clump(u, v) - 0.5) * 0.12)
      const i = (y * N + x) * 4
      const c = Math.round(lum * 255)
      albedo[i] = albedo[i + 1] = albedo[i + 2] = c
      albedo[i + 3] = 255
    }
  }
  const a = canvasFrom(albedo)
  a.colorSpace = SRGBColorSpace
  velvetMaps = { albedo: a, normal: canvasFrom(heightToNormalRGBA(height, N, 0.8)) }
  return velvetMaps
}

// Tone-on-tone weave patterns: a near-white luminance albedo (so the
// material colour tints it) carrying striped or herringbone structure.
// Tone-on-tone weave patterns. Keyed by a fixed, finite set of pattern names
// (striped/checkered/plaid/dots/herringbone) so this never grows large in
// practice; a small LRU bound is a belt-and-braces guard that still disposes the
// CanvasTexture if a key ever leaves the cache (AUD-002).
const patternTex = new LruCache<Texture>({
  max: 16,
  dispose: (tex) => tex.dispose(),
})
function getPatternTexture(pattern: string): Texture {
  const hit = patternTex.get(pattern)
  if (hit) return hit
  const fine = makeFbm(0x2b1a, 3, 90)
  const data = new Uint8ClampedArray(N * N * 4)
  const band = 26 // px per stripe / herringbone block
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let lum: number
      if (pattern === 'striped') {
        // Soft vertical stripes, two tones close in value (tonal stripe).
        const s = Math.sin((x / band) * Math.PI)
        lum = 0.9 + 0.1 * (s > 0 ? 1 : -1) * 0.5
      } else if (pattern === 'checkered') {
        // Gingham-style check: overlapping light/dark in both axes.
        const cx = Math.floor(x / band) % 2
        const cy = Math.floor(y / band) % 2
        lum = cx && cy ? 0.8 : cx || cy ? 0.9 : 0.99
      } else if (pattern === 'plaid') {
        // Tartan: thin darker lines crossing a lighter ground.
        const vx = x % band < 3 || (x % (band * 2) < 6 && x % (band * 2) > 2)
        const vy = y % band < 3 || (y % (band * 2) < 6 && y % (band * 2) > 2)
        lum = vx && vy ? 0.78 : vx || vy ? 0.86 : 0.97
      } else if (pattern === 'dots') {
        // Regular polka dots: darker discs on a light ground.
        const cx = (x % band) - band / 2
        const cy = (y % band) - band / 2
        lum = Math.hypot(cx, cy) < band * 0.28 ? 0.82 : 0.97
      } else {
        // Herringbone: diagonals that flip direction every block row.
        const row = Math.floor(y / band)
        const dir = row % 2 === 0 ? 1 : -1
        const t = (((x + dir * y) % band) + band) % band
        lum = t < band / 2 ? 0.97 : 0.83
      }
      lum = clamp01(lum + (fine(x / N, y / N) - 0.5) * 0.05)
      const i = (y * N + x) * 4
      const c = Math.round(lum * 255)
      data[i] = data[i + 1] = data[i + 2] = c
      data[i + 3] = 255
    }
  }
  const tex = canvasFrom(data)
  tex.colorSpace = SRGBColorSpace
  patternTex.set(pattern, tex)
  return tex
}

// Textures a single cached material owns exclusively (clones + its own
// CanvasTextures). The disposer (AUD-002) disposes ONLY these on eviction —
// never the shared 256² singletons (fabric/leather/velvet/paint/rattan normals,
// the pattern textures), which many live materials reference. Disposing a shared
// singleton would corrupt every other material that uses it.
const OWNED_TEXTURES = new WeakSet<Texture>()

/** Tag a freshly-cloned / per-material texture as exclusively owned by the
 *  material about to be cached, so it is safe to dispose on eviction. Returns
 *  the texture for inline use. */
function own<T extends Texture>(tex: T): T {
  OWNED_TEXTURES.add(tex)
  return tex
}

/** Dispose an evicted cached material plus the textures it OWNS exclusively
 *  (mirrors `cache.ts:disposeCachedMaterial`, but skips shared singletons via
 *  the `OWNED_TEXTURES` tag). Called one frame after eviction by the LRU. */
function disposeOwnedMaterial(m: MeshStandardMaterial): void {
  for (const tex of [m.map, m.normalMap, m.roughnessMap, m.aoMap]) {
    if (tex && OWNED_TEXTURES.has(tex)) tex.dispose()
  }
  m.dispose()
}

// MeshPhysicalMaterial extends MeshStandardMaterial, so the cache holds both —
// callers still receive a real three `Material` and the `material=` contract
// (a MeshStandardMaterial instance) is preserved.
//
// AUD-002 — bounded LRU + dispose-on-evict. Keys embed free-hex colours, so
// without a bound this grows unboundedly and VRAM ratchets up over a session.
// MAX is far above any realistic count of *simultaneously on-screen* distinct
// materials (a furnished plan uses dozens, not hundreds), so the LRU entry being
// evicted is virtually certain to be orphaned — and the LRU defers the dispose
// one frame so any still-mounted mesh has unmounted first (see materialLru.ts).
const MATERIAL_CACHE_MAX = 256
const cache = new LruCache<MeshStandardMaterial>({
  max: MATERIAL_CACHE_MAX,
  dispose: disposeOwnedMaterial,
})

/** Test-only: current entry count of the main furniture material cache. */
export function __getMaterialCacheSizeForTest(): number {
  return cache.size
}

/** Lift a hex colour toward white by `amount` (0..1) for a sheen lobe that
 *  reads brighter than the cloth body — the hallmark of velvet / satin pile.
 *  The component lerp lives in the pure `liftedSheenRgb`; we only parse the hex
 *  into three's working (linear) RGB and write the lerped components back. */
function liftedSheenColor(color: string, amount: number): Color {
  const c = new Color(color)
  const [r, g, b] = liftedSheenRgb([c.r, c.g, c.b], amount)
  return c.setRGB(r, g, b)
}

/** Apply a fabric sheen layer to a physical material in place. Only velvet /
 *  satin-fabric / leather earn a sheen (see `sheenLayer`); matte finishes get
 *  none so they don't read plasticky. Cheap + IBL-driven, so free on
 *  Performance (no IBL) and never regresses the flat default. */
function applySheen(m: MeshPhysicalMaterial, color: string, layer: SheenLayer): void {
  m.sheen = layer.sheen
  m.sheenRoughness = layer.sheenRoughness
  m.sheenColor = liftedSheenColor(color, layer.sheenColorLift)
}

/** Soft-fabric material tinted to `color` (upholstery). `rough` overrides the
 *  natural roughness (for the shine control). */
export function getFabricMaterial(
  color: string,
  rough = 0.95,
  pattern = 'plain',
  /** Render both faces — for thin draped sheets (curtains) visible from inside
   *  the room AND through the window. Folded into the cache key; default
   *  FrontSide keeps every existing caller byte-identical. */
  doubleSided = false,
  /** <1 makes the cloth translucent (sheer curtains/blinds). Folded into the
   *  cache key; default 1 keeps every existing caller byte-identical. */
  opacity = 1,
  /**
   * Weave relief (`normalScale`), FOLDED INTO THE CACHE KEY (FABRIC-WEAVE-KEY).
   *
   * It has to be a parameter rather than a post-hoc mutation, because this cache
   * is shared across callers that want different relief: `getDraperyMaterial`
   * used to call this and then re-set `normalScale` on the returned instance,
   * with a comment claiming its `rough=0.98` key "never collides with cotton's
   * 0.95 or any other caller". That is true for LINEN and false for COTTON — a
   * cotton curtain and a woven-fabric sofa of the same colour and pattern both
   * key `fab:<color>:0.95:<pattern>`, so the drapery call stomped the sofa's
   * weave. It was invisible only because both wanted 0.65; raising the upholstery
   * default made it an order-dependent bug, so the mutation is gone.
   *
   * Default 1.3 (was 0.65): measured on the default flat's sofa
   * (`surface-detail.mjs DEF=sofa-3seat MASK=item`, walk/Medium/09:00), the weave
   * normal is the only responsive lever for "the panels read like moulded foam" —
   * microcontrast 1.346 / 2.115 / 2.879 / 3.829 at 0.65 / 1.3 / 2.0 / 3.0. At 1.3
   * the weave reads across the whole sofa as woven textile; at 2.0 it becomes a
   * regular grid that looks like mesh screen. SHEEN is NOT the lever: the entire
   * space (`sheen` 0 -> 1 x `sheenRoughness` 0.6 -> 0.2) moved microcontrast only
   * 1.24 -> 1.68, with `sheen = 0` sitting mid-range ABOVE the shipped 0.4/0.6 —
   * a broad sheen lobe fills in the weave's own shading rather than revealing it.
   */
  weave = 1.3,
): MeshStandardMaterial {
  const sheer = opacity < 1
  const key = `fab:${color}:${rough.toFixed(2)}:${pattern}${doubleSided ? ':2s' : ''}${sheer ? `:o${opacity.toFixed(2)}` : ''}:w${weave.toFixed(2)}`
  const hit = cache.get(key)
  if (hit) return hit
  const patterned =
    pattern === 'striped' ||
    pattern === 'herringbone' ||
    pattern === 'checkered' ||
    pattern === 'plaid' ||
    pattern === 'dots'
  const m = new MeshPhysicalMaterial({
    color,
    roughness: rough,
    metalness: 0,
    normalMap: getFabricNormal(),
    map: patterned ? getPatternTexture(pattern) : null,
    ...(doubleSided ? { side: DoubleSide } : {}),
    ...(sheer ? { transparent: true, opacity, depthWrite: false } : {}),
  })
  m.normalScale.set(weave, weave)
  const sheen = sheenLayer('fabric')
  if (sheen) applySheen(m, color, sheen)
  cache.set(key, m)
  return m
}

let boucleNormal: Texture | null = null
/** Shared nubby-loop bouclé normal (one 256² singleton, cloned + repeated per
 *  material). Dense rounded wool loops: a mid-frequency value-noise field
 *  rounded into raised blobs (the loops) with a finer fibre fuzz on top. */
function getBoucleNormal(): Texture {
  if (boucleNormal) return boucleNormal
  const blob = makeFbm(0x8ac1, 3, 34) // loop clusters
  const fibre = makeFbm(0x2f5e, 4, 96) // fine fibre fuzz
  const height = new Float32Array(N * N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N
      const v = y / N
      const b = clamp01(blob(u, v))
      // Smoothstep rounding turns the noise into bulging rounded loops (peaks
      // bulge proud, valleys flatten) — the pebbled bouclé surface.
      const loop = b * b * (3 - 2 * b)
      height[y * N + x] = loop * 0.82 + fibre(u, v) * 0.18
    }
  }
  boucleNormal = canvasFrom(heightToNormalRGBA(height, N, 3.6))
  return boucleNormal
}

/** Bouclé upholstery — the nubby looped-wool "quiet luxury" staple. A matte,
 *  low-metalness cloth carrying the dense rounded-loop normal (kept on ALL
 *  tiers — the nub relief IS the material's identity) with a faint wool sheen.
 *  `repeat` tiles the loop field denser than 1× so the nubs read small/dense on
 *  a large seat; cached per (color, rough, repeat). */
export function getBoucleMaterial(color: string, rough = 0.9, repeat = 4): MeshStandardMaterial {
  const r = Math.round(repeat * 100) / 100
  const key = `boucle:${color}:${rough.toFixed(2)}:${r}`
  const hit = cache.get(key)
  if (hit) return hit
  const normal = own(applyAnisotropy(getBoucleNormal().clone()))
  normal.repeat.set(r, r)
  normal.needsUpdate = true
  const m = new MeshPhysicalMaterial({
    color,
    roughness: rough,
    metalness: 0,
    normalMap: normal,
    envMapIntensity: GLOSSY_ENV_INTENSITY,
  })
  // Pronounced nub relief (deeper than a flat weave) so it reads clearly nubby.
  m.normalScale.set(1.0, 1.0)
  const sheen = sheenLayer('fabric')
  if (sheen) applySheen(m, color, sheen)
  cache.set(key, m)
  return m
}

/** Woven fabric with a diagonal two-colour gradient (ombre) albedo, tinted
 *  full-colour by the gradient itself. Shares the fabric weave normal. */
export function getGradientFabricMaterial(a: string, b: string): MeshStandardMaterial {
  const key = `grad:${a}:${b}`
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 64, 64)
  g.addColorStop(0, a)
  g.addColorStop(1, b)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = own(new CanvasTexture(c))
  tex.colorSpace = SRGBColorSpace
  applyAnisotropy(tex)
  const m = new MeshPhysicalMaterial({
    map: tex,
    roughness: 0.95,
    metalness: 0,
    normalMap: getFabricNormal(),
  })
  m.normalScale.set(0.65, 0.65)
  // Ombre cloth is woven fabric — give it the same satin sheen. The gradient
  // map carries the colour, so lift the sheen lobe off white.
  const sheen = sheenLayer('fabric')
  if (sheen) {
    m.sheen = sheen.sheen
    m.sheenRoughness = sheen.sheenRoughness
    m.sheenColor = new Color(0xffffff).multiplyScalar(0.85)
  }
  cache.set(key, m)
  return m
}

/** Flat two-colour diagonal gradient (no weave) — for prints / wall art. */
export function getGradientMaterial(a: string, b: string): MeshStandardMaterial {
  const key = `gradflat:${a}:${b}`
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 64, 64)
  g.addColorStop(0, a)
  g.addColorStop(1, b)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = own(new CanvasTexture(c))
  tex.colorSpace = SRGBColorSpace
  applyAnisotropy(tex)
  const m = new MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 })
  cache.set(key, m)
  return m
}

/** Two-colour art print for wall art: a crisp canvas pattern (vertical
 *  'stripes', a Mondrian-ish 'blocks' grid, or diagonal 'chevron') in colours
 *  a + b. Cached per (a, b, kind). */
export function getPrintMaterial(a: string, b: string, kind: string): MeshStandardMaterial {
  const key = `print:${a}:${b}:${kind}`
  const hit = cache.get(key)
  if (hit) return hit
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.fillStyle = a
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = b
  if (kind === 'stripes') {
    for (let i = 1; i < 6; i += 2) ctx.fillRect((i / 6) * S, 0, S / 6, S)
  } else if (kind === 'chevron') {
    const bandH = S / 5
    ctx.lineWidth = bandH * 0.5
    ctx.strokeStyle = b
    for (let y = -S; y < S * 2; y += bandH) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(S / 2, y + bandH)
      ctx.lineTo(S, y)
      ctx.stroke()
    }
  } else {
    // blocks: a few colour-blocked rectangles + tonal accents (abstract).
    const shade = (hex: string, f: number) => {
      const [r, g, bl] = hexToRgb(hex)
      return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(bl * f)})`
    }
    ctx.fillStyle = b
    ctx.fillRect(0, 0, S * 0.55, S * 0.6)
    ctx.fillStyle = shade(a, 0.7)
    ctx.fillRect(S * 0.55, 0, S * 0.45, S * 0.4)
    ctx.fillStyle = shade(b, 1.25)
    ctx.fillRect(S * 0.55, S * 0.4, S * 0.45, S * 0.6)
    ctx.fillStyle = shade(a, 1.15)
    ctx.fillRect(0, S * 0.6, S * 0.55, S * 0.4)
  }
  const tex = own(new CanvasTexture(c))
  tex.colorSpace = SRGBColorSpace
  applyAnisotropy(tex)
  const m = new MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0 })
  cache.set(key, m)
  return m
}

/** Smooth leather upholstery — pebbled grain, low roughness for a soft sheen. */
export function getLeatherMaterial(color: string, rough = 0.42): MeshStandardMaterial {
  const key = `leath:${color}:${rough.toFixed(2)}`
  const hit = cache.get(key)
  if (hit) return hit
  const m = new MeshPhysicalMaterial({
    color,
    roughness: rough,
    metalness: 0.06,
    map: isFeatureEnabled('pbrSurfaces') ? getLeatherAlbedo() : null,
    normalMap: getLeatherNormal(),
    envMapIntensity: GLOSSY_ENV_INTENSITY,
  })
  // Sharper pebbled grain so the hide texture reads under raking light.
  m.normalScale.set(0.5, 0.5)
  const sheen = sheenLayer('leather')
  if (sheen) applySheen(m, color, sheen)
  cache.set(key, m)
  return m
}

/** Velvet upholstery — soft pile (fine weave normal) with a pronounced sheen
 *  lobe (the hallmark of velvet) so it catches grazing light richly. */
export function getVelvetMaterial(
  color: string,
  rough = 0.62,
  /** Render both faces — for draped velvet curtains seen from inside + through
   *  the glass. Folded into the cache key; default FrontSide is byte-identical. */
  doubleSided = false,
): MeshStandardMaterial {
  const key = `velv:${color}:${rough.toFixed(2)}${doubleSided ? ':2s' : ''}`
  const hit = cache.get(key)
  if (hit) return hit
  // PR6: velvet gets its own smooth pile (own normal + faint albedo), not the
  // slubby woven-fabric normal; legacy path keeps the shared fabric normal.
  const rich = isFeatureEnabled('pbrSurfaces')
  const vm = rich ? getVelvetMaps() : null
  const m = new MeshPhysicalMaterial({
    color,
    roughness: rough,
    metalness: 0.02,
    map: vm?.albedo ?? null,
    normalMap: vm?.normal ?? getFabricNormal(),
    envMapIntensity: GLOSSY_ENV_INTENSITY,
    ...(doubleSided ? { side: DoubleSide } : {}),
  })
  m.normalScale.set(0.3, 0.3)
  const sheen = sheenLayer('velvet')
  if (sheen) applySheen(m, color, sheen)
  cache.set(key, m)
  return m
}

/** Dispatch upholstery material by finish kind ('fabric' | 'leather' |
 *  'velvet' | 'boucle'), tinted to `color`. `sheen` (0..1) tunes matte → glossy.
 *  `pattern` ('plain' | 'striped' | 'herringbone') applies a tone-on-tone
 *  weave to woven fabric only (leather/velvet ignore it). */
export function getUpholsteryMaterial(
  kind: string,
  color: string,
  sheen = 0,
  pattern = 'plain',
): MeshStandardMaterial {
  if (kind === 'leather')
    return getLeatherMaterial(color, sheen > 0 ? sheenRough(0.42, sheen) : 0.42)
  if (kind === 'velvet') return getVelvetMaterial(color, sheen > 0 ? sheenRough(0.62, sheen) : 0.62)
  if (kind === 'boucle') return getBoucleMaterial(color, sheen > 0 ? sheenRough(0.9, sheen) : 0.9)
  return getFabricMaterial(color, sheen > 0 ? sheenRough(0.95, sheen) : 0.95, pattern)
}

/**
 * Window-treatment fabric for curtains/blinds (CURTAIN-FABRIC). Restricted to
 * **fabric-only** weaves by design — drapery is cloth, so wood/stone/metal never
 * apply — while reusing the shared tone-on-tone `pattern` set (striped, plaid,
 * checkered, herringbone, dots). `kind` is the weave: `cotton` (default woven),
 * `linen` (matter, coarser), or `velvet` (sheen-rich pile; pattern ignored).
 * `opacity` (<1 = translucent) is the separate opacity/light-blocking axis (see
 * `draperyOpacity.ts`) — sheer cloth renders see-through. `doubleSided` for
 * draped curtains seen from both sides.
 */
export function getDraperyMaterial(
  kind: string,
  color: string,
  pattern = 'plain',
  doubleSided = false,
  opacity = 1,
): MeshStandardMaterial {
  // Velvet is a heavy opaque pile — always opaque (sheer velvet is nonsensical).
  if (kind === 'velvet') return getVelvetMaterial(color, 0.6, doubleSided)
  // cotton (default) | linen — linen reads a touch matter/coarser. (Legacy
  // `sheer` weave falls through to cotton; its translucency now comes from
  // `opacity`, set from the opacity level by the caller.)
  const linen = kind === 'linen'
  // Drapery keeps the calmer weave relief it was tuned with — curtains already
  // read as cloth from their folds and vertical gathers, and they occupy a large
  // share of the frame, so the upholstery's stronger 1.3 would be loud here.
  // Passed as a PARAMETER (folded into the cache key) rather than mutated onto the
  // returned instance: cotton's key collides with the woven-fabric upholstery of
  // the same colour/pattern, so the old post-hoc `normalScale.set` was stomping a
  // shared cached material. See FABRIC-WEAVE-KEY in `getFabricMaterial`.
  return getFabricMaterial(
    color,
    linen ? 0.98 : 0.95,
    pattern,
    doubleSided,
    opacity,
    linen ? 0.95 : 0.65,
  )
}

/** Flat painted material — matte by default, or glossy (lacquered) when
 *  `gloss` is set. `rough` overrides roughness (shine control). No grain, so
 *  it reads as a painted/laminate surface. */
export function getPaintedMaterial(
  color: string,
  gloss = false,
  rough?: number,
): MeshStandardMaterial {
  const r = rough ?? (gloss ? 0.16 : 0.72)
  const metal = gloss ? 0.1 : 0.0
  const key = `paint:${color}:${r.toFixed(2)}:${metal}`
  const hit = cache.get(key)
  if (hit) return hit
  // PR6: a faint shared paint micro-normal so painted/laminate panels aren't
  // dead-flat (the most common cabinet/bed/wardrobe finish). Subtle + shared, so
  // it costs nothing extra per piece.
  const micro = isFeatureEnabled('pbrSurfaces') ? getPaintNormal() : null
  // Lacquered (gloss) paint gets a thin clearcoat film so it reads as a
  // varnished/laminate sheen rather than flat plastic; matte paint stays a
  // plain MeshStandardMaterial (cheaper, and no coat to show).
  if (gloss) {
    const coat = clearcoatLayer('gloss')
    const g = new MeshPhysicalMaterial({
      color,
      roughness: r,
      metalness: metal,
      envMapIntensity: GLOSSY_ENV_INTENSITY,
      normalMap: micro,
    })
    if (micro) g.normalScale.set(0.35, 0.35)
    if (coat) {
      g.clearcoat = coat.clearcoat
      g.clearcoatRoughness = coat.clearcoatRoughness
    }
    cache.set(key, g)
    return g
  }
  const m = new MeshStandardMaterial({ color, roughness: r, metalness: metal, normalMap: micro })
  if (micro) m.normalScale.set(0.35, 0.35)
  cache.set(key, m)
  return m
}

/** Smooth vinyl / PVC laminate — the standard SG toilet/utility bifold-door
 *  finish: a slightly glossy, subtle plastic sheen (rougher than a lacquered
 *  `gloss` paint, smoother/flatter than matte `painted`), with no wood grain.
 *  Under `pbrSurfaces` it's a `MeshPhysicalMaterial` with a thin clearcoat film
 *  (reusing the shared paint micro-normal so it isn't dead-flat, same as
 *  {@link getPaintedMaterial}'s gloss branch, at a lighter clearcoat so vinyl
 *  reads less lacquered than gloss paint); with the flag off it's a plain
 *  `MeshStandardMaterial` at the same roughness/metalness (the legacy flat-tier
 *  look — no maps, no extra cost). Cached per colour. */
export function getVinylMaterial(color: string): MeshStandardMaterial {
  const rough = 0.35
  const metal = 0.05
  const key = `vinyl:${color}`
  const hit = cache.get(key)
  if (hit) return hit
  if (!isFeatureEnabled('pbrSurfaces')) {
    const m = new MeshStandardMaterial({ color, roughness: rough, metalness: metal })
    cache.set(key, m)
    return m
  }
  const micro = getPaintNormal()
  const coat = clearcoatLayer('gloss')
  const g = new MeshPhysicalMaterial({
    color,
    roughness: rough,
    metalness: metal,
    envMapIntensity: GLOSSY_ENV_INTENSITY,
    normalMap: micro,
  })
  g.normalScale.set(0.2, 0.2)
  if (coat) {
    // Lighter than gloss paint's own clearcoat — vinyl reads as a smooth
    // plastic sheet, not a wet-lacquered finish.
    g.clearcoat = coat.clearcoat * 0.55
    g.clearcoatRoughness = coat.clearcoatRoughness
  }
  cache.set(key, g)
  return g
}

/** Per-repeat variant cache: `furn:<id>:x<repeat>` → a clone of the base
 *  furniture material with `texture.repeat` overridden to `(repeat, repeat)`.
 *  Allows individual primitives to control tiling density at their natural
 *  scale (same as how `getWoodMaterial(color, repeat)` works for procedural
 *  wood).  Only allocated when `repeat` differs from 1 (the base). */
// AUD-002 — same bounded-LRU + owned-texture disposal as `cache`. Keyed per
// (mat id, repeat); the base material is cloned and its map/normal/rough textures
// are cloned per repeat (so all owned). Bound generously above any realistic
// simultaneous variant count.
const furnitureRepeatCache = new LruCache<MeshStandardMaterial>({
  max: 128,
  dispose: disposeOwnedMaterial,
})

/** Wave 4A — the shared `mat:floor-wood-*` oak/walnut/… grain is tuned for the
 *  FLOOR (a large world-UV tile, viewed from standing distance). Applied to
 *  furniture (per-face UVs, tall vertical panels seen up close) the same tile
 *  squishes into a busy wavy "cathedral"/watermark grain — worst on wardrobe/
 *  bookshelf doors. These two furniture-only knobs calm it WITHOUT touching the
 *  floor build (the floor never goes through `getFurnitureMatWithRepeat`):
 *   - coarsen the tile (fewer, wider boards + fewer grain bands per panel), and
 *   - soften the baked grain relief (a gentler normal scale). */
const FURNITURE_WOOD_COARSEN = 0.5
const FURNITURE_WOOD_NORMAL_SCALE = 0.24
/** Catalog wood materials are ided `floor-wood-<species>` (+ any `tint:`/`compose:`
 *  of one). Match on the `wood` token so every wood finish — but no stone/tile/
 *  concrete DLC — is coarsened. */
const FURNITURE_WOOD_MAT_RE = /wood/i

/** Return (or build) a variant of a furniture `mat:` material with `repeat`
 *  applied to all texture channels.  The base is cloned and each texture
 *  (`map`, `normalMap`, `roughnessMap`) is individually cloned + re-set so
 *  the shared base material is not mutated.  Cached per `(id, repeat)`. */
function getFurnitureMatWithRepeat(
  matId: string,
  base: MeshStandardMaterial,
  repeat: number,
  wood = false,
): MeshStandardMaterial {
  const key = `${furnitureMaterialCacheId(matId)}:x${repeat.toFixed(2)}${wood ? ':w' : ''}`
  const hit = furnitureRepeatCache.get(key)
  if (hit) return hit
  const m = base.clone()
  if (m.map) {
    m.map = own(applyAnisotropy(m.map.clone()))
    m.map.needsUpdate = true
    m.map.repeat.set(repeat, repeat)
  }
  if (m.normalMap) {
    m.normalMap = own(applyAnisotropy(m.normalMap.clone()))
    m.normalMap.needsUpdate = true
    m.normalMap.repeat.set(repeat, repeat)
  }
  if (m.roughnessMap) {
    m.roughnessMap = own(applyAnisotropy(m.roughnessMap.clone()))
    m.roughnessMap.needsUpdate = true
    m.roughnessMap.repeat.set(repeat, repeat)
  }
  // Soften the grain relief on furniture wood so the coarsened tile doesn't read
  // as an embossed watermark (floor keeps its own, stronger relief).
  if (wood) m.normalScale.set(FURNITURE_WOOD_NORMAL_SCALE, FURNITURE_WOOD_NORMAL_SCALE)
  furnitureRepeatCache.set(key, m)
  return m
}

/** Physical grain period for furniture wood: one texture tile spans this many
 *  metres of real panel. Chosen so the LARGEST carcass panels keep roughly the
 *  scale they already have (wardrobe body 0.70, bookshelf 1.10, TV console 1.13
 *  m/tile before this existed) while every smaller panel is pulled to match
 *  instead of shrinking with its own size. */
export const FURNITURE_GRAIN_METRES = 0.9

/** The `(repeatU, repeatV)` a panel of world size `w × h` needs so its texture
 *  lands at a fixed PHYSICAL period, rather than at one tile per face.
 *
 *  This is the whole point of the sized factory. A box face's UVs run 0→1 no
 *  matter how big the face is, so a single isotropic `repeat` gives every panel
 *  its own scale — measured on the default flat, one wardrobe material spanned
 *  0.005 → 1.050 m/tile, a 210× spread — and stretches each face by its own
 *  aspect ratio (a 0.437 × 1.99 m door: 0.218 across, 0.995 up, a 4.6:1 smear
 *  that NO isotropic repeat can undo, because the ratio is preserved by
 *  construction). Deriving u and v separately from world size fixes both.
 *
 *  Quantised to 0.05 so near-identical panels share one cached variant, and
 *  clamped to [0.05, 24] so a degenerate 1 mm edge cannot ask for a 900× tile.
 *  Non-finite / non-positive sizes fall back to 1. */
export function sizedRepeat(
  w: number,
  h: number,
  metresPerTile = FURNITURE_GRAIN_METRES,
): [number, number] {
  const mpt =
    Number.isFinite(metresPerTile) && metresPerTile > 0 ? metresPerTile : FURNITURE_GRAIN_METRES
  const one = (v: number): number => {
    if (!Number.isFinite(v) || v <= 0) return 1
    return Math.min(24, Math.max(0.05, Math.round((Math.abs(v) / mpt) * 20) / 20))
  }
  return [one(w), one(h)]
}

// AUD-002 — same bounded-LRU + owned-texture disposal as the other caches. Keyed
// per (kind, colour, sheen, repeatU, repeatV); every cloned texture is `own`ed.
const sizedCache = new LruCache<MeshStandardMaterial>({
  max: 256,
  dispose: disposeOwnedMaterial,
})

/** {@link getSurfaceMaterial}, but tiled to a fixed PHYSICAL grain period from
 *  the panel's real world size instead of a hand-picked scalar `repeat`.
 *
 *  Use this for any furniture panel whose size varies (carcass sides, doors,
 *  drawer fronts, shelves): it keeps one piece of furniture reading as ONE piece
 *  of wood. Finishes with no texture maps (painted / gloss) are returned
 *  unchanged — there is nothing to rescale. */
export function getSurfaceMaterialSized(
  kind: string,
  color: string,
  w: number,
  h: number,
  sheen = 0,
  metresPerTile = FURNITURE_GRAIN_METRES,
): MeshStandardMaterial {
  const base = getSurfaceMaterial(kind, color, 1, sheen)
  if (!base.map && !base.normalMap && !base.roughnessMap) return base
  const [ru, rv] = sizedRepeat(w, h, metresPerTile)
  const key = `sized:${kind}:${color}:${sheen.toFixed(2)}:${ru}x${rv}`
  const hit = sizedCache.get(key)
  if (hit) return hit
  const m = base.clone()
  if (m.map) {
    m.map = own(applyAnisotropy(m.map.clone()))
    m.map.needsUpdate = true
    m.map.repeat.set(ru, rv)
  }
  if (m.normalMap) {
    m.normalMap = own(applyAnisotropy(m.normalMap.clone()))
    m.normalMap.needsUpdate = true
    m.normalMap.repeat.set(ru, rv)
  }
  if (m.roughnessMap) {
    m.roughnessMap = own(applyAnisotropy(m.roughnessMap.clone()))
    m.roughnessMap.needsUpdate = true
    m.roughnessMap.repeat.set(ru, rv)
  }
  sizedCache.set(key, m)
  return m
}

/** {@link getSurfaceMaterialSized} for a BOX panel given its `[w, h, d]` args.
 *
 *  A box has three faces and one material, so the pair has to describe ONE of
 *  them; this picks the face a viewer actually reads. Three maps `u → x` on
 *  every face, and `v → y` on the four upright faces but `v → z` on the top and
 *  bottom. Taking `v` from `max(h, d)` therefore lands correctly on the upright
 *  face of a tall panel (h > d) AND on the top face of a horizontal one like a
 *  shelf or a worktop (d > h) — in both cases the large, visible face. The
 *  remaining thin edges are a few millimetres of end grain and are not what
 *  gives the piece away. */
export function getSurfaceMaterialForBox(
  kind: string,
  color: string,
  dims: readonly [number, number, number],
  sheen = 0,
  metresPerTile = FURNITURE_GRAIN_METRES,
): MeshStandardMaterial {
  const [w, h, d] = dims
  return getSurfaceMaterialSized(kind, color, w, Math.max(h, d), sheen, metresPerTile)
}

/** Dispatch a hard-surface material by finish kind ('wood' | 'painted' |
 *  'gloss'), tinted to `color`. `sheen` (0..1) tunes matte → glossy across all
 *  three. Wood keeps its grain; painted/gloss are flat.
 *
 *  When `kind` is a `mat:<id>` finish (a catalog/DLC material pre-built by
 *  `FurnitureMaterialLoader`), `repeat` is honoured the same way as for
 *  procedural wood: a per-`(id, repeat)` variant is cloned and cached so
 *  tiling density is consistent across different-sized furniture pieces. */
export function getSurfaceMaterial(
  kind: string,
  color: string,
  repeat = 1,
  sheen = 0,
): MeshStandardMaterial {
  // DLC / catalog material applied to furniture (`mat:<id>`). The loader builds
  // it into the cache once its (possibly downloaded) textures are ready; until
  // then fall back to a procedural wood so the piece always renders.
  const matId = parseFurnitureMaterialFinish(kind)
  if (matId) {
    // getBuiltMaterial, not getCachedMaterial: procedural materials cache under
    // a size-suffixed key, which a plain-id lookup would permanently miss.
    const built = getBuiltMaterial(furnitureMaterialCacheId(matId))
    if (built) {
      // Apply the primitive's repeat factor so tiling density is consistent
      // with procedural wood (`getWoodMaterial(color, repeat)`). The base
      // furniture material's texture already tiles at FURNITURE_UV (2×); when
      // a primitive requests a different repeat we serve a cached clone.
      const isWood = FURNITURE_WOOD_MAT_RE.test(matId)
      // Wave 4A: coarsen furniture wood so the floor-tuned grain doesn't squish
      // into a busy watermark on tall panels (floor-safe — see the constants).
      let r = Math.round(repeat * 100) / 100
      if (isWood) {
        r = Math.round(r * FURNITURE_WOOD_COARSEN * 100) / 100
        // Always serve the softened clone for wood (even at r≈1) so the calmer
        // normal scale + coarser tile apply.
        return getFurnitureMatWithRepeat(matId, built, r, true)
      }
      if (Math.abs(r - 1) < 0.005) return built
      return getFurnitureMatWithRepeat(matId, built, r)
    }
    return getWoodMaterial(
      color,
      repeat,
      sheen > 0 ? sheenRough(WOOD_BASE_ROUGHNESS, sheen) : WOOD_BASE_ROUGHNESS,
    )
  }
  if (kind === 'painted')
    return getPaintedMaterial(color, false, sheen > 0 ? sheenRough(0.72, sheen) : undefined)
  if (kind === 'gloss')
    return getPaintedMaterial(color, true, sheen > 0 ? sheenRough(0.16, sheen) : undefined)
  if (kind === 'marble' || kind === 'stone')
    return getStoneMaterial(color, repeat, sheen > 0 ? sheenRough(0.12, sheen) : 0.12)
  // Sintered stone (porcelain slab): dense, low-porosity — a satin polish, a
  // touch matter than a mirror-marble, over the shared stone veining.
  if (kind === 'sintered')
    return getStoneMaterial(color, repeat, sheen > 0 ? sheenRough(0.22, sheen) : 0.22)
  if (kind === 'rattan') return getRattanMaterial(color, repeat * 3)
  if (kind === 'concrete')
    return getConcreteMaterial(color, repeat, sheen > 0 ? sheenRough(0.85, sheen) : 0.85)
  if (kind === 'metal') return getMetalMaterial(color, 'satin', repeat)
  // Brushed gold/brass hardware finish — a canonical warm brass tone (like the
  // primitives that hardcode a brass tint), brushed via the dedicated preset.
  if (kind === 'brass') return getMetalMaterial('#b8923f', 'brushed-brass', repeat)
  return getWoodMaterial(
    color,
    repeat,
    sheen > 0 ? sheenRough(WOOD_BASE_ROUGHNESS, sheen) : WOOD_BASE_ROUGHNESS,
  )
}

/**
 * Base roughness for furniture wood (WOOD-GLOSS).
 *
 * This was **0.5**, which made timber GLOSSIER THAN PAINT in this very file (painted
 * 0.72, concrete 0.85, marble 0.12) — backwards for an oiled/satin finish, and the
 * specular lobe it produced was tight enough to turn the grain normal's low-frequency
 * waviness into mirror ribbons. On the default flat's dining table, seen from a walk
 * pose at 13:00, the top read as crumpled cling film over timber rather than wood: bright
 * wavy highlight bands with wobbling edges, repeated on the chair backs, the sideboard
 * and the TV console. That is the single most "rendered, not photographed" surface in the
 * default walk view, and it is what the "looks like animation" report was pointing at.
 *
 * Swept live over the 90 wood-signature materials in the scene at 0.5 / 0.7 / 0.85
 * (`scripts/dev-probes/walk-tour.mjs ROUGH=…`): 0.5 shows strong mirror ribbons, 0.7 still
 * carries them, and **0.85 removes them** — the grain survives as grain and the surface
 * reads as matte satin timber. 0.85 is the value that was measured, so it is the value
 * shipped; do not interpolate to a prettier-looking number without re-running the sweep.
 *
 * Applied at every wood site so a caller cannot silently reintroduce the old value: the
 * `getWoodMaterial` default AND the two `getSurfaceMaterial` wood branches, which used to
 * pass a hardcoded 0.5 and would otherwise win over the default.
 */
export const WOOD_BASE_ROUGHNESS = 0.85

/** Wood material whose grain is tinted by `color`. `repeat` tiles the grain
 *  (defaults suit a ~1 m piece). `rough` overrides roughness (shine control). */
export function getWoodMaterial(
  color: string,
  repeat = 1,
  rough = WOOD_BASE_ROUGHNESS,
): MeshStandardMaterial {
  const key = `wood:${color}:${repeat}:${rough.toFixed(2)}`
  const hit = cache.get(key)
  if (hit) return hit
  const maps = getWoodMaps()
  // Clone so per-repeat tiling doesn't clobber the shared source. Re-stamp the
  // anisotropy cap so the clone tracks a later device-max update too (RD-401).
  const map = own(applyAnisotropy(maps.albedo.clone()))
  const normal = own(applyAnisotropy(maps.normal.clone()))
  const roughMap = own(applyAnisotropy(maps.rough.clone()))
  map.repeat.set(repeat, repeat)
  normal.repeat.set(repeat, repeat)
  roughMap.repeat.set(repeat, repeat)
  map.needsUpdate = normal.needsUpdate = roughMap.needsUpdate = true
  const [r, g, b] = hexToRgb(color)
  const m = new MeshStandardMaterial({
    color: `rgb(${r},${g},${b})`,
    roughness: rough,
    metalness: 0.04,
    map,
    normalMap: normal,
    roughnessMap: roughMap,
  })
  // Grain relief — pores + latewood lines catch raking light. Kept moderate
  // (Wave 4A) so the calmer grain doesn't read as an embossed watermark.
  m.normalScale.set(0.45, 0.45)
  cache.set(key, m)
  return m
}

// Woven rattan / wicker: a coarse plain over-under weave. At each strand crossing
// the horizontal or vertical strand is "over" (raised) in a checker, giving the
// basketweave relief; fine noise adds organic fibre variation. One shared normal.
let rattanNormal: Texture | null = null
function getRattanNormal(): Texture {
  if (rattanNormal) return rattanNormal
  const strands = 11 // strands across the tile
  const period = N / strands
  const fine = makeFbm(0x9a7e, 3, 70)
  const height = new Float32Array(N * N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const col = Math.floor(x / period)
      const row = Math.floor(y / period)
      // Rounded ridge profile across each strand's width (cos: 1 at centre → 0 at gap).
      const hProf = Math.cos((((y % period) / period) * 2 - 1) * (Math.PI / 2))
      const vProf = Math.cos((((x % period) / period) * 2 - 1) * (Math.PI / 2))
      // Plain weave: alternate which strand sits over at each crossing.
      const horizOver = (col + row) % 2 === 0
      const over = horizOver ? hProf : vProf
      const under = horizOver ? vProf * 0.45 : hProf * 0.45
      const h = Math.max(over, under)
      height[y * N + x] = clamp01(h * 0.82 + fine(x / N, y / N) * 0.18)
    }
  }
  rattanNormal = canvasFrom(heightToNormalRGBA(height, N, 3.2))
  return rattanNormal
}

/** Woven rattan / wicker — a tan basketweave for outdoor furniture, baskets and
 *  light decor. Tinted by `color`; `repeat` tiles the weave to the piece size. */
export function getRattanMaterial(color: string, repeat = 3): MeshStandardMaterial {
  const key = `rattan:${color}:${repeat}`
  const hit = cache.get(key)
  if (hit) return hit
  const normal = own(applyAnisotropy(getRattanNormal().clone()))
  normal.repeat.set(repeat, repeat)
  normal.needsUpdate = true
  const [r, g, b] = hexToRgb(color)
  const m = new MeshStandardMaterial({
    color: `rgb(${r},${g},${b})`,
    roughness: 0.78,
    metalness: 0.02,
    normalMap: normal,
  })
  m.normalScale.set(0.85, 0.85)
  cache.set(key, m)
  return m
}

/** Cached plain solid material (metal pole, plastic body, etc.) so primitives
 *  can pass a real `Material` instance to a `material=` prop instead of a plain
 *  props object (which three.js silently ignores). */
export function getSolidMaterial(
  color: string,
  roughness: number,
  metalness: number,
): MeshStandardMaterial {
  // Same no-environment cap as getMetalMaterial: a highly metallic solid has no
  // diffuse term, so on the IBL-less Performance tier it renders black. Most
  // appliance bodies reach three through here (`applianceBodyMaterial` →
  // `applianceFinish` presets), not through the brushed-metal factory, so the
  // cap has to live in both. Non-metallic solids are untouched.
  //
  // IBL-CAP-LIVE: the key is the REQUESTED metalness and the cap is applied (and
  // re-applied on every later IBL change) by `registerCappedMetal`. Keying on the
  // capped value instead — as this did — both split one request into two cache
  // entries depending on boot order AND froze the cap at creation time, so a
  // material built at the `medium` boot tier kept metalness 0.75 after the
  // adaptive ladder demoted to `performance`.
  const key = `solid:${color}:${roughness.toFixed(2)}:${metalness.toFixed(2)}`
  const hit = cache.get(key)
  if (hit) return hit
  const m = registerCappedMetal(new MeshStandardMaterial({ color, roughness }), metalness)
  cache.set(key, m)
  return m
}

/**
 * Glass material tinted to `color`, tier-gated. On the High / Maximum render
 * tiers it is a real refractive `MeshPhysicalMaterial` (`transmission` + ior
 * 1.5 + thickness) so windows / glass table tops / cabinet + vase glass read as
 * true glass; on Performance / Medium it falls back to the cheap transparent +
 * opacity pane the inline primitives used, so the flat default never pays for
 * the transmission render pass. `opacity` is the legacy clarity (lower = clearer
 * → more transmission); `tint` (0..1) deepens the volume tint for coloured glass.
 *
 * Cached per (tier, color, opacity, tint) so panes share one GPU material.
 */
export function getGlassMaterial(
  tier: RenderTier,
  color = '#cfe0e6',
  opacity = 0.3,
  tint = 0,
): MeshPhysicalMaterial {
  const key = `glass:${tier}:${color}:${opacity.toFixed(2)}:${tint.toFixed(2)}`
  const hit = cache.get(key)
  if (hit) return hit as MeshPhysicalMaterial
  const { physical, cheap } = glassConfig(tier, opacity, tint)
  // Double-sided so a single-plane pane (shower screen) shows from both faces
  // and a box shell's inner walls read; harmless for solid glass boxes.
  const m = new MeshPhysicalMaterial({ color, side: DoubleSide })
  if (physical) {
    m.transmission = physical.transmission
    m.ior = physical.ior
    m.thickness = physical.thickness
    m.roughness = physical.roughness
    m.metalness = physical.metalness
    m.envMapIntensity = GLOSSY_ENV_INTENSITY
    // Transmission handles see-through; no alpha blending needed.
    m.transparent = false
  } else if (cheap) {
    m.transparent = cheap.transparent
    m.opacity = cheap.opacity
    m.roughness = cheap.roughness
    m.metalness = cheap.metalness
    // Fresnel rim + faint sky reflection so cheap glass still reads as glass
    // (RD-405). `envMapIntensity` only does anything where an IBL probe exists
    // (Medium); it's inert on the flat Performance tier.
    m.ior = cheap.ior
    m.envMapIntensity = cheap.envMapIntensity
  }
  cache.set(key, m)
  return m
}

/**
 * Surface-finish presets for hard appliance/fixture bodies. Returns plain
 * `meshStandardMaterial` props (roughness/metalness) to spread onto a mesh
 * material so the same painted/steel/gloss look is consistent across the
 * fridge, washer, oven, hood, microwave, etc. Colour is supplied separately.
 * The mapping itself lives in the pure `furnitureMaterialLogic` module; this
 * re-exports it so existing callers keep importing it from here.
 */
export const applianceFinish = applianceFinishLogic

// ---- Brushed / satin metal (MAT-004) -------------------------------------
//
// Appliance bodies (`applianceFinish('steel')`) were flat grey plastic — a
// scalar metalness/roughness with no directional brushing. `getMetalMaterial`
// upgrades the steel body to a real brushed-stainless / satin / black-steel
// look: a shared procedural brush normal + roughness-streak map (directional
// hairlines running along U, from the pure `metalBrush.ts` field) plus three.js
// `anisotropy` for the swept highlight. Tasteful, not chrome-mirror.
//
// Gated behind `pbrSurfaces` exactly like the other material micro-normals: when
// off, `getMetalMaterial` returns a plain `MeshStandardMaterial` carrying just
// the finish's metalness/roughness (the legacy `applianceFinish` look) so the
// flat Performance tier never pays for the brush maps and reads sensible.

/** The metal finishes a steel body / hardware can take. `stainless` is the
 *  bright brushed appliance default; `satin` is a softer, slightly rougher
 *  sheen; `black-steel` is the dark matte-stainless trend finish; `brushed-brass`
 *  is the warm brushed gold/brass hardware trend (mirrors `black-steel` — a
 *  finish preset, the gold body comes from the caller's warm tint, maps are
 *  tint-independent greyscale). */
export type MetalFinish = 'stainless' | 'satin' | 'black-steel' | 'brushed-brass'

/** Base metalness/roughness + brush intensity per finish. The brush maps tune
 *  the directional grain; `anisotropy` is the swept-highlight strength. */
function metalFinishPreset(finish: MetalFinish): {
  roughness: number
  metalness: number
  streak: number
  anisotropy: number
} {
  switch (finish) {
    case 'satin':
      // Softer satin: a touch rougher, a gentler sweep than bright stainless.
      return { roughness: 0.42, metalness: 0.85, streak: 0.4, anisotropy: 0.4 }
    case 'black-steel':
      // Dark matte stainless: matter, slightly stronger grain (reads on the dark
      // body), subtler highlight so it doesn't sparkle.
      return { roughness: 0.5, metalness: 0.82, streak: 0.55, anisotropy: 0.35 }
    case 'brushed-brass':
      // Warm brushed brass/gold hardware: fully metallic with a satin brushed
      // sheen (a touch glossier than satin steel) + a soft directional sweep.
      return { roughness: 0.36, metalness: 0.95, streak: 0.45, anisotropy: 0.45 }
    default: // 'stainless' — bright brushed appliance steel.
      return {
        roughness: 0.3,
        metalness: 0.9,
        streak: DEFAULT_BRUSH_PARAMS.streak,
        anisotropy: DEFAULT_BRUSH_PARAMS.anisotropy,
      }
  }
}

/** Shared brushed-metal maps (one 256² normal + roughness-streak singleton,
 *  built once and cloned per material). Present only under `pbrSurfaces` — the
 *  flat tier gets no maps (a plain metalness/roughness). The roughness map is a
 *  multiplier ≥ 1 (clamped) so the brush only ever scatters a touch MORE than
 *  the base — never glossier (no specular regression). */
let brushedMetalMaps: { normal: Texture; rough: Texture } | null = null
function getBrushedMetalMaps(streak: number): { normal: Texture; rough: Texture } {
  // One canonical brush (default streak) shared by every steel body — caching by
  // the singleton keeps all appliances on one GPU texture pair. The `streak`
  // arg only gates the build amplitude for the canonical map; per-finish streak
  // differences ride the material's `normalScale`/`anisotropy` so we never bake
  // a separate map per finish (instanced/shared, per the edge-case brief).
  if (brushedMetalMaps) return brushedMetalMaps
  const { height, rough } = buildBrushedMetalFields(N, 0x5712, {
    streak,
    anisotropy: DEFAULT_BRUSH_PARAMS.anisotropy,
  })
  const normal = canvasFrom(heightToNormalRGBA(height, N, 1.0))
  // Roughness map: the signed streak delta (±~0.06) encoded as a multiplier on
  // the material's base `roughness`. Centre on 1 so the mean roughness is
  // unchanged; the abraded grain scatters a touch more/less along the hairlines.
  const roughData = new Uint8ClampedArray(N * N * 4)
  for (let i = 0; i < N * N; i++) {
    const rc = Math.round(clamp01(1 + rough[i]) * 255)
    roughData[i * 4] = roughData[i * 4 + 1] = roughData[i * 4 + 2] = rc
    roughData[i * 4 + 3] = 255
  }
  // Normal + roughness stay LINEAR (the CanvasTexture default — no sRGB tag).
  brushedMetalMaps = { normal, rough: canvasFrom(roughData) }
  return brushedMetalMaps
}

/**
 * Brushed / satin / black-steel metal tinted to `color`, for appliance bodies
 * and metal furniture parts. `finish` picks the metalness/roughness + brush
 * intensity preset; `repeat` tiles the brush to the part size.
 *
 * Under `pbrSurfaces` it is a `MeshPhysicalMaterial` with the shared brush
 * normal + roughness-streak maps and three.js `anisotropy` (swept highlight).
 * With the flag off it is a plain `MeshStandardMaterial` carrying just the
 * finish's metalness/roughness (the legacy flat steel look — no maps, no extra
 * cost).
 *
 * BRUSH-AXIS: pass a face/mesh `normal` to orient the swept highlight along that
 * face's dominant in-plane axis (the pure `brushAxis.ts` resolver maps it to an
 * `anisotropyRotation`). Omit it (the default) and the sweep runs along the fixed
 * U brush direction (`anisotropyRotation = 0`) — byte-identical to before.
 *
 * Cached per `(finish, color, repeat, brushRotation)` so every steel body sharing
 * the same orientation shares one GPU material (don't rebuild per appliance).
 */
/**
 * Metalness ceiling on a tier with **no image-based lighting**.
 *
 * A fully metallic PBR surface has no diffuse term — everything it shows is
 * reflected environment. The Performance tier (the default) runs `ibl: false`,
 * so `scene.environment` is null and a `metalness: 0.9` appliance has literally
 * nothing to reflect: the fridge, stove and range hood rendered as flat BLACK
 * silhouettes despite their light stainless base colours (#d8dade / #cfd2d6),
 * which is what made the default kitchen read as a grey box (Chrome audit
 * 2026-08). Capping metalness there lets the base colour carry the look while
 * keeping a little sheen; Medium+ (IBL on) is untouched.
 */
// Moved to `iblSignal.ts` — shared with `cache.ts`'s scanned metalness-map path.

export function getMetalMaterial(
  color: string,
  finish: MetalFinish = 'stainless',
  repeat = 1,
  faceNormal?: Vec3 | null,
): MeshStandardMaterial {
  const r = Math.round(repeat * 100) / 100
  // BRUSH-AXIS: resolve the per-face brush rotation up front so it keys the cache
  // (distinct orientations are distinct materials). No normal → 0, the legacy U
  // axis, so the key + the material are unchanged from before.
  const rotation = anisotropyRotationForNormal(faceNormal)
  const rotKey = rotation === 0 ? '' : `:a${rotation.toFixed(4)}`
  // IBL-CAP-LIVE: the key no longer carries the IBL state. It used to (`:noibl`),
  // which handed a correctly-capped material to any NEW call after a tier change —
  // but a mesh already mounted keeps the material it was given, so the cap only
  // actually tracked the tier for consumers that re-render on it (i.e. the
  // subscribing `MetalMaterial` component, not the primitives that call this
  // factory directly). `registerCappedMetal` re-derives every registered
  // material's metalness whenever `setIblActive` fires, which makes the cap
  // correct for both paths and collapses the two cache entries back into one.
  const key = `metal:${finish}:${color}:${r}${rotKey}`
  const hit = cache.get(key)
  if (hit) return hit
  const preset = metalFinishPreset(finish)
  const pbr = isFeatureEnabled('pbrSurfaces')
  if (!pbr) {
    // Flat tier: legacy look — metalness/roughness only, no brush maps.
    const m = registerCappedMetal(
      new MeshStandardMaterial({
        color,
        roughness: preset.roughness,
        envMapIntensity: GLOSSY_ENV_INTENSITY,
      }),
      preset.metalness,
    )
    cache.set(key, m)
    return m
  }
  const maps = getBrushedMetalMaps(preset.streak)
  const normal = own(applyAnisotropy(maps.normal.clone()))
  const roughnessMap = own(applyAnisotropy(maps.rough.clone()))
  normal.repeat.set(r, r)
  roughnessMap.repeat.set(r, r)
  normal.needsUpdate = roughnessMap.needsUpdate = true
  const m = registerCappedMetal(
    new MeshPhysicalMaterial({
      color,
      roughness: preset.roughness,
      normalMap: normal,
      roughnessMap,
      envMapIntensity: GLOSSY_ENV_INTENSITY,
    }),
    preset.metalness,
  )
  // Subtle brush relief — a satin grain, not a scratched groove.
  m.normalScale.set(0.2, 0.2)
  // Swept anisotropic highlight. `anisotropyRotation` is 0 (the legacy fixed U
  // brush direction) unless a face `normal` was supplied (BRUSH-AXIS), in which
  // case the sweep is rotated to follow that face's dominant in-plane axis.
  m.anisotropy = preset.anisotropy
  m.anisotropyRotation = rotation
  cache.set(key, m)
  return m
}
