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
import { PET_TYPES, type PetType } from '../analysis/petCompliance'
import { isNonDefaultPriceRules, mergePriceRules } from '../analysis/renovationCost'
import { ROOMS } from '../apartment/constants'
import type { RoomId } from '../apartment/types'
import {
  DEFAULT_DRAWING_SET_TEMPLATE,
  isNonDefaultDrawingSetTemplate,
  mergeDrawingSetTemplate,
} from '../export/drawingSetTemplate'
import {
  DEFAULT_QUOTE_TEMPLATE,
  isNonDefaultTemplate,
  mergeTemplate,
} from '../export/quoteTemplate'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { allPlanRooms, GROUND_LEVEL_ID, levelAsPlan, planLevels } from '../floorplan/levels'
import { isDefaultPlan } from '../floorplan/planGeometry'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { defaultLayout } from '../furniture/defaultLayout'
import { clampCustomMetaEntries } from '../furniture/itemMetaLimits'
import { snapToNearestWindow } from '../furniture/placement/windowSnap'
import { defaultParamProps } from '../furniture/types'
import { safeUrl } from '../utils/safeUrl'
import { normalizeLightsMode } from './slices/uiSlice'
import type { RootState } from './store'

/** Zod transform: neutralize an unsafe-scheme URL (javascript:/data:/…) into
 *  `undefined` at the import trust boundary so it never enters state.
 *  Back-compatible — only the URL field is dropped, the record is preserved. */
/** The trailing `.optional()` is type-level only (re-marks the field as a true
 *  optional KEY in zod's inferred output, not just "possibly undefined") —
 *  without it, TS infers `{ url: string | undefined }` (a REQUIRED key), which
 *  rejects assigning the app's `{ url?: string }` shape wholesale (as
 *  `serialize()` does for `items`/`meta`). Runtime behaviour is unchanged
 *  (an absent key already parses to `undefined` either way). */
