import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { type CreditEntry, emitCredits } from './emit-credits'
import { inferMaterialSidecar } from './materialChannels'
import { deriveBoundingBox } from './process-glb'
import {
  type FurnitureSidecar,
  type MaterialSidecar,
  readSidecar,
  resolveFurnitureMetadata,
} from './sidecar'

export interface IndexOptions {
  projectRoot: string
}

// Generated LOD proxies (`foo-low.glb` / `foo-medium.glb`, produced by
// optimize_glb_lod.mjs) are tier siblings of a base GLB — the runtime resolves
// them by suffix, they are NOT their own catalog entries. Skip them here (same
// guard the optimize/compress scripts use) so a base that ships LOD variants
// doesn't spawn phantom `dropped-foo-low` defs.
const LOD_VARIANT_RE = /-(low|medium)\.glb$/i

function walk(dir: string, ext: RegExp): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) out.push(...walk(p, ext))
    else if (ext.test(name) && !LOD_VARIANT_RE.test(name)) out.push(p)
  }
  return out
}

// Asset paths are relative to `public/` (no leading slash) and wrapped in a
// `${BASE}` placeholder so the emitter can prepend Vite's `import.meta.env.
// BASE_URL` (which is `/` in dev/test and the configured sub-path — e.g.
// `/sofa-so-good/` — in a production build). A root-absolute `/assets/...`
// literal would 404 under a non-root `base`. `BASE_URL` always ends in `/`.
function baseUrlExpr(relPath: string): string {
  return `\`\${import.meta.env.BASE_URL}${relPath}\``
}

function tsLiteralFurniture(meta: FurnitureSidecar, relPath: string): string {
  const attrLine = meta.attribution ? `    attribution: ${JSON.stringify(meta.attribution)},\n` : ''
  const srcLine = meta.sourceUrl ? `    sourceUrl: ${JSON.stringify(meta.sourceUrl)},\n` : ''
  const noClipLine = meta.noClip ? `    noClip: true,\n` : ''
  return `  {
    kind: 'gltf',
    id: ${JSON.stringify(meta.id)},
    name: ${JSON.stringify(meta.name)},
    category: ${JSON.stringify(meta.category)},
    source: 'builtin',
    url: ${baseUrlExpr(relPath)},
    license: ${JSON.stringify(meta.license ?? 'CC0')},
${attrLine}${srcLine}${noClipLine}    defaultFootprint: { w: ${meta.footprint.w}, d: ${meta.footprint.d}, h: ${meta.footprint.h} },
    scale: ${meta.scale},
  },\n`
}

function tsLiteralMaterial(meta: MaterialSidecar, baseDir: string): string {
  const albedo = baseUrlExpr(`${baseDir}/${meta.channels.albedo}`)
  const normal = meta.channels.normal
    ? `\n      normal: ${baseUrlExpr(`${baseDir}/${meta.channels.normal}`)},`
    : ''
  const rough = meta.channels.rough
    ? `\n      roughness: ${baseUrlExpr(`${baseDir}/${meta.channels.rough}`)},`
    : ''
  const ao = meta.channels.ao ? `\n      ao: ${baseUrlExpr(`${baseDir}/${meta.channels.ao}`)},` : ''
  const srcUrl = meta.sourceUrl ? JSON.stringify(meta.sourceUrl) : "''"
  const sourceField = `'${meta.sourceUrl?.includes('ambientcg') ? 'ambientcg' : 'polyhaven'}'`
  // Sidecar-declared mean-albedo swatch (picker-chip preview colour); neutral
  // grey placeholder for folders whose sidecar predates the field.
  const swatch = meta.swatch ?? '#888888'
  return `  {
    id: ${JSON.stringify(meta.id)},
    name: ${JSON.stringify(meta.name)},
    category: ${JSON.stringify(meta.category)},
    kind: 'textured',
    source: ${sourceField},
    swatch: ${JSON.stringify(swatch)},
    sourceUrl: ${srcUrl},
    textures: {
      albedo: ${albedo},${normal}${rough}${ao}
    },
    uvScale: [${meta.uvScale[0]}, ${meta.uvScale[1]}],
  },\n`
}

