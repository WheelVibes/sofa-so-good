/**
 * Catalog + instance types for the furniture system.
 *
 * The catalog is a hybrid of two kinds:
 *   - 'parametric' — built-in primitives (Bed, Sofa, ...) whose geometry is
 *     derived from a `paramSchema` the Inspector renders into UI.
 *   - 'gltf'       — bundled CC0 GLBs and user-uploaded models, both rendered
 *     through the same generic loader. Built-in entries reference a static
 *     URL under /assets/furniture/; user entries reference an IndexedDB
 *     `assetId` resolved to a blob URL at render time.
 *
 * Instances (`FurnitureItem`) carry a stable id, the def they reference, a
 * floor-plane position + rotation, and a free-form `props` bag. For
 * parametric items the bag overrides `paramSchema` defaults; for gltf items
 * only `scale` and `tint` are honoured.
 */

import type { ProviderId } from '../catalog/remote/types'

export type FurnitureCategory =
  | 'beds'
  | 'seating'
  | 'tables'
  | 'storage'
  | 'kitchen'
  | 'bathroom'
  | 'appliances'
  | 'lighting'
  | 'decor'
  | 'textiles'
  | 'outdoor'
  | 'electronics'
  | 'kids'
  | 'laundry'
  | 'others'

export const FURNITURE_CATEGORIES: readonly FurnitureCategory[] = [
  'beds',
  'seating',
  'tables',
  'storage',
  'kitchen',
  'bathroom',
  'appliances',
  'lighting',
  'decor',
  'textiles',
  'outdoor',
  'electronics',
  'kids',
  'laundry',
  'others',
]

export type FurnitureType = string

/** Built-in primitive component identifier. Maps to a React component in
 *  src/furniture/primitives/. Adding a primitive = one entry here + one file. */
export type PrimitiveKind =
  | 'Bed'
  | 'Sofa'
  | 'SofaSectional'
  | 'FeatureWall'
  | 'ConsoleTable'
  | 'Sideboard'
  | 'BarCart'
  | 'Ottoman'
  | 'RoomDivider'
  | 'Bench'
  | 'CubeShelf'
  | 'DiningTable'
  | 'KitchenCounter'
  | 'Wardrobe'
  | 'Desk'
  | 'Bookshelf'
  | 'TVConsole'
  | 'DiningChair'
  | 'Armchair'
  | 'CoffeeTable'
  | 'Nightstand'
  | 'Rug'
  | 'PottedPlant'
  | 'FlatscreenTV'
  | 'AirconUnit'
  | 'Refrigerator'
  | 'FloorLamp'
  | 'Toilet'
  | 'BathroomSink'
  | 'CeilingLight'
  | 'CeilingFan'
  | 'Stove'
  | 'WashingMachine'
  | 'Curtain'
  | 'WallArt'
  | 'OfficeChair'
  | 'WallCabinet'
  | 'Dresser'
  | 'BarStool'
  | 'Shower'
  | 'Staircase'
  | 'Mirror'
  | 'Monitor'
  | 'RangeHood'
  | 'TableLamp'
  | 'Microwave'
  | 'DryingRack'
  | 'LaundryHamper'
  | 'TabletopDecor'
  | 'ShoeCabinet'
  | 'WallShelf'
  | 'WallSconce'
  | 'WallTapestry'
  | 'CoveLight'
  | 'FloorMirror'
  | 'RollerBlind'
  | 'SideTable'
  | 'WallClock'
  | 'StandingFan'
  | 'TowelRail'
  | 'BunkBed'
  | 'ToddlerBed'
  | 'Crib'
  | 'Soundbar'
  | 'FloorSpeaker'
  | 'WallMirror'
  | 'FloorVase'
  | 'GarmentRack'
  | 'HighChair'
  | 'ChangingTable'
  | 'Bathtub'
  | 'CoatRack'
  | 'HangingPlant'
  | 'ChaiseLounge'
  | 'KitchenIsland'
  | 'PetBed'
  | 'Aquarium'
  | 'Piano'
  | 'Fireplace'
  | 'Vanity'
  | 'ToyStorage'
  | 'TowelLadder'
  | 'CabinetBase'
  | 'CabinetWall'
  | 'CabinetTall'
  | 'CabinetCorner'
  | 'Dishwasher'
  | 'Oven'
  | 'WineCooler'
  | 'PlanterTrough'
  | 'OutdoorChair'
  | 'OutdoorTable'
  | 'OutdoorParasol'
  | 'OutdoorLounger'

export type ParamField =
  | {
      kind: 'number'
      key: string
      label: string
      min: number
      max: number
      step: number
      default: number
      unit?: 'm' | 'cm'
    }
  | {
      kind: 'integer'
      key: string
      label: string
      min: number
      max: number
      default: number
    }
  | { kind: 'color'; key: string; label: string; default: string }
  | {
      kind: 'enum'
      key: string
      label: string
      options: { value: string; label: string }[]
      default: string
    }

export type ParamValue = number | string
export type ParamProps = Record<string, ParamValue>

