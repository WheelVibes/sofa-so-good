import { MeshStandardMaterial, type Texture } from 'three';
import type { MaterialDef } from './types';
import { generateProcedural } from './procedural/generators';

/** Module-level material cache keyed by MaterialId. Each cached
 *  MeshStandardMaterial is reused across every mesh that applies the
 *  same finish so the GPU uploads textures once. */
const CACHE = new Map<string, MeshStandardMaterial>();

/** Returns the cached material for a MaterialId, or undefined. */
export function getCachedMaterial(id: string): MeshStandardMaterial | undefined {
  return CACHE.get(id);
}

/** Constructs and caches a new material for the given def. The caller
 *  is responsible for passing already-loaded textures (or none for a
 *  solid material). */
export function buildMaterial(
  def: MaterialDef,
  textures?: { albedo?: Texture; normal?: Texture; roughness?: Texture; ao?: Texture },
): MeshStandardMaterial {
  const existing = CACHE.get(def.id);
  if (existing) return existing;

  const m = new MeshStandardMaterial({
    color: def.swatch,
    roughness: 0.85,
    metalness: 0.0,
  });
  if (def.kind === 'procedural') {
    const maps = generateProcedural(def.id, def.pattern, def.swatch);
    m.color.set('#ffffff'); // tint baked into albedo
    m.map = maps.albedo;
    m.normalMap = maps.normal;
    m.roughnessMap = maps.roughness;
    m.metalness = maps.metalness;
    for (const t of [maps.albedo, maps.normal, maps.roughness]) {
      t.repeat.set(1 / def.uvScale[0], 1 / def.uvScale[1]);
    }
    CACHE.set(def.id, m);
    return m;
  }
  if (def.kind === 'textured' && textures) {
    if (textures.albedo) m.map = textures.albedo;
    if (textures.normal) m.normalMap = textures.normal;
    if (textures.roughness) m.roughnessMap = textures.roughness;
    if (textures.ao) m.aoMap = textures.ao;
    // Apply UV repeat so the picker thumbnail and the rendered surface
    // tile at the metres-per-tile rate declared in the def.
    for (const t of [textures.albedo, textures.normal, textures.roughness, textures.ao]) {
      if (!t) continue;
      t.wrapS = t.wrapT = 1000; // RepeatWrapping
      t.repeat.set(1 / def.uvScale[0], 1 / def.uvScale[1]);
    }
  }
  CACHE.set(def.id, m);
  return m;
}

/** Drops the cached material for a MaterialId — used when a user
 *  material is deleted so its GPU resources are reclaimed. */
export function disposeCachedMaterial(id: string): void {
  const m = CACHE.get(id);
  if (!m) return;
  m.dispose();
  if (m.map) m.map.dispose();
  if (m.normalMap) m.normalMap.dispose();
  if (m.roughnessMap) m.roughnessMap.dispose();
  if (m.aoMap) m.aoMap.dispose();
  CACHE.delete(id);
}
