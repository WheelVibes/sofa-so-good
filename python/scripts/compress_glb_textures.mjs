// Full-resolution, codec-only KTX2/UASTC re-encode of GLB textures.
//
// Unlike optimize_glb_lod.mjs (which produces downscaled + decimated -low/-medium
// LOD *proxies*), this rewrites a GLB IN PLACE-equivalent: it swaps the embedded
// PNG/JPEG/WebP textures for KTX2 Basis-Universal **UASTC** — keeping FULL
// resolution and the ORIGINAL geometry (Draco preserved, no mesh simplify). The
// result is visually lossless (UASTC is the high-quality Basis mode) but
// GPU-compressed in VRAM, the IKEA-Home-Planner approach: the win is VRAM + load,
// not silhouette/texel loss. Use it on the "Original"/high asset tier, which the
// app loads verbatim (see furniture/gltf/lod.ts — `high` → no suffix).
//
// Geometry is left untouched: textures are 82% of the corpus and ~95% of the
// GLBs are already Draco, so re-Draco'ing buys nothing and risks churn.
//
// Encoding needs the KTX-Software `toktx` binary on PATH AND @gltf-transform/cli
// (which provides the `toktx` transform; gltf-transform's `textureCompress` does
// NOT support ktx2 in v4.x — only jpeg/png/webp/avif). When either is missing we
// print actionable guidance and exit non-zero WITHOUT writing partial output, so
// this is safe to run anywhere; the heavy encode runs on a box that has toktx.
//
// Usage:
//   node compress_glb_textures.mjs <dir-or-file> [--out <dir>] [--etc1s] [--dry-run]
// Default codec is UASTC (visually lossless). --etc1s opts into the smaller,
// slightly-lossy colour codec. --dry-run reports what would be processed.

import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const positional = args.filter((a) => !a.startsWith('--'))
const SRC_ARG = positional[0]
const outIdx = args.indexOf('--out')
const OUT_DIR = outIdx !== -1 ? args[outIdx + 1] : null
const USE_ETC1S = flags.has('--etc1s')
const DRY_RUN = flags.has('--dry-run')

// LOD proxies are produced by optimize_glb_lod.mjs — never re-encode them here.
const VARIANT_RE = /-(low|medium)\.glb$/i

function listGlbs(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listGlbs(p))
    else if (entry.name.endsWith('.glb') && !VARIANT_RE.test(entry.name)) out.push(p)
  }
  return out
}

function hasToktx() {
  try {
    execSync('toktx --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Resolve a source GLB path to its destination (mirrors the tree under --out,
 *  or rewrites beside the source when no --out given). */
function destFor(src) {
  if (!OUT_DIR) return src
  const root = SRC_ARG && statSync(SRC_ARG).isDirectory() ? SRC_ARG : dirname(SRC_ARG)
  return join(OUT_DIR, relative(root, src))
}

async function main() {
  if (!SRC_ARG || !existsSync(SRC_ARG)) {
    console.error('Usage: node compress_glb_textures.mjs <dir-or-file> [--out <dir>] [--etc1s] [--dry-run]')
    process.exit(1)
  }

  const srcs = statSync(SRC_ARG).isDirectory() ? listGlbs(SRC_ARG) : [SRC_ARG]
  const codec = USE_ETC1S ? 'ETC1S (smaller, slightly lossy colour)' : 'UASTC (visually lossless)'
  console.log(`GLBs to process: ${srcs.length}`)
  console.log(`Codec: KTX2 ${codec}`)
  console.log(`Output: ${OUT_DIR ? OUT_DIR : 'in place (beside source)'}`)

  if (DRY_RUN) {
    console.log('\n--dry-run: no files written. First few targets:')
    for (const s of srcs.slice(0, 5)) console.log(`  ${s} -> ${destFor(s)}`)
    return
  }

  // Hard requirements for the actual encode.
  let toktxCli
  try {
    toktxCli = (await import('@gltf-transform/cli')).toktx
  } catch {
    toktxCli = undefined
  }
  if (!hasToktx() || !toktxCli) {
    console.error(
      '\nKTX2/UASTC encode unavailable in this environment:\n' +
        (!hasToktx()
          ? '  • `toktx` binary not on PATH — install KTX-Software:\n' +
            '    https://github.com/KhronosGroup/KTX-Software/releases (Linux x86_64 .deb/tar)\n'
          : '') +
        (!toktxCli ? '  • @gltf-transform/cli not installed — `npm i -D @gltf-transform/cli`\n' : '') +
        '\nNothing was written. Re-run on a machine with both, or in CI.',
    )
    process.exit(2)
  }

  // Encode path (runs only where toktx + cli exist). Imported lazily so the
  // script loads without the heavy deps when only validating / dry-running.
  const { NodeIO } = await import('@gltf-transform/core')
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
  const { Mode } = await import('@gltf-transform/cli')
  const draco3d = (await import('draco3dgltf')).default

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })

  let made = 0
  let failed = 0
  for (const src of srcs) {
    const dest = destFor(src)
    try {
      const doc = await io.read(src)
      // UASTC for everything keeps it visually lossless; ETC1S is the opt-in
      // smaller colour codec (normal/data maps still go UASTC under ETC1S mode).
      await doc.transform(
        toktxCli({
          mode: USE_ETC1S ? Mode.ETC1S : Mode.UASTC,
          // No resize — full resolution is the whole point of this pass.
        }),
      )
      if (OUT_DIR) mkdirSync(dirname(dest), { recursive: true })
      await io.write(dest, doc)
      made++
      console.log(`  ${basename(src)} -> ${dest}`)
    } catch (err) {
      failed++
      console.warn(`  FAILED ${src}: ${err.message}`)
    }
  }
  console.log(`\nDone. ${made} re-encoded, ${failed} failed.`)
}

/** Sidecar copy: when an --out dir is given, bring along metadata.json + the
 *  -main.jpg thumbnails so the output is a self-contained group folder. */
function copySidecars() {
  if (!OUT_DIR || !SRC_ARG || !statSync(SRC_ARG).isDirectory()) return
  const copyTree = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) copyTree(p)
      else if (/metadata\.json$|-main\.jpg$/i.test(e.name)) {
        const d = join(OUT_DIR, relative(SRC_ARG, p))
        mkdirSync(dirname(d), { recursive: true })
        copyFileSync(p, d)
      }
    }
  }
  copyTree(SRC_ARG)
}

main()
  .then(() => {
    if (!DRY_RUN) copySidecars()
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
