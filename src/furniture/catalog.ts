/**
 * Catalog access — merges built-in defs with user-uploaded defs from the
 * store. Use these helpers (not BUILTIN_CATALOG directly) anywhere a
 * complete catalog view is needed; doing so means user uploads appear
 * automatically in the drawer, inspector lookups, and serializer.
 */

import { useShallow } from 'zustand/react/shallow';
import { BUILTIN_CATALOG, BUILTIN_BY_CATEGORY } from './builtinCatalog';
import { GENERATED_FURNITURE } from './generatedCatalog';
import { useStore } from '../state/store';
import type {
  FurnitureCategory,
  FurnitureDef,
  FurnitureType,
  UserGltfDef,
} from './types';

/** Reactive hook returning the complete catalog (built-ins + user uploads). */
export function useCatalog(): Record<FurnitureType, FurnitureDef> {
  const userFurniture = useStore(useShallow((s) => s.userFurniture));
  const merged: Record<FurnitureType, FurnitureDef> = { ...BUILTIN_CATALOG };
  for (const def of GENERATED_FURNITURE) merged[def.id] = def;
  for (const def of userFurniture) merged[def.id] = def;
  return merged;
}

/** Reactive hook returning the catalog grouped by category. */
export function useCatalogByCategory(): Record<FurnitureCategory, FurnitureDef[]> {
  const userFurniture = useStore(useShallow((s) => s.userFurniture));
  const out: Record<FurnitureCategory, FurnitureDef[]> = {
    beds: [...(BUILTIN_BY_CATEGORY.beds ?? [])],
    seating: [...(BUILTIN_BY_CATEGORY.seating ?? [])],
    tables: [...(BUILTIN_BY_CATEGORY.tables ?? [])],
    storage: [...(BUILTIN_BY_CATEGORY.storage ?? [])],
    kitchen: [...(BUILTIN_BY_CATEGORY.kitchen ?? [])],
    lighting: [...(BUILTIN_BY_CATEGORY.lighting ?? [])],
    decor: [...(BUILTIN_BY_CATEGORY.decor ?? [])],
  };
  for (const def of GENERATED_FURNITURE) (out[def.category] ??= []).push(def);
  for (const def of userFurniture) (out[def.category] ??= []).push(def);
  return out;
}

/** Non-reactive lookup. Falls back to built-in catalog only — call sites
 *  that need user uploads should pass them in via the merged catalog. */
export function getDef(
  catalog: Record<FurnitureType, FurnitureDef>,
  id: FurnitureType,
): FurnitureDef | undefined {
  return catalog[id];
}

export function isUserDef(def: FurnitureDef): def is UserGltfDef {
  return def.kind === 'gltf' && def.source === 'user';
}