interface FurnitureDefBase {
  id: FurnitureType
  name: string
  category: FurnitureCategory
  /** Extra search terms / synonyms (e.g. "credenza" for a sideboard) so the
   *  catalog search finds an item even when the user types a common alias.
   *  Matched alongside the display name. */
  keywords?: string[]
  /** Default Y-axis rotation in radians, applied at placement. */
  defaultRotation?: number
  /**
   * Footprint used for the placement-collision pre-check (parametric items
   * may compute a tighter footprint from their current params; gltf items
   * fall back to this until the GLB has loaded and the bbox is cached).
   */
  defaultFootprint: { w: number; d: number; h: number }
  /**
   * Vertical extent (metres above floor) used for height-aware collision so
   * items at different heights (a pendant over a table, a wall aircon over a
   * wardrobe) don't falsely collide. Defaults to [0, defaultFootprint.h].
   */
  verticalSpan?: { base: number; top: number }
  /** Wall/ceiling-mounted: skip wall-body collision (it's meant to touch a
   *  wall or hang from the ceiling). */
  mounted?: boolean
  /** Flat floor covering (e.g. a rug): never collides with walls or items. */
  noClip?: boolean
  /** Clear floor (m) the layout must preserve in front of this piece; from IKEA design semantics. */
  frontClearance?: number
}

export interface ParametricDef extends FurnitureDefBase {
  kind: 'parametric'
  primitive: PrimitiveKind
  paramSchema: ParamField[]
  /**
   * Maps the OBB footprint axes to ParamField keys so placement
   * collision can recompute the footprint from live params. When a
   * key is absent (or the param is not a number) the corresponding
   * `defaultFootprint` axis is used unchanged.
   *
   * Default: { w: 'width', d: 'depth' } — most primitives use these.
   * Bed and KitchenCounter override because their long axis is named
   * differently in the inspector.
   */
  footprintParams?: { w?: string; d?: string }
}

export interface BuiltinGltfDef extends FurnitureDefBase {
  kind: 'gltf'
  source: 'builtin'
  url: string
  scale?: number
  /** Bundled GLBs are CC0 by default, but some (e.g. the pool tables) are
   *  CC-BY — the real licence rides on the sidecar → generated catalog and is
   *  shown in the inspector + CreditsModal. */
  license: 'CC0' | 'CC-BY'
  attribution?: string
  sourceUrl?: string
}

export interface UserGltfDef extends FurnitureDefBase {
  kind: 'gltf'
  source: 'user'
  /** IndexedDB key in the asset store. Resolved to a blob URL at render time. */
  assetId: string
  /** SHA-256 of the GLB bytes — used to skip re-uploading an identical file.
   *  Persisted in the asset's IDB meta and rehydrated on boot. */
  contentHash?: string
  scale?: number
  uploadedAt: string
  /**
   * Runtime-only blob URL resolved from `assetId` on first persist /
   * on hydration. NOT included in the serialized save format — Phase 3
   * hydration recreates it from the IndexedDB blob.
   */
  runtimeUrl?: string
  /** Named material/mesh groups discovered in the GLB that the user can
   *  re-skin (populated at import). */
  finishTargets?: { key: string; label: string }[]
  /** Map of finish-target key → finish value. For now a hex tint; the
   *  configurator milestone extends this to `mat:<id>` DLC + procedural ids.
   *  Applied by GltfModel. */
  finishOverrides?: Record<string, string>
}

export interface RemoteGltfDef extends FurnitureDefBase {
  kind: 'gltf'
  source: 'remote'
  provider: ProviderId
  slug: string
  resolution: '1k' | '2k' | '4k'
  /** Object URL pointing to the .gltf JSON document for the loader. */
  runtimeUrl: string
  /** Map of every relative path the .gltf JSON references → object URL. */
  runtimeAssets: Record<string, string>
  scale?: number
  license: 'CC0'
  attribution: string
  sourceUrl: string
}

export interface PackGltfDef extends FurnitureDefBase {
  kind: 'gltf'
  source: 'pack'
  packId: string
  entryId: string
  /** Hydrated from the IDB blob at app start; same lifecycle as UserGltfDef. */
  runtimeUrl?: string
  thumbUrl?: string
  scale?: number
  /** Most packs are CC0; API-sourced packs (Poly Pizza) may include CC-BY
   *  models, which the catalog card credits via `attribution`. */
  license: 'CC0' | 'CC-BY'
  attribution: string
  sourceUrl: string
}

export interface IkeaGlbMaterial {
  name: string // glb_materials[].name → finish-target key
  hex: string
  metallic: number
  roughness: number
  textured: boolean
  sampledHex?: string // representative colour for the swatch
}

