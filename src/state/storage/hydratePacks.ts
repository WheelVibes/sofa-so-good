import { useStore } from '../store';
import { InstalledPackStore } from '../../catalog/packs/installedPackStore';
import { IdbAssetStore } from './IdbAssetStore';
import { AVAILABLE_PACKS } from '../../catalog/packs/registry';
import type { PackGltfDef } from '../../furniture/types';

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
    store.markPackInstalled(pack);
    const meta = AVAILABLE_PACKS.find((p) => p.id === pack.packId);
    const attribution = meta?.attribution ?? pack.packId;
    const sourceUrl = meta?.sourceUrl ?? '';
    for (const e of pack.entries) {
      const glb = await IdbAssetStore.get(e.glbKey);
      const thumb = await IdbAssetStore.get(e.thumbKey);
      if (!glb) continue;
      defs.push({
        id: e.id,
        name: e.name,
        category: e.category,
        kind: 'gltf',
        source: 'pack',
        packId: e.packId,
        entryId: e.entryId,
        defaultFootprint: e.footprint,
        runtimeUrl: URL.createObjectURL(glb.blob),
        thumbUrl: thumb ? URL.createObjectURL(thumb.blob) : undefined,
        license: 'CC0',
        attribution,
        sourceUrl,
      });
    }
  }
  useStore.getState().setPackFurniture(defs);
}
