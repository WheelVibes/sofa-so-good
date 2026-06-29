/**
 * Slot configurator — save an assembled product into the catalog (SLOT-103).
 *
 * A near-copy of `saveParametric.ts`: it reuses the GLB-designer pipeline
 * end-to-end (build meshes → `exportGlb` → `persistUserGlb`) so a configured
 * product becomes a regular `UserGltfDef` — persisting, hydrating on boot,
 * colliding via its composed footprint, and pricing via the summed option price.
 * `finishTargets` ride along so the baked product stays re-skinnable through the
 * existing finish-override channel. NO new persistence path is invented (repo
 * rule in `src/furniture/CLAUDE.md`).
 */

import { exportGlb } from '../convert/toGlb'
import type { PersistResult } from '../upload/persist'
import { persistUserGlb } from '../upload/persist'
import { buildConfiguredObject, disposeConfiguredObject } from './buildObject'
import { type ConfigurableProduct, type ConfiguredSpec, clampConfig, productLabel } from './model'

export async function saveConfiguredAsset(
  product: ConfigurableProduct,
  spec: Partial<ConfiguredSpec> | null | undefined,
  name?: string,
): Promise<PersistResult> {
  const clamped = clampConfig(product, spec)
  const { object, model, finishTargets } = await buildConfiguredObject(product, clamped)
  let buffer: ArrayBuffer
  try {
    buffer = await exportGlb(object)
  } finally {
    disposeConfiguredObject(object)
  }
  const display = name?.trim() || productLabel(product, clamped)
  const safe = display.replace(/[^\w\- ]+/g, '').slice(0, 60) || 'configured'
  const file = new File([buffer], `${safe}.glb`, { type: 'model/gltf-binary' })
  return persistUserGlb(file, {
    name: display,
    category: product.category,
    footprint: model.bounds,
    price: model.price,
    finishTargets,
  })
}
