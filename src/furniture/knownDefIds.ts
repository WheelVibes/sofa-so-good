import { BUILTIN_CATALOG } from './builtinCatalog'
import { GENERATED_FURNITURE } from './generatedCatalog'
import type { FurnitureDef } from './types'

/**
 * Every furniture def id this device can render without the sender's help:
 * the built-in catalog, the bundled CC0 set-dressing props in
 * `GENERATED_FURNITURE` (vases, book sets, plants — placed by the app's own
 * furnish/decor pass, so they appear in ordinary designs), plus this user's
 * uploads/imports and installed packs.
 *
 * THE known-set for anything that applies a serialized design — the share-link
 * loaders, a saved-layout load, the recovery restore. Before R7-AA each of
 * those built `BUILTIN_CATALOG + userFurniture` by hand and so silently dropped
 * the bundled props: the 149-item maisonette furnish arrived through a link as
 * 144 items, the five missing (`ceramic-vase-wide` ×4, `book-set`) blamed on
 * "uploaded models".
 */
export function knownFurnitureDefIds(s: {
  userFurniture: readonly Pick<FurnitureDef, 'id'>[]
  packFurniture?: readonly Pick<FurnitureDef, 'id'>[]
}): Set<string> {
  const known = new Set<string>(Object.keys(BUILTIN_CATALOG))
  for (const d of GENERATED_FURNITURE) known.add(d.id)
  for (const d of s.userFurniture) known.add(d.id)
  for (const d of s.packFurniture ?? []) known.add(d.id)
  return known
}

/**
 * True when a def id names something only the SENDER'S device had: an upload
 * (`user-…`), an IKEA import (`ikea-…`) or a dev local-assets drop (`local:…`).
 * Anything else that fails to resolve is a def this build doesn't ship (a
 * newer build's catalog, a pack not installed here) — and must not be called
 * an uploaded model.
 */
export function isSenderOnlyDefId(defId: string): boolean {
  return defId.startsWith('user-') || defId.startsWith('ikea-') || defId.startsWith('local:')
}