export async function indexAssets(opts: IndexOptions): Promise<void> {
  const root = opts.projectRoot
  const furnitureDir = join(root, 'public/assets/furniture')
  const materialsDir = join(root, 'public/assets/materials')

  const glbs = walk(furnitureDir, /\.glb$/i)
  const seen = new Set<string>()
  const furnitureLits: string[] = []
  const furnitureCredits: CreditEntry[] = []
  for (const glb of glbs) {
    const sidecar = readSidecar<FurnitureSidecar>(glb)
    const meta = await resolveFurnitureMetadata({
      glbPath: glb,
      sidecar,
      bboxFn: deriveBoundingBox,
    })
    if (seen.has(meta.id)) {
      throw new Error(`duplicate id "${meta.id}" in ${glb}`)
    }
    seen.add(meta.id)
    const relPath = relative(join(root, 'public'), glb).replace(/\\/g, '/')
    furnitureLits.push(tsLiteralFurniture(meta, relPath))
    // Credit any bundled asset that carries attribution (CC0 needs none, but a
    // CC-BY model must be credited).
    if (meta.attribution && meta.sourceUrl) {
      furnitureCredits.push({
        id: meta.id,
        name: meta.name,
        attribution: meta.attribution,
        sourceUrl: meta.sourceUrl,
        license: meta.license ?? 'CC0',
      })
    }
  }

  const materialDirs = existsSync(materialsDir)
    ? readdirSync(materialsDir)
        .map((n) => join(materialsDir, n))
        .filter((p) => statSync(p).isDirectory())
    : []
  const matSeen = new Set<string>()
  const materialLits: string[] = []
  const materialCredits: CreditEntry[] = []
  for (const md of materialDirs) {
    // A hand-authored sidecar always wins. When none exists, fall back to
    // auto-detecting the PBR channel map from the texture filenames so a bare
    // Poly Haven / ambientCG download folder "just works" (see materialChannels).
    let meta = readSidecar<MaterialSidecar>(join(md, 'material'))
    if (!meta) {
      const files = readdirSync(md).filter((n) => statSync(join(md, n)).isFile())
      const folderName = basename(md)
      const { sidecar, detection } = inferMaterialSidecar(folderName, files)
      for (const w of detection.warnings) {
        console.warn(`[index-assets] material "${folderName}": ${w}`)
      }
      for (const ig of detection.ignored) {
        console.warn(
          `[index-assets] material "${folderName}": ignoring ${ig.channel} map "${ig.file}" (runtime binds only albedo/normal/roughness/ao)`,
        )
      }
      if (!sidecar) continue
      const inferred = Object.entries(sidecar.channels)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')
      console.log(
        `[index-assets] auto-detected material "${sidecar.id}" (${sidecar.category}): ${inferred}`,
      )
      meta = sidecar
    }
    if (matSeen.has(meta.id)) throw new Error(`duplicate id "${meta.id}" in ${md}`)
    matSeen.add(meta.id)
    const baseDir = relative(join(root, 'public'), md).replace(/\\/g, '/')
    materialLits.push(tsLiteralMaterial(meta, baseDir))
    if (meta.attribution && meta.sourceUrl) {
      materialCredits.push({
        id: meta.id,
        name: meta.name,
        attribution: meta.attribution,
        sourceUrl: meta.sourceUrl,
        license: meta.license ?? 'CC0',
      })
    }
  }

  mkdirSync(join(root, 'src/furniture'), { recursive: true })
  mkdirSync(join(root, 'src/materials'), { recursive: true })

  const furnitureModule = `// AUTO-GENERATED by scripts/asset-pipeline/index-assets.ts. Do not edit.
import type { FurnitureDef } from './types';

/**
 * Merge the auto-generated CC0 GLB set-dressing props into a base catalog, for
 * LOOKUP only — the base \`defs\` win on any id clash. Used by the decor-styling
 * pass so it can resolve bundled props (vases, books, plants, a tea set) that
 * live here and not in \`BUILTIN_CATALOG\`, without mutating the caller's catalog.
 * The \`GENERATED_FURNITURE\` list is appended at the bottom of this file.
 */
export function mergeGeneratedCatalog(
  defs: Record<string, FurnitureDef>,
): Record<string, FurnitureDef> {
  const merged: Record<string, FurnitureDef> = { ...defs };
  for (const g of GENERATED_FURNITURE) if (!merged[g.id]) merged[g.id] = g;
  return merged;
}

export const GENERATED_FURNITURE: FurnitureDef[] = [
${furnitureLits.join('')}];
`
  const materialModule = `// AUTO-GENERATED by scripts/asset-pipeline/index-assets.ts. Do not edit.
import type { MaterialDef } from './types';

export const GENERATED_MATERIALS: MaterialDef[] = [
${materialLits.join('')}];
`

  writeFileSync(join(root, 'src/furniture/generatedCatalog.ts'), furnitureModule)
  writeFileSync(join(root, 'src/materials/generatedCatalog.ts'), materialModule)

  // Keep CREDITS.json / CREDITS.md in sync with whatever is bundled, so a
  // single `npm run index-assets` never leaves an attribution-required asset
  // (e.g. CC-BY) uncredited.
  emitCredits({ projectRoot: root, furniture: furnitureCredits, materials: materialCredits })
}
