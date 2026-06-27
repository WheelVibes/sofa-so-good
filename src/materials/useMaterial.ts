import { useTexture } from '@react-three/drei'
import type { MeshStandardMaterial } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../state/store'
import { BUILTIN_MATERIALS } from './builtinCatalog'
import { buildMaterial, getCachedMaterial } from './cache'
import {
  composedMaterialDef,
  isComposedMaterialId,
  isTintMaterialId,
  parseTintMaterialId,
  tintedMaterialDef,
} from './composeMaterial'
import { GENERATED_MATERIALS } from './generatedCatalog'
import type {
  MaterialDef,
  MaterialId,
  ProceduralMaterialDef,
  SolidMaterialDef,
  TexturedMaterialDef,
} from './types'

/** Reactive hook returning the merged material catalog. */
export function useMaterials(): Record<MaterialId, MaterialDef> {
  const userMaterials = useStore(useShallow((s) => s.userMaterials))
  const remoteMaterials = useStore(useShallow((s) => s.resolvedRemoteMaterials))
  const merged: Record<MaterialId, MaterialDef> = { ...BUILTIN_MATERIALS }
  for (const m of GENERATED_MATERIALS) merged[m.id] = m
  for (const m of userMaterials) merged[m.id] = m
  for (const m of Object.values(remoteMaterials)) merged[m.id] = m
  return merged
}

/** A custom user-chosen colour is encoded directly as a `#RRGGBB` finish id;
 *  synthesise a tinted plaster def for it so any wall/floor can be painted an
 *  arbitrary colour without a catalog entry. The id doubles as the cache key,
 *  so each colour caches its own material. */
export function customColorDef(id: string): MaterialDef {
  return {
    id,
    name: 'Custom colour',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: id,
    uvScale: [2.5, 2.5],
  }
}

/** Resolves a MaterialId to a def, falling back to the first builtin. */
export function useMaterialDef(id: MaterialId): MaterialDef {
  const materials = useMaterials()
  if (typeof id === 'string' && id.startsWith('#')) return customColorDef(id)
  // A composed finish (`compose:<pattern>:<#hex>`) is synthesised on the fly —
  // texture + colour, no catalog entry needed (MAT-COMPOSE).
  if (isComposedMaterialId(id)) {
    const composed = composedMaterialDef(id)
    if (composed) return composed
  }
  // A tinted finish (`tint:<baseId>:<#hex>`) recolours an existing catalog
  // material — including textured CC0 / Poly Haven ones (MAT-COMPOSE tail).
  if (isTintMaterialId(id)) {
    const parts = parseTintMaterialId(id)
    const base = parts ? materials[parts.baseId] : undefined
    if (base) {
      const tinted = tintedMaterialDef(id, base)
      if (tinted) return tinted
    }
  }
  const def = materials[id]
  if (def) return def
  const firstKey = Object.keys(materials)[0]!
  return materials[firstKey]!
}

/** Hook for solid materials — no suspending loader, never throws. */
export function useSolidMaterial(def: SolidMaterialDef): MeshStandardMaterial {
  const cached = getCachedMaterial(def.id)
  if (cached) return cached
  return buildMaterial(def)
}

/** Hook for procedural materials — generates PBR maps on first use and
 *  caches them; synchronous, never suspends. */
export function useProceduralMaterial(def: ProceduralMaterialDef): MeshStandardMaterial {
  const cached = getCachedMaterial(def.id)
  if (cached) return cached
  return buildMaterial(def)
}

/** Hook for textured materials — always calls useTexture so hook
 *  order is stable across renders, including after the material has
 *  been cached. */
export function useTexturedMaterial(def: TexturedMaterialDef): MeshStandardMaterial {
  // Texture URLs already carry the Vite `base` — generated-catalog paths bake
  // `${import.meta.env.BASE_URL}` in (same convention as the furniture GLB
  // paths), and runtime (user/remote) URLs are absolute blob:/http: URLs. Do
  // NOT re-apply withBase here or the sub-path doubles (`/sofa-so-good/
  // sofa-so-good/…`) and 404s in production.
  const urls = def.runtimeUrls ?? def.textures
  const list = [urls.albedo, urls.normal, urls.roughness].filter((u): u is string => !!u)
  const tex = useTexture(list)
  const cached = getCachedMaterial(def.id)
  if (cached) return cached
  const arr = Array.isArray(tex) ? tex : [tex]
  const loaded = {
    albedo: arr[0],
    normal: urls.normal ? arr[1] : undefined,
    roughness: urls.roughness ? arr[urls.normal ? 2 : 1] : undefined,
  }
  return buildMaterial(def, loaded)
}
