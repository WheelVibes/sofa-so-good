/**
 * Zod schema for the serialized save format. Mirrors spec §8.1, with
 * additions for user uploads (just the def metadata; binaries live in
 * IndexedDB and are referenced by assetId).
 *
 * version=1 is the only current shape. Future versions register a
 * migration in storage/migrations.ts; this file stays as the
 * canonical "shape today" so consumers don't have to discriminate.
 */

import { z } from 'zod'
import { ROOMS } from '../apartment/constants'
import type { RoomId } from '../apartment/types'
import {
  DEFAULT_QUOTE_TEMPLATE,
  isNonDefaultTemplate,
  mergeTemplate,
} from '../export/quoteTemplate'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { allPlanRooms } from '../floorplan/levels'
import { isDefaultPlan } from '../floorplan/planGeometry'
import { safeUrl } from '../utils/safeUrl'
import type { RootState } from './store'

/** Zod transform: neutralize an unsafe-scheme URL (javascript:/data:/…) into
 *  `undefined` at the import trust boundary so it never enters state.
 *  Back-compatible — only the URL field is dropped, the record is preserved. */
const sanitizedUrl = (schema: z.ZodOptional<z.ZodString>) => schema.transform((u) => safeUrl(u))

const FurnitureItemZ = z.object({
  id: z.string(),
  defId: z.string(),
  position: z.tuple([z.number(), z.number()]),
  rotation: z.number(),
  // Optional multi-axis tilt (pitch about local X, roll about local Z), radians.
  // Backward-compatible with pre-tilt saves (absent = upright).
  pitch: z.number().optional(),
  roll: z.number().optional(),
  // Optional elevation above the floor (m) — SweetHome3DJS parity. Back-compat.
  elevation: z.number().optional(),
  // Optional mirror flips (backward-compatible with pre-flip saves).
  flipX: z.boolean().optional(),
  flipZ: z.boolean().optional(),
  // Optional lock/pin flag (backward-compatible).
  locked: z.boolean().optional(),
  // Optional group membership (introduced in save v2; absent = ungrouped).
  groupId: z.string().optional(),
  // Optional user-given display name (absent = use the catalog def name).
  label: z.string().optional(),
  // Optional plan level (storey); absent = ground floor (F13, additive).
  levelId: z.string().optional(),
  props: z.record(z.string(), z.union([z.number(), z.string()])),
})

const UserGltfDefZ = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  kind: z.literal('gltf'),
  source: z.literal('user'),
  assetId: z.string(),
  contentHash: z.string().optional(),
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
  // Optional def-level price estimate (parametric generator) — additive.
  price: z.number().optional(),
  // Optional GLB byte size for the catalog model-info tooltip — additive.
  byteSize: z.number().optional(),
})

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
}) // runtimeUrl intentionally omitted — rebuilt from assetId at hydration

const IkeaGltfDefZ = z
  .object({
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
    // Neutralize a javascript:/data: source URL on import (rendered in SourceLine).
    sourceUrl: sanitizedUrl(z.string().optional()),
  })
  // The free-form productInfo bag (z.unknown()) carries scraped URLs rendered
  // as a `<img src>` (mainImageUrl) and document `href`s — sanitize them too.
  .transform((d) => {
    if (d.productInfo) d.productInfo = sanitizeProductInfoUrls(d.productInfo)
    return d
  })

/** Drop unsafe-scheme URLs inside the open-ended IKEA `productInfo` bag —
 *  `mainImageUrl` (rendered as `<img src>`) and `documents[].url` (rendered as
 *  anchors). Mutates a shallow copy; unknown shapes pass through untouched. */
function sanitizeProductInfoUrls(info: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...info }
  if (typeof out.mainImageUrl === 'string') {
    out.mainImageUrl = safeUrl(out.mainImageUrl) // undefined → field dropped on render
  }
  if (Array.isArray(out.documents)) {
    out.documents = out.documents.map((doc) =>
      doc && typeof doc === 'object' && typeof (doc as { url?: unknown }).url === 'string'
        ? { ...doc, url: safeUrl((doc as { url: string }).url) }
        : doc,
    )
  }
  return out
}

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
})

