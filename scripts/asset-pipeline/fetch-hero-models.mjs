#!/usr/bin/env node
// Photoreal HERO models — the CC0 Poly Haven pieces that stand in for the boxy
// parametric primitives in Realistic mode (PHOTOREAL-HERO, `furniture/photorealProxies.ts`).
//
// Why a separate script from `fetch-polyhaven-models.mjs`: that one feeds the dev-only
// `local-assets/` plugin and writes a provenance-only sidecar. A hero model ships in PROD
// (`public/assets/furniture/`) and must satisfy three invariants the runtime proxy relies on,
// none of which a raw Poly Haven export guarantees:
//
//   1. **Faces +Z** — every parametric primitive faces +Z (back at −Z), and the proxy is drawn
//      in the primitive's frame with no runtime yaw. Poly Haven authors are not consistent
//      (`wooden_display_shelves_01` faces +X; `modern_coffee_table_01`'s long axis runs along Z).
//      The per-model `yawDeg` below was read off the Blender turntables
//      (`inspect_asset.py`, view_00 = the glTF +Z face) and is BAKED into a wrapper node.
//   2. **Floor-centred** — bbox centre on the origin in X/Z, bbox min at y=0. The primitive's
//      collision OBB is centred on the item, so an off-origin GLB would render displaced from
//      where it collides. Baked as the wrapper node's translation.
//   3. **Pipeline sidecar** (`sidecar.ts` `FurnitureSidecar`) with the footprint measured
//      from the FINAL (rotated) geometry, so `index-assets` emits a correct `defaultFootprint`
//      and `photorealProxyFor` can scale against it without loading the GLB.
//
// Textures are re-encoded to WebP (≤1024, the source resolution) and geometry Draco'd.
// LOD siblings are NOT produced here — run `npm run optimize:glb public/assets/furniture`
// afterwards, then `npm run index-assets` to regenerate `generatedCatalog.ts` + `CREDITS.md`.
//
// CLI:
//   node scripts/asset-pipeline/fetch-hero-models.mjs [--src <dir>] [--only id1,id2] [--force]
//     --src   reuse a directory already produced by fetch-polyhaven-models.mjs (skips network)
//     --only  restrict to these HERO ids (the `ph-*` ids, or the Poly Haven ids)
//     --force overwrite an existing public GLB
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getBounds, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, draco, prune, textureCompress, weld } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import sharp from 'sharp'

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const OUT_DIR = join(PROJECT_ROOT, 'public/assets/furniture')

/**
 * The curated set. `yawDeg` rotates about +Y so the piece faces +Z (or, for a
 * symmetric table, so its LONG axis runs along X like the primitive's `width`).
 * Names are what the catalog shows; keep them descriptive of the LOOK, since a
 * user picking one from the catalog cannot see the Poly Haven id.
 */
export const HERO_MODELS = [
  {
    ph: 'sofa_02',
    id: 'ph-sofa-leather',
    name: 'Leather sofa',
    category: 'seating',
    yawDeg: 0,
  },
  {
    ph: 'modern_arm_chair_01',
    id: 'ph-armchair-leather-oak',
    name: 'Leather & oak armchair',
    category: 'seating',
    yawDeg: 0,
  },
  {
    ph: 'dining_chair_02',
    id: 'ph-dining-chair-leather',
    name: 'Leather dining chair',
    category: 'seating',
    yawDeg: 0,
  },
  {
    ph: 'Ottoman_01',
    id: 'ph-ottoman-leather',
    name: 'Leather ottoman',
    category: 'seating',
    yawDeg: 0,
  },
  {
    ph: 'modern_coffee_table_01',
    id: 'ph-coffee-table-stone',
    name: 'Stone-top coffee table',
    category: 'tables',
    // Long axis runs along Z in the source; the primitive's `width` is X.
    yawDeg: 90,
  },
  {
    ph: 'side_table_01',
    id: 'ph-side-table-oak',
    name: 'Oak side table',
    category: 'tables',
    yawDeg: 0,
  },
  {
    ph: 'modern_wooden_cabinet',
    id: 'ph-cabinet-slatted',
    name: 'Slatted walnut cabinet',
    category: 'storage',
    yawDeg: 0,
  },
  {
    ph: 'wooden_display_shelves_01',
    id: 'ph-display-shelves-pine',
    name: 'Pine display shelves',
    category: 'storage',
    // Open cubes face +X in the source (turntable view_01).
    yawDeg: -90,
  },
]

function parseArgs(argv) {
  const a = { src: null, only: null, force: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--src') a.src = argv[++i]
    else if (argv[i] === '--only') a.only = new Set(argv[++i].split(',').map((s) => s.trim()))
    else if (argv[i] === '--force') a.force = true
  }
  return a
}

