import { glbFootprint } from '../../catalog/packs/footprint'
import { InstalledPackStore } from '../../catalog/packs/installedPackStore'
import { AVAILABLE_PACKS } from '../../catalog/packs/registry'
import { packEntryScale, scaledFootprint } from '../../catalog/packs/scaleHeuristic'
import { ThumbnailRenderer } from '../../catalog/packs/thumbnail'
import type { InstalledPack } from '../../catalog/packs/types'
import type { PackGltfDef } from '../../furniture/types'
import { useStore } from '../store'
import { IdbAssetStore } from './IdbAssetStore'

/**
 * Reads installed-pack manifests from IDB, resolves blob URLs for each
 * entry's GLB + thumbnail, and writes the resulting PackGltfDef list
 * into the store. Mirrors hydrateUserAssets.
 */
export async function hydratePacks(): Promise<void> {
  if (typeof indexedDB === 'undefined') return

  let installed: InstalledPack[]
  try {
    installed = await InstalledPackStore.list()
  } catch {
    return
  }
  if (installed.length === 0) return

  const defs: PackGltfDef[] = []
  const store = useStore.getState()

  // Legacy packs stored their thumbnails as JPEG, which has no alpha and baked a
  // black background behind the model. Re-render those to transparent PNG once,
  // lazily (the renderer is only created when a legacy thumb is actually found),
  // so already-installed packs match parametric/PNG cards' uniform background.
  let thumbRenderer: ThumbnailRenderer | null = null
  const refreshLegacyThumb = async (
    thumb: Awaited<ReturnType<typeof IdbAssetStore.get>>,
    glbBlob: Blob,
  ): Promise<Blob | undefined> => {
    if (!thumb) return undefined
    if (thumb.mime !== 'image/jpeg') return thumb.blob
    try {
      thumbRenderer ??= new ThumbnailRenderer()
      const bytes = new Uint8Array(await glbBlob.arrayBuffer())
      const png = await thumbRenderer.render(bytes)
      await IdbAssetStore.put({ ...thumb, mime: 'image/png', blob: png })
      return png
    } catch {
      // Best-effort — keep the legacy blob if a re-render fails.
      return thumb.blob
    }
  }

  for (const pack of installed) {
    const meta = AVAILABLE_PACKS.find((p) => p.id === pack.packId)
    const attribution = meta?.attribution ?? pack.packId
    const sourceUrl = meta?.sourceUrl ?? ''
    let mutated = false
    const migratedEntries: typeof pack.entries = []
    for (const e of pack.entries) {
      const glb = await IdbAssetStore.get(e.glbKey)
      const thumb = await IdbAssetStore.get(e.thumbKey)
      if (!glb) {
        migratedEntries.push(e)
        continue
      }

      // Migrate legacy entries that pre-date per-id scaling: their
      // persisted `footprint` is the raw GLB bbox and `scale` is missing.
      // Recompute both from the still-stored GLB bytes.
      let { scale, footprint } = e
      if (typeof scale !== 'number') {
        const expectedScale = packEntryScale(pack.packId, e.entryId)
        if (expectedScale !== 1) {
          const rawBytes = new Uint8Array(await new Response(glb.blob).arrayBuffer())
          const raw = await glbFootprint(rawBytes)
          footprint = scaledFootprint(raw, expectedScale)
        }
        scale = expectedScale
        mutated = true
      }

      const thumbBlob = await refreshLegacyThumb(thumb, glb.blob)

      migratedEntries.push({ ...e, scale, footprint })
      defs.push({
        id: e.id,
        name: e.name,
        category: e.category,
        kind: 'gltf',
        source: 'pack',
        packId: e.packId,
        entryId: e.entryId,
        defaultFootprint: footprint,
        scale,
        runtimeUrl: URL.createObjectURL(glb.blob),
        thumbUrl: thumbBlob ? URL.createObjectURL(thumbBlob) : undefined,
        // API-sourced packs (Poly Pizza) credit a different author + licence per
        // entry; fall back to the pack-level defaults for zip packs.
        license: e.license ?? 'CC0',
        attribution: e.attribution ?? attribution,
        sourceUrl: e.sourceUrl ?? sourceUrl,
      })
    }

    const finalPack: InstalledPack = mutated ? { ...pack, entries: migratedEntries } : pack
    if (mutated) {
      try {
        await InstalledPackStore.put(finalPack)
      } catch {
        // Best-effort persistence — the in-memory defs above already
        // carry the migrated scale, so a write failure only means the
        // migration repeats on next hydrate.
      }
    }
    store.markPackInstalled(finalPack)
  }
  ;(thumbRenderer as ThumbnailRenderer | null)?.dispose()
  useStore.getState().setPackFurniture(defs)
}