const Vec2Z = z.tuple([z.number(), z.number()])
const PlanWallZ = z.object({
  id: z.string(),
  start: Vec2Z,
  end: Vec2Z,
  thickness: z.enum(['external', 'internal']),
  // Optional custom name (+ auto-assigned flag) + lock flag — additive, back-compat.
  name: z.string().optional(),
  nameAuto: z.boolean().optional(),
  locked: z.boolean().optional(),
  // Optional per-wall explicit thickness (m) override — additive, back-compat.
  thicknessM: z.number().optional(),
  topHeight: z.number().optional(),
  // Optional sloping-wall end height (PARITY-SLOPEWALL) — additive, back-compat.
  topHeightEnd: z.number().optional(),
  // Optional curvature bulge (m) — additive, back-compat (PARITY-CURVEDWALL).
  arc: z.number().optional(),
  // Optional per-wall baseboard override (PARITY-BASEBOARD) — additive, back-compat.
  baseboard: z
    .object({
      height: z.number().optional(),
      color: z.string().optional(),
      hidden: z.boolean().optional(),
    })
    .optional(),
  // Optional per-wall paint colour override (elementColors) — additive, back-compat.
  color: z.string().optional(),
})
const PlanOpeningZ = z.object({
  id: z.string(),
  kind: z.enum(['door', 'window']),
  wallId: z.string(),
  // Optional custom name (+ auto-assigned flag) + lock flag — additive, back-compat.
  name: z.string().optional(),
  nameAuto: z.boolean().optional(),
  locked: z.boolean().optional(),
  offset: z.number(),
  width: z.number(),
  sill: z.number(),
  head: z.number(),
  hinge: z.enum(['start', 'end']).optional(),
  swing: z.enum(['left', 'right']).optional(),
  // Optional door-leaf / window-glass colour (elementColors) — additive, back-compat.
  color: z.string().optional(),
  // Optional door/window style/type (openingStyles) — additive, back-compat.
  style: z.string().optional(),
})
const PlanRoomZ = z.object({
  id: z.string(),
  name: z.string(),
  origin: Vec2Z,
  width: z.number(),
  depth: z.number(),
  extension: z.object({ offset: Vec2Z, width: z.number(), depth: z.number() }).optional(),
  // Explicit polygon outline (absolute metres) for free-form / Auto-room rooms —
  // authoritative for area/render/containment, so it MUST round-trip or the room
  // silently reverts to its bounding rectangle on reload.
  polygon: z.array(Vec2Z).optional(),
  ceilingHeight: z.number().optional(),
  floor: z.string().optional(),
  // Per-room wall finish (optional + additive → no schema-version bump).
  wall: z.string().optional(),
  // Movable room-name label offset (metres from the centroid). Optional + additive.
  labelOffset: Vec2Z.optional(),
  // Room-name label rotation (radians) + font-size multiplier. Optional + additive.
  labelAngle: z.number().optional(),
  labelFontScale: z.number().optional(),
  // Per-room floor-texture transform (scale/angle) — optional + additive.
  floorTexScale: z.number().optional(),
  floorTexAngle: z.number().optional(),
  // Per-room ceiling treatment (tray/coffered/dropped). Optional + additive →
  // no schema-version bump; absent → flat (the prior behaviour).
  ceiling: z
    .object({
      style: z.enum(['flat', 'tray', 'coffered', 'dropped', 'sloped']),
      drop: z.number().optional(),
      margin: z.number().optional(),
      grid: z.tuple([z.number(), z.number()]).optional(),
      coveLight: z.boolean().optional(),
      coveColor: z.string().optional(),
      // Sloped-ceiling pitch (PARITY-SLOPECEIL) — additive, back-compat.
      slope: z.object({ axis: z.enum(['x', 'z']), rise: z.number() }).optional(),
    })
    .optional(),
})
// One storey above the ground floor (F13). Optional + additive — no
// schema-version bump; absent = single-storey (the prior behaviour).
const PlanUpperLevelZ = z.object({
  id: z.string(),
  name: z.string(),
  elevation: z.number(),
  ceilingHeight: z.number().optional(),
  walls: z.array(PlanWallZ),
  openings: z.array(PlanOpeningZ),
  rooms: z.array(PlanRoomZ),
})
export const FloorPlanZ = z.object({
  id: z.string(),
  name: z.string(),
  // Template categorisation (housing type → project → apartment type). Optional
  // + additive — older saved plans simply have none.
  category: z
    .object({
      housingType: z.enum(['HDB', 'Condominium']),
      projectName: z.string(),
      apartmentType: z.string(),
    })
    .optional(),
  ceilingHeight: z.number(),
  extent: Vec2Z,
  walls: z.array(PlanWallZ),
  openings: z.array(PlanOpeningZ),
  rooms: z.array(PlanRoomZ),
  wallColor: z.string().optional(),
  // Plan-wide default wall thickness (m) per category — additive, back-compat.
  wallThickness: z
    .object({ external: z.number().optional(), internal: z.number().optional() })
    .optional(),
  upperLevels: z.array(PlanUpperLevelZ).optional(),
  groundName: z.string().optional(),
  notes: z
    .array(
      z.object({
        id: z.string(),
        x: z.number(),
        z: z.number(),
        text: z.string(),
        levelId: z.string().optional(),
      }),
    )
    .optional(),
  dimensions: z
    .array(z.object({ id: z.string(), a: Vec2Z, b: Vec2Z, levelId: z.string().optional() }))
    .optional(),
  // Persistent ruler guides (PARITY-PLAN-GUIDES). Optional + additive — absent → [].
  guides: z.array(z.object({ axis: z.enum(['x', 'z']), pos: z.number() })).optional(),
  // Free-form polyline markup (PARITY-POLYLINE). Optional + additive — no
  // schema-version bump; absent → []. `points` MUST round-trip or the polyline
  // silently vanishes on reload.
  polylines: z
    .array(
      z.object({
        id: z.string(),
        points: z.array(Vec2Z),
        closed: z.boolean().optional(),
        dashed: z.boolean().optional(),
        arrow: z.boolean().optional(),
        levelId: z.string().optional(),
      }),
    )
    .optional(),
})