export interface IkeaVariant {
  finish: string // raw scraper finish, e.g. "black-brown"
  label: string // display label (title-cased finish)
  articleNumber: string
  url: string
  /** IDB key for this finish's GLB; null = not crawled (stub). */
  assetId: string | null
  /** Runtime blob URL, hydrated from assetId (not persisted). */
  runtimeUrl?: string
  price?: number // price_numeral
  currency?: string
  swatchHex?: string // sampled_hex of material_0, for the picker
  /**
   * Bounding-box footprint of this variant's GLB at scale=1, in metres.
   * `anchorOffset` is the GLB's local-space geometric centre `[x, y, z]` in
   * metres — only the x/z components are used for placement OBB computations
   * (they map to the FOOTPRINT_CACHE `ox`/`oz` fields in GltfModel.tsx and the
   * `CachedBox` ox/oz in collision/gltfSpan.ts). Placement.ts adds the rotated
   * x/z offset to item.position when constructing the OBB; y is ignored.
   */
  footprint?: { w: number; d: number; h: number; anchorOffset: [number, number, number] }
  glbMaterials: IkeaGlbMaterial[]
  /** Downscaled catalog-thumbnail blob in IDB (kind:'texture', role:'ikea-image').
   *  Null/absent when no product image was scraped for this finish. Persisted. */
  imageAssetId?: string | null
  /** Runtime blob URL for the thumbnail; hydrated from imageAssetId, NOT persisted. */
  runtimeImageUrl?: string
}

/**
 * Read-only IKEA product metadata from the scraper payload (series, materials,
 * care instructions, documents, rating, images, measurements). Surfaced in the
 * inspector's product-info panel; no behavioural impact.
 */
export interface IkeaProductInfo {
  series?: string
  styleGroup?: string
  typeName?: string // scraper type_name — used by the compatibility resolver
  designer?: string
  description?: string
  goodToKnow?: string[]
  categoryHierarchy?: string[]
  size?: string
  productMeasurements?: Record<string, string>
  materials?: { part: string; composition: string }[]
  careInstructions?: string
  documents?: { name: string; url: string }[]
  rating?: { value: number; max: number; count: number }
  mainImageUrl?: string
  contextualImageUrl?: string
  categoryConfidence?: 'high' | 'low'
}

export interface IkeaCompatibility {
  acceptsCategories: string[]
  size?: string
}

/** Modular sofa section connectivity (from the scraper). `role` is the section
 *  kind; `mates` lists which local edges accept which neighbour roles. Absent for
 *  non-modular products. Drives edge-snap when combining two sections. */
export interface IkeaModular {
  role: 'seat' | 'corner' | 'chaise' | 'armrest'
  mates: { edge: 'left' | 'right' | 'back'; accepts: string[] }[]
}

export interface IkeaGltfDef extends FurnitureDefBase {
  kind: 'gltf'
  source: 'ikea'
  groupKey: string
  /** Must match one of `variants[].finish`; drives which GLB asset is loaded. */
  activeVariant: string
  variants: IkeaVariant[]
  productInfo?: IkeaProductInfo
  compatibility?: IkeaCompatibility
  modular?: IkeaModular
  uploadedAt: string
  license: 'IKEA'
  attribution: string
  sourceUrl?: string
  /** Uniform scale override applied at render time (same semantics as other GltfDef variants). */
  scale?: number
  /** Runtime blob URL for the active variant's GLB; hydrated from the active variant's assetId (not persisted). */
  runtimeUrl?: string
}

export type GltfDef = BuiltinGltfDef | UserGltfDef | RemoteGltfDef | PackGltfDef | IkeaGltfDef
export type FurnitureDef = ParametricDef | GltfDef

export interface FurnitureItem {
  id: string
  defId: FurnitureType
  /** [x, z] in metres in the apartment frame; Y is always 0 (floor-anchored). */
  position: [number, number]
  /** Y-axis rotation in radians. */
  rotation: number
  /** Mirror flips in the item's local frame (left↔right / front↔back).
   *  Optional + default false so saved layouts stay backward-compatible. */
  flipX?: boolean
  flipZ?: boolean
  /** When true the item is pinned: it can't be dragged, nudged, rotated or
   *  deleted until unlocked (good for fixed appliances / fixtures). Optional
   *  + default false so saved layouts stay backward-compatible. */
  locked?: boolean
  /** Items sharing a groupId move/rotate as a unit and select together.
   *  A group IS the set of items with this id — there is no separate entity.
   *  Optional + default undefined so existing saves stay valid. */
  groupId?: string
  /** Optional user-given display name, overriding the catalog def name in the
   *  inspector + Layers panel. Optional + default undefined (uses def.name). */
  label?: string
  /** Plan level (storey) this item sits on; absent = the ground floor. Heights
   *  in `props` stay relative to the item's level floor — renderers add the
   *  level's elevation. See docs/research/multi-level-design.md (F13). */
  levelId?: string
  props: ParamProps
}

/** Returns the param schema's default values as a fresh ParamProps map.
 *  Footprint dimensions (`width`, `depth`, `length`) are seeded from
 *  `defaultFootprint` so primitives can read them even when they aren't
 *  exposed as editable schema fields (e.g. fixed-size beds). Schema
 *  defaults override the seeds when both are present. */
export function defaultParamProps(def: ParametricDef): ParamProps {
  const out: ParamProps = {
    width: def.defaultFootprint.w,
    depth: def.defaultFootprint.d,
    length: def.defaultFootprint.d,
  }
  for (const f of def.paramSchema) out[f.key] = f.default
  return out
}
