/**
 * Zod schema for the serialized save format. Mirrors spec §8.1, with
 * additions for user uploads (just the def metadata; binaries live in
 * IndexedDB and are referenced by assetId).
 *
 * version=1 is the only current shape. Future versions register a
 * migration in storage/migrations.ts; this file stays as the
 * canonical "shape today" so consumers don't have to discriminate.
 */

import { z } from 'zod';
import { ROOMS } from '../apartment/constants';
import { buildDefaultPlan } from '../floorplan/defaultPlan';
import { isDefaultPlan } from '../floorplan/planGeometry';
import type { RootState } from './store';
import type { RoomId } from '../apartment/types';

const FurnitureItemZ = z.object({
  id: z.string(),
  defId: z.string(),
  position: z.tuple([z.number(), z.number()]),
  rotation: z.number(),
  // Optional mirror flips (backward-compatible with pre-flip saves).
  flipX: z.boolean().optional(),
  flipZ: z.boolean().optional(),
  // Optional lock/pin flag (backward-compatible).
  locked: z.boolean().optional(),
  // Optional group membership (introduced in save v2; absent = ungrouped).
  groupId: z.string().optional(),
  props: z.record(z.string(), z.union([z.number(), z.string()])),
});

const UserGltfDefZ = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  kind: z.literal('gltf'),
  source: z.literal('user'),
  assetId: z.string(),
  uploadedAt: z.string(),
  defaultFootprint: z.object({
    w: z.number(),
    d: z.number(),
    h: z.number(),
  }),
  mounted: z.boolean().optional(),
  noClip: z.boolean().optional(),
  verticalSpan: z.object({ base: z.number(), top: z.number() }).optional(),
  finishTargets: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
  finishOverrides: z.record(z.string(), z.string()).optional(),
});

const IkeaVariantZ = z.object({
  finish: z.string(),
  label: z.string(),
  articleNumber: z.string(),
  url: z.string(),
  assetId: z.string().nullable(),
  imageAssetId: z.string().nullable().optional(),
  price: z.number().optional(),
  currency: z.string().optional(),
  swatchHex: z.string().optional(),
  footprint: z
    .object({
      w: z.number(),
      d: z.number(),
      h: z.number(),
      anchorOffset: z.tuple([z.number(), z.number(), z.number()]),
    })
    .optional(),
  glbMaterials: z.array(
    z.object({
      name: z.string(),
      hex: z.string(),
      metallic: z.number(),
      roughness: z.number(),
      textured: z.boolean(),
      sampledHex: z.string().optional(),
    }),
  ),
}); // runtimeUrl intentionally omitted — rebuilt from assetId at hydration

const IkeaGltfDefZ = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  kind: z.literal('gltf'),
  source: z.literal('ikea'),
  groupKey: z.string(),
  activeVariant: z.string(),
  variants: z.array(IkeaVariantZ),
  defaultFootprint: z.object({ w: z.number(), d: z.number(), h: z.number() }),
  verticalSpan: z.object({ base: z.number(), top: z.number() }).optional(),
  mounted: z.boolean().optional(),
  noClip: z.boolean().optional(),
  frontClearance: z.number().optional(),
  productInfo: z.record(z.string(), z.unknown()).optional(),
  compatibility: z
    .object({ acceptsCategories: z.array(z.string()), size: z.string().optional() })
    .optional(),
  uploadedAt: z.string(),
  license: z.literal('IKEA'),
  attribution: z.string(),
  sourceUrl: z.string().optional(),
});

const UserMaterialDefZ = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['floor', 'wall']),
  kind: z.literal('textured'),
  source: z.literal('user'),
  swatch: z.string(),
  uvScale: z.tuple([z.number(), z.number()]),
  textures: z.object({
    albedo: z.string(),
    normal: z.string().optional(),
    roughness: z.string().optional(),
    ao: z.string().optional(),
  }),
});

