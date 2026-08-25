// Pack the extracted ambientCG corpus into an R2-ready material library.
//
// Emits the channels the runtime actually binds (`src/materials/cache.ts` +
// `TexturedMaterialDef.textures`): albedo, normal (GL), roughness, AO,
// metalness, opacity, and displacement. Displacement is NOT three's
// vertex-displacing `displacementMap` — the shell's floors are low-poly boxes
// with nothing to subdivide — it is the height field the parallax-occlusion
// floor path ray-marches in the fragment shader (`pomFloor.ts`).
//
// Dropped, because nothing can consume them: NormalDX (the same data as
// NormalGL with G flipped; three.js is OpenGL-convention), the DCC scene files
// (.blend/.usdc/.mtlx/.tres), and the preview PNG (superseded by the 256 px
// thumb this packer generates).
//
// CODEC: near-lossless WebP for every bound map, because footprint must not cost
// visual quality. The reasoning, all measured on this corpus:
//
//  - Lossy WebP (VP8) is ALWAYS YUV 4:2:0 — the format has no 4:4:4 mode, and
//    `smartSubsample` only re-weights the same subsampling. A normal map stores
//    X/Y in R/G, so 4:2:0 caps fidelity at ~22 dB PSNR *regardless of quality*
//    (q80 and q95 score the same). ambientCG ships these JPEGs as 4:4:4 for
//    exactly that reason. Lossy WebP is therefore disqualified for normals, and
//    on saturated albedo it plateaus at ~29 dB with errors up to 103/255.
//  - AVIF does support lossy 4:4:4 and is ~half the size, but tops out around
//    35-37 dB with per-channel errors of 26-53/255, and decodes far slower than
//    WebP — a real cost when a scene binds many 1K textures at once.
//  - Near-lossless WebP (a lossless-mode pre-quantization, NOT VP8 lossy, so no
//    chroma subsampling) holds 46 dB with a max channel error of 2/255 —
//    imperceptible — at ~57% of source. That is the quality-first choice: it
//    preserves ambientCG's own encode rather than re-degrading it.
//
// Thumbnails are the one exception: 256 px picker chips, plain lossy WebP.
//
// Usage:
//   node scripts/pack-ambientcg.mjs [--src resources/ambientcg] [--out resources/acg]
//                                   [--near-lossless 60] [--lossless]
//                                   [--only Tiles,Wood,...] [--limit N]
//                                   [--concurrency N] [--dry-run]
//
// Emits <out>/<AssetId>/{albedo,normal,rough,ao,metal,opacity,height,thumb}.webp
// plus <out>/index.json (the manifest the client reads). Upload as `acg/` in R2
// alongside `ikea/`; see docs/deployment-cloudflare.md.

import { existsSync, statSync } from 'node:fs'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ------------------------------------------------------------------- taxonomy

/**
 * Family → the surface the finish belongs on plus a FALLBACK physical tile size.
 * `uvScale` is metres-per-tile, the same convention as `builtinCatalog` and
 * `showroomCatalog` (a scan applied at the wrong physical scale is the single
 * most obvious photoreal tell, and the runtime default of [1, 1] is wrong for
 * nearly all of these).
 *
 * **These are guesses of last resort.** ambientCG publishes the real size of
 * the photographed patch per asset (`dimensionX`/`dimensionY`, cm), and it is
 * frequently nothing like the family average — measured over one API page, 16
 * of 28 packed assets were more than 1.5x off: `Wood066` is a 0.4 m scan the
 * table stretched to 1.2 m (every texel over 3x the floor — blurry, with planks
 * 3x too wide), while `Tiles141` is a 2 m scan squeezed into 0.6 m. So the
 * packer asks the API first (`fetchDimensions`) and only falls back here.
 *
 * `interior` marks families worth surfacing in a Singapore HDB/condo interior
 * tool. Exterior-only families are still packed (they cost little) but are
 * flagged so the client can default to hiding them.
 */
