import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { downloadToCache } from './asset-pipeline/cache'
import { emitCredits } from './asset-pipeline/emit-credits'
import { indexAssets } from './asset-pipeline/index-assets'
import {
  type FurnitureManifestEntry,
  furnitureManifestFile,
  type MaterialManifestEntry,
  materialManifestFile,
} from './asset-pipeline/manifest'
import { processGlb } from './asset-pipeline/process-glb'
import { processTexture } from './asset-pipeline/process-texture'
import { writeSidecar } from './asset-pipeline/sidecar'

const args = new Set(process.argv.slice(2))
const QUICK = args.has('--quick')
// Opt-in build-time KTX2/UASTC texture compression for furniture GLBs. Off by
// default (CPU-heavy); no-ops when the encoder is unavailable. See ktx2-encode.ts.
const KTX2 = args.has('--ktx2')
const projectRoot = process.cwd()
const cacheRoot = join(projectRoot, '.asset-cache')

async function fetchFurniture(entries: FurnitureManifestEntry[]): Promise<void> {
  for (const e of entries) {
    console.log(`[furniture] ${e.id}`)
    const cached = await downloadToCache(cacheRoot, e.downloadUrl)
    const out = join(projectRoot, 'public/assets/furniture', `${e.id}.glb`)
    await processGlb(cached, out, { compress: !QUICK, ktx2: KTX2 })
    writeSidecar(out, {
      id: e.id,
      name: e.name,
      category: e.category,
      footprint: e.footprint,
      scale: e.scale,
      anchor: e.anchor,
      license: e.license,
      attribution: e.attribution,
      sourceUrl: e.sourceUrl,
    })
  }
}

async function fetchMaterials(entries: MaterialManifestEntry[]): Promise<void> {
  for (const e of entries) {
    console.log(`[material] ${e.id}`)
    const dir = join(projectRoot, 'public/assets/materials', e.id)
    mkdirSync(dir, { recursive: true })
    const channels: Record<string, string> = {}
    for (const [key, url] of Object.entries(e.downloads)) {
      if (!url) continue
      const cached = await downloadToCache(cacheRoot, url)
      const ext =
        cached.toLowerCase().endsWith('.jpg') || cached.toLowerCase().endsWith('.jpeg')
          ? 'jpg'
          : 'png'
      const outName = `${key}.${ext}`
      await processTexture(cached, join(dir, outName), { maxSize: 2048 })
      channels[key] = outName
    }
    writeSidecar(join(dir, 'material'), {
      id: e.id,
      name: e.name,
      category: e.category,
      uvScale: e.uvScale,
      channels,
      license: e.license,
      attribution: e.attribution,
      sourceUrl: e.sourceUrl,
    })
  }
}

async function main(): Promise<void> {
  const furniturePath = join(projectRoot, 'assets/manifest/furniture.json')
  const materialPath = join(projectRoot, 'assets/manifest/materials.json')
  if (!existsSync(furniturePath) || !existsSync(materialPath)) {
    throw new Error(`Missing manifest at ${furniturePath} or ${materialPath}`)
  }
  const furniture = furnitureManifestFile.parse(JSON.parse(readFileSync(furniturePath, 'utf8')))
  const materials = materialManifestFile.parse(JSON.parse(readFileSync(materialPath, 'utf8')))

  await fetchFurniture(furniture)
  await fetchMaterials(materials)

  emitCredits({
    projectRoot,
    furniture: furniture.map((e) => ({
      id: e.id,
      name: e.name,
      attribution: e.attribution,
      sourceUrl: e.sourceUrl,
      license: e.license,
    })),
    materials: materials.map((e) => ({
      id: e.id,
      name: e.name,
      attribution: e.attribution,
      sourceUrl: e.sourceUrl,
      license: e.license,
    })),
  })

  await indexAssets({ projectRoot })
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