const Vec2Z = z.tuple([z.number(), z.number()]);
const PlanWallZ = z.object({
  id: z.string(),
  start: Vec2Z,
  end: Vec2Z,
  thickness: z.enum(['external', 'internal']),
  topHeight: z.number().optional(),
});
const PlanOpeningZ = z.object({
  id: z.string(),
  kind: z.enum(['door', 'window']),
  wallId: z.string(),
  offset: z.number(),
  width: z.number(),
  sill: z.number(),
  head: z.number(),
});
const PlanRoomZ = z.object({
  id: z.string(),
  name: z.string(),
  origin: Vec2Z,
  width: z.number(),
  depth: z.number(),
  extension: z.object({ offset: Vec2Z, width: z.number(), depth: z.number() }).optional(),
  ceilingHeight: z.number().optional(),
  floor: z.string().optional(),
});
const FloorPlanZ = z.object({
  id: z.string(),
  name: z.string(),
  ceilingHeight: z.number(),
  extent: Vec2Z,
  walls: z.array(PlanWallZ),
  openings: z.array(PlanOpeningZ),
  rooms: z.array(PlanRoomZ),
});

const RawSerializedStateZ = z.object({
  version: z.literal(2),
  apartmentId: z.literal('serangoon-north-vista-4r'),
  items: z.array(FurnitureItemZ),
  // Optional custom apartment shell (omitted for the default flat).
  floorPlan: FloorPlanZ.optional(),
  doors: z.record(z.string(), z.object({ open: z.boolean() })),
  finishes: z.object({
    floor: z.record(z.string(), z.string()),
    walls: z.record(z.string(), z.string()),
    // Optional for backward compat with payloads saved before accent walls.
    wallAccents: z.record(z.string(), z.string()).optional(),
  }),
  userFurniture: z.array(z.union([UserGltfDefZ, IkeaGltfDefZ])),
  userMaterials: z.array(UserMaterialDefZ),
  timeMode: z.enum(['system', 'manual']),
  manualHour: z.number().min(0).max(24),
  cameraMode: z.enum(['orbit', 'firstPerson']),
  orientationDeg: z.number().optional(),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      label: z.string().optional(),
    })
    .nullable()
    .optional()
    .default(null),
  locationPromptDismissed: z.boolean().optional().default(false),
  savedAt: z.string(),
});

const LEGACY_TIME_HOUR: Record<string, number> = {
  day: 12,
  dusk: 18,
  night: 0,
};

/** Accepts both new (`timeMode`/`manualHour`) and legacy (`timeOfDay`)
 *  payload shapes. Legacy values map: day→12, dusk→18, night→0, all
 *  in manual mode. */
export const SerializedStateZ = z.preprocess((input) => {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    let obj = input as Record<string, unknown>;
    // v1 -> v2 was a no-op on items (the optional groupId); accept legacy v1
    // payloads by bumping the version so the literal(2) check passes. (The
    // full migrate() chain still runs on the autosave-load path.)
    if (obj.version === 1) {
      obj = { ...obj, version: 2 };
    }
    if (!('timeMode' in obj) && typeof obj.timeOfDay === 'string') {
      const hour = LEGACY_TIME_HOUR[obj.timeOfDay];
      if (typeof hour === 'number') {
        const { timeOfDay: _legacy, ...rest } = obj;
        void _legacy;
        return { ...rest, timeMode: 'manual', manualHour: hour };
      }
    }
    return obj;
  }
  return input;
}, RawSerializedStateZ);

export type SerializedState = z.infer<typeof SerializedStateZ>;

/** Picks the persistable subset of the live store. Strips runtime-only
 *  fields (selectedItemId, selectedRoomId, nearbyDoorId, runtimeUrl on
 *  user defs, catalogOpen). */