const FAMILIES = {
  Tiles: { category: 'floor', uvScale: [0.6, 0.6], interior: true },
  WoodFloor: { category: 'floor', uvScale: [1.5, 1.5], interior: true },
  Wood: { category: 'floor', uvScale: [1.2, 1.2], interior: true },
  Planks: { category: 'floor', uvScale: [1.5, 1.5], interior: true },
  Concrete: { category: 'floor', uvScale: [2.2, 2.2], interior: true },
  Marble: { category: 'floor', uvScale: [1.6, 1.6], interior: true },
  Terrazzo: { category: 'floor', uvScale: [1.2, 1.2], interior: true },
  Carpet: { category: 'floor', uvScale: [2, 2], interior: true },
  PaintedPlaster: { category: 'wall', uvScale: [2, 2], interior: true },
  PaintedWood: { category: 'wall', uvScale: [1.2, 1.2], interior: true },
  Bricks: { category: 'wall', uvScale: [1.5, 1.5], interior: true },
  Fabric: { category: 'wall', uvScale: [0.8, 0.8], interior: true },
  Leather: { category: 'wall', uvScale: [0.8, 0.8], interior: true },
  Metal: { category: 'wall', uvScale: [1, 1], interior: true },
  PaintedMetal: { category: 'wall', uvScale: [1, 1], interior: true },
  Plastic: { category: 'wall', uvScale: [1, 1], interior: true },
  PavingStones: { category: 'floor', uvScale: [1.5, 1.5], interior: false },
  WoodSiding: { category: 'wall', uvScale: [1.5, 1.5], interior: false },
}

/** Split `Wood065A` → `Wood`. Family is the leading run of letters. */
export function familyOf(assetId) {
  return /^([A-Za-z]+)/.exec(assetId)?.[1] ?? assetId
}

/** Turn `WoodFloor008` into `Wood Floor 008` for a readable picker label. */
export function displayName(assetId) {
  const fam = familyOf(assetId)
  const rest = assetId.slice(fam.length)
  const spaced = fam.replace(/([a-z])([A-Z])/g, '$1 $2')
  return rest ? `${spaced} ${rest}` : spaced
}

/**
 * Real scanned size per asset, in metres, from the ambientCG API
 * (`dimensionX`/`dimensionY` are centimetres; 0/absent means "not recorded").
 * One paged sweep for the whole corpus rather than a call per asset.
 *
 * Returns an empty map on any network failure — the packer then falls back to
 * the family table for every asset, which is exactly the old behaviour, so a
 * pack run never fails just because the API is unreachable.
 */
export async function fetchDimensions(fetchImpl = fetch, log = console.log) {
  const out = new Map()
  const PAGE = 100
  try {
    for (let offset = 0; offset < 4000; offset += PAGE) {
      const url =
        'https://ambientcg.com/api/v2/full_json?type=Material&include=technicalData' +
        `&limit=${PAGE}&offset=${offset}`
      const res = await fetchImpl(url)
      if (!res.ok) throw new Error(`ambientCG ${res.status}`)
      const json = await res.json()
      const assets = json.foundAssets ?? []
      for (const a of assets) {
        // Square-ish scans are the norm; take X and let Y ride along (the
        // runtime's uvScale is a single period per axis anyway).
        const cm = Number(a.dimensionX) || 0
        if (cm > 0) out.set(a.assetId, cm / 100)
      }
      if (assets.length < PAGE) break
    }
    log(`[pack-acg] real scanned size for ${out.size} assets (ambientCG dimensionX)`)
  } catch (err) {
    log(`[pack-acg] dimension lookup failed (${err.message}) — falling back to the family table`)
    return new Map()
  }
  return out
}

/** Texels per metre a finish should carry — mirrors `src/materials/tileSize.ts`
 *  (`TARGET_TEXEL_DENSITY`). A 1K map therefore covers at most 2 m. */
const TARGET_TEXEL_DENSITY = 512

/**
 * The tile size to write for one asset, in `src/materials/tileSize.ts`'s
 * precedence: the SCANNED size when the API records one, else the family guess
 * — but never larger than the map's own resolution can cover at the target
 * density. That last clamp is the "a tile is at most as big as its map"
 * rule: a 1K map asked to cover 2.2 m of concrete has 465 px/m and renders
 * soft, so the guess is capped at 2 m rather than magnified.
 */
