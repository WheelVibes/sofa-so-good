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

const RawSerializedStateZ = z.object({
  version: z.literal(1),
  apartmentId: z.literal('serangoon-north-vista-4r'),
  items: z.array(FurnitureItemZ),
  doors: z.record(z.string(), z.object({ open: z.boolean() })),
  finishes: z.object({
    floor: z.record(z.string(), z.string()),
    walls: z.record(z.string(), z.string()),
    // Optional for backward compat with payloads saved before accent walls.
    wallAccents: z.record(z.string(), z.string()).optional(),
  }),
  userFurniture: z.array(UserGltfDefZ),
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
    const obj = input as Record<string, unknown>;
    if (!('timeMode' in obj) && typeof obj.timeOfDay === 'string') {
      const hour = LEGACY_TIME_HOUR[obj.timeOfDay];
      if (typeof hour === 'number') {
        const { timeOfDay: _legacy, ...rest } = obj;
        void _legacy;
        return { ...rest, timeMode: 'manual', manualHour: hour };
      }
    }
  }
  return input;
}, RawSerializedStateZ);

export type SerializedState = z.infer<typeof SerializedStateZ>;

/** Picks the persistable subset of the live store. Strips runtime-only
 *  fields (selectedItemId, selectedRoomId, nearbyDoorId, runtimeUrl on
 *  user defs, catalogOpen). */
export function serialize(state: RootState): SerializedState {
  return {
    version: 1,
    apartmentId: 'serangoon-north-vista-4r',
    items: state.items,
    doors: state.doors,
    finishes: state.finishes,
    userFurniture: state.userFurniture.map((d) => ({
      id: d.id,
      name: d.name,
      category: d.category,
      kind: 'gltf',
      source: 'user',
      assetId: d.assetId,
      uploadedAt: d.uploadedAt,
      defaultFootprint: d.defaultFootprint,
    })),
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
