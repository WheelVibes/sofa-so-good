import { useStore } from '../store';
import { IdbAssetStore } from './IdbAssetStore';
import {
  FURNITURE_CATEGORIES,
  type UserGltfDef,
  type FurnitureCategory,
} from '../../furniture/types';

/**
 * Reloads user-uploaded furniture defs from IndexedDB and populates the
 * user-assets store slice. Called once at app boot before the first
 * paint of the catalog drawer.
 *
 * Phase 3 will extend this to also hydrate user materials and the
 * autosaved layout from localStorage. The split (binaries from IDB,
 * state from localStorage) means each can be wired independently.
 */
export async function hydrateUserAssets(): Promise<void> {
  // IndexedDB is unavailable in some test environments; fail soft so
  // the app still boots in those cases.
  if (typeof indexedDB === 'undefined') return;

  let metas;
  try {
    metas = await IdbAssetStore.list();
  } catch {
    return;
  }
  if (metas.length === 0) return;

  const defs: UserGltfDef[] = [];
  for (const m of metas) {
    if (m.kind !== 'gltf') continue;
    const rec = await IdbAssetStore.get(m.assetId);
    if (!rec) continue;
    const cat = m.meta?.['category'];
    const category: FurnitureCategory =
      typeof cat === 'string' && (FURNITURE_CATEGORIES as readonly string[]).includes(cat)
        ? (cat as FurnitureCategory)
        : 'decor';
    defs.push({
      id: `user-${m.assetId}`,
      name: m.name,
      category,
      kind: 'gltf',
      source: 'user',
      assetId: m.assetId,
      uploadedAt: m.uploadedAt,
      defaultFootprint: { w: 1.0, d: 1.0, h: 1.0 },
      runtimeUrl: URL.createObjectURL(rec.blob),
    });
  }
  useStore.getState().setUserFurniture(defs);
}