export function tileSizeFor(id, familySpec, dimensions, pixels) {
  const scan = dimensions?.get(id)
  if (typeof scan === 'number' && scan > 0) {
    // Clamp the same way the runtime does: a 5 cm period moirés, a 12 m one
    // never repeats indoors, and both mean the record is wrong.
    const m = Math.min(8, Math.max(0.1, scan))
    return { uvScale: [m, m], uvScaleSource: 'scan' }
  }
  const guess = familySpec.uvScale[0]
  const cap = pixels > 0 ? pixels / TARGET_TEXEL_DENSITY : Number.POSITIVE_INFINITY
  if (guess > cap) return { uvScale: [cap, cap], uvScaleSource: 'density' }
  return { uvScale: familySpec.uvScale, uvScaleSource: 'family' }
}

// --------------------------------------------------------------------- args

function parseArgs(argv) {
  const out = {
    src: 'resources/ambientcg',
    out: 'resources/acg',
    // Near-lossless pre-quantization level: 0 = max (largest), 60 = the sweet
    // spot measured at 46 dB / 2-of-255 max error, 100 = off.
    nearLossless: 60,
    lossless: false,
    thumbSize: 256,
    concurrency: Math.max(1, (os.cpus()?.length ?? 4) - 2),
    only: null,
    limit: Number.POSITIVE_INFINITY,
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--src') out.src = argv[++i]
    else if (a === '--out') out.out = argv[++i]
    else if (a === '--near-lossless') out.nearLossless = Number(argv[++i])
    else if (a === '--lossless') out.lossless = true
    else if (a === '--concurrency') out.concurrency = Number(argv[++i])
    else if (a === '--limit') out.limit = Number(argv[++i])
    else if (a === '--only') out.only = new Set(argv[++i].split(',').map((s) => s.trim()))
    else throw new Error(`unknown argument: ${a}`)
  }
  return out
}

// ----------------------------------------------------------------- packing

/** Manifest channel key → ambientCG file suffix. */
const SUFFIX = {
  albedo: 'Color',
  normal: 'NormalGL',
  rough: 'Roughness',
  ao: 'AmbientOcclusion',
  metal: 'Metalness',
  opacity: 'Opacity',
  height: 'Displacement',
}

/** Source path for one channel of an asset, or null when absent. */
function channelPath(srcDir, id, channel) {
  const p = path.join(srcDir, id, `${id}_1K-JPG_${SUFFIX[channel]}.jpg`)
  return existsSync(p) ? p : null
}

/** Mean albedo colour as a hex string — the picker chip + loading tile colour. */
async function meanColor(file) {
  const { data } = await sharp(file).resize(1, 1, { fit: 'fill' }).raw().toBuffer({
    resolveWithObject: true,
  })
  const hex = (v) => v.toString(16).padStart(2, '0')
  return `#${hex(data[0])}${hex(data[1])}${hex(data[2])}`
}

/**
 * Pack one asset. Returns its manifest entry, or null when it has no albedo
 * (nothing renderable — the runtime throws on a missing albedo, so such an
 * asset must never reach the manifest).
 */