/** Serialised quote template — all fields optional for backward compatibility.
 *  Missing fields are filled in from `DEFAULT_QUOTE_TEMPLATE` on load. */
const QuoteTemplateZ = z
  .object({
    companyName: z.string().optional(),
    contactLine: z.string().optional(),
    headerNote: z.string().optional(),
    footerNote: z.string().optional(),
    currencyLabel: z.string().optional(),
    gstPercent: z.number().optional(),
    markupPercent: z.number().optional(),
    discountPercent: z.number().optional(),
    showFfe: z.boolean().optional(),
    showFloor: z.boolean().optional(),
    showWall: z.boolean().optional(),
    showCarpentry: z.boolean().optional(),
  })
  .optional()

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
    // Optional for backward compat with payloads saved before ceiling finishes.
    ceiling: z.record(z.string(), z.string()).optional(),
    // Optional for backward compat with payloads saved before accent walls.
    wallAccents: z.record(z.string(), z.string()).optional(),
  }),
  userFurniture: z.array(z.union([UserGltfDefZ, IkeaGltfDefZ])),
  userMaterials: z.array(UserMaterialDefZ),
  // Optional apartment master colour palette + per-room overrides
  // (CUSTOMIZE-MASTER-PALETTE). Absent on legacy saves → empty.
  masterPalette: z.array(z.string()).optional(),
  roomPalettes: z.record(z.string(), z.array(z.string())).optional(),
  timeMode: z.enum(['system', 'manual']),
  manualHour: z.number().min(0).max(24),
  // Optional (added later): fixture-lights mode, so a saved lighting mood's
  // on/off state round-trips. Absent → 'auto' on load.
  lightsMode: z.enum(['auto', 'on', 'off']).optional(),
  // Optional pinned dimension callouts (persist with the design). Absent → [].
  annotations: z
    .array(
      z.object({
        id: z.string(),
        a: z.tuple([z.number(), z.number()]),
        b: z.tuple([z.number(), z.number()]),
        shape: z.enum(['line', 'rect']),
      }),
    )
    .optional(),
  // Optional pinned design comments (F24) — optional + additive like
  // annotations, so they travel with .sofa.json exports AND `#/design/<code>`
  // share links (designShare reuses serialize). Absent → [].
  comments: z
    .array(
      z.object({
        id: z.string(),
        position: z.tuple([z.number(), z.number()]),
        levelId: z.string().optional(),
        text: z.string(),
        author: z.string().optional(),
        createdAt: z.string(),
        resolved: z.boolean(),
      }),
    )
    .optional(),
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
  // Free-text project note that travels with the design (optional, back-compat).
  note: z.string().optional(),
  // Optional free-text callouts on drawing-set sheets (PARITY-LIGHTINGTEMPLATE-TEXT).
  // Optional + additive — no schema-version bump; absent → [] on load.
  drawingCallouts: z
    .array(
      z.object({
        id: z.string(),
        sheet: z.enum([
          'cover',
          'floor-plan',
          'elevations',
          'lighting',
          'dimensions',
          'section',
          'electrical',
          'plumbing',
          'finishes',
          'demolition',
          'ffe',
        ]),
        text: z.string(),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        leaderX: z.number().min(0).max(1).optional(),
        leaderY: z.number().min(0).max(1).optional(),
      }),
    )
    .optional(),
  // Optional tour stops (C261, P-720 tail) — optional + additive, no version bump.
  // Images are NOT shared — receivers capture live from the current design.
  // Absent → [] on load (backward-compatible with older saves / links).
  panoTourStops: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        position: z.tuple([z.number(), z.number()]),
        levelId: z.string().optional(),
      }),
    )
    .optional(),
  // Optional user-editable quote template (PARITY-QUOTE-XLSX tail).
  // Optional + additive — no schema-version bump; absent → DEFAULT_QUOTE_TEMPLATE on load.
  quoteTemplate: QuoteTemplateZ,
  savedAt: z.string(),
})

