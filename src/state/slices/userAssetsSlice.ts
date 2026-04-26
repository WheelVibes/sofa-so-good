import type { SliceCreator } from './types';
import type { RootState } from '../store';
import type { UserGltfDef } from '../../furniture/types';
import { IdbAssetStore } from '../storage/IdbAssetStore';

/**
 * Tracks user-uploaded furniture defs and material defs (defs only —
 * the binary blobs live in IndexedDB, not the store). On startup the
 * store hydration code reads the asset manifest from `IdbAssetStore`,
 * resolves blob URLs, and populates these arrays before any consumers
 * read from them.
 *
 * Material side intentionally absent here in Phase 2 — added in 3.5.
 */

export interface UserAssetsSlice {
  userFurniture: UserGltfDef[];
  addUserFurniture: (def: UserGltfDef) => void;
  removeUserFurniture: (id: string) => void;
  setUserFurniture: (defs: UserGltfDef[]) => void;
}

export const USER_ASSETS_INITIAL: Pick<UserAssetsSlice, 'userFurniture'> = {
  userFurniture: [],
};

export const createUserAssetsSlice: SliceCreator<UserAssetsSlice, RootState> = (set, get) => ({
  ...USER_ASSETS_INITIAL,
  addUserFurniture: (def) =>
    set((s) => ({ userFurniture: [...s.userFurniture, def] })),
  removeUserFurniture: (id) => {
    const def = get().userFurniture.find((d) => d.id === id);
    set((s) => ({
      userFurniture: s.userFurniture.filter((d) => d.id !== id),
      // Drop placed instances of the def so they don't render placeholder cubes.
      items: s.items.filter((it) => it.defId !== id),
      selectedItemId: s.selectedItemId && s.items.find((it) => it.id === s.selectedItemId)?.defId === id
        ? null
        : s.selectedItemId,
    }));
    if (def) {
      if (def.runtimeUrl) URL.revokeObjectURL(def.runtimeUrl);
      void IdbAssetStore.delete(def.assetId);
    }
  },
  setUserFurniture: (defs) => set({ userFurniture: defs }),
});