export function serialize(state: RootState): SerializedState {
  return {
    version: 2,
    apartmentId: 'serangoon-north-vista-4r',
    items: state.items,
    // Persist a custom shell; the default flat is rebuilt from constants.
    ...(isDefaultPlan(state.floorPlan) ? {} : { floorPlan: state.floorPlan }),
    doors: state.doors,
    finishes: state.finishes,
    // User-uploaded and IKEA-imported defs persist; runtime-only blob URLs
    // (the def's `runtimeUrl` and each IKEA variant's `runtimeUrl`) are
    // stripped and rebuilt from the assetId at hydration.
    userFurniture: state.userFurniture
      .filter(
        (d): d is Extract<typeof d, { source: 'user' | 'ikea' }> =>
          d.source === 'user' || d.source === 'ikea',
      )
      .map((d) =>
        d.source === 'ikea'
          ? {
              id: d.id,
              name: d.name,
              category: d.category,
              kind: 'gltf' as const,
              source: 'ikea' as const,
              groupKey: d.groupKey,
              activeVariant: d.activeVariant,
              variants: d.variants.map(({ runtimeUrl, runtimeImageUrl, ...v }) => {
                void runtimeUrl;
                void runtimeImageUrl;
                return v;
              }),
              defaultFootprint: d.defaultFootprint,
              verticalSpan: d.verticalSpan,
              mounted: d.mounted,
              noClip: d.noClip,
              frontClearance: d.frontClearance,
              productInfo: d.productInfo as Record<string, unknown> | undefined,
              compatibility: d.compatibility,
              uploadedAt: d.uploadedAt,
              license: d.license,
              attribution: d.attribution,
              sourceUrl: d.sourceUrl,
            }
          : {
              id: d.id,
              name: d.name,
              category: d.category,
              kind: 'gltf' as const,
              source: 'user' as const,
              assetId: d.assetId,
              uploadedAt: d.uploadedAt,
              defaultFootprint: d.defaultFootprint,
              mounted: d.mounted,
              noClip: d.noClip,
              verticalSpan: d.verticalSpan,
              finishTargets: d.finishTargets,
              finishOverrides: d.finishOverrides,
            },
      ),
    userMaterials: state.userMaterials.map((d) => ({
      id: d.id,
      name: d.name,
      category: d.category,
      kind: 'textured',
      source: 'user',
      swatch: d.swatch,
      uvScale: d.uvScale,
      textures: d.textures,
    })),
    timeMode: state.timeMode,
    manualHour: state.manualHour,
    cameraMode: state.cameraMode,
    orientationDeg: state.orientationDeg,
    location: state.location,
    locationPromptDismissed: state.locationPromptDismissed,
    savedAt: new Date().toISOString(),
  };
}

/** Applies a parsed save to the live store. Skips items whose def is
 *  unresolvable (e.g. user-uploaded asset missing from IDB) — caller
 *  should toast the dropped ids. */
export function applySerialized(
  state: SerializedState,
  knownDefIds: Set<string>,
): Partial<RootState> {
  const validRoom = (k: string): k is RoomId => k in ROOMS;
  const floor: Partial<Record<RoomId, string>> = {};
  for (const [k, v] of Object.entries(state.finishes.floor)) {
    if (validRoom(k)) floor[k] = v;
  }
  const walls: Partial<Record<RoomId, string>> = {};
  for (const [k, v] of Object.entries(state.finishes.walls)) {
    if (validRoom(k)) walls[k] = v;
  }
  return {
    items: state.items.filter((it) => knownDefIds.has(it.defId)),
    // Restore a saved custom shell, else fall back to the default flat.
    floorPlan: state.floorPlan ?? buildDefaultPlan(),
    doors: state.doors,
    finishes: {
      floor: floor as Record<RoomId, string>,
      walls: walls as Record<RoomId, string>,
      wallAccents: state.finishes.wallAccents ?? {},
    },
    timeMode: state.timeMode,
    manualHour: state.manualHour,
    cameraMode: state.cameraMode,
    orientationDeg: state.orientationDeg ?? 0,
    location: state.location ?? null,
    locationPromptDismissed: state.locationPromptDismissed ?? false,
  };
}