const LEGACY_TIME_HOUR: Record<string, number> = {
  day: 12,
  dusk: 18,
  night: 0,
}

/** Accepts both new (`timeMode`/`manualHour`) and legacy (`timeOfDay`)
 *  payload shapes. Legacy values map: day→12, dusk→18, night→0, all
 *  in manual mode. */
export const SerializedStateZ = z.preprocess((input) => {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    let obj = input as Record<string, unknown>
    // v1 -> v2 was a no-op on items (the optional groupId); accept legacy v1
    // payloads by bumping the version so the literal(2) check passes. (The
    // full migrate() chain still runs on the autosave-load path.)
    if (obj.version === 1) {
      obj = { ...obj, version: 2 }
    }
    if (!('timeMode' in obj) && typeof obj.timeOfDay === 'string') {
      const hour = LEGACY_TIME_HOUR[obj.timeOfDay]
      if (typeof hour === 'number') {
        const { timeOfDay: _legacy, ...rest } = obj
        void _legacy
        return { ...rest, timeMode: 'manual', manualHour: hour }
      }
    }
    return obj
  }
  return input
}, RawSerializedStateZ)

export type SerializedState = z.infer<typeof SerializedStateZ>

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
    // Master palette + per-room overrides (omit empties to keep saves lean).
    ...(state.masterPalette.length ? { masterPalette: state.masterPalette } : {}),
    ...(Object.keys(state.roomPalettes).length ? { roomPalettes: state.roomPalettes } : {}),
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
                void runtimeUrl
                void runtimeImageUrl
                return v
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
              price: d.price,
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
    lightsMode: state.lightsMode,
    ...(state.annotations.length ? { annotations: state.annotations } : {}),
    ...(state.comments.length ? { comments: state.comments } : {}),
    ...(state.drawingCallouts.length ? { drawingCallouts: state.drawingCallouts } : {}),
    cameraMode: state.cameraMode,
    orientationDeg: state.orientationDeg,
    location: state.location,
    locationPromptDismissed: state.locationPromptDismissed,
    ...(state.designNote ? { note: state.designNote } : {}),
    // Persist tour stops so shared designs arrive with stops in place.
    // Images are NOT embedded — receivers capture live, same as C252 model.
    ...(state.panoTourStops.length ? { panoTourStops: state.panoTourStops } : {}),
    // Persist the quote template only when the user has changed it (saves space).
    ...(isNonDefaultTemplate(state.quoteTemplate) ? { quoteTemplate: state.quoteTemplate } : {}),
    savedAt: new Date().toISOString(),
  }
}

