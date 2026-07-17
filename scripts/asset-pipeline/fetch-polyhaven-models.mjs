#!/usr/bin/env node
// Fetch-and-repack pipeline for Poly Haven CC0 furniture MODELS.
//
// Poly Haven ships models as a multi-file glTF (a .gltf + a .bin + separate
// texture images), which the dev-only local-assets DB can't consume directly.
// This script downloads a curated set at 1k texture resolution, repacks each
// into a SELF-CONTAINED single .glb (embedded buffers + textures) via
// @gltf-transform, runs the repo's light optimize transforms (dedup/prune/weld),
// and drops the result into `local-assets/<category>/<slug>.glb` where the
// Part-1 dev plugin (scripts/vite-local-assets.mjs + localAssetsSlice) auto-loads
// it into the furniture catalog (behind the `localAssets` devOnly flag).
//
// A JSON sidecar (`<glb>.json`) records CC0 provenance (author + source URL).
// The plugin doesn't read it (it hardcodes CC0 + derives name/category from the
// path), but it documents where each dev-local asset came from.
//
// CLI:
//   node scripts/asset-pipeline/fetch-polyhaven-models.mjs [options]
//     --limit N            cap how many assets to fetch (default: the curated set)
//     --category <cat>     only fetch Poly Haven assets in this API category
//                          (e.g. furniture, seating, lighting)
//     --ids id1,id2,...    fetch exactly these Poly Haven asset ids
//     --res 1k|2k|4k       texture resolution (default 1k)
//     --out <dir>          output root (default: local-assets/)
//     --force              re-fetch even if the target .glb already exists
//
// Idempotent: skips any asset whose target .glb already exists (unless --force).
// Rate-limited: a short delay between assets to stay polite to the API/CDN.

import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { dedup, prune, weld } from '@gltf-transform/functions'
import {
  buildAttribution,
  pickGltfBundle,
  polyhavenCategory,
  slugify,
  sourceUrl,
} from './polyhaven-select.mjs'

const API = 'https://api.polyhaven.com'
const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url))

// Curated Tier-1 interior set for an HDB/condo app — modern, neutral pieces that
// read well in a living/dining room: sofa, chairs, coffee/side/dining tables,
// storage, and two lamps. Used when no --ids/--category/--limit selection is given.
const CURATED_IDS = [
  'sofa_02', // seating — 3-seater sofa
  'modern_arm_chair_01', // seating — accent armchair
  'mid_century_lounge_chair', // seating — lounge chair
  'dining_chair_02', // seating — dining chair
  'modern_coffee_table_01', // tables — coffee table
  'side_table_01', // tables — side table
  'dining_table', // tables — dining table
  'modern_wooden_cabinet', // storage — cabinet / sideboard
  'steel_frame_shelves_03', // storage — open shelving
  'desk_lamp_arm_01', // lighting — task lamp
  'modern_ceiling_lamp_01', // lighting — pendant / ceiling lamp
]