/** Find the repacked GLB for a Poly Haven id under a fetch-polyhaven-models.mjs out dir. */
function findRepacked(srcDir, phId) {
  const want = `${phId}`.toLowerCase()
  for (const cat of readdirSync(srcDir)) {
    const dir = join(srcDir, cat)
    if (!statSync(dir).isDirectory()) continue
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.glb')) continue
      const sidecar = join(dir, `${f}.json`)
      if (!existsSync(sidecar)) continue
      const meta = JSON.parse(readFileSync(sidecar, 'utf8'))
      if (String(meta.id).toLowerCase() === want) return { glb: join(dir, f), meta }
    }
  }
  return null
}
function yawQuaternion(deg) {
  const half = (deg * Math.PI) / 360
  return [0, Math.sin(half), 0, Math.cos(half)]
}

async function buildIO() {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })
}

function sceneBounds(scene) {
  const b = getBounds(scene)
  return {
    min: b.min,
    max: b.max,
    w: b.max[0] - b.min[0],
    h: b.max[1] - b.min[1],
    d: b.max[2] - b.min[2],
    cx: (b.max[0] + b.min[0]) / 2,
    cz: (b.max[2] + b.min[2]) / 2,
  }
}

/** Re-root the scene under one wrapper node carrying the yaw + floor-centring. */
function bakeFrame(doc, yawDeg) {
  const root = doc.getRoot()
  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  if (!scene) throw new Error('no scene')
  const wrapper = doc.createNode('hero-root')
  for (const n of scene.listChildren()) {
    scene.removeChild(n)
    wrapper.addChild(n)
  }
  scene.addChild(wrapper)
  wrapper.setRotation(yawQuaternion(yawDeg))
  // Bounds AFTER the rotation, then translate so the bbox is floor-centred.
  const b = sceneBounds(scene)
  wrapper.setTranslation([-b.cx, -b.min[1], -b.cz])
  return sceneBounds(scene)
}

function countTriangles(doc) {
  let tris = 0
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices()
      const n = idx ? idx.getCount() : (prim.getAttribute('POSITION')?.getCount() ?? 0)
      tris += Math.floor(n / 3)
    }
  return tris
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const models = HERO_MODELS.filter((m) => !args.only || args.only.has(m.id) || args.only.has(m.ph))
  if (!models.length) {
    console.error('nothing selected')
    process.exit(1)
  }
  let srcDir = args.src
  let tmp = null
  if (!srcDir) {
    tmp = join(tmpdir(), `hero-${Date.now()}`)
    mkdirSync(tmp, { recursive: true })
    srcDir = tmp
    execFileSync(
      process.execPath,
      [
        join(PROJECT_ROOT, 'scripts/asset-pipeline/fetch-polyhaven-models.mjs'),
        '--ids',
        models.map((m) => m.ph).join(','),
        '--res',
        '1k',
        '--out',
        srcDir,
      ],
      { stdio: 'inherit' },
    )
  }
  const io = await buildIO()
  mkdirSync(OUT_DIR, { recursive: true })
  const rows = []
  for (const m of models) {
    const out = join(OUT_DIR, `${m.id}.glb`)
    if (existsSync(out) && !args.force) {
      console.log(`• ${m.id} exists (skip; --force to redo)`)
      continue
    }
    const found = findRepacked(srcDir, m.ph)
    if (!found) {
      console.error(`• ${m.id}: no repacked GLB for ${m.ph} under ${srcDir}`)
      continue
    }
    const doc = await io.read(found.glb)
    const before = sceneBounds(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0])
    const fp = bakeFrame(doc, m.yawDeg)
    await doc.transform(
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
      weld(),
      dedup(),
      prune(),
      draco(),
    )
    await io.write(out, doc)
    const footprint = { w: round(fp.w), d: round(fp.d), h: round(fp.h) }
    const sidecar = {
      id: m.id,
      name: m.name,
      category: m.category,
      footprint,
      scale: 1,
      anchor: 'floor-center',
      license: 'CC0',
      attribution: found.meta.attribution ?? 'Poly Haven',
      sourceUrl: found.meta.sourceUrl ?? `https://polyhaven.com/a/${m.ph}`,
    }
    writeFileSync(`${out}.json`, `${JSON.stringify(sidecar, null, 2)}\n`)
    const bytes = statSync(out).size
    rows.push({ id: m.id, bytes, tris: countTriangles(doc), footprint, yaw: m.yawDeg })
    console.log(
      `• ${m.id}  ${(bytes / 1e6).toFixed(2)} MB  ${countTriangles(doc)} tris  ` +
        `fp ${footprint.w}×${footprint.d}×${footprint.h} (src ${round(before.w)}×${round(before.d)}×${round(before.h)}, yaw ${m.yawDeg}°)`,
    )
  }
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  const total = rows.reduce((s, r) => s + r.bytes, 0)
  console.log(`\n${rows.length} hero model(s), ${(total / 1e6).toFixed(2)} MB total`)
  console.log('next: npm run optimize:glb public/assets/furniture && npm run index-assets')
}

function round(n) {
  return Math.round(n * 1000) / 1000
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
