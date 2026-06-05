import type { MaterialCategory } from '../../../materials/types'
import { mapPolyHavenFurnitureCategory } from '../category-map'
import type { AssetBundle, RemoteEntry, RemoteProvider, Resolution } from '../types'

const API = 'https://api.polyhaven.com'
const CDN_THUMB = (slug: string) =>
  `https://cdn.polyhaven.com/asset_img/thumbs/${slug}.png?height=150`
const PAGE_URL = (slug: string) => `https://polyhaven.com/a/${slug}`

interface PHAssetMeta {
  name: string
  categories?: string[]
  authors?: Record<string, string>
  tags?: string[]
}

const tagsFor = (m: PHAssetMeta): string[] => [...(m.tags ?? []), ...(m.categories ?? [])]
type PHIndex = Record<string, PHAssetMeta>

interface PHFile {
  url: string
  md5?: string
  size?: number
}

/**
 * Poly Haven `/files/{slug}` response shape, as observed against the live API.
 *
 * Top-level keys are channel names (Diffuse, nor_gl, Rough, arm, …) for
 * texture assets, plus packaged-format keys (`gltf`, `blend`, `fbx`, `usd`).
 *
 * For models, `gltf[resolution].gltf` holds the .gltf URL plus an `include`
 * record of every relative dependency the .gltf references (.bin and the
 * texture jpgs), keyed by the relative path the .gltf JSON uses.
 *
 * For textures the channel keys hold `{ resolution: { format: PHFile } }`.
 */
interface PHFiles {
  // Channel keys (textures & per-channel files for models).
  Diffuse?: Record<string, Record<string, PHFile>>
  nor_gl?: Record<string, Record<string, PHFile>>
  Rough?: Record<string, Record<string, PHFile>>
  arm?: Record<string, Record<string, PHFile>> // AO/Rough/Metal packed
  AO?: Record<string, Record<string, PHFile>>
  // Packaged formats.
  gltf?: Record<
    string,
    {
      gltf?: PHFile & { include?: Record<string, PHFile> }
    }
  >
}

const FALLBACK_ORDER: Resolution[] = ['2k', '1k', '4k']

function pickResolution<T>(
  byRes: Record<string, T> | undefined,
  preferred: Resolution,
): T | undefined {
  if (!byRes) return undefined
  if (byRes[preferred]) return byRes[preferred]
  for (const r of FALLBACK_ORDER) if (byRes[r]) return byRes[r]
  const first = Object.keys(byRes)[0]
  return first ? byRes[first] : undefined
}

function pickJpg(byFormat: Record<string, PHFile> | undefined): PHFile | undefined {
  return byFormat?.jpg ?? byFormat?.png ?? Object.values(byFormat ?? {})[0]
}

const attrib = (a: PHAssetMeta) =>
  `Poly Haven — ${Object.keys(a.authors ?? { Unknown: '' }).join(', ')}`

