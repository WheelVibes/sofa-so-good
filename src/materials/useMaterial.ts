import { useTexture } from '@react-three/drei';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../state/store';
import { BUILTIN_MATERIALS } from './builtinCatalog';
import { GENERATED_MATERIALS } from './generatedCatalog';
import { buildMaterial, getCachedMaterial } from './cache';
import type { MaterialDef, MaterialId, SolidMaterialDef, TexturedMaterialDef } from './types';
import type { MeshStandardMaterial } from 'three';

/** Reactive hook returning the merged material catalog. */
export function useMaterials(): Record<MaterialId, MaterialDef> {
  const userMaterials = useStore(useShallow((s) => s.userMaterials));
  const merged: Record<MaterialId, MaterialDef> = { ...BUILTIN_MATERIALS };
  for (const m of GENERATED_MATERIALS) merged[m.id] = m;
  for (const m of userMaterials) merged[m.id] = m;
  return merged;
}

/** Resolves a MaterialId to a def, falling back to the first builtin. */
export function useMaterialDef(id: MaterialId): MaterialDef {
  const materials = useMaterials();
  const def = materials[id];
  if (def) return def;
  const firstKey = Object.keys(materials)[0]!;
  return materials[firstKey]!;
}

/** Hook for solid materials — no suspending loader, never throws. */
export function useSolidMaterial(def: SolidMaterialDef): MeshStandardMaterial {
  const cached = getCachedMaterial(def.id);
  if (cached) return cached;
  return buildMaterial(def);
}

/** Hook for textured materials — always calls useTexture so hook
 *  order is stable across renders, including after the material has
 *  been cached. */
export function useTexturedMaterial(def: TexturedMaterialDef): MeshStandardMaterial {
  const urls = def.runtimeUrls ?? def.textures;
  const list = [urls.albedo, urls.normal, urls.roughness].filter(
    (u): u is string => !!u,
  );
  const tex = useTexture(list);
  const cached = getCachedMaterial(def.id);
  if (cached) return cached;
  const arr = Array.isArray(tex) ? tex : [tex];
  const loaded = {
    albedo: arr[0],
    normal: urls.normal ? arr[1] : undefined,
    roughness: urls.roughness ? arr[urls.normal ? 2 : 1] : undefined,
  };
  return buildMaterial(def, loaded);
}
