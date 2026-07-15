import { unzipSync } from 'fflate'
import { convertModel } from '../../furniture/convert/convertModel'
import type { FurnitureCategory, PackGltfDef } from '../../furniture/types'
import { IdbAssetStore } from '../../state/storage/IdbAssetStore'
import { useStore } from '../../state/store'
import { glbFootprint } from './footprint'
import { InstalledPackStore } from './installedPackStore'
import {
  inlineGltfUris,
  POLY_HAVEN_API,
  POLY_HAVEN_RESOLUTION,
  type PolyHavenItem,
  polyHavenAttribution,
  polyHavenBundle,
  polyHavenDataMime,
  polyHavenSourceUrl,
  resolvePolyHavenGltfFiles,
} from './polyHaven'
import type { PolyPizzaModel } from './polyPizza'
import { searchPolyPizza } from './polyPizza'
import { packEntryScale, scaledFootprint } from './scaleHeuristic'
import { ThumbnailRenderer } from './thumbnail'
import type { InstalledPack, InstalledPackEntry, Pack } from './types'

export interface InstallOpts {
  signal?: AbortSignal
  /** Injection seam for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch
  /** Notification id to drive (when called from UI). When omitted the
   *  flow opens its own notification. */
  notificationId?: string
}

const glbKey = (packId: string, entryId: string) => `pack:${packId}:${entryId}:glb`
const thumbKey = (packId: string, entryId: string) => `pack:${packId}:${entryId}:thumb`

/** Per-entry overrides for non-CC0 / API-sourced packs (Poly Pizza credits a
 *  different author + licence per model). Omitted → the pack-level defaults. */
interface EntryMeta {
  attribution?: string
  license?: 'CC0' | 'CC-BY'
  sourceUrl?: string
}

/**
 * Turns one GLB's bytes into a persisted pack entry + its runtime def:
 * renders a thumbnail, measures the footprint, applies the per-id scale, and
 * writes the GLB + thumbnail blobs to IDB. Shared by the zip-pack flow and the
 * Poly Pizza API flow.
 */
async function buildEntry(
  pack: Pack,
  descriptor: { id: string; name: string; category: FurnitureCategory },
  glbBytes: Uint8Array,
  renderer: ThumbnailRenderer,
  meta: EntryMeta = {},
): Promise<{ entry: InstalledPackEntry; def: PackGltfDef }> {
  const [thumbBlob, rawFootprint] = await Promise.all([
    renderer.render(glbBytes),
    glbFootprint(glbBytes),
  ])
  const scale = packEntryScale(pack.id, descriptor.id)
  const footprint = scaledFootprint(rawFootprint, scale)

  const gKey = glbKey(pack.id, descriptor.id)
  const tKey = thumbKey(pack.id, descriptor.id)
  const now = new Date().toISOString()

  const glbBlob = new Blob([new Uint8Array(glbBytes)], { type: 'model/gltf-binary' })
  await IdbAssetStore.put({
    assetId: gKey,
    kind: 'gltf',
    mime: 'model/gltf-binary',
    name: descriptor.name,
    uploadedAt: now,
    blob: glbBlob,
    meta: { source: 'pack', packId: pack.id, entryId: descriptor.id, role: 'glb' },
  })
  await IdbAssetStore.put({
    assetId: tKey,
    kind: 'texture',
    mime: thumbBlob.type || 'image/png',
    name: `${descriptor.name} (thumb)`,
    uploadedAt: now,
    blob: thumbBlob,
    meta: { source: 'pack', packId: pack.id, entryId: descriptor.id, role: 'thumb' },
  })

  const entryId = `${pack.id}:${descriptor.id}`
  const attribution = meta.attribution ?? pack.attribution
  const sourceUrl = meta.sourceUrl ?? pack.sourceUrl
  const license = meta.license ?? pack.license
  const entry: InstalledPackEntry = {
    id: entryId,
    packId: pack.id,
    entryId: descriptor.id,
    name: descriptor.name,
    category: descriptor.category,
    scale,
    footprint,
    glbKey: gKey,
    thumbKey: tKey,
    attribution: meta.attribution,
    license: meta.license,
    sourceUrl: meta.sourceUrl,
  }
  const def: PackGltfDef = {
    id: entryId,
    name: descriptor.name,
    category: descriptor.category,
    kind: 'gltf',
    source: 'pack',
    packId: pack.id,
    entryId: descriptor.id,
    defaultFootprint: footprint,
    scale,
    runtimeUrl: URL.createObjectURL(glbBlob),
    thumbUrl: URL.createObjectURL(thumbBlob),
    license,
    attribution,
    sourceUrl,
  }
  return { entry, def }
}

