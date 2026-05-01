import { useStore } from '../store';
import { InstalledPackStore } from '../../catalog/packs/installedPackStore';
import { IdbAssetStore } from './IdbAssetStore';
import { AVAILABLE_PACKS } from '../../catalog/packs/registry';
import { packEntryScale, scaledFootprint } from '../../catalog/packs/scaleHeuristic';
import { glbFootprint } from '../../catalog/packs/footprint';
import type { PackGltfDef } from '../../furniture/types';
import type { InstalledPack } from '../../catalog/packs/types';

/**
 * Reads installed-pack manifests from IDB, resolves blob URLs for each
 * entry's GLB + thumbnail, and writes the resulting PackGltfDef list
 * into the store. Mirrors hydrateUserAssets.
 */
export async function hydratePacks(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  let installed;
  try {
    installed = await InstalledPackStore.list();
  } catch {
    return;
  }
  if (installed.length === 0) return;

  const defs: PackGltfDef[] = [];
  const store = useStore.getState();

  for (const pack of installed) {
    const meta = AVAILABLE_PACKS.find((p) => p.id === pack.packId);
    const attribution = meta?.attribution ?? pack.packId;
    const sourceUrl = meta?.sourceUrl ?? '';
    let mutated = false;
    const migratedEntries: typeof pack.entries = [];
    for (const e of pack.entries) {
      const glb = await IdbAssetStore.get(e.glbKey);
      const thumb = await IdbAssetStore.get(e.thumbKey);
      if (!glb) {
        migratedEntries.push(e);
        continue;
      }

      // Migrate legacy entries that pre-date per-id scaling: their
      // persisted `footprint` is the raw GLB bbox and `scale` is missing.
      // Recompute both from the still-stored GLB bytes.
      let { scale, footprint } = e;
      if (typeof scale !== 'number') {
        const expectedScale = packEntryScale(pack.packId, e.entryId);
        if (expectedScale !== 1) {
          const rawBytes = new Uint8Array(await new Response(glb.blob).arrayBuffer());
          const raw = await glbFootprint(rawBytes);
          footprint = scaledFootprint(raw, expectedScale);
        }
        scale = expectedScale;
        mutated = true;
      }

      migratedEntries.push({ ...e, scale, footprint });
      // `entry.footprint` is persisted SCALED (raw × scale) for storage
      // back-compat, but `def.defaultFootprint` must be the RAW bbox —
      // `itemFootprint` multiplies by `def.scale` again at read time.
      const safeScale = scale > 0 ? scale : 1;
      defs.push({
        id: e.id,
        name: e.name,
        category: e.category,
        kind: 'gltf',
        source: 'pack',
        packId: e.packId,
        entryId: e.entryId,
        defaultFootprint: {
          w: footprint.w / safeScale,
          d: footprint.d / safeScale,
          h: footprint.h / safeScale,
        },
        scale,
        runtimeUrl: URL.createObjectURL(glb.blob),
        thumbUrl: thumb ? URL.createObjectURL(thumb.blob) : undefined,
        license: 'CC0',
        attribution,
        sourceUrl,
      });
    }

    const finalPack: InstalledPack = mutated
      ? { ...pack, entries: migratedEntries }
      : pack;
    if (mutated) {
      try {
        await InstalledPackStore.put(finalPack);
      } catch {
        // Best-effort persistence — the in-memory defs above already
        // carry the migrated scale, so a write failure only means the
        // migration repeats on next hydrate.
      }
    }
    store.markPackInstalled(finalPack);
  }
  useStore.getState().setPackFurniture(defs);
}
