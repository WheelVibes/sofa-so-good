import type { RemoteGltfDef } from '../../furniture/types'
import { showroomFinishFor } from '../../materials/showroomCatalog'
import { resolveTileSize } from '../../materials/tileSize'
import type { TexturedMaterialDef } from '../../materials/types'
import { gltfJsonFootprint } from './gltfBounds'
import type { AssetBundle, RemoteEntry, Resolution } from './types'
import { RESOLUTION_PIXELS } from './types'

const blobUrl = (b: Blob) => URL.createObjectURL(b)

interface GltfWithUris {
  buffers?: { uri?: string }[]
  images?: { uri?: string }[]
}

export function bundleToMaterialDef(
  entry: RemoteEntry,
  resolution: Resolution,
  bundle: AssetBundle,
): TexturedMaterialDef {
  if (bundle.kind !== 'material') throw new Error('not a material bundle')
  const c = bundle.channels
  const albedoUrl = c.albedo ? blobUrl(c.albedo) : undefined
  if (!albedoUrl) throw new Error('material bundle missing albedo')
  const urls = {
    albedo: albedoUrl,
    normal: c.normal ? blobUrl(c.normal) : undefined,
    roughness: c.roughness ? blobUrl(c.roughness) : undefined,
    ao: c.ao ? blobUrl(c.ao) : undefined,
    // Optional extras — only some scans ship them (ambientCG: metalness on
    // ~18%, opacity on ~2%, displacement on all). Absent channels stay
    // undefined and cost nothing downstream.
    metalness: c.metalness ? blobUrl(c.metalness) : undefined,
    opacity: c.opacity ? blobUrl(c.opacity) : undefined,
    displacement: c.displacement ? blobUrl(c.displacement) : undefined,
  }
  // SHOWROOM-FINISHES — a curated showroom pick carries hand-tuned metadata:
  // its honest name, a mean-albedo swatch, and (most importantly) the physical
  // metres-per-tile the scan reads correctly at on the world-UV surfaces. A
  // generic pack-browser download keeps the provider name + the legacy 1 m
  // tile default.
  const curated = entry.provider === 'polyhaven' ? showroomFinishFor(entry.slug) : null
  // Physical metres-per-tile, best source first: a curated showroom value, the
  // provider's own scanned size (ambientCG ships one per asset), else the
  // legacy 1 m default — capped either way by what this resolution can cover
  // sharply, so a map is never asked to stretch past its own texels.
  const tile = resolveTileSize({
    scanMetres: curated?.uvScale?.[0] ?? entry.uvScale?.[0],
    fallbackMetres: 1,
    pixels: RESOLUTION_PIXELS[resolution],
  })
  return {
    id: `${entry.provider}:${entry.slug}:${resolution}`,
    name: curated?.name ?? entry.name,
    category: (curated?.category ?? entry.category) as 'floor' | 'wall',
    swatch: curated?.swatch ?? '#cccccc',
    kind: 'textured',
    source: entry.provider as 'polyhaven' | 'ambientcg',
    slug: entry.slug,
    resolution,
    sourceUrl: entry.sourceUrl,
    thumbUrl: entry.thumbUrl,
    textures: urls,
    uvScale: [tile.metres, tile.metres],
    runtimeUrls: urls,
  }
}

/**
 * Builds a self-contained gltf JSON whose `buffers[].uri` and `images[].uri`
 * are object URLs to the in-memory blobs. No URLModifier is needed on the
 * loader because GLTFLoader resolves `blob:` URIs directly.
 */
export function bundleToFurnitureDef(
  entry: RemoteEntry,
  resolution: Resolution,
  bundle: AssetBundle,
): RemoteGltfDef {
  if (bundle.kind !== 'furniture') throw new Error('not a furniture bundle')
  const json = JSON.parse(JSON.stringify(bundle.gltfJson)) as GltfWithUris
  const runtimeAssets: Record<string, string> = {}

  // Map texture path → object URL.
  const textureUrls: Record<string, string> = {}
  for (const [path, blob] of Object.entries(bundle.textures)) {
    const u = blobUrl(blob)
    textureUrls[path] = u
    runtimeAssets[path] = u
    // Try common variants of the path: GLTFLoader uses URI as-is from JSON.
    const base = path.split('/').pop() ?? path
    textureUrls[base] = u
  }

  // Rewrite images[].uri to point at object URLs. If a texture wasn't fetched
  // into `bundle.textures` (should not happen for a well-formed bundle) this
  // falls back to the source glTF's original `uri` — if that were ever a
  // foreign absolute URL, the runtime render loader's shared SEC-1 policy
  // (`furniture/gltf/loaderSecurity.ts`) still blocks the fetch at render time.
  for (const img of json.images ?? []) {
    if (!img.uri) continue
    const original = img.uri
    img.uri = textureUrls[original] ?? textureUrls[original.split('/').pop() ?? ''] ?? original
  }

  // Rewrite buffers[].uri to point at the bin object URL.
  if (bundle.bin && json.buffers && json.buffers.length > 0) {
    const binUrl = blobUrl(bundle.bin)
    runtimeAssets[json.buffers[0].uri ?? 'scene.bin'] = binUrl
    json.buffers[0].uri = binUrl
  }

  const gltfBlob = new Blob([JSON.stringify(json)], { type: 'model/gltf+json' })
  const runtimeUrl = blobUrl(gltfBlob)

  // Seed a real footprint from the glTF POSITION accessor bounds so pre-render
  // placement / collision / catalog sizing / budget don't use a 1×1×1 m guess.
  // `GltfModel` still measures + caches the authoritative bbox after first
  // render; this just makes the PRE-render value honest. Falls back to the old
  // 1×1×1 placeholder when bounds are unavailable or absurd (see gltfBounds.ts).
  const defaultFootprint = gltfJsonFootprint(bundle.gltfJson) ?? { w: 1, d: 1, h: 1 }

  return {
    id: `${entry.provider}:${entry.slug}:${resolution}`,
    name: entry.name,
    category: entry.category as RemoteGltfDef['category'],
    defaultFootprint,
    kind: 'gltf',
    source: 'remote',
    provider: entry.provider,
    slug: entry.slug,
    resolution,
    runtimeUrl,
    runtimeAssets,
    license: 'CC0',
    attribution: entry.attribution,
    sourceUrl: entry.sourceUrl,
  }
}
