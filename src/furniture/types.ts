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

export type FurnitureCategory =
  | 'beds'
  | 'seating'
  | 'tables'
  | 'storage'
  | 'kitchen'
  | 'lighting'
  | 'decor';

export const FURNITURE_CATEGORIES: readonly FurnitureCategory[] = [
  'beds',
  'seating',
  'tables',
  'storage',
  'kitchen',
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
  | 'TVConsole';

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

export type GltfDef = BuiltinGltfDef | UserGltfDef;
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

/** Returns the param schema's default values as a fresh ParamProps map. */
export function defaultParamProps(def: ParametricDef): ParamProps {
  const out: ParamProps = {};
  for (const f of def.paramSchema) out[f.key] = f.default;
  return out;
}
