/**
 * Catalog access — merges built-in defs with user-uploaded defs from the
 * store. Use these helpers (not BUILTIN_CATALOG directly) anywhere a
 * complete catalog view is needed; doing so means user uploads appear
 * automatically in the drawer, inspector lookups, and serializer.
 */

import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { spanFromFootprint } from '../collision/gltfSpan'
import { useStore } from '../state/store'
import { BUILTIN_BY_CATEGORY, BUILTIN_CATALOG } from './builtinCatalog'
import { getCachedGltfFootprint } from './GltfModel'
import { GENERATED_FURNITURE } from './generatedCatalog'
import type {
  FurnitureCategory,
  FurnitureDef,
  FurnitureType,
  IkeaGltfDef,
  UserGltfDef,
} from './types'
import { FURNITURE_CATEGORIES } from './types'

/**
 * If a user GLB's real bounding box has been cached (i.e. the model loaded at
 * least once), derive its footprint + floor-anchored vertical span from that
 * box. An authored `verticalSpan` is preserved; only the footprint is refreshed
 * from the cache in that case. Mounted models lift the span to where they sit.
 *
 * The bbox cache fills asynchronously after first render, so a freshly-uploaded
 * model has no cached box on the first pass — it keeps its seeded placeholder
 * footprint until the next catalog rebuild, which is acceptable.
 */
function resolveUserDefFootprint(def: UserGltfDef): UserGltfDef {
  const url = def.runtimeUrl
  const cached = url ? getCachedGltfFootprint(url) : null
  if (!cached) return def
  const { defaultFootprint, verticalSpan } = spanFromFootprint(
    cached,
    def.mounted ? { baseY: def.verticalSpan?.base ?? 0 } : undefined,
  )
  return { ...def, defaultFootprint, verticalSpan: def.verticalSpan ?? verticalSpan }
}

/**
 * Same footprint refresh as {@link resolveUserDefFootprint} but for an IKEA def:
 * resolve from the active variant's cached bbox once the GLB has loaded.
 * Falls back to the seeded footprint carried from import when the cache is empty.
 */
function resolveIkeaDefFootprint(def: IkeaGltfDef): IkeaGltfDef {
  const variant =
    def.variants.find((v) => v.finish === def.activeVariant) ??
    def.variants.find((v) => v.runtimeUrl)
  const url = variant?.runtimeUrl
  const cached = url ? getCachedGltfFootprint(url) : null
  if (!cached) return def
  const { defaultFootprint, verticalSpan } = spanFromFootprint(
    cached,
    def.mounted ? { baseY: def.verticalSpan?.base ?? 0 } : undefined,
  )
  return { ...def, defaultFootprint, verticalSpan: def.verticalSpan ?? verticalSpan }
}

/** Build the complete merged catalog (built-ins + generated + user/IKEA uploads
 *  + resolved remote + installed packs) from store slices. Non-reactive — call
 *  from event handlers / non-hook code (e.g. the whole-home auto-arranger) that
 *  must see user + IKEA defs, not just BUILTIN_CATALOG. The hook `useCatalog`
 *  wraps this for reactive consumers. */
export function buildMergedCatalog(slices: {
  userFurniture: (UserGltfDef | IkeaGltfDef)[]
  resolvedRemoteFurniture: Record<string, FurnitureDef>
  packFurniture: FurnitureDef[]
}): Record<FurnitureType, FurnitureDef> {
  const merged: Record<FurnitureType, FurnitureDef> = { ...BUILTIN_CATALOG }
  for (const def of GENERATED_FURNITURE) merged[def.id] = def
  for (const def of slices.userFurniture)
    merged[def.id] = isIkeaDef(def) ? resolveIkeaDefFootprint(def) : resolveUserDefFootprint(def)
  for (const def of Object.values(slices.resolvedRemoteFurniture)) merged[def.id] = def
  for (const def of slices.packFurniture) merged[def.id] = def
  return merged
}

