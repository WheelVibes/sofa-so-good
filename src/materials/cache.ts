import { MeshStandardMaterial, type Texture } from 'three'
import {
  generateProcedural,
  getPlasterNormal,
  getProceduralBaseSize,
} from './procedural/generators'
import type { MaterialDef } from './types'

/** Module-level material cache keyed by MaterialId. Each cached
 *  MeshStandardMaterial is reused across every mesh that applies the
 *  same finish so the GPU uploads textures once. */
const CACHE = new Map<string, MeshStandardMaterial>()

/** Returns the cached material for a MaterialId, or undefined. */
export function getCachedMaterial(id: string): MeshStandardMaterial | undefined {
  return CACHE.get(id)
}

/** Returns the BUILT material for a MaterialId regardless of its kind:
 *  procedural materials cache under `id@<generation size>` (so a quality-tier
 *  change regenerates them — see `buildMaterial`), everything else under the
 *  plain id. Callers that only have the id (e.g. a furniture `mat:<id>`
 *  finish) must use this — a plain `getCachedMaterial(id)` permanently misses
 *  procedural builds and the finish silently stays on its fallback. */
export function getBuiltMaterial(id: string): MeshStandardMaterial | undefined {
  return CACHE.get(id) ?? CACHE.get(`${id}@${getProceduralBaseSize()}`)
}

/** Constructs and caches a new material for the given def. The caller
 *  is responsible for passing already-loaded textures (or none for a
 *  solid material). */
export function buildMaterial(
  def: MaterialDef,
  textures?: { albedo?: Texture; normal?: Texture; roughness?: Texture; ao?: Texture },
): MeshStandardMaterial {
  // Procedural materials carry the generation size in the key so a quality-
  // tier change regenerates at the new size instead of serving a stale one.
  const cacheKey =
    def.kind === 'procedural' && def.pattern !== 'plaster'
      ? `${def.id}@${getProceduralBaseSize()}`
      : def.id
  const existing = CACHE.get(cacheKey)
  if (existing) return existing

  const m = new MeshStandardMaterial({
    color: def.swatch,
    roughness: 0.85,
    metalness: 0.0,
  })
  if (def.kind === 'procedural' && def.pattern === 'plaster') {
    // Painted plaster: shared normal + flat tint (no per-material textures).
    const normal = getPlasterNormal()
    m.color.set(def.swatch)
    m.roughness = 0.92
    m.normalMap = normal
    m.normalScale.set(0.4, 0.4)
    CACHE.set(cacheKey, m)
    return m
  }
  if (def.kind === 'procedural') {
    const maps = generateProcedural(def.id, def.pattern, def.swatch)
    m.color.set('#ffffff') // tint baked into albedo
    m.map = maps.albedo
    m.normalMap = maps.normal
    m.roughnessMap = maps.roughness
    m.metalness = maps.metalness
    for (const t of [maps.albedo, maps.normal, maps.roughness]) {
      t.repeat.set(1 / def.uvScale[0], 1 / def.uvScale[1])
    }
    CACHE.set(cacheKey, m)
    return m
  }
  if (def.kind === 'textured' && textures) {
    if (textures.albedo) m.map = textures.albedo
    if (textures.normal) m.normalMap = textures.normal
    if (textures.roughness) m.roughnessMap = textures.roughness
    if (textures.ao) m.aoMap = textures.ao
    // Apply UV repeat so the picker thumbnail and the rendered surface
    // tile at the metres-per-tile rate declared in the def.
    for (const t of [textures.albedo, textures.normal, textures.roughness, textures.ao]) {
      if (!t) continue
      t.wrapS = t.wrapT = 1000 // RepeatWrapping
      t.repeat.set(1 / def.uvScale[0], 1 / def.uvScale[1])
    }
  }
  CACHE.set(cacheKey, m)
  return m
}

/** Drops the cached material for a MaterialId — used when a user
 *  material is deleted so its GPU resources are reclaimed. */
export function disposeCachedMaterial(id: string): void {
  const m = CACHE.get(id)
  if (!m) return
  m.dispose()
  if (m.map) m.map.dispose()
  if (m.normalMap) m.normalMap.dispose()
  if (m.roughnessMap) m.roughnessMap.dispose()
  if (m.aoMap) m.aoMap.dispose()
  CACHE.delete(id)
}
