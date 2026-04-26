import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../state/store';
import { BUILTIN_MATERIALS } from './builtinCatalog';
import { buildMaterial, getCachedMaterial } from './cache';
import type { MaterialDef, MaterialId, TexturedMaterialDef } from './types';

/** Reactive hook returning the merged material catalog. */
export function useMaterials(): Record<MaterialId, MaterialDef> {
  const userMaterials = useStore(useShallow((s) => s.userMaterials));
  const merged: Record<MaterialId, MaterialDef> = { ...BUILTIN_MATERIALS };
  for (const m of userMaterials) merged[m.id] = m;
  return merged;
}

interface MaterialResult {
  material: ReturnType<typeof buildMaterial>;
}

/**
 * Returns a MeshStandardMaterial for the given id. Solid materials
 * resolve synchronously; textured materials throw a Suspense promise
 * via useTexture so the parent <Suspense> boundary handles the load.
 *
 * The hook is intentionally render-pure: every call with the same
 * MaterialId returns the same cached material instance, so React.memo
 * around <RoomFloor> only re-renders when the id actually changes.
 */
export function useMaterial(id: MaterialId): MaterialResult {
  const materials = useMaterials();
  const def = materials[id];
  const fallback = materials[Object.keys(materials)[0]!]!;
  const target: MaterialDef = def ?? fallback;

  // Hooks must be called unconditionally and in the same order every
  // render — use a stable URL list (or a 1×1 placeholder) regardless
  // of whether the def is textured.
  const { albedo, normal, roughness } = useMemo(() => {
    if (target.kind === 'textured') {
      const t = target as TexturedMaterialDef;
      const urls = t.runtimeUrls ?? t.textures;
      return {
        albedo: urls.albedo,
        normal: urls.normal,
        roughness: urls.roughness,
      };
    }
    return { albedo: undefined, normal: undefined, roughness: undefined };
  }, [target]);

  const cached = getCachedMaterial(target.id);
  if (cached) return { material: cached };

  if (target.kind === 'solid' || !albedo) {
    return { material: buildMaterial(target) };
  }

  // useTexture suspends until every URL in the array has loaded.
  const list = [albedo, normal, roughness].filter((u): u is string => !!u);
  const tex = useTexture(list);
  const arr = Array.isArray(tex) ? tex : [tex];
  const loaded = {
    albedo: arr[0],
    normal: normal ? arr[1] : undefined,
    roughness: roughness ? arr[normal ? 2 : 1] : undefined,
  };
  return { material: buildMaterial(target, loaded) };
}
