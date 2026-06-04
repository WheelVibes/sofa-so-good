import { unzipSync } from 'fflate'
import type { FurnitureCategory, PackGltfDef } from '../../furniture/types'
import { IdbAssetStore } from '../../state/storage/IdbAssetStore'
import { useStore } from '../../state/store'
import { glbFootprint } from './footprint'
import { InstalledPackStore } from './installedPackStore'
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
