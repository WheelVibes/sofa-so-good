import { useStore } from '../store';
import { IdbAssetStore, type AssetRecord } from './IdbAssetStore';
import {
  FURNITURE_CATEGORIES,
  type UserGltfDef,
  type FurnitureCategory,
} from '../../furniture/types';
import type { TexturedMaterialDef, MaterialCategory } from '../../materials/types';

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

  const furniture: UserGltfDef[] = [];
  // Group texture records by their parent matId so we can rebuild
  // material defs from the channel records on disk.
  const matChannels = new Map<string, Partial<Record<'albedo' | 'normal' | 'roughness' | 'ao', AssetRecord>>>();

  for (const m of metas) {
    // Pack-installed assets share the IDB store; skip them here so they
    // don't surface as user uploads. hydratePacks() reconstructs them.
    if (m.meta?.['source'] === 'pack') continue;
    if (m.kind === 'gltf') {
      const rec = await IdbAssetStore.get(m.assetId);
      if (!rec) continue;
      const cat = m.meta?.['category'];
      const category: FurnitureCategory =
        typeof cat === 'string' && (FURNITURE_CATEGORIES as readonly string[]).includes(cat)
          ? (cat as FurnitureCategory)
          : 'decor';
      furniture.push({
        id: `user-${m.assetId}`,
        name: m.name,
        category,
        kind: 'gltf',
        source: 'user',
        assetId: m.assetId,
        uploadedAt: m.uploadedAt,
        defaultFootprint: { w: 1.0, d: 1.0, h: 1.0 },
        runtimeUrl: URL.createObjectURL(rec.blob),
        mounted: m.meta?.['mounted'] as boolean | undefined,
        noClip: m.meta?.['noClip'] as boolean | undefined,
      });
    } else if (m.kind === 'texture') {
      const matId = m.meta?.['matId'];
      const role = m.meta?.['role'];
      if (typeof matId !== 'string' || typeof role !== 'string') continue;
      if (role !== 'albedo' && role !== 'normal' && role !== 'roughness' && role !== 'ao') continue;
      const rec = await IdbAssetStore.get(m.assetId);
      if (!rec) continue;
      const bucket = matChannels.get(matId) ?? {};
      bucket[role] = rec;
      matChannels.set(matId, bucket);
    }
  }
  useStore.getState().setUserFurniture(furniture);

  const materials: TexturedMaterialDef[] = [];
  for (const [matId, channels] of matChannels.entries()) {
    if (!channels.albedo) continue;
    const albedoMeta = channels.albedo.meta as
      | { matId?: string; category?: string; uvScale?: [number, number]; swatch?: string; name?: string }
      | undefined;
    const category: MaterialCategory =
      albedoMeta?.category === 'wall' ? 'wall' : 'floor';
    const url = (rec: AssetRecord) => URL.createObjectURL(rec.blob);
    materials.push({
      id: matId,
      name: channels.albedo.meta?.['name'] as string ?? matId.slice(0, 8),
      category,
      kind: 'textured',
      source: 'user',
      swatch: '#cccccc',
      uvScale: [1, 1],
      textures: {
        albedo: channels.albedo.assetId,
        normal: channels.normal?.assetId,
        roughness: channels.roughness?.assetId,
        ao: channels.ao?.assetId,
      },
      runtimeUrls: {
        albedo: url(channels.albedo),
        normal: channels.normal ? url(channels.normal) : undefined,
        roughness: channels.roughness ? url(channels.roughness) : undefined,
        ao: channels.ao ? url(channels.ao) : undefined,
      },
    });
  }
  useStore.getState().setUserMaterials(materials);
}
