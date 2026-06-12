/**
 * Parametric furniture (PF1) — save a generated piece into the catalog.
 *
 * Reuses the GLB-designer pipeline end-to-end: build the part meshes →
 * `exportGlb` (GLTFExporter) → `persistUserGlb` (validate, content-hash
 * de-dupe, blob → IndexedDB, def → store). The result is a regular user
 * catalog item that persists, hydrates on boot, collides via its exact
 * spec-derived footprint and prices via the def-level estimate.
 *
 * Each generate creates a NEW def (no mutation of placed items); generating
 * the *identical* spec again de-dupes to the existing def via the GLB
 * content hash inside `persistUserGlb`.
 */

import { exportGlb } from '../convert/toGlb'
import type { PersistResult } from '../upload/persist'
import { persistUserGlb } from '../upload/persist'
import { buildParametricObject, disposeParametricObject } from './buildObject'
import { estimatePrice } from './price'
import { clampSpec, type ParametricSpec, specLabel } from './spec'

/** Build, export and persist a parametric piece as a user catalog asset.
 *  `name` defaults to the spec label ("Custom bookshelf 80 × 200 cm"). */
export async function saveParametricAsset(
  specIn: ParametricSpec,
  name?: string,
): Promise<PersistResult> {
  const spec = clampSpec(specIn)
  const { object, model } = buildParametricObject(spec)
  let buffer: ArrayBuffer
  try {
    buffer = await exportGlb(object)
  } finally {
    disposeParametricObject(object)
  }
  const display = name?.trim() || specLabel(spec)
  const safe = display.replace(/[^\w\- ]+/g, '').slice(0, 60) || 'parametric'
  const file = new File([buffer], `${safe}.glb`, { type: 'model/gltf-binary' })
  return persistUserGlb(file, {
    name: display,
    category: 'storage',
    footprint: model.bounds,
    price: estimatePrice(model),
  })
}
