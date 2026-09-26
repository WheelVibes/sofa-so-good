/**
 * WET-GLASS — the two textures, built once per session and SHARED by every pane.
 *
 * ## Two maps, two jobs, one of them moving
 *
 * | slot | content | moves? |
 * | --- | --- | --- |
 * | `normalMap` | the pinned bead field ({@link dropletField.beadField}) | never |
 * | `roughnessMap` | the runnel tracks ({@link dropletField.runnelField}) | scrolls downward |
 *
 * **The runnels are a ROUGHNESS map, not a second normal map, and that is the whole trick.** On a
 * pane the visible signature of a runnel is not its relief — it is that the water has *cleaned a
 * path*: the rest of the glass hazes over and you can see sharply through where a drop has run.
 * That is the mechanic the canonical procedural rain shader is built on (Martijn Steinrucken's
 * "Heartfelt", Shadertoy 2017, https://www.shadertoy.com/view/ltffzl — fogged glass with drops that
 * cut trails through the fog), and here it is nearly free: three multiplies `material.roughness` by
 * the map's GREEN channel, and on the transmission tier roughness IS the blur of the view behind
 * the glass, so a dark green value re-sharpens the view along the track without touching anything
 * else. Using a second normal map instead would have needed the `clearcoatNormalMap` slot, and
 * `wetGlass.ts` records why a clearcoat is not affordable here.
 *
 * ## One SOURCE, a clone per pane — which costs no VRAM, and that was checked rather than assumed
 *
 * Each pane needs its own `repeat`, so a 3 mm drop is 3 mm on a 0.6 m toilet window and on a 2.4 m
 * living-room one. `repeat` lives on the `Texture`, not on the material, so that means one texture
 * object per pane.
 *
 * It does **not** mean one GPU upload per pane. three keys its `WebGLTexture` objects on
 * `texture.source` plus a cache key built from the SAMPLER state — wrap, filter, flip, anisotropy
 * (`WebGLTextures.initTexture` / `getTextureCacheKey` in `three@0.184`) — and `repeat`/`offset` are
 * neither: they are a per-material uniform (`normalMapTransform` / `roughnessMapTransform`, both
 * present in this build). A `Texture.clone()` shares `source` by reference and this module gives
 * every clone identical sampler state, so eight window panes share exactly two uploads and differ
 * only by a 3x3 matrix. Every pane's runnels therefore also scroll in step, which is correct — it
 * is the same rain.
 *
 * ## Resolution
 *
 * 256² for both. The tile covers `TILE_METRES` of real glass, so a texel is ~1 mm — the resolution
 * at which the smallest drop in the field is still a disc rather than a single texel, and the point
 * past which more texels only sharpen something the transmission pass is about to blur anyway. The
 * pair is ~512 kB of VRAM for the whole flat, however many windows it has.
 */
import { LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, Texture } from 'three'
import { beadField, runnelDroplets, runnelField } from './dropletField'
import { paintDropletNormals } from './wetGlassNormals'

/** Texture resolution for both maps. See the module doc for why 256 and not more. */
const WET_TEX_SIZE = 256

/**
 * How much real glass one tile of the droplet textures covers, in metres.
 *
 * 0.32 m puts `beadField`'s 90 drops at ~880 drops/m² and its radii (0.5–3.1 % of a tile) at
 * 3–20 mm across. That is larger than life on purpose — see `dropletField.ts:beadField` for the
 * legibility floor behind it (a physically-sized 4 mm drop is about ONE pixel from three metres
 * back) — and the DENSITY is the part that stays honest.
 *
 * **It started at 0.25 m and the frames moved it.** At 0.25 the beads were sub-pixel at the
 * `living-far` pose and read as speckle on the glass rather than as drops on it — a texture, which
 * is the one thing a droplet must not be. This is the whole tuning knob: it scales every drop and
 * every runnel together without touching the field's proportions.
 */
const TILE_METRES = 0.32

/**
 * Roughness multiplier inside a runnel track.
 *
 * `wetGlass.ts:FILM_ROUGHNESS` is 0.14, so 0.36 puts a track at 0.05 — exactly the pane's DRY
 * roughness (`materialRealism.ts:windowGlassPhysical`). The runnels are therefore not "smoother
 * than glass", which would be a lie; they are the glass, with the film wiped off. **Tied to
 * `FILM_ROUGHNESS` by that identity, not chosen independently** — move one and recompute the other.
 */
const TRACK_ROUGHNESS = 0.36

