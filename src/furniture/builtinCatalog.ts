/**
 * Built-in furniture catalog — the assembled registry. Each entry is a fully-typed
 * FurnitureDef; the entries themselves live in per-category modules under ./defs/
 * (grouped by FurnitureCategory) plus the parametric cabinet engine (./cabinet).
 *
 * Adding a parametric primitive: add a ParametricDef to the matching ./defs/<category>.ts
 * AND a primitive component under primitives/<PrimitiveKind>.tsx. Adding a built-in GLB:
 * drop the file under public/assets/furniture/ and add a BuiltinGltfDef entry to its
 * category file; the generic GltfModel wrapper handles rendering.
 *
 * User-uploaded assets are NOT included here — they live in the user-assets store slice
 * and are merged in by `useCatalog()`.
 */
import { CABINET_DEFS } from './cabinet/cabinetCatalog'
import { APPLIANCES_DEFS } from './defs/appliances'
import { BATHROOM_DEFS } from './defs/bathroom'
import { BEDS_DEFS } from './defs/beds'
import { DECOR_DEFS } from './defs/decor'
import { ELECTRONICS_DEFS } from './defs/electronics'
import { KIDS_DEFS } from './defs/kids'
import { KITCHEN_DEFS } from './defs/kitchen'
import { LAUNDRY_DEFS } from './defs/laundry'
import { LIGHTING_DEFS } from './defs/lighting'
import { OTHERS_DEFS } from './defs/others'
import { OUTDOOR_DEFS } from './defs/outdoor'
import { PETS_DEFS } from './defs/pets'
import { SEATING_DEFS } from './defs/seating'
import { STORAGE_DEFS } from './defs/storage'
import { TABLES_DEFS } from './defs/tables'
import { TEXTILES_DEFS } from './defs/textiles'
import type { FurnitureCategory, FurnitureDef, FurnitureType } from './types'

export const BUILTIN_CATALOG: Record<FurnitureType, FurnitureDef> = {
  // Parametric cabinet engine (base / wall / tall).
  ...CABINET_DEFS,
  ...APPLIANCES_DEFS,
  ...BATHROOM_DEFS,
  ...BEDS_DEFS,
  ...DECOR_DEFS,
  ...ELECTRONICS_DEFS,
  ...KIDS_DEFS,
  ...KITCHEN_DEFS,
  ...LAUNDRY_DEFS,
  ...LIGHTING_DEFS,
  ...OTHERS_DEFS,
  ...OUTDOOR_DEFS,
  ...PETS_DEFS,
  ...SEATING_DEFS,
  ...STORAGE_DEFS,
  ...TABLES_DEFS,
  ...TEXTILES_DEFS,
}

/** Pre-grouped lookup for the catalog drawer; recomputed only on module init. */
export const BUILTIN_BY_CATEGORY: Readonly<Record<FurnitureCategory, FurnitureDef[]>> =
  Object.freeze(
    (Object.values(BUILTIN_CATALOG) as FurnitureDef[]).reduce(
      (acc, def) => {
        if (!acc[def.category]) acc[def.category] = []
        acc[def.category].push(def)
        return acc
      },
      {} as Record<FurnitureCategory, FurnitureDef[]>,
    ),
  )