const sanitizedUrl = (schema: z.ZodOptional<z.ZodString>) =>
  schema.transform((u) => safeUrl(u)).optional()

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
  // Optional per-instance handover metadata (ITEM-META, additive) — a custom
  // product/spec URL, description, and remarks. The URL is an import trust
  // boundary (rendered into an <a href>), so it's sanitized the same way as
  // other imported URL fields (see the module-level `sanitizedUrl` note).
  meta: z
    .object({
      url: sanitizedUrl(z.string().optional()),
      // Custom price override — neutralized to `undefined` (never rejects the
      // whole record) when non-finite/negative, so corrupt/hand-edited price
      // data can't reach `itemPrice()` and can't break an otherwise-valid load
      // (mirrors the `sanitizedUrl` neutralize-not-reject pattern above).
      // Trailing `.optional()` is type-level only — see `sanitizedUrl`'s note.
      price: z
        .unknown()
        .optional()
        .transform((n) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined))
        .optional(),
      brand: z.string().optional(),
      model: z.string().optional(),
      supplier: z.string().optional(),
      description: z.string().optional(),
      remarks: z.string().optional(),
      // User-defined custom key/value fields (additive) — an ordered list so
      // display/CSV order is stable. Clamped (never rejects the record) the
      // same way as `price` above: entries beyond CUSTOM_META_MAX_ENTRIES are
      // dropped, keys/values beyond their length caps are truncated, blank
      // key/value entries are dropped, and a malformed (non-array/non-object)
      // input degrades to `undefined` rather than failing the whole load.
      custom: z
        .unknown()
        .optional()
        .transform((v) => clampCustomMetaEntries(v))
        .optional(),
    })
    .optional(),
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
  // Optional granular footprint decomposition (non-rectangular baked shape, e.g.
  // an L/U configurator sectional) so collision keeps the concave notch on
  // import — additive; absent defs fall back to the bbox.
  footprintParts: z
    .array(
      z.object({
        dx: z.number(),
        dz: z.number(),
        w: z.number(),
        d: z.number(),
        rot: z.number().optional(),
      }),
    )
    .optional(),
  // Optional def-level price estimate (parametric generator) — additive.
  price: z.number().optional(),
  // Optional GLB byte size for the catalog model-info tooltip — additive.
  byteSize: z.number().optional(),
  // Optional slot-configurator recipe (JSON) for re-editing (SLOT-204) — additive.
  slotSpec: z.string().optional(),
  // Optional GLB-designer edit spec (JSON) for re-editing (Asset Studio S0) — additive.
  assetSpec: z.string().optional(),
  // Optional parametric-generator recipe (JSON `ParametricSpec`) so the drawing
  // set can rebuild a carpentry elevation/section (TODO G8) — additive.
  parametricSpec: z.string().optional(),
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
  // Optional open-railing render override for a topHeight wall — additive, back-compat.
  railing: z.boolean().optional(),
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
  // Optional per-wall crown-molding override (mirrors baseboard) — additive, back-compat.
  crown: z
    .object({
      height: z.number().optional(),
      color: z.string().optional(),
      hidden: z.boolean().optional(),
    })
    .optional(),
  // Optional per-wall paint colour override (elementColors) — additive, back-compat.
  color: z.string().optional(),
  // Optional user-declared structural classification (TODO G7, wallStructure) —
  // additive, back-compat. Absent = 'unknown'.
  structure: z
    .enum(['load-bearing', 'rc-partition', 'brick-partition', 'drywall', 'gable-end', 'unknown'])
    .optional(),
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
  // Doors: panel/flush/glazed/bifold/sliding/double; windows:
  // plain/grille/invisible-grille/louvre. Kept a free string (no closed enum)
  // so a future style needs no schema/version bump.
  style: z.string().optional(),
  // Optional door-leaf material/finish (`painted`/`wood`/`vinyl`) — additive,
  // back-compat; ignored for windows.
  material: z.string().optional(),
})
const PlanRoomZ = z.object({
  id: z.string(),
  name: z.string(),
  // Explicit user-set room category (RM1) — optional + additive; absent falls
  // back to name-based inference (`floorplan/roomCategory.ts`).
  category: z
    .enum([
      'living',
      'dining',
      'bedroom',
      'masterBedroom',
      'kitchen',
      'bath',
      'powder',
      'study',
      'serviceYard',
      'storeroom',
      'balcony',
      'foyer',
      'other',
    ])
    .optional(),
  origin: Vec2Z,
  width: z.number(),
  depth: z.number(),
  extension: z.object({ offset: Vec2Z, width: z.number(), depth: z.number() }).optional(),
  // Explicit polygon outline (absolute metres) for free-form / Auto-room rooms —
  // authoritative for area/render/containment, so it MUST round-trip or the room
  // silently reverts to its bounding rectangle on reload.
  polygon: z.array(Vec2Z).optional(),
  ceilingHeight: z.number().optional(),
  // Finished-floor-level offset (mm) vs the main FFL datum (BSJ-8, `floorLevels`
  // flag). Optional + additive → no schema-version bump; absent = level (0).
  floorLevelMm: z.number().optional(),
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
      housingType: z.enum(['HDB', 'Condominium', 'Landed']),
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
  // Persisted electrical points (MEP layer, G1). Optional + additive — no
  // schema-version bump; absent → []. `kind` is a closed enum (matches
  // `ElectricalKind` in `floorplan/types.ts`) so an unknown/corrupt kind
  // rejects that one point record rather than silently accepting garbage.
  electricalPoints: z
    .array(
      z.object({
        id: z.string(),
        x: z.number(),
        z: z.number(),
        kind: z.enum([
          'socket',
          'socket-double',
          'switch',
          'data',
          'tv-point',
          'aircon',
          'water-heater',
        ]),
        mountHeightMm: z.number().optional(),
        label: z.string().optional(),
        levelId: z.string().optional(),
        // Lighting/switching schematic (BSJ-3, `switchCircuits`). Additive +
        // back-compat — controlled light-fixture ids + gang/way. See
        // `floorplan/types.ts`'s `PlanElectricalPoint` + `switchCircuits.ts`.
        controls: z.array(z.string()).optional(),
        gang: z.number().optional(),
        way: z.number().optional(),
      }),
    )
    .optional(),
  // Persisted plumbing points (MEP layer, G1). Same shape/rules as
  // `electricalPoints` above.
  plumbingPoints: z
    .array(
      z.object({
        id: z.string(),
        x: z.number(),
        z: z.number(),
        kind: z.enum(['water-point', 'drainage', 'floor-trap', 'soil-pipe', 'water-heater']),
        mountHeightMm: z.number().optional(),
        label: z.string().optional(),
        levelId: z.string().optional(),
      }),
    )
    .optional(),
  // Optional explicit setting-out datum (TODO G3). Optional + additive — no
  // schema-version bump; absent → the computed default corner.
  datum: z.object({ x: z.number(), z: z.number() }).optional(),
  // Parametric roof (UX research round 3, `parametricRoof` pro flag). Optional
  // + additive — no schema-version bump; absent → no roof. The enums MUST stay
  // in parity with `RoofStyle`/`RoofMaterialKind`/`RoofDormerSide` in
  // `floorplan/types.ts` (adding a value needs both files).
  roof: z
    .object({
      style: z.enum(['gable', 'hip', 'flat-parapet']),
      pitchDeg: z.number(),
      overhang: z.number(),
      ridgeAxis: z.enum(['auto', 'x', 'z']),
      material: z.enum(['clay-tile', 'metal-seam']).optional(),
      dormers: z
        .array(
          z.object({
            wallSide: z.enum(['N', 'S', 'E', 'W']),
            offset: z.number(),
            width: z.number(),
          }),
        )
        .optional(),
    })
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

/** Serialised drawing-set handover template — all fields optional for
 *  backward compatibility. Missing fields are filled in from
 *  `DEFAULT_DRAWING_SET_TEMPLATE` on load. */
const DrawingSetTemplateZ = z
  .object({
    projectName: z.string().optional(),
    projectAddress: z.string().optional(),
    client: z.string().optional(),
    drawnBy: z.string().optional(),
    checkedBy: z.string().optional(),
    revision: z.string().optional(),
    revisionNote: z.string().optional(),
    // User-customizable paper (additive follow-up to TODO G2) — absent →
    // 'a4'/'landscape' via `mergeDrawingSetTemplate` on load.
    paperSize: z.enum(['a4', 'a3', 'a2', 'a1']).optional(),
    orientation: z.enum(['landscape', 'portrait']).optional(),
  })
  .optional()

// Configurable price-rule library — every field optional + lenient; `mergePriceRules`
// sanitises (clamps negatives/NaN) and back-fills defaults on deserialise.
const PriceRulesZ = z
  .object({
    floor: z.record(z.string(), z.number()).optional(),
    wall: z.record(z.string(), z.number()).optional(),
    carpentryPerM: z.number().optional(),
    trades: z.record(z.string(), z.number()).optional(),
  })
  .optional()

const RawSerializedStateZ = z.object({
  version: z.literal(2),
  apartmentId: z.literal('serangoon-north-vista-4r'),
  items: z.array(FurnitureItemZ),
  // Optional custom apartment shell (omitted for the default flat).
  floorPlan: FloorPlanZ.optional(),
  doors: z.record(z.string(), z.object({ open: z.boolean(), leaf: z.literal('none').optional() })),
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
  // on/off state round-trips. 'auto' is still ACCEPTED for legacy saves (the
  // follow-the-sun mode removed 2026-07-24) but normalizes to 'off' on load.
  lightsMode: z.enum(['auto', 'on', 'off']).optional(),
  // Optional (added later): the one-tap lighting mood preset (UX round-3 #3),
  // so a saved reading/movie/entertaining/romantic mood round-trips. Absent →
  // 'none' (Normal) on load.
  lightMood: z.enum(['none', 'reading', 'movie', 'entertaining', 'romantic']).optional(),
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
  /** Key-collection / TOP date (`yyyy-mm-dd`) for the DLP tracker (R4-8). */
  keyCollectionDate: z.string().optional(),
  handoverChecked: z.record(z.string(), z.boolean()).optional(),
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
  // Declared household pet types (Pet program P6) — drives the pet-compliance
  // checklist + catalog essentials. Optional + additive (no schema-version bump);
  // absent → [] on load. Unknown values are dropped by the enum.
  petTypes: z.array(z.enum(PET_TYPES as unknown as [PetType, ...PetType[]])).optional(),
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
          'carpentry',
          'opening-schedule',
          'rcp',
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
  // Optional user-editable drawing-set handover template (TODO G5).
  // Optional + additive — no schema-version bump; absent → DEFAULT_DRAWING_SET_TEMPLATE on load.
  drawingSetTemplate: DrawingSetTemplateZ,
  // Optional + additive — absent → DEFAULT_PRICE_RULES on load.
  priceRules: PriceRulesZ,
  savedAt: z.string(),
  // Defaults-layout revision this save has seen (see CURRENT_DEFAULTS_REV in
  // applySerialized). Optional + additive — absent (older saves) → 0, which
  // makes the loader backfill any default items introduced since.
  defaultsRev: z.number().optional(),
})

const LEGACY_TIME_HOUR: Record<string, number> = {
  day: 12,
  dusk: 18,
  night: 0,
}

/** Accepts both new (`timeMode`/`manualHour`) and legacy (`timeOfDay`)
 *  payload shapes. Legacy hours map: day→12, dusk→18, night→0. The old
 *  *default* was 'day', so users who never picked a time land there — it
 *  migrates to `system` mode (follow the real clock, like a fresh design)
 *  rather than being pinned to manual noon. 'dusk'/'night' were deliberate
 *  off-default picks, so they stay `manual` at their hour. */
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
        const { timeOfDay: legacy, ...rest } = obj
        const timeMode = legacy === 'day' ? 'system' : 'manual'
        return { ...rest, timeMode, manualHour: hour }
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
              footprintParts: Array.isArray(d.footprintParts) ? d.footprintParts : undefined,
              price: d.price,
              slotSpec: d.slotSpec,
              assetSpec: d.assetSpec,
              parametricSpec: d.parametricSpec,
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
    lightMood: state.lightMood,
    ...(state.annotations.length ? { annotations: state.annotations } : {}),
    ...(state.comments.length ? { comments: state.comments } : {}),
    ...(state.drawingCallouts.length ? { drawingCallouts: state.drawingCallouts } : {}),
    cameraMode: state.cameraMode,
    orientationDeg: state.orientationDeg,
    ...(state.keyCollectionDate ? { keyCollectionDate: state.keyCollectionDate } : {}),
    ...(Object.keys(state.handoverChecked).length
      ? { handoverChecked: state.handoverChecked }
      : {}),
    location: state.location,
    locationPromptDismissed: state.locationPromptDismissed,
    // Persist declared pet types only when the household has any (keeps saves lean).
    ...(state.petTypes.length ? { petTypes: state.petTypes } : {}),
    ...(state.designNote ? { note: state.designNote } : {}),
    // Persist tour stops so shared designs arrive with stops in place.
    // Images are NOT embedded — receivers capture live, same as C252 model.
    ...(state.panoTourStops.length ? { panoTourStops: state.panoTourStops } : {}),
    // Persist the quote template only when the user has changed it (saves space).
    ...(isNonDefaultTemplate(state.quoteTemplate) ? { quoteTemplate: state.quoteTemplate } : {}),
    // Persist the drawing-set template only when the user has changed it.
    ...(isNonDefaultDrawingSetTemplate(state.drawingSetTemplate)
      ? { drawingSetTemplate: state.drawingSetTemplate }
      : {}),
    // Persist the price-rule library only when the user has changed a rate.
    ...(isNonDefaultPriceRules(state.priceRules) ? { priceRules: state.priceRules } : {}),
    savedAt: new Date().toISOString(),
    defaultsRev: CURRENT_DEFAULTS_REV,
  }
}