async function packAsset(id, args, dimensions) {
  const srcDir = path.resolve(ROOT, args.src)
  const albedoSrc = channelPath(srcDir, id, 'albedo')
  if (!albedoSrc) return null

  const fam = familyOf(id)
  const spec = FAMILIES[fam]
  if (!spec) return null // unknown family — no sane category/uvScale to assign

  const destDir = path.join(path.resolve(ROOT, args.out), id)
  const files = {}
  const bytes = {}

  if (!args.dryRun) await mkdir(destDir, { recursive: true })

  const emit = async (name, buf) => {
    if (!args.dryRun) await writeFile(path.join(destDir, name), buf)
    bytes[name] = buf.length
    return name
  }

  /** Encode one map at the quality-first setting (see CODEC note above). */
  const encodeMap = (file) =>
    args.lossless
      ? sharp(file).webp({ lossless: true, effort: 6 }).toBuffer()
      : sharp(file).webp({ nearLossless: true, quality: args.nearLossless }).toBuffer()

  // The map's own resolution caps how much floor it can cover sharply — read
  // it rather than assuming 1K, so a future 2K pack widens the cap by itself.
  const albedoPx = (await sharp(albedoSrc).metadata()).width ?? 0

  files.albedo = await emit('albedo.webp', await encodeMap(albedoSrc))
  // Thumbnail so the picker grid never downloads a full 1K albedo to draw a chip.
  await emit(
    'thumb.webp',
    await sharp(albedoSrc)
      .resize(args.thumbSize, args.thumbSize, { fit: 'cover' })
      .webp({ quality: 78 })
      .toBuffer(),
  )

  for (const ch of ['normal', 'rough', 'ao', 'metal', 'opacity', 'height']) {
    const src = channelPath(srcDir, id, ch)
    if (!src) continue
    files[ch] = await emit(`${ch}.webp`, await encodeMap(src))
  }

  return {
    id,
    name: displayName(id),
    family: fam,
    category: spec.category,
    interior: spec.interior,
    swatch: await meanColor(albedoSrc),
    // Physical tile size — the scanned size when ambientCG records one, else
    // the family guess. `uvScaleSource` keeps that visible in the manifest so a
    // later run can tell a measured value from an assumed one.
    ...tileSizeFor(id, spec, dimensions, albedoPx),
    files,
    bytes: Object.values(bytes).reduce((a, b) => a + b, 0),
  }
}

// -------------------------------------------------------------------- main

const fmt = (n) => {
  const u = ['B', 'KB', 'MB', 'GB']
  let v = n
  let i = 0
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i > 1 ? 2 : 0)} ${u[i]}`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const srcDir = path.resolve(ROOT, args.src)
  const ids = (await readdir(srcDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((id) => !args.only || args.only.has(familyOf(id)))
    .sort()
    .slice(0, args.limit)

  console.log(
    `[pack-acg] ${ids.length} assets from ${args.src}, concurrency ${args.concurrency}` +
      `${args.dryRun ? ' (dry run)' : ''}`,
  )
  // One API sweep up front: the real photographed size beats every guess.
  const dimensions = await fetchDimensions()
  const items = []
  const skipped = []
  let srcBytes = 0
  let done = 0
  // sharp hands the work to libvips threads, so a bounded pool of concurrent
  // encodes keeps every core busy instead of serialising 4 maps per asset.
  let cursor = 0
  const runners = Array.from({ length: Math.min(args.concurrency, ids.length) }, async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++]
      for (const ch of Object.keys(SUFFIX)) {
        const p = channelPath(srcDir, id, ch)
        if (p) srcBytes += statSync(p).size
      }
      const entry = await packAsset(id, args, dimensions)
      if (entry) items.push(entry)
      else skipped.push(id)
      done++
      if (done % 100 === 0 || done === ids.length) {
        const outBytes = items.reduce((a, e) => a + e.bytes, 0)
        console.log(
          `[pack-acg] ${done}/${ids.length}  ${fmt(srcBytes)} -> ${fmt(outBytes)}  skipped ${skipped.length}`,
        )
      }
    }
  })
  await Promise.all(runners)
  // Pool completion order is nondeterministic; keep the manifest stable.
  items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const outBytes = items.reduce((a, e) => a + e.bytes, 0)
  const manifest = {
    version: 1,
    provider: 'ambientcg',
    license: 'CC0',
    attribution: 'ambientCG (CC0)',
    count: items.length,
    items,
  }
  if (!args.dryRun) {
    const outDir = path.resolve(ROOT, args.out)
    await mkdir(outDir, { recursive: true })
    await writeFile(path.join(outDir, 'index.json'), JSON.stringify(manifest))
  }
  console.log(
    `[pack-acg] done — ${items.length} packed, ${skipped.length} skipped: ` +
      `${fmt(srcBytes)} -> ${fmt(outBytes)} (${((100 * outBytes) / srcBytes).toFixed(0)}%)`,
  )
  const interior = items.filter((i) => i.interior)
  console.log(
    `[pack-acg] interior-relevant: ${interior.length} assets, ${fmt(interior.reduce((a, e) => a + e.bytes, 0))}`,
  )
  if (skipped.length)
    console.log(`[pack-acg] skipped (no albedo / unknown family): ${skipped.join(', ')}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error('[pack-acg] failed:', err.message ?? err)
    process.exit(1)
  })
}
