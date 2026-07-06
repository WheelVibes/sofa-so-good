import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import { isIkeaDef } from '../../furniture/catalog'
import type { FurnitureDef } from '../../furniture/types'

/** The shared-library folder slug to re-download an imported def from, or null if
 *  the def isn't a shared/ikea import or no manifest item matches its group. The
 *  manifest is only loaded for an admin + `sharedLibrary` flag + backend, so a
 *  null result also covers "not re-downloadable in this session". */
export function sharedGroupForDef(def: FurnitureDef, items: SharedLibraryItem[]): string | null {
  if (!isIkeaDef(def) || !def.groupKey) return null
  return items.find((it) => it.groupKey === def.groupKey)?.group ?? null
}
