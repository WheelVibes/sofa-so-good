import { unzipSync } from 'fflate'
import type { MaterialCategory } from '../../../materials/types'
import type { AssetBundle, RemoteEntry, RemoteProvider, Resolution } from '../types'

// ambientCG's API and CDN don't send CORS headers, so browser fetches go
// through a same-origin proxy (Vite dev proxy in development; production
// deployments need an equivalent reverse-proxy — see TODO.md). Asset zip
// links returned by the API are rewritten to the proxied origin too.
const API = '/acg/api/v2/full_json'
const PAGE_URL = (slug: string) => `https://ambientcg.com/view?id=${slug}`

function proxify(url: string): string {
  return url
    .replace(/^https?:\/\/acg-media\.ambientcg\.com/i, '/acg-cdn')
    .replace(/^https?:\/\/ambientcg\.com/i, '/acg')
}

interface AcgAsset {
  assetId: string
  displayName: string
  category?: string
  previewImage?: Record<string, string>
  downloadFolders?: Array<{
    downloadFiletypeCategories?: {
      zip?: { downloads?: Array<{ attribute: string; downloadLink: string }> }
    }
  }>
}

function categoryFor(meta: AcgAsset): MaterialCategory {
  const c = (meta.category ?? '').toLowerCase()
  return /wall|brick|plaster|tile|wallpaper/.test(c) ? 'wall' : 'floor'
}

function thumbFor(meta: AcgAsset): string {
  return (
    meta.previewImage?.['128-PNG'] ??
    meta.previewImage?.['200-PNG'] ??
    Object.values(meta.previewImage ?? {})[0] ??
    ''
  )
}

function zipUrlFor(meta: AcgAsset, resolution: Resolution): string | undefined {
  const want = `${resolution.toUpperCase()}-JPG`
  for (const f of meta.downloadFolders ?? []) {
    for (const d of f.downloadFiletypeCategories?.zip?.downloads ?? []) {
      if (d.attribute === want) return d.downloadLink
    }
  }
  return undefined
}

async function fetchIndex(signal?: AbortSignal): Promise<RemoteEntry[]> {
  const url = `${API}?type=Material&include=imageData,downloadData`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`ambientCG ${res.status}`)
  const json = (await res.json()) as { foundAssets: AcgAsset[] }
  return json.foundAssets.map((a) => ({
    provider: 'ambientcg' as const,
    slug: a.assetId,
    kind: 'material' as const,
    name: a.displayName,
    category: categoryFor(a),
    thumbUrl: proxify(thumbFor(a)),
    resolutions: ['1k', '2k', '4k'] as Resolution[],
    attribution: 'ambientCG (CC0)',
    sourceUrl: PAGE_URL(a.assetId),
    tags: a.category ? [a.category] : [],
  }))
}

async function fetchThumbnail(entry: RemoteEntry, signal?: AbortSignal): Promise<Blob> {
  const r = await fetch(entry.thumbUrl, { signal })
  if (!r.ok) throw new Error(`ambientCG thumb ${r.status}`)
  return r.blob()
}

async function fetchAsset(
  entry: RemoteEntry,
  resolution: Resolution,
  signal?: AbortSignal,
): Promise<AssetBundle> {
  const url = `${API}?id=${encodeURIComponent(entry.slug)}&include=downloadData`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`ambientCG ${res.status}`)
  const json = (await res.json()) as { foundAssets: AcgAsset[] }
  const meta = json.foundAssets[0]
  if (!meta) throw new Error(`ambientCG asset ${entry.slug} not found`)
  const zipUrl = zipUrlFor(meta, resolution)
  if (!zipUrl) throw new Error(`No ${resolution} zip for ${entry.slug}`)
  const zipRes = await fetch(proxify(zipUrl), { signal })
  if (!zipRes.ok) throw new Error(`ambientCG zip ${zipRes.status}`)
  const buf = new Uint8Array(await zipRes.arrayBuffer())
  const files = unzipSync(buf)
  const channels: Record<string, Blob> = {}
  // NormalGL (not NormalDX) — three.js is OpenGL-convention. Displacement feeds
  // the parallax-occlusion floor path, metalness/opacity the maps of the same
  // name; the DCC files (.blend/.usdc/.mtlx/.tres) have no browser use.
  const want: { ch: string; re: RegExp; mime: string }[] = [
    { ch: 'albedo', re: /Color\.(jpg|png)$/i, mime: 'image/jpeg' },
    { ch: 'normal', re: /NormalGL\.(jpg|png)$/i, mime: 'image/jpeg' },
    { ch: 'roughness', re: /Roughness\.(jpg|png)$/i, mime: 'image/jpeg' },
    { ch: 'ao', re: /AmbientOcclusion\.(jpg|png)$/i, mime: 'image/jpeg' },
    { ch: 'metalness', re: /Metalness\.(jpg|png)$/i, mime: 'image/jpeg' },
    { ch: 'opacity', re: /Opacity\.(jpg|png)$/i, mime: 'image/jpeg' },
    { ch: 'displacement', re: /Displacement\.(jpg|png)$/i, mime: 'image/jpeg' },
  ]
  for (const [name, bytes] of Object.entries(files)) {
    for (const { ch, re, mime } of want) {
      if (re.test(name) && !channels[ch]) {
        const ab = new Uint8Array(bytes).buffer as ArrayBuffer
        channels[ch] = new Blob([ab], { type: mime })
      }
    }
  }
  if (!channels.albedo) throw new Error(`No color channel in ${entry.slug} zip`)
  return { kind: 'material', channels }
}

export const ambientcg: RemoteProvider = {
  id: 'ambientcg',
  fetchIndex,
  fetchThumbnail,
  fetchAsset,
}