function materialCategoryFor(meta: PHAssetMeta): MaterialCategory {
  const cats = meta.categories ?? []
  return cats.some((c) => /wall|brick|plaster|paint/i.test(c)) ? 'wall' : 'floor'
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Poly Haven ${res.status}: ${url}`)
  return (await res.json()) as T
}

async function fetchIndex(signal?: AbortSignal): Promise<RemoteEntry[]> {
  const [models, textures] = await Promise.all([
    fetchJson<PHIndex>(`${API}/assets?t=models`, signal),
    fetchJson<PHIndex>(`${API}/assets?t=textures`, signal),
  ])
  const out: RemoteEntry[] = []
  for (const [slug, meta] of Object.entries(models)) {
    out.push({
      provider: 'polyhaven',
      slug,
      kind: 'furniture',
      name: meta.name,
      category: mapPolyHavenFurnitureCategory(meta.categories ?? []),
      thumbUrl: CDN_THUMB(slug),
      resolutions: ['1k', '2k', '4k'],
      attribution: attrib(meta),
      sourceUrl: PAGE_URL(slug),
      tags: tagsFor(meta),
    })
  }
  for (const [slug, meta] of Object.entries(textures)) {
    out.push({
      provider: 'polyhaven',
      slug,
      kind: 'material',
      name: meta.name,
      category: materialCategoryFor(meta),
      thumbUrl: CDN_THUMB(slug),
      resolutions: ['1k', '2k', '4k'],
      attribution: attrib(meta),
      sourceUrl: PAGE_URL(slug),
      tags: tagsFor(meta),
    })
  }
  return out
}

async function fetchThumbnail(entry: RemoteEntry, signal?: AbortSignal): Promise<Blob> {
  const r = await fetch(entry.thumbUrl, { signal })
  if (!r.ok) throw new Error(`Thumb ${r.status}`)
  return r.blob()
}

async function fetchBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(`Poly Haven ${r.status}: ${url}`)
  return r.blob()
}

async function fetchAsset(
  entry: RemoteEntry,
  resolution: Resolution,
  signal?: AbortSignal,
): Promise<AssetBundle> {
  const files = await fetchJson<PHFiles>(`${API}/files/${entry.slug}`, signal)
  if (entry.kind === 'material') {
    const channels: Record<string, Blob> = {}
    // Albedo (Diffuse).
    const diff = pickJpg(pickResolution(files.Diffuse, resolution))
    if (!diff) throw new Error(`No diffuse texture for ${entry.slug}`)
    channels.albedo = await fetchBlob(diff.url, signal)
    // Normal (OpenGL convention preferred).
    const nor = pickJpg(pickResolution(files.nor_gl, resolution))
    if (nor) channels.normal = await fetchBlob(nor.url, signal)
    // Roughness — either standalone Rough channel or G of the packed ARM.
    const rough = pickJpg(pickResolution(files.Rough, resolution))
    if (rough) channels.roughness = await fetchBlob(rough.url, signal)
    // AO — standalone or R of the ARM channel.
    const ao = pickJpg(pickResolution(files.AO, resolution))
    if (ao) channels.ao = await fetchBlob(ao.url, signal)
    return { kind: 'material', channels }
  }

  // Furniture (model) path.
  const bucket = pickResolution(files.gltf, resolution)
  const gltfFile = bucket?.gltf
  if (!gltfFile?.url) {
    throw new Error(
      `No .gltf for ${entry.slug} (resolutions available: ${
        Object.keys(files.gltf ?? {}).join(', ') || 'none'
      })`,
    )
  }
  const gltfRes = await fetch(gltfFile.url, { signal })
  if (!gltfRes.ok) throw new Error(`Poly Haven gltf ${gltfRes.status}`)
  const gltfJson = (await gltfRes.json()) as object

  let bin: Blob | undefined
  const textures: Record<string, Blob> = {}
  for (const [path, file] of Object.entries(gltfFile.include ?? {})) {
    const blob = await fetchBlob(file.url, signal)
    if (path.endsWith('.bin')) bin = blob
    else textures[path] = blob
  }

  return {
    kind: 'furniture',
    gltfJson,
    bin,
    textures,
    rootPath: gltfFile.url.split('/').pop() ?? `${entry.slug}.gltf`,
  }
}

/** Sum the byte sizes of exactly the files {@link fetchAsset} would download
 *  for `resolution`, so a card can show the cost before the user clicks.
 *  Returns null if the API exposes no size for the picked files. */
async function fetchSize(
  entry: RemoteEntry,
  resolution: Resolution,
  signal?: AbortSignal,
): Promise<number | null> {
  const files = await fetchJson<PHFiles>(`${API}/files/${entry.slug}`, signal)
  let total = 0
  let any = false
  const add = (f?: PHFile) => {
    if (f?.size != null) {
      total += f.size
      any = true
    }
  }
  if (entry.kind === 'material') {
    add(pickJpg(pickResolution(files.Diffuse, resolution)))
    add(pickJpg(pickResolution(files.nor_gl, resolution)))
    add(pickJpg(pickResolution(files.Rough, resolution)))
    add(pickJpg(pickResolution(files.AO, resolution)))
  } else {
    const gltfFile = pickResolution(files.gltf, resolution)?.gltf
    add(gltfFile)
    for (const f of Object.values(gltfFile?.include ?? {})) add(f)
  }
  return any ? total : null
}

export const polyhaven: RemoteProvider = {
  id: 'polyhaven',
  fetchIndex,
  fetchThumbnail,
  fetchAsset,
  fetchSize,
}
