#!/usr/bin/env node
/**
 * Rewrite the packed ambientCG manifest's tile sizes from the REAL scanned
 * dimensions ambientCG publishes, without re-packing a single image.
 *
 * `pack-ambientcg.mjs` originally assigned one physical tile size per family
 * (all `Tiles*` → 0.6 m, all `Wood*` → 1.2 m, …). Measured against the API's
 * own `dimensionX`, 16 of 28 assets on one page were more than 1.5x off:
 * `Wood066` is a 0.4 m scan the table stretched to 1.2 m — every texel spread
 * over 3x the floor, so the finish renders blurry AND its planks come out 3x
 * too wide — while `Tiles141` is a 2 m scan squeezed into 0.6 m, repeating
 * three times too often. The packer asks the API now; this script fixes the
 * corpus that is already packed and uploaded.
 *
 * Only `uvScale` (+ a `uvScaleSource` marker) changes, so **only the manifest
 * needs re-uploading** — the maps themselves are untouched:
 *
 *   node scripts/retag-acg-tile-sizes.mjs            # rewrite in place
 *   node scripts/retag-acg-tile-sizes.mjs --dry-run  # report, change nothing
 *   node scripts/push-r2-library.mjs resources/acg '' \
 *     --only index.json --rename index.json=library/acg-index.json
 *
 * `--file <path>` points at a different manifest (default: the local R2 mirror
 * at `resources/library/acg-index.json`, then `resources/acg/index.json`).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchDimensions } from './pack-ambientcg.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const DEFAULT_FILES = [
  path.join(ROOT, 'resources/library/acg-index.json'),
  path.join(ROOT, 'resources/acg/index.json'),
]

function parseArgs(argv) {
  const args = { dryRun: false, file: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true
    else if (argv[i] === '--file') args.file = argv[++i]
  }
  return args
}

/**
 * Apply scanned sizes to a manifest's items. Pure: takes the parsed manifest
 * and the id→metres map, returns the new items plus what changed. Exported for
 * the unit test.
 */
export function retagItems(items, dimensions, pixels = 1024) {
  // Same target as `src/materials/tileSize.ts`: a 1K map covers at most 2 m.
  const cap = pixels / 512
  const changed = []
  const next = items.map((item) => {
    const was = item.uvScale?.[0]
    const scan = dimensions.get(item.id)
    if (scan > 0) {
      const m = Math.min(8, Math.max(0.1, scan))
      if (was === m && item.uvScaleSource === 'scan') return item
      changed.push({ id: item.id, from: was, to: m, ratio: was ? m / was : null })
      return { ...item, uvScale: [m, m], uvScaleSource: 'scan' }
    }
    // No recorded dimension: keep the family guess, but never let it ask the
    // map to cover more floor than its texels can describe.
    if (!(was > cap)) return item
    changed.push({ id: item.id, from: was, to: cap, ratio: cap / was })
    return { ...item, uvScale: [cap, cap], uvScaleSource: 'density' }
  })
  return { items: next, changed }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const file = args.file ? path.resolve(ROOT, args.file) : DEFAULT_FILES.find((f) => existsSync(f))
  if (!file || !existsSync(file)) {
    console.error(
      `[retag-acg] no manifest found (looked in ${DEFAULT_FILES.join(', ')}). ` +
        `Run 'npm run pull-r2-library' first, or pass --file <path>.`,
    )
    process.exit(1)
  }

  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(manifest.items)) {
    console.error(`[retag-acg] ${file} has no items array`)
    process.exit(1)
  }

  const dimensions = await fetchDimensions()
  if (dimensions.size === 0) {
    console.error('[retag-acg] no dimensions fetched — nothing to do')
    process.exit(1)
  }

  const { items, changed } = retagItems(manifest.items, dimensions)
  const scanned = items.filter((i) => i.uvScaleSource === 'scan').length
  const capped = items.filter((i) => i.uvScaleSource === 'density').length
  changed.sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))

  console.log(
    `[retag-acg] ${changed.length} of ${items.length} items re-tagged — ` +
      `${scanned} from the scanned size, ${capped} capped by map resolution, ` +
      `${items.length - scanned - capped} still on the family guess`,
  )
  for (const c of changed.slice(0, 5)) {
    console.log(`  ${c.id}: ${c.from} m → ${c.to} m  (×${(c.ratio ?? 0).toFixed(2)})`)
  }
  if (changed.length > 10) console.log('  …')
  for (const c of changed.slice(-5)) {
    console.log(`  ${c.id}: ${c.from} m → ${c.to} m  (×${(c.ratio ?? 0).toFixed(2)})`)
  }

  if (args.dryRun) {
    console.log('[retag-acg] dry run — nothing written')
    return
  }
  writeFileSync(file, `${JSON.stringify({ ...manifest, items }, null, 0)}\n`)
  console.log(`[retag-acg] wrote ${file}`)
  console.log(
    '[retag-acg] upload just the manifest:\n' +
      "  node scripts/push-r2-library.mjs resources/acg '' --only index.json " +
      '--rename index.json=library/acg-index.json',
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main()
}