/** True when an item's transform is safe to feed into the Three.js matrices
 *  (no NaN/Infinity — `z.number()` admits both, so a corrupt or hand-edited
 *  save could otherwise crash-loop the renderer). Exported so a caller that
 *  needs to reason about *why* `applySerialized` dropped a given item (e.g.
 *  `hydrate.ts`/`cloudBoot.ts` distinguishing "corrupt" from "def temporarily
 *  unresolvable", BUG-2) can reuse the exact same check instead of drifting a
 *  second copy of it. */
function hasFiniteItemTransform(it: SerializedState['items'][number]): boolean {
  return (
    Number.isFinite(it.position[0]) &&
    Number.isFinite(it.position[1]) &&
    Number.isFinite(it.rotation)
  )
}

/** Applies a parsed save to the live store. Skips items whose def is
 *  unresolvable (e.g. user-uploaded asset missing from IDB) — caller
 *  should toast the dropped ids.
 *
 *  This drop-unknown-defId behaviour is correct for a load that is
 *  explicitly about a DIFFERENT design than what's currently persisted
 *  (file import, a saved version/slot, a plan/design share link) — the def
 *  genuinely doesn't exist here, and each of those callers already tells the
 *  user a count was skipped. It is the WRONG behaviour for restoring the
 *  user's OWN autosave (`hydrate.ts`/`cloudBoot.ts`): there, a def can be
 *  unresolvable only because its IndexedDB blob is temporarily/permanently
 *  gone (browser storage eviction, private-mode wipe, quota pressure) —
 *  dropping the item here and then letting the very next autosave fire would
 *  silently and permanently delete placed furniture the user never asked to
 *  remove (BUG-2). Those two callers re-merge the dropped-for-unknown-def
 *  items back into this function's `items` output (using
 *  `hasFiniteItemTransform` to keep genuinely corrupt items dropped). */
