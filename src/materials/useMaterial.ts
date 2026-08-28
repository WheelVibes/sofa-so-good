import { useTexture } from '@react-three/drei'
import { useDeferredValue, useMemo, useSyncExternalStore } from 'react'
import type { MeshStandardMaterial, Texture } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { useFeature } from '../features/useFeature'
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
import {
  buildPomFloorMaterial,
  buildPomPhotoFloorMaterial,
  pomFloorEligible,
  pomPhotoFloorEligible,
} from './pomFloor'
import {
  getProceduralBaseSizeVersion,
  subscribeProceduralBaseSize,
} from './proceduralBaseSizeSignal'
import type {
  MaterialCategory,
  MaterialDef,
  MaterialId,
  ProceduralMaterialDef,
  SolidMaterialDef,
  TexturedMaterialDef,
} from './types'

/** Reactive hook returning the merged material catalog.
 *
 * PERF-B: the merge is rebuilt via `useMemo`, keyed on the three input slice
 * *references* (already stable across unrelated store updates thanks to the
 * `useShallow` selectors above), so every wall/floor/ceiling/furniture
 * consumer of `useMaterialDef` shares one rebuild per commit instead of each
 * re-deriving the whole merged catalog on every render. */
export function useMaterials(): Record<MaterialId, MaterialDef> {
  const userMaterials = useStore(useShallow((s) => s.userMaterials))
  const remoteMaterials = useStore(useShallow((s) => s.resolvedRemoteMaterials))
  const savedMaterials = useStore(useShallow((s) => s.savedMaterials))
  return useMemo(() => {
    const merged: Record<MaterialId, MaterialDef> = { ...BUILTIN_MATERIALS }
    for (const m of GENERATED_MATERIALS) merged[m.id] = m
    for (const m of userMaterials) merged[m.id] = m
    for (const m of Object.values(remoteMaterials)) merged[m.id] = m
    // User-saved custom materials (CUSTOMIZE-SAVE-MATERIAL): a saved entry is a
    // self-describing finish id (`compose:…` / `tint:…` / `#hex`) + a name. Resolve
    // each to a def (the base for a tint comes from the catalog built above) and
    // give it the user's name so it shows as a named tile in the picker.
    for (const s of savedMaterials) {
      const def = resolveFinishDef(s.finishId, merged, s.category)
      if (def) merged[s.finishId] = { ...def, id: s.finishId, name: s.name }
    }
    return merged
  }, [userMaterials, remoteMaterials, savedMaterials])
}

/** Resolve any self-describing finish id (`#hex` / `compose:…` / `tint:…`) or a
 *  plain catalog id to a `MaterialDef`, using `catalog` to look up a tint base.
 *  Returns `null` when it can't be resolved. Shared by `useMaterials` (named
 *  saved entries) and reusable for any non-hook resolution. */
function resolveFinishDef(
  id: string,
  catalog: Record<MaterialId, MaterialDef>,
  category: MaterialCategory,
): MaterialDef | null {
  if (id.startsWith('#')) return { ...customColorDef(id), category }
  if (isComposedMaterialId(id)) return composedMaterialDef(id, category)
  if (isTintMaterialId(id)) {
    const parts = parseTintMaterialId(id)
    const base = parts ? catalog[parts.baseId] : undefined
    return base ? tintedMaterialDef(id, base) : null
  }
  return catalog[id] ?? null
}

/** A custom user-chosen colour is encoded directly as a `#RRGGBB` finish id;
 *  synthesise a tinted plaster def for it so any wall/floor can be painted an
 *  arbitrary colour without a catalog entry. The id doubles as the cache key,
 *  so each colour caches its own material. */