/** Soft edge on a track, as a fraction of the drop radius — a hard disc reads as a sticker. */
const TRACK_FEATHER = 0.35

let beadSource: Texture | null = null
let trackSource: Texture | null = null

function canvasFrom(paint: (data: Uint8ClampedArray, w: number, h: number) => void): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = WET_TEX_SIZE
  canvas.height = WET_TEX_SIZE
  const ctx = canvas.getContext('2d')
  const tex = new Texture(canvas)
  if (ctx) {
    const image = ctx.createImageData(WET_TEX_SIZE, WET_TEX_SIZE)
    paint(image.data, WET_TEX_SIZE, WET_TEX_SIZE)
    ctx.putImageData(image, 0, 0)
  }
  // Both maps are DATA, never colour: a normal map read through the sRGB transfer function is
  // wrong everywhere, and a roughness map is a linear multiplier. `Texture` defaults to
  // `NoColorSpace`, which is what both want -- stated here because the neighbouring backdrop
  // bakers all set `SRGBColorSpace` and the difference is silent.
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.magFilter = LinearFilter
  // Mipmapped, and that is not the default choice it looks like. In WALK mode the pane fills a
  // good part of the frame and a mipmap buys nothing; in ORBIT the same pane is a few dozen pixels
  // of a dollhouse with a `repeat` around 10, which is exactly the minification case an unmipmapped
  // droplet field SHIMMERS in as the camera turns. Two 256² mip chains are ~170 kB and one extra
  // upload pass, once per session.
  tex.minFilter = LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

/** Paint the runnel tracks as a GREEN-channel roughness multiplier. */
function paintTracks(data: Uint8ClampedArray, w: number, h: number): void {
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 255
    data[i * 4 + 1] = 255
    data[i * 4 + 2] = 255
    data[i * 4 + 3] = 255
  }
  const lo = Math.round(TRACK_ROUGHNESS * 255)
  for (const d of runnelDroplets(runnelField())) {
    const rx = d.r * w
    const ry = d.r * h
    const cx = d.cx * w
    const cy = d.cy * h
    const x0 = Math.max(0, Math.floor(cx - rx))
    const x1 = Math.min(w - 1, Math.ceil(cx + rx))
    const y0 = Math.max(0, Math.floor(cy - ry))
    const y1 = Math.min(h - 1, Math.ceil(cy + ry))
    for (let y = y0; y <= y1; y++) {
      const v = (y + 0.5 - cy) / ry
      for (let x = x0; x <= x1; x++) {
        const u = (x + 0.5 - cx) / rx
        const s = Math.sqrt(u * u + v * v)
        if (s >= 1) continue
        // 1 at the centre, 0 at the rim, over the outer `TRACK_FEATHER` of the radius.
        const k = Math.min(1, (1 - s) / TRACK_FEATHER)
        const val = Math.round(255 + (lo - 255) * k)
        const p = (y * w + x) * 4 + 1
        if (val < data[p]) data[p] = val
      }
    }
  }
}

/** The shared pinned-bead normal source. Built on first use. */
function beadNormalSource(): Texture {
  if (!beadSource) {
    const drops = beadField()
    beadSource = canvasFrom((data, w, h) => paintDropletNormals(data, w, h, drops))
  }
  return beadSource
}

/** The shared runnel-track roughness source. Built on first use. */
function runnelRoughnessSource(): Texture {
  if (!trackSource) trackSource = canvasFrom(paintTracks)
  return trackSource
}

export interface WetGlassMaps {
  /** Pinned beads, for `normalMap`. Never offset. */
  beads: Texture
  /** Runnel tracks, for `roughnessMap`. Its `offset.y` is what the animation advances. */
  tracks: Texture
}

/**
 * A pane-sized clone pair for a `width` x `height` metre pane.
 *
 * The caller owns the returned textures and must `dispose()` them when the pane unmounts or goes
 * dry; disposing a clone releases its cache-key entry without touching the shared `source`, so the
 * next pane still finds the upload warm.
 */
export function wetGlassMaps(width: number, height: number): WetGlassMaps {
  const rx = Math.max(1, (Number.isFinite(width) ? width : 1) / TILE_METRES)
  const ry = Math.max(1, (Number.isFinite(height) ? height : 1) / TILE_METRES)
  const beads = beadNormalSource().clone()
  const tracks = runnelRoughnessSource().clone()
  for (const t of [beads, tracks]) {
    t.repeat.set(rx, ry)
    t.needsUpdate = true
  }
  return { beads, tracks }
}