/** Bump when the curated default layout gains NEW items that existing
 *  default-flat saves should receive on load (list their ids below). */
const CURRENT_DEFAULTS_REV = 1
const DEFAULTS_BACKFILL_IDS = new Set(['default-b2-curtain', 'default-b3-curtain'])

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
  // Re-home ORPHANED window-bound fixtures (curtains/blinds/mesh screens):
  // a fixture is only ever PLACED snapped to a window, but a later plan change
  // (or a default-flat geometry revision — e.g. the removed MB west window)
  // can leave a persisted fixture hanging on a now-solid wall. On load, any
  // window-bound item further than ~0.3 m from every window on its storey is
  // re-snapped to the nearest window (keeping its props); if its storey has no
  // windows at all it is dropped rather than left floating mid-wall.
  const levelPlans = new Map(planLevels(plan).map((l) => [l.id, levelAsPlan(plan, l)]))
  // Re-home items STRANDED OUTSIDE the flat: a plan change (or a default-flat
  // geometry revision) can leave a persisted item's centre outside every room
  // of its storey — e.g. the old service-yard washer sitting in what is now a
  // void strip. Such an item is clamped to the nearest point inside its
  // nearest room (inset 0.3 m so its body lands inside too). Items inside any
  // room (with a small tolerance for wall-flush placement) are untouched.
  const OUT_TOL = 0.2
  const rehomeStranded = (
    it: SerializedState['items'][number],
  ): SerializedState['items'][number] => {
    const def = BUILTIN_CATALOG[it.defId]
    if (def?.mounted || def?.noClip) return it
    const lp = levelPlans.get(it.levelId ?? GROUND_LEVEL_ID) ?? levelPlans.get(GROUND_LEVEL_ID)
    if (!lp || lp.rooms.length === 0) return it
    const [x, z] = it.position
    const rects = lp.rooms.flatMap((r) => {
      const main = {
        x0: r.origin[0],
        z0: r.origin[1],
        x1: r.origin[0] + r.width,
        z1: r.origin[1] + r.depth,
      }
      if (!r.extension) return [main]
      const ex = r.origin[0] + r.extension.offset[0]
      const ez = r.origin[1] + r.extension.offset[1]
      return [main, { x0: ex, z0: ez, x1: ex + r.extension.width, z1: ez + r.extension.depth }]
    })
    const inside = rects.some(
      (rc) =>
        x >= rc.x0 - OUT_TOL &&
        x <= rc.x1 + OUT_TOL &&
        z >= rc.z0 - OUT_TOL &&
        z <= rc.z1 + OUT_TOL,
    )
    if (inside) return it
    // Clamp to the nearest room rect, inset so the item's body lands inside.
    let best: [number, number] | null = null
    let bestD = Number.POSITIVE_INFINITY
    for (const rc of rects) {
      const inset = Math.min(0.3, (rc.x1 - rc.x0) / 2, (rc.z1 - rc.z0) / 2)
      const cx = Math.min(Math.max(x, rc.x0 + inset), rc.x1 - inset)
      const cz = Math.min(Math.max(z, rc.z0 + inset), rc.z1 - inset)
      const d = Math.hypot(cx - x, cz - z)
      if (d < bestD) {
        bestD = d
        best = [cx, cz]
      }
    }
    return best ? { ...it, position: best } : it
  }
  const rehomeWindowBound = (
    it: SerializedState['items'][number],
  ): SerializedState['items'][number] | null => {
    if (!BUILTIN_CATALOG[it.defId]?.windowBound) return it
    const lp = levelPlans.get(it.levelId ?? GROUND_LEVEL_ID) ?? levelPlans.get(GROUND_LEVEL_ID)
    if (!lp) return it
    const snap = snapToNearestWindow(lp.walls, lp.openings, [it.position[0], it.position[1]])
    if (!snap) return null
    const drift = Math.hypot(snap.position[0] - it.position[0], snap.position[1] - it.position[1])
    if (drift <= 0.3) return it
    return { ...it, position: [snap.position[0], snap.position[1]], rotation: snap.rotation }
  }
  // Drop items whose transform isn't finite (see `hasFiniteItemTransform`) —
  // `z.number()` admits NaN/Infinity, so a corrupt or hand-edited save could
  // otherwise feed NaN into the Three.js matrices and break (or crash-loop)
  // the whole renderer.
  const items = state.items
    .filter((it) => knownDefIds.has(it.defId) && hasFiniteItemTransform(it))
    .map(rehomeWindowBound)
    .filter((it): it is SerializedState['items'][number] => it != null)
    .map(rehomeStranded)
  // Backfill default-layout items a NEWER defaults revision introduced (e.g.
  // the W1 bedroom curtains): only for saves of the DEFAULT flat that still
  // carry default-layout furnishing, and only for revisions this save hasn't
  // seen (the stamped `defaultsRev` makes a user's later deletion stick —
  // re-saving records the current revision, so the item is never re-added).
  if (isDefaultPlan(plan) && (state.defaultsRev ?? 0) < CURRENT_DEFAULTS_REV) {
    const have = new Set(items.map((i) => i.id))
    if (items.some((it) => it.id?.startsWith('default-'))) {
      for (const entry of defaultLayout()) {
        if (!DEFAULTS_BACKFILL_IDS.has(entry.id) || have.has(entry.id)) continue
        const def = BUILTIN_CATALOG[entry.defId]
        const props =
          def?.kind === 'parametric'
            ? { ...defaultParamProps(def), ...entry.props }
            : { ...entry.props }
        items.push({
          id: entry.id,
          defId: entry.defId,
          position: [entry.position[0], entry.position[1]],
          rotation: entry.rotation,
          props,
        })
      }
    }
  }
  return {
    items,
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
    lightsMode: normalizeLightsMode(state.lightsMode),
    lightMood: state.lightMood ?? 'none',
    annotations: state.annotations ?? [],
    comments: state.comments ?? [],
    drawingCallouts: state.drawingCallouts ?? [],
    cameraMode: state.cameraMode,
    orientationDeg: state.orientationDeg ?? 0,
    keyCollectionDate: state.keyCollectionDate ?? null,
    handoverChecked: state.handoverChecked ?? {},
    location: state.location ?? null,
    locationPromptDismissed: state.locationPromptDismissed ?? false,
    petTypes: state.petTypes ?? [],
    designNote: state.note ?? '',
    // Restore tour stops from the shared design (absent in older saves → []).
    panoTourStops: state.panoTourStops ?? [],
    // Restore the quote template (absent in older saves → DEFAULT_QUOTE_TEMPLATE).
    quoteTemplate: state.quoteTemplate
      ? mergeTemplate(state.quoteTemplate)
      : DEFAULT_QUOTE_TEMPLATE,
    // Restore the drawing-set template (absent in older saves → default).
    drawingSetTemplate: state.drawingSetTemplate
      ? mergeDrawingSetTemplate(state.drawingSetTemplate)
      : DEFAULT_DRAWING_SET_TEMPLATE,
    // Restore the price-rule library (absent / partial → sanitised defaults).
    priceRules: mergePriceRules(state.priceRules),
  }
}