function customColorDef(id: string): MaterialDef {
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

/**
 * The finish id a rendered SURFACE should resolve (FINISH-DEFER).
 *
 * A photo (`textured`) finish SUSPENDS on first use — `useTexturedMaterial`
 * calls drei's `useTexture`, which throws a promise until every channel image
 * has loaded and decoded (a 1K ambientCG scan is 5 maps / ~3 MB, and the first
 * application of one measured **~12 s** on the software-GL harness). Every
 * wall/floor/ceiling surface sits behind `<Suspense fallback={null}>`, so a
 * plain (synchronous) finish change made the surface VANISH for that whole
 * window: the wall faces unmounted and the bare structural body showed through,
 * which reads exactly like "the finish didn't apply" — the Chrome-audit report
 * of photo wall finishes rendering flat grey at the Performance tier. Nothing
 * tier-specific about it: switching tiers merely remounted the scene once the
 * textures were already in drei's URL cache, which is why the same finish
 * "worked" at Maximum and on every subsequent application.
 *
 * Deferring the id hands the change to React as a low-priority update, so when
 * the new textured branch suspends React KEEPS the already-committed surface on
 * screen (the previous finish) instead of falling back to nothing, and swaps in
 * the new one when its textures land. The `fallback={null}` boundaries stay as
 * the safety net for a first-ever mount (nothing to keep) and for a load error.
 *
 * Apply this at every finish-id → `MaterialDef` dispatch on a RENDER path
 * (`useMaterialDef(useDeferredFinishId(id))`) — never in a UI panel, where the
 * picker must reflect the selection immediately.
 */
export function useDeferredFinishId<T extends MaterialId | null>(id: T): T {
  return useDeferredValue(id)
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
 *  caches them; synchronous, never suspends.
 *
 *  Subscribes to the procedural BASE_SIZE so a surface that is already MOUNTED
 *  re-resolves when the quality tier changes the generation size
 *  (PROCEDURAL-BAKE-STALE). Cache keys already carry the size, so re-running
 *  `buildMaterial` after a change hands back the right generation — the missing
 *  piece was ever running it again. Subscribing to `qualityTier` instead does NOT
 *  work and was reverted in v0.31.5.37: `QualityController` writes the size from an
 *  effect, so a tier subscriber re-renders BEFORE the write and re-resolves at the
 *  old size. See `proceduralBaseSizeSignal.ts`. */
export function useProceduralMaterial(def: ProceduralMaterialDef): MeshStandardMaterial {
  useSyncExternalStore(
    subscribeProceduralBaseSize,
    getProceduralBaseSizeVersion,
    getProceduralBaseSizeVersion,
  )
  const cached = getCachedMaterial(def.id)
  if (cached) return cached
  return buildMaterial(def)
}

/** Floor-only procedural material with optional parallax-occlusion mapping
 *  (PHOTO-POM). On Performance / Medium, when the `pomFloors` flag is off, or for
 *  a pattern without hero grout relief this returns the plain shared procedural
 *  material — byte-identical to {@link useProceduralMaterial}. On High / Maximum
 *  an eligible geometric floor (tile / hexagon / subway / checker / brick /
 *  parquet / herringbone) gets a POM variant whose grout / joints recess and
 *  occlude as the camera moves. The base hook is always called (stable hook
 *  order); the tier subscription re-renders the floor when the tier changes. */
export function useFloorProceduralMaterial(def: ProceduralMaterialDef): MeshStandardMaterial {
  const tier = useStore((s) => s.qualityTier)
  const pomOn = useFeature('pomFloors')
  const base = useProceduralMaterial(def)
  if (pomFloorEligible(def.pattern, tier, pomOn)) return buildPomFloorMaterial(def, tier)
  return base
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
  // REAL-3 — include the AO channel: bundles/uploads that ship an ambient-
  // occlusion map (remote CC0 downloads fetch it, `buildMaterial` binds it)
  // previously never had it loaded here, so photo finishes lost their baked
  // crevice/grout shading. Ordered list → positional unpack below.
  // The metalness / opacity / displacement channels follow the same pattern:
  // optional, positionally unpacked in declaration order. `useTexture` is
  // URL-keyed, so a channel absent from the def costs nothing.
  const list = [
    urls.albedo,
    urls.normal,
    urls.roughness,
    urls.ao,
    urls.metalness,
    urls.opacity,
    urls.displacement,
  ].filter((u): u is string => !!u)
  const tex = useTexture(list)
  const cached = getCachedMaterial(def.id)
  if (cached) return cached
  const arr = Array.isArray(tex) ? tex : [tex]
  let next = 1
  const loaded = {
    albedo: arr[0],
    normal: urls.normal ? arr[next++] : undefined,
    roughness: urls.roughness ? arr[next++] : undefined,
    ao: urls.ao ? arr[next++] : undefined,
    metalness: urls.metalness ? arr[next++] : undefined,
    opacity: urls.opacity ? arr[next++] : undefined,
    displacement: urls.displacement ? arr[next++] : undefined,
  }
  return buildMaterial(def, loaded)
}

/** Floor-specific variant of {@link useTexturedMaterial} (PHOTO-POM). A scanned
 *  floor that ships a displacement map gets the same parallax-occlusion
 *  treatment the procedural geometric patterns get, on High / Maximum only —
 *  its joints genuinely recede instead of being faked by the normal map. Any
 *  other case returns the plain textured material, byte-identical to before.
 *  The base hook is always called first so hook order stays stable. */
export function useFloorTexturedMaterial(def: TexturedMaterialDef): MeshStandardMaterial {
  const tier = useStore((s) => s.qualityTier)
  const pomOn = useFeature('pomFloors')
  const base = useTexturedMaterial(def)
  if (!pomPhotoFloorEligible(def, tier, pomOn)) return base
  // Reuse the textures the base hook already loaded (drei's `useTexture` is
  // URL-keyed, so this is a cache hit, not a second download).
  return buildPomPhotoFloorMaterial(def, tier, {
    albedo: base.map ?? undefined,
    normal: base.normalMap ?? undefined,
    roughness: base.roughnessMap ?? undefined,
    ao: base.aoMap ?? undefined,
    metalness: base.metalnessMap ?? undefined,
    displacement: base.userData.displacementMap as Texture | undefined,
  })
}
