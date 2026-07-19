#!/usr/bin/env node
// Fetch-and-extract pipeline for Kenney.nl CC0 furniture MODELS ("Furniture Kit").
//
// Unlike Poly Haven (multi-file glTF that needs repacking into a single .glb),
// Kenney's kit ZIP already ships self-contained flat-shaded GLBs at
// `Models/GLTF format/<name>.glb` — a single embedded buffer, no external
// images/textures (verified by hand: `images: undefined`, one `buffers[0]`).
// So this script just: (1) resolves the kit's ZIP download URL from its pack
// page (the URL lives at a content-hash path that changes per kit revision —
// see kenney_scraper.py's docstring), (2) downloads the ZIP once, (3) extracts
// the curated GLB entries with `fflate` (already a project dependency), (4)
// round-trips each through @gltf-transform (weld/dedup/prune, matching the
// Poly Haven fetcher's light optimize pass) and writes it to
// `local-assets/<category>/<slug>.glb`, where the Part-1 dev plugin
// (scripts/vite-local-assets.mjs + localAssetsSlice) auto-loads it into the
// furniture catalog (behind the `localAssets` devOnly flag).
//
// A JSON sidecar (`<glb>.json`) records CC0 provenance (kit + source URL).
// The plugin doesn't read it (it hardcodes CC0 + derives name/category from
// the path); it documents where each dev-local asset came from.
//
// License: CC0 1.0 (public domain) — kenney.nl/assets/furniture-kit. No
// attribution required (recorded anyway, matching CREDITS.json conventions).
//
// CLI:
//   node scripts/asset-pipeline/fetch-kenney-models.mjs [options]
//     --limit N            cap how many curated items to fetch
//     --category <cat>     only fetch items in this FurnitureCategory subdir
//     --out <dir>          output root (default: local-assets/)
//     --force               re-extract even if the target .glb already exists
//
// Idempotent: skips any item whose target .glb already exists (unless --force).
// Single network round-trip for the pack page + one ZIP download (no per-item
// fetch — the kit ships every model in one archive).

import { existsSync, mkdirSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { KHRMaterialsUnlit } from '@gltf-transform/extensions'
import { dedup, prune, weld } from '@gltf-transform/functions'
import { unzipSync } from 'fflate'
import {
  KENNEY_FURNITURE_KIT,
  kenneyAttribution,
  kenneyZipEntryPath,
  slugify,
} from './kenney-select.mjs'

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ZIP_HREF_RE = /href=["']([^"']+\.zip(?:\?[^"']*)?)["']/i

function parseArgs(argv) {
  const args = {
    limit: null,
    category: null,
    out: join(PROJECT_ROOT, 'local-assets'),
    force: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--limit') args.limit = Number(argv[++i])
    else if (a === '--category') args.category = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--force') args.force = true
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

async function fetchBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** Resolve the kit's ZIP download URL from its pack page (content-hash path,
 *  not guessable from the slug alone — see kenney_scraper.py). */
async function resolveZipUrl(pageUrl) {
  const html = await fetchText(pageUrl)
  const m = ZIP_HREF_RE.exec(html)
  if (!m) throw new Error(`no .zip href found on ${pageUrl}`)
  return new URL(m[1], pageUrl).toString()
}

const io = new NodeIO().registerExtensions([KHRMaterialsUnlit])

/** Round-trip a self-contained GLB buffer through gltf-transform's light
 *  optimize transforms (matching the Poly Haven fetcher), tolerating failure. */
async function optimizeGlb(bytes) {
  try {
    const doc = await io.readBinary(bytes)
    await doc.transform(weld(), dedup(), prune())
    return await io.writeBinary(doc)
  } catch (err) {
    console.warn(`  optimize transforms failed, writing raw bytes: ${err?.message ?? err}`)
    return bytes
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(
      'Usage: node scripts/asset-pipeline/fetch-kenney-models.mjs [--limit N] [--category seating] [--out dir] [--force]',
    )
    return
  }

  let items = KENNEY_FURNITURE_KIT.items
  if (args.category) items = items.filter((it) => it.category === args.category)
  if (args.limit && Number.isFinite(args.limit)) items = items.slice(0, args.limit)

  console.log(
    `Kenney "${KENNEY_FURNITURE_KIT.pack}" fetch — ${items.length} curated item(s), out ${args.out}`,
  )

  // Skip the whole page/ZIP round-trip if every target already exists (unless --force).
  const targets = items.map((it) => ({
    item: it,
    outPath: join(args.out, it.category, `${slugify(it.name)}.glb`),
  }))
  const pending = args.force ? targets : targets.filter((t) => !existsSync(t.outPath))
  if (pending.length === 0) {
    console.log('All curated items already present (use --force to re-extract).')
    return
  }

  console.log(`Resolving ZIP for ${KENNEY_FURNITURE_KIT.pageUrl} ...`)
  const zipUrl = await resolveZipUrl(KENNEY_FURNITURE_KIT.pageUrl)
  console.log(`Downloading ${zipUrl} ...`)
  const zipBytes = await fetchBuffer(zipUrl)

  const wanted = new Set(pending.map((t) => kenneyZipEntryPath(t.item.glb)))
  const entries = unzipSync(zipBytes, { filter: (f) => wanted.has(f.name) })

  const results = []
  for (const { item, outPath } of pending) {
    const entryPath = kenneyZipEntryPath(item.glb)
    const raw = entries[entryPath]
    if (!raw) {
      console.warn(`• ${item.glb} → entry not found in ZIP (${entryPath}), skipping`)
      results.push({ item, error: 'entry-not-found' })
      continue
    }
    try {
      const optimized = await optimizeGlb(raw)
      mkdirSync(dirname(outPath), { recursive: true })
      await writeFile(outPath, optimized)
      await writeFile(
        `${outPath}.json`,
        `${JSON.stringify(
          {
            name: item.name,
            category: item.category,
            license: 'CC0',
            attribution: kenneyAttribution(item, KENNEY_FURNITURE_KIT.pack),
            sourceUrl: KENNEY_FURNITURE_KIT.pageUrl,
            pack: KENNEY_FURNITURE_KIT.pack,
          },
          null,
          2,
        )}\n`,
      )
      const bytes = statSync(outPath).size
      console.log(
        `• ${item.glb} → ${item.category}/${slugify(item.name)}.glb  (${(bytes / 1e3).toFixed(1)} KB)`,
      )
      results.push({ item, bytes })
    } catch (err) {
      console.error(`• ${item.glb} → ERROR ${err?.message ?? err}`)
      results.push({ item, error: String(err?.message ?? err) })
    }
  }

  const skipped = targets.length - pending.length
  const ok = results.filter((r) => r.bytes && !r.error)
  const failed = results.filter((r) => r.error)
  console.log(`\nDone: ${ok.length} fetched, ${skipped} already present, ${failed.length} failed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
