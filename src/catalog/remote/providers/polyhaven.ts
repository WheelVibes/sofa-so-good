import type { MaterialCategory } from '../../../materials/types'
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
 * Top-level keys are channel names (Diffuse, nor_gl, Rough, arm, …); each holds
 * `{ resolution: { format: PHFile } }`.
 *
 * Poly Haven **models** (furniture) are intentionally NOT surfaced — only its
 * CC0 **materials/textures** are used as an asset source (product decision), so
 * the packaged-format keys (`gltf`/`fbx`/…) are not parsed.
 */
interface PHFiles {
  // Channel keys (texture maps).
  Diffuse?: Record<string, Record<string, PHFile>>
  nor_gl?: Record<string, Record<string, PHFile>>
  Rough?: Record<string, Record<string, PHFile>>
  arm?: Record<string, Record<string, PHFile>> // AO/Rough/Metal packed
  AO?: Record<string, Record<string, PHFile>>
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
  // Materials/textures only — Poly Haven furniture models are deliberately not
  // an asset source here (we only ingest its CC0 PBR materials).
  const textures = await fetchJson<PHIndex>(`${API}/assets?t=textures`, signal)
  const out: RemoteEntry[] = []
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
  // Materials only — Poly Haven furniture is not an asset source here.
  if (entry.kind !== 'material')
    throw new Error(`Poly Haven only serves materials, got ${entry.kind}`)
  const files = await fetchJson<PHFiles>(`${API}/files/${entry.slug}`, signal)
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

/** Total bytes a {@link fetchAsset} would download for this entry+resolution —
 *  the sum of exactly the files that path picks, so the estimate matches the
 *  real download. Returns null if the files endpoint lacks sizes. */
async function fetchSize(
  entry: RemoteEntry,
  resolution: Resolution,
  signal?: AbortSignal,
): Promise<number | null> {
  if (entry.kind !== 'material') return null
  const files = await fetchJson<PHFiles>(`${API}/files/${entry.slug}`, signal)
  let total = 0
  let any = false
  const add = (f: PHFile | undefined) => {
    if (f && typeof f.size === 'number') {
      total += f.size
      any = true
    }
  }
  add(pickJpg(pickResolution(files.Diffuse, resolution)))
  add(pickJpg(pickResolution(files.nor_gl, resolution)))
  add(pickJpg(pickResolution(files.Rough, resolution)))
  add(pickJpg(pickResolution(files.AO, resolution)))
  return any ? total : null
}

export const polyhaven: RemoteProvider = {
  id: 'polyhaven',
  fetchIndex,
  fetchThumbnail,
  fetchAsset,
  fetchSize,
}