/** Reactive hook returning the complete catalog (built-ins + user uploads + resolved remote + installed packs). */
export function useCatalog(): Record<FurnitureType, FurnitureDef> {
  const userFurniture = useStore(useShallow((s) => s.userFurniture))
  const remote = useStore(useShallow((s) => s.resolvedRemoteFurniture))
  const packFurniture = useStore(useShallow((s) => s.packFurniture))
  return buildMergedCatalog({
    userFurniture,
    resolvedRemoteFurniture: remote,
    packFurniture,
  })
}

/** Reactive hook returning the catalog grouped by category. */
export function useCatalogByCategory(): Record<FurnitureCategory, FurnitureDef[]> {
  const userFurniture = useStore(useShallow((s) => s.userFurniture))
  const remote = useStore(useShallow((s) => s.resolvedRemoteFurniture))
  const packFurniture = useStore(useShallow((s) => s.packFurniture))
  const out = Object.fromEntries(
    FURNITURE_CATEGORIES.map((c) => [c, [...(BUILTIN_BY_CATEGORY[c] ?? [])]]),
  ) as Record<FurnitureCategory, FurnitureDef[]>
  for (const def of GENERATED_FURNITURE) (out[def.category] ??= []).push(def)
  for (const def of userFurniture)
    (out[def.category] ??= []).push(
      isIkeaDef(def) ? resolveIkeaDefFootprint(def) : resolveUserDefFootprint(def),
    )
  for (const def of Object.values(remote)) (out[def.category] ??= []).push(def)
  for (const def of packFurniture) (out[def.category] ??= []).push(def)
  return out
}

/** Build the merged catalog from the CURRENT store state, without subscribing. */
function snapshotCatalog(): Record<FurnitureType, FurnitureDef> {
  const s = useStore.getState()
  return buildMergedCatalog({
    userFurniture: s.userFurniture,
    resolvedRemoteFurniture: s.resolvedRemoteFurniture,
    packFurniture: s.packFurniture,
  })
}

/**
 * Stable catalog accessor for components that must NOT re-render when the
 * catalog changes — chiefly the in-canvas FurnitureLayer/DragController/
 * MarqueeSelector. A reactive `useCatalog()` there means every import commit
 * rebuilds the whole catalog AND re-renders the R3F tree; during a bulk import
 * (thousands of commits) that starves the render loop and costs the WebGL
 * context (white flicker). This keeps the merged catalog in a ref, refreshed by
 * a non-rendering store subscription, and returns a stable `(id) => def` getter.
 *
 * `epoch` bumps when the catalog rebuilds, so a caller that DOES need to react
 * (e.g. FurnitureLayer re-rendering placed items after their def resolves) can
 * depend on it deliberately — without the full-catalog-identity churn.
 */
export function useCatalogGetter(): {
  getDef: (id: FurnitureType) => FurnitureDef | undefined
  ref: React.RefObject<Record<FurnitureType, FurnitureDef>>
} {
  const ref = useRef<Record<FurnitureType, FurnitureDef>>(undefined as never)
  if (ref.current === undefined) ref.current = snapshotCatalog()
  useEffect(() => {
    // Refresh on any change to a catalog input slice. Imperative — no render.
    const update = () => {
      ref.current = snapshotCatalog()
    }
    update()
    const unsub = useStore.subscribe((s, prev) => {
      if (
        s.userFurniture !== prev.userFurniture ||
        s.resolvedRemoteFurniture !== prev.resolvedRemoteFurniture ||
        s.packFurniture !== prev.packFurniture
      )
        update()
    })
    return unsub
  }, [])
  const getDefStable = useRef((id: FurnitureType) => ref.current[id])
  return { getDef: getDefStable.current, ref }
}

/** Non-reactive lookup. Falls back to built-in catalog only — call sites
 *  that need user uploads should pass them in via the merged catalog. */
export function getDef(
  catalog: Record<FurnitureType, FurnitureDef>,
  id: FurnitureType,
): FurnitureDef | undefined {
  return catalog[id]
}

export function isUserDef(def: FurnitureDef): def is UserGltfDef {
  return def.kind === 'gltf' && def.source === 'user'
}

export function isIkeaDef(def: FurnitureDef): def is IkeaGltfDef {
  return def.kind === 'gltf' && def.source === 'ikea'
}
