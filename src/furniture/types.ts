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

import type { ProviderId } from '../catalog/remote/types';

export type FurnitureCategory =
  | 'beds'
  | 'seating'
  | 'tables'
  | 'storage'
  | 'kitchen'
  | 'bathroom'
  | 'appliances'
  | 'lighting'
  | 'decor';

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
];

export type FurnitureType = string;

/** Built-in primitive component identifier. Maps to a React component in
 *  src/furniture/primitives/. Adding a primitive = one entry here + one file. */
export type PrimitiveKind =
  | 'Bed'
  | 'Sofa'
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
  | 'BarStool';

export type ParamField =
  | {
      kind: 'number';
      key: string;
      label: string;
      min: number;
      max: number;
      step: number;
      default: number;
      unit?: 'm' | 'cm';
    }
  | {
      kind: 'integer';
      key: string;
      label: string;
      min: number;
      max: number;
      default: number;
    }
  | { kind: 'color'; key: string; label: string; default: string }
  | {
      kind: 'enum';
      key: string;
      label: string;
      options: { value: string; label: string }[];
      default: string;
    };

export type ParamValue = number | string;
export type ParamProps = Record<string, ParamValue>;

interface FurnitureDefBase {
  id: FurnitureType;
  name: string;
  category: FurnitureCategory;
  /** Default Y-axis rotation in radians, applied at placement. */
  defaultRotation?: number;
  /**
   * Footprint used for the placement-collision pre-check (parametric items
   * may compute a tighter footprint from their current params; gltf items
   * fall back to this until the GLB has loaded and the bbox is cached).
   */
  defaultFootprint: { w: number; d: number; h: number };
  /**
   * Vertical extent (metres above floor) used for height-aware collision so
   * items at different heights (a pendant over a table, a wall aircon over a
   * wardrobe) don't falsely collide. Defaults to [0, defaultFootprint.h].
   */
  verticalSpan?: { base: number; top: number };
  /** Wall/ceiling-mounted: skip wall-body collision (it's meant to touch a
   *  wall or hang from the ceiling). */
  mounted?: boolean;
  /** Flat floor covering (e.g. a rug): never collides with walls or items. */
  noClip?: boolean;
}

export interface ParametricDef extends FurnitureDefBase {
  kind: 'parametric';
  primitive: PrimitiveKind;
  paramSchema: ParamField[];
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
  footprintParams?: { w?: string; d?: string };
}

export interface BuiltinGltfDef extends FurnitureDefBase {
  kind: 'gltf';
  source: 'builtin';
  url: string;
  scale?: number;
  license: 'CC0';
  attribution?: string;
  sourceUrl?: string;
}

export interface UserGltfDef extends FurnitureDefBase {
  kind: 'gltf';
  source: 'user';
  /** IndexedDB key in the asset store. Resolved to a blob URL at render time. */
  assetId: string;
  scale?: number;
  uploadedAt: string;
  /**
   * Runtime-only blob URL resolved from `assetId` on first persist /
   * on hydration. NOT included in the serialized save format — Phase 3
   * hydration recreates it from the IndexedDB blob.
   */
  runtimeUrl?: string;
}

export interface RemoteGltfDef extends FurnitureDefBase {
  kind: 'gltf';
  source: 'remote';
  provider: ProviderId;
  slug: string;
  resolution: '1k' | '2k' | '4k';
  /** Object URL pointing to the .gltf JSON document for the loader. */
  runtimeUrl: string;
  /** Map of every relative path the .gltf JSON references → object URL. */
  runtimeAssets: Record<string, string>;
  scale?: number;
  license: 'CC0';
  attribution: string;
  sourceUrl: string;
}

export interface PackGltfDef extends FurnitureDefBase {
  kind: 'gltf';
  source: 'pack';
  packId: string;
  entryId: string;
  /** Hydrated from the IDB blob at app start; same lifecycle as UserGltfDef. */
  runtimeUrl?: string;
  thumbUrl?: string;
  scale?: number;
  license: 'CC0';
  attribution: string;
  sourceUrl: string;
}

export type GltfDef = BuiltinGltfDef | UserGltfDef | RemoteGltfDef | PackGltfDef;
export type FurnitureDef = ParametricDef | GltfDef;

export interface FurnitureItem {
  id: string;
  defId: FurnitureType;
  /** [x, z] in metres in the apartment frame; Y is always 0 (floor-anchored). */
  position: [number, number];
  /** Y-axis rotation in radians. */
  rotation: number;
  props: ParamProps;
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
  };
  for (const f of def.paramSchema) out[f.key] = f.default;
  return out;
}