const RATE_LIMIT_MS = 400
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseArgs(argv) {
  const args = {
    limit: null,
    category: null,
    ids: null,
    res: '1k',
    out: join(PROJECT_ROOT, 'local-assets'),
    force: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--limit') args.limit = Number(argv[++i])
    else if (a === '--category') args.category = argv[++i]
    else if (a === '--ids')
      args.ids = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    else if (a === '--res') args.res = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--force') args.force = true
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

async function fetchBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

const io = new NodeIO()

/** Download a glTF bundle (main .gltf + includes) to `tmpDir`, then read+repack
 *  it into a single self-contained .glb at `outPath` with light optimization. */
async function repackToGlb(bundle, tmpDir, outPath) {
  // Main .gltf goes at the temp root; includes keep their RELATIVE paths so the
  // .gltf's buffer/image URIs resolve on disk.
  const gltfName = bundle.url.split('/').pop() || 'model.gltf'
  const gltfPath = join(tmpDir, gltfName)
  await mkdir(dirname(gltfPath), { recursive: true })
  await writeFile(gltfPath, await fetchBuffer(bundle.url))

  for (const inc of bundle.includes) {
    const dest = join(tmpDir, inc.relPath)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, await fetchBuffer(inc.url))
    await sleep(RATE_LIMIT_MS)
  }

  const doc = await io.read(gltfPath) // resolves .bin + textures relative to gltfPath
  try {
    await doc.transform(weld(), dedup(), prune())
  } catch (err) {
    console.warn(`  optimize transforms failed, writing unoptimized: ${err?.message ?? err}`)
  }
  mkdirSync(dirname(outPath), { recursive: true })
  await io.write(outPath, doc) // .glb → buffers + images embedded (self-contained)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(
      'Usage: node scripts/asset-pipeline/fetch-polyhaven-models.mjs [--limit N] [--category furniture] [--ids id1,id2] [--res 1k] [--out dir] [--force]',
    )
    return
  }

  // Resolve the id list. Priority: --ids > --category (API list) > curated set.
  let ids
  let assetMeta = {}
  if (args.ids) {
    ids = args.ids
  } else if (args.category) {
    assetMeta = await fetchJson(
      `${API}/assets?type=models&categories=${encodeURIComponent(args.category)}`,
    )
    ids = Object.keys(assetMeta)
  } else {
    ids = CURATED_IDS
  }
  if (args.limit && Number.isFinite(args.limit)) ids = ids.slice(0, args.limit)

  console.log(`Poly Haven model fetch — ${ids.length} asset(s), res ${args.res}, out ${args.out}`)

  const results = []
  for (const id of ids) {
    try {
      // Asset metadata: for --category we already have it; otherwise fetch the
      // single asset so we can derive its category + attribution.
      let asset = assetMeta[id]
      if (!asset) {
        const info = await fetchJson(`${API}/info/${encodeURIComponent(id)}`)
        asset = info
      }
      asset = { id, ...asset }
      const category = polyhavenCategory(asset)
      const slug = slugify(asset.name || id)
      const outPath = join(args.out, category, `${slug}.glb`)

      if (!args.force && existsSync(outPath)) {
        console.log(`• ${id} → ${category}/${slug}.glb (skip, exists)`)
        results.push({ id, category, slug, skipped: true, bytes: statSync(outPath).size })
        continue
      }

      const files = await fetchJson(`${API}/files/${encodeURIComponent(id)}`)
      const bundle = pickGltfBundle(files, args.res)
      if (!bundle) {
        console.warn(`• ${id} → no glTF bundle, skipping`)
        results.push({ id, error: 'no-gltf-bundle' })
        continue
      }

      const tmpDir = join(tmpdir(), `phv-${id}-${Date.now()}`)
      mkdirSync(tmpDir, { recursive: true })
      try {
        await repackToGlb(bundle, tmpDir, outPath)
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }

      const bytes = statSync(outPath).size
      // Provenance sidecar (informational; the dev plugin hardcodes CC0).
      await writeFile(
        `${outPath}.json`,
        `${JSON.stringify(
          {
            id: asset.id,
            name: asset.name || id,
            category,
            license: 'CC0',
            attribution: buildAttribution(asset),
            sourceUrl: sourceUrl(id),
            resolution: bundle.resolution,
          },
          null,
          2,
        )}\n`,
      )

      console.log(
        `• ${id} → ${category}/${slug}.glb  (${(bytes / 1e6).toFixed(2)} MB, ${bundle.resolution})`,
      )
      results.push({ id, category, slug, bytes, resolution: bundle.resolution })
      await sleep(RATE_LIMIT_MS)
    } catch (err) {
      console.error(`• ${id} → ERROR ${err?.message ?? err}`)
      results.push({ id, error: String(err?.message ?? err) })
    }
  }

  const ok = results.filter((r) => r.bytes && !r.error)
  const skipped = results.filter((r) => r.skipped)
  const failed = results.filter((r) => r.error)
  console.log(
    `\nDone: ${ok.length - skipped.length} fetched, ${skipped.length} skipped, ${failed.length} failed`,
  )
  const big = ok.filter((r) => r.bytes > 8e6)
  if (big.length)
    console.warn(
      `Over 8 MB: ${big.map((r) => `${r.id} (${(r.bytes / 1e6).toFixed(1)}MB)`).join(', ')}`,
    )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
