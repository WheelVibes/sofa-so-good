import { useTexture } from '@react-three/drei'
import { Suspense, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { buildMaterial, getBuiltMaterial } from '../materials/cache'
import {
  furnitureMaterialCacheId,
  parseFurnitureMaterialFinish,
} from '../materials/furnitureMaterials'
import type { MaterialDef, TexturedMaterialDef } from '../materials/types'
import { useMaterials } from '../materials/useMaterial'
import { SilentErrorBoundary } from '../scene/SilentErrorBoundary'
import { useStore } from '../state/store'

/** Furniture surfaces tile finishes per box face (UVs run 0..1 per face), so a
 *  ~0.5 m tile reads well on a typical drawer front / tabletop. */
const FURNITURE_UV: [number, number] = [0.5, 0.5]

/** Re-scope a catalog material def to a furniture-local cache id + tiling so it
 *  never clobbers the floor/wall variant of the same source material. */
function furnitureDefOf(def: MaterialDef): MaterialDef {
  const id = furnitureMaterialCacheId(def.id)
  if (def.kind === 'solid') return { ...def, id }
  return { ...def, id, uvScale: FURNITURE_UV }
}

/**
 * Catalog material ids that are defaulted onto common wood-surface furniture
 * (dining tables, bookshelves, wardrobes, sideboards, bed frames, desks, …).
 * Pre-warming these on scene mount ensures first render shows the CC0 grain
 * immediately — no procedural fallback flicker when an item is placed.
 * All are procedural (offline-safe): no remote fetch needed.
 */
export const CATALOG_WOOD_DEFAULTS: readonly string[] = [
  'floor-wood-oak',
  'floor-wood-walnut',
  'floor-wood-teak',
  'floor-wood-ash',
  'floor-wood-ebony',
] as const

/**
 * Watches the furniture items for finishes encoded as `mat:<materialId>` and
 * makes sure the referenced catalog/DLC material is built into the shared
 * material cache. Procedural/solid finishes build synchronously; downloaded
 * CC0 PBR (textured) finishes load their images through <Suspense> first.
 * Each build bumps `materialEpoch` so memoised furniture re-renders and the
 * primitives' synchronous `getSurfaceMaterial` lookup finds the new material.
 *
 * Pre-warms the catalog wood defaults on mount so new-item placements render
 * the CC0 grain on the first frame (no visible pop for the common cases).
 *
 * Mounted once inside the scene graph (it renders only loader helpers).
 */
export function FurnitureMaterialLoader() {
  const items = useStore(useShallow((s) => s.items))

  // Distinct material ids: items' explicit finishes UNION the catalog defaults
  // so default-finish furniture is warm before the user even places a piece.
  const ids = useMemo(() => {
    const set = new Set<string>(CATALOG_WOOD_DEFAULTS)
    for (const it of items) {
      for (const v of Object.values(it.props)) {
        if (typeof v !== 'string') continue
        const id = parseFurnitureMaterialFinish(v)
        if (id) set.add(id)
      }
    }
    return [...set]
  }, [items])

  return <EnsureFurnitureMaterials ids={ids} />
}

/**
 * Builds the given catalog/DLC material ids into the furniture-scoped material
 * cache (the body of `FurnitureMaterialLoader`, reusable wherever a furniture
 * `mat:<id>` finish can appear outside placed items — e.g. the GLB designer's
 * per-part finishes). Mount inside a Canvas.
 */
export function EnsureFurnitureMaterials({ ids }: { ids: string[] }) {
  const materials = useMaterials()
  const bump = useStore((s) => s.bumpMaterialEpoch)

  // Split into already-cached, procedural (sync-buildable), and textured
  // (need async image loads). Unknown ids (remote not yet downloaded) are
  // skipped — the piece keeps its procedural fallback until resolved.
  const { procedural, textured } = useMemo(() => {
    const procedural: MaterialDef[] = []
    const textured: TexturedMaterialDef[] = []
    for (const id of ids) {
      if (getBuiltMaterial(furnitureMaterialCacheId(id))) continue
      const def = materials[id]
      if (!def) continue
      if (def.kind === 'textured') textured.push(def)
      else procedural.push(def)
    }
    return { procedural, textured }
  }, [ids, materials])

  // Procedural/solid finishes have no async dependency — build them now.
  useEffect(() => {
    if (procedural.length === 0) return
    for (const def of procedural) buildMaterial(furnitureDefOf(def))
    bump()
  }, [procedural, bump])

  return (
    <>
      {textured.map((def) => (
        // A failed CC0 texture load (404/CORS) must not blank the scene — the
        // furniture just keeps its procedural fallback material.
        <SilentErrorBoundary key={def.id} resetKey={def.runtimeUrls ?? def.textures}>
          <Suspense fallback={null}>
            <TexturedFurnitureMaterial def={def} />
          </Suspense>
        </SilentErrorBoundary>
      ))}
    </>
  )
}

/** Loads a downloaded CC0 PBR material's image channels and builds a
 *  furniture-scoped MeshStandardMaterial into the cache. Suspends while the
 *  textures load. */
function TexturedFurnitureMaterial({ def }: { def: TexturedMaterialDef }) {
  const bump = useStore((s) => s.bumpMaterialEpoch)
  const urls = def.runtimeUrls ?? def.textures
  const list = [urls.albedo, urls.normal, urls.roughness].filter((u): u is string => !!u)
  const tex = useTexture(list)

  useEffect(() => {
    const arr = Array.isArray(tex) ? tex : [tex]
    const loaded = {
      albedo: arr[0],
      normal: urls.normal ? arr[1] : undefined,
      roughness: urls.roughness ? arr[urls.normal ? 2 : 1] : undefined,
    }
    buildMaterial(furnitureDefOf(def), loaded)
    bump()
  }, [tex, def, urls.normal, urls.roughness, bump])

  return null
}