/** Merges freshly-built entries/defs into the store + IDB, additively (so a
 *  second Poly Pizza search appends rather than wiping prior downloads). */
async function commit(
  pack: Pack,
  built: { entry: InstalledPackEntry; def: PackGltfDef }[],
  additive: boolean,
): Promise<InstalledPack> {
  const state = useStore.getState()
  const prior = additive ? (state.installedPacks[pack.id]?.entries ?? []) : []
  // Dedupe by entry id (a re-download of the same model replaces the old one).
  const byId = new Map<string, InstalledPackEntry>()
  for (const e of prior) byId.set(e.id, e)
  for (const { entry } of built) byId.set(entry.id, entry)
  const installed: InstalledPack = {
    packId: pack.id,
    installedAt: new Date().toISOString(),
    entries: [...byId.values()],
  }
  await InstalledPackStore.put(installed)

  state.markPackInstalled(installed)
  const freshIds = new Set(built.map((b) => b.def.id))
  state.setPackFurniture([
    ...state.packFurniture.filter((d) => d.packId !== pack.id || !freshIds.has(d.id)),
    ...built.map((b) => b.def),
  ])
  return installed
}

export async function installPack(pack: Pack, opts: InstallOpts = {}): Promise<InstalledPack> {
  if (pack.kind === 'poly-pizza') throw new Error(`Use installPolyPizzaPack for "${pack.id}".`)
  if (pack.kind === 'ikea-live' || !pack.downloadUrl || !pack.parseEntries) {
    throw new Error(
      `installPack is for zip packs; "${pack.id}" (kind=${pack.kind ?? 'zip'}) has no downloadUrl/parseEntries.`,
    )
  }
  const downloadUrl = pack.downloadUrl
  const parseEntries = pack.parseEntries
  const sizeBytes = pack.sizeBytes ?? 0
  const fetchImpl = opts.fetchImpl ?? fetch
  const { notify } = useStore.getState()
  const notifId =
    opts.notificationId ??
    notify.start({ title: `Installing ${pack.name}`, kind: 'progress', message: 'Downloading…' })

  try {
    const res = await fetchImpl(downloadUrl, { signal: opts.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const total = Number(res.headers.get('Content-Length') ?? sizeBytes)
    if (Math.abs(total - sizeBytes) / sizeBytes > 0.05) {
      throw new Error(
        `Pack size mismatch — server says ${total}B, registry says ${sizeBytes}B (>5% drift). The pack URL may have moved; please report.`,
      )
    }
    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')
    const chunks: Uint8Array[] = []
    let received = 0
    while (true) {
      if (opts.signal?.aborted) throw new Error('Cancelled')
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.byteLength
      notify.update(notifId, {
        progress: 0.5 * (received / total),
        message: `Downloading… ${Math.round((received / total) * 100)}%`,
      })
    }
    const zipBytes = new Uint8Array(received)
    let offset = 0
    for (const c of chunks) {
      zipBytes.set(c, offset)
      offset += c.byteLength
    }

    notify.update(notifId, { progress: 0.55, message: 'Unzipping…' })
    const files = unzipSync(zipBytes)
    notify.update(notifId, { progress: 0.6, message: 'Processing entries…' })

    const descriptors = parseEntries(files)
    const renderer = new ThumbnailRenderer()
    const built: { entry: InstalledPackEntry; def: PackGltfDef }[] = []
    try {
      for (let i = 0; i < descriptors.length; i++) {
        if (opts.signal?.aborted) throw new Error('Cancelled')
        const d = descriptors[i]
        const glbBytes = files[d.glbPath]
        if (!glbBytes) continue
        built.push(await buildEntry(pack, d, glbBytes, renderer))
        notify.update(notifId, {
          progress: 0.6 + 0.4 * ((i + 1) / descriptors.length),
          message: `Processing entries… ${i + 1}/${descriptors.length}`,
        })
      }
    } finally {
      renderer.dispose()
    }

    const installed = await commit(pack, built, false)
    notify.success(notifId, `${built.length} items added to your catalog`)
    return installed
  } catch (err) {
    notify.error(notifId, err instanceof Error ? err.message : String(err))
    throw err
  }
}

export interface PolyPizzaInstallOpts extends InstallOpts {
  apiKey: string
  /** Search term, e.g. "sofa". Defaults to "furniture". */
  query?: string
  /** Max models to fetch (also the API page size). */
  limit?: number
}

/**
 * Installs furniture from the Poly Pizza API: searches, fetches each model's
 * GLB in-browser (CORS-friendly CDN), and registers them through the shared
 * pack pipeline. Additive — repeat searches append to the same pack. Errors are
 * surfaced via the returned rejection (a `PolyPizzaError` carries a user-facing
 * message) and the progress notification.
 */
export async function installPolyPizzaPack(
  pack: Pack,
  opts: PolyPizzaInstallOpts,
): Promise<InstalledPack> {
  if (pack.kind !== 'poly-pizza') throw new Error(`"${pack.id}" is not a Poly Pizza pack.`)
  const fetchImpl = opts.fetchImpl ?? fetch
  const { notify } = useStore.getState()
  const notifId =
    opts.notificationId ??
    notify.start({
      title: `Downloading from ${pack.name}`,
      kind: 'progress',
      message: 'Searching…',
    })

  try {
    const models: PolyPizzaModel[] = await searchPolyPizza(opts.apiKey, opts.query ?? 'furniture', {
      limit: opts.limit ?? 24,
      signal: opts.signal,
      fetchImpl,
    })
    notify.update(notifId, {
      progress: 0.1,
      message: `Found ${models.length} models — downloading…`,
    })

    const renderer = new ThumbnailRenderer()
    const built: { entry: InstalledPackEntry; def: PackGltfDef }[] = []
    try {
      for (let i = 0; i < models.length; i++) {
        if (opts.signal?.aborted) throw new Error('Cancelled')
        const m = models[i]
        let glbBytes: Uint8Array
        try {
          const res = await fetchImpl(m.downloadUrl, { signal: opts.signal })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          glbBytes = new Uint8Array(await res.arrayBuffer())
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') throw err
          // Skip an individual model that fails to download; keep the rest.
          continue
        }
        built.push(
          await buildEntry(
            pack,
            { id: m.id, name: m.name, category: m.category },
            glbBytes,
            renderer,
            {
              attribution: m.attribution,
              license: m.license,
              sourceUrl: `https://poly.pizza/m/${m.id}`,
            },
          ),
        )
        notify.update(notifId, {
          progress: 0.1 + 0.9 * ((i + 1) / models.length),
          message: `Downloading… ${i + 1}/${models.length}`,
        })
      }
    } finally {
      renderer.dispose()
    }

    if (built.length === 0) throw new Error('Every model failed to download (possible CORS issue).')
    const installed = await commit(pack, built, true)
    notify.success(notifId, `${built.length} models added to your catalog`)
    return installed
  } catch (err) {
    notify.error(notifId, err instanceof Error ? err.message : String(err))
    throw err
  }
}

/** Base64-encode bytes for a `data:` URI (chunked so a large texture doesn't
 *  blow the argument limit of `String.fromCharCode(...spread)`). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * Fetch one Poly Haven model's multi-file glTF (`.gltf` + `.bin` + textures) and
 * pack it into a self-contained binary GLB. The dependency URLs come from the
 * API's `include` map — never constructed here. Each dependency is inlined into
 * the glTF as a `data:` URI (so the glTF has zero external refs), then the
 * single self-contained glTF is re-exported to a binary GLB via the shared
 * model-CONVERT pipeline. Inlining is required because CONVERT loads the entry
 * from a `blob:` URL, and relative refs resolved against a `blob:` base are
 * short-circuited by the loader-security manager before its sibling-pool map
 * runs — `data:` URIs pass straight through.
 */
async function fetchPolyHavenGlb(
  item: PolyHavenItem,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const filesRes = await fetchImpl(`${POLY_HAVEN_API}/files/${item.slug}`, { signal })
  if (!filesRes.ok) throw new Error(`files ${item.slug}: HTTP ${filesRes.status}`)
  const plan = resolvePolyHavenGltfFiles(await filesRes.json(), POLY_HAVEN_RESOLUTION)
  if (!plan) throw new Error(`${item.slug}: no ${POLY_HAVEN_RESOLUTION} glTF variant`)

  const fetchBytes = async (url: string, label: string): Promise<Uint8Array> => {
    const res = await fetchImpl(url, { signal })
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  }

  const [gltfBytes, ...depBytes] = await Promise.all([
    fetchBytes(plan.gltfUrl, plan.gltfName),
    ...plan.deps.map((d) => fetchBytes(d.url, d.name)),
  ])
  const dataUriByName: Record<string, string> = {}
  plan.deps.forEach((d, i) => {
    dataUriByName[d.name] = `data:${polyHavenDataMime(d.name)};base64,${bytesToBase64(depBytes[i])}`
  })

  const gltfJson = inlineGltfUris(
    JSON.parse(new TextDecoder().decode(gltfBytes)) as Record<string, unknown>,
    dataUriByName,
  )
  const entry = new File([JSON.stringify(gltfJson)], plan.gltfName, { type: 'model/gltf+json' })
  const { glb } = await convertModel(entry, [])
  return new Uint8Array(await glb.arrayBuffer())
}

/**
 * Installs a curated Poly Haven set-dressing bundle: fetches each item's glTF +
 * textures in-browser (keyless, CORS-friendly), packs each into a self-contained
 * GLB, and registers them through the shared pack pipeline. All items are CC0 —
 * the author is captured for the credit line. An individual item that fails is
 * skipped; the flow only rejects when every item fails.
 */
export async function installPolyHavenBundle(
  pack: Pack,
  opts: InstallOpts = {},
): Promise<InstalledPack> {
  if (pack.kind !== 'poly-haven-bundle') throw new Error(`"${pack.id}" is not a Poly Haven bundle.`)
  const bundle = polyHavenBundle(pack.id)
  if (!bundle) throw new Error(`Unknown Poly Haven bundle "${pack.id}".`)
  const fetchImpl = opts.fetchImpl ?? fetch
  const { notify } = useStore.getState()
  const notifId =
    opts.notificationId ??
    notify.start({
      title: `Adding ${pack.name}`,
      kind: 'progress',
      message: 'Downloading…',
    })

  try {
    const renderer = new ThumbnailRenderer()
    const built: { entry: InstalledPackEntry; def: PackGltfDef }[] = []
    try {
      for (let i = 0; i < bundle.items.length; i++) {
        if (opts.signal?.aborted) throw new Error('Cancelled')
        const item = bundle.items[i]
        let glbBytes: Uint8Array
        try {
          glbBytes = await fetchPolyHavenGlb(item, fetchImpl, opts.signal)
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') throw err
          // Skip an item that fails to download/convert; keep the rest.
          continue
        }
        built.push(
          await buildEntry(
            pack,
            { id: item.slug, name: item.name, category: item.category },
            glbBytes,
            renderer,
            {
              attribution: polyHavenAttribution(item),
              license: 'CC0',
              sourceUrl: polyHavenSourceUrl(item.slug),
            },
          ),
        )
        notify.update(notifId, {
          progress: (i + 1) / bundle.items.length,
          message: `Downloading… ${i + 1}/${bundle.items.length}`,
        })
      }
    } finally {
      renderer.dispose()
    }

    if (built.length === 0)
      throw new Error('Every item failed to download (possible network/CORS issue).')
    const installed = await commit(pack, built, false)
    notify.success(notifId, `${built.length} items added to your catalog`)
    return installed
  } catch (err) {
    notify.error(notifId, err instanceof Error ? err.message : String(err))
    throw err
  }
}
