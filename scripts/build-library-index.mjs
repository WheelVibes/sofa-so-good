// Build the shared-library manifest for R2. Scans the ikea_optimized/ tree,
// reads each product's metadata.json, and emits a compact index.json the app
// fetches (via /api/assets/library/index.json) to populate the prod catalog.
//
// Usage:
//   node scripts/build-library-index.mjs [srcDir] [outFile]
// Defaults:
//   srcDir  = ikea_optimized
//   outFile = ikea_optimized/library-index.json   (upload to R2 as library/index.json)
//
// Then upload the whole tree + the index to R2 (see docs/deployment-cloudflare.md):
//   rclone copy ikea_optimized r2:sofa-assets/ikea --transfers=32 --checkers=32 \
//     --exclude 'library-index.json'
//   rclone copyto ikea_optimized/library-index.json r2:sofa-assets/library/index.json

import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const srcDir = process.argv[2] ?? 'ikea_optimized'
const outFile = process.argv[3] ?? path.join(srcDir, 'library-index.json')

/** Pick the first variant that actually has a GLB, for the thumbnail + price. */
function primaryVariant(variants) {
  if (!Array.isArray(variants)) return null
  return variants.find((v) => v && typeof v.glb === 'string') ?? null
}

async function readMetadata(dir) {
  const file = path.join(dir, 'metadata.json')
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function buildEntry(group, dir) {
  const meta = await readMetadata(dir)
  if (!meta) return null
  const variants = Array.isArray(meta.variants) ? meta.variants : []
  const usable = variants.filter((v) => v && typeof v.glb === 'string')
  if (usable.length === 0) return null // nothing renderable — skip
  const primary = primaryVariant(variants)
  return {
    group,
    name: meta.product_name ?? group,
    type: meta.type_name ?? '',
    category: meta.design?.category ?? '',
    size: meta.size ?? '',
    series: meta.series ?? '',
    variants: usable.length,
    thumbnail: primary?.main_image ?? null,
    price: primary?.price_numeral ?? null,
    currency: primary?.currency ?? null,
  }
}

async function main() {
  const entries = await readdir(srcDir, { withFileTypes: true })
  const groups = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
  const items = []
  let skipped = 0
  for (const group of groups) {
    const entry = await buildEntry(group, path.join(srcDir, group))
    if (entry) items.push(entry)
    else skipped++
  }
  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    count: items.length,
    items,
  }
  await writeFile(outFile, JSON.stringify(index))
  const bytes = (await stat(outFile)).size
  console.log(
    `[build-library-index] ${items.length} items (${skipped} skipped) -> ${outFile} (${(bytes / 1024).toFixed(0)} KB)`,
  )
}

main().catch((err) => {
  console.error('[build-library-index] failed:', err)
  process.exit(1)
})