/** Applies a parsed save to the live store. Skips items whose def is
 *  unresolvable (e.g. user-uploaded asset missing from IDB) — caller
 *  should toast the dropped ids. */
export function applySerialized(
  state: SerializedState,
  knownDefIds: Set<string>,
): Partial<RootState> {
  // The plan being restored (custom shell, else the default flat) — used to
  // validate finish keys: a custom plan's finishes are keyed by its own room
  // ids (not in the fixed `ROOMS` table), so filtering on `ROOMS` alone would
  // silently drop every custom-room floor/wall finish on load.
  const plan = state.floorPlan ?? buildDefaultPlan()
  // All storeys' rooms — a multi-level plan keys finishes by upper-level room
  // ids too (allPlanRooms === plan.rooms for single-storey plans).
  const planRoomIds = new Set<string>(allPlanRooms(plan).map((r) => r.id))
  const validRoom = (k: string): k is RoomId => k in ROOMS || planRoomIds.has(k)
  const floor: Partial<Record<RoomId, string>> = {}
  for (const [k, v] of Object.entries(state.finishes.floor)) {
    if (validRoom(k)) floor[k] = v
  }
  const walls: Partial<Record<RoomId, string>> = {}
  for (const [k, v] of Object.entries(state.finishes.walls)) {
    if (validRoom(k)) walls[k] = v
  }
  const ceiling: Partial<Record<RoomId, string>> = {}
  for (const [k, v] of Object.entries(state.finishes.ceiling ?? {})) {
    if (validRoom(k)) ceiling[k] = v
  }
  // Drop items whose transform isn't finite — `z.number()` admits NaN/Infinity,
  // so a corrupt or hand-edited save could otherwise feed NaN into the Three.js
  // matrices and break (or crash-loop) the whole renderer.
  const finiteTransform = (it: SerializedState['items'][number]) =>
    Number.isFinite(it.position[0]) &&
    Number.isFinite(it.position[1]) &&
    Number.isFinite(it.rotation)
  return {
    items: state.items.filter((it) => knownDefIds.has(it.defId) && finiteTransform(it)),
    // A loaded/restored design has no relation to the current session's
    // selection or hidden set — reset both so the inspector and the Layers
    // "(N hidden)" count never reference items that are no longer present.
    selectedItemId: null,
    selectedItemIds: [],
    hiddenItemIds: [],
    // Restore a saved custom shell, else fall back to the default flat.
    floorPlan: plan,
    doors: state.doors,
    finishes: {
      floor: floor as Record<RoomId, string>,
      walls: walls as Record<RoomId, string>,
      ceiling: ceiling as Record<RoomId, string>,
      wallAccents: state.finishes.wallAccents ?? {},
    },
    masterPalette: state.masterPalette ?? [],
    roomPalettes: state.roomPalettes ?? {},
    timeMode: state.timeMode,
    manualHour: state.manualHour,
    lightsMode: state.lightsMode ?? 'auto',
    annotations: state.annotations ?? [],
    comments: state.comments ?? [],
    drawingCallouts: state.drawingCallouts ?? [],
    cameraMode: state.cameraMode,
    orientationDeg: state.orientationDeg ?? 0,
    location: state.location ?? null,
    locationPromptDismissed: state.locationPromptDismissed ?? false,
    designNote: state.note ?? '',
    // Restore tour stops from the shared design (absent in older saves → []).
    panoTourStops: state.panoTourStops ?? [],
    // Restore the quote template (absent in older saves → DEFAULT_QUOTE_TEMPLATE).
    quoteTemplate: state.quoteTemplate
      ? mergeTemplate(state.quoteTemplate)
      : DEFAULT_QUOTE_TEMPLATE,
  }
}