/** BUG-2 fix. Call this right after `applySerialized` when the load is
 *  restoring the user's OWN autosave (`hydrate.ts`/`cloudBoot.ts`) rather
 *  than an explicit cross-instance import — puts back, in place on `patch`,
 *  any item `applySerialized` dropped purely because its `defId` wasn't in
 *  `knownDefIds` (an item dropped for a genuinely non-finite/corrupt
 *  transform stays dropped). The restored items render as nothing until
 *  their def resolves again — `FurnitureLayer`/`LayersPanel` already treat
 *  an unknown `defId` as inert rather than crashing — so retaining them
 *  costs nothing but a few bytes of save size, while dropping them here would
 *  let the very next autosave make a transient IndexedDB blob eviction (or a
 *  private-mode wipe, or quota pressure) permanent. Returns the ids restored
 *  this way, e.g. for a future "N items are missing their model" notice. */
export function preserveUnresolvedItems(
  state: SerializedState,
  knownDefIds: Set<string>,
  patch: Partial<RootState>,
): string[] {
  const unresolved = state.items.filter(
    (it) => !knownDefIds.has(it.defId) && hasFiniteItemTransform(it),
  )
  if (unresolved.length > 0) {
    patch.items = [...(patch.items ?? []), ...unresolved]
  }
  return unresolved.map((it) => it.id)
}
