/**
 * Move-in / handover punch-list (PARITY-MOVEIN-CHECKLIST) — a derived snagging +
 * key-handover checklist in the spirit of the defect-check / handover sheet an
 * SG buyer walks the home with on collection (HDB key collection, condo TOP, or
 * a renovation handover).
 *
 * Three sources, all deterministic from the plan + placed furniture:
 *   - **Per-room snag items**: a small rule table keyed on each room's inferred
 *     kind (`roomKindFromName`) — the defects you actually check in that kind of
 *     room (e.g. tile hollowness in a bath, water-stop valves in a kitchen).
 *     Rooms whose name maps to no recognised kind land in a generic room bucket.
 *   - **Appliance / utility activation**: for each appliance-ish furniture
 *     category actually present in `items` (kitchen, appliances, laundry,
 *     electronics), the install/test/activation step that piece implies.
 *   - **Generic handover**: keys, meters, defect-liability and documents — always
 *     present, even for an empty plan (so the punch-list never comes back blank).
 *
 * Pure logic only — no clocks, no randomness, no React/three — so the same input
 * always yields the same grouped output and it is fully unit-testable. A panel /
 * report section is presentation over the groups this returns. Mirrors the shape
 * of `accessibility.ts` / `daylight.ts`.
 */

import { toRoomKind } from '../floorplan/roomCategory'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureCategory, FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildHandoverDates, formatHandoverDate } from './handoverDates'
import { type RoomKind, roomKindFromName } from './suggestions'

/** One actionable checklist line. */
interface ChecklistItem {
  /** Stable id (group key + rule id) so a UI can key/checkbox each line. */
  id: string
  label: string
}

/** A named group of checklist lines (a room, the appliances bucket, or generic). */
interface ChecklistGroup {
  /** 'room' = a plan room; 'appliances' = utility activation; 'generic' = handover. */
  kind: 'room' | 'appliances' | 'generic'
  title: string
  items: ChecklistItem[]
}

export interface HandoverChecklist {
  groups: ChecklistGroup[]
  /** Total number of checklist lines across all groups. */
  totalItems: number
}

/** A per-room snag rule. */
interface RoomRule {
  id: string
  label: string
}

/**
 * Snag checks every habitable room shares (finishes, electrics, openings). Kept
 * separate from the kind-specific rules so each room gets the common walk-through
 * plus whatever its kind adds.
 */
const COMMON_ROOM_RULES: readonly RoomRule[] = [
  { id: 'walls', label: 'Walls & ceiling — no cracks, stains or uneven paint' },
  { id: 'floor', label: 'Flooring — no hollow tiles, scratches or lippage' },
  { id: 'power', label: 'Power points & light switches all work' },
  { id: 'doors', label: 'Doors & windows open, close and lock smoothly' },
]

/**
 * Kind-specific snag rules — the defects you check in that kind of room. Keyed on
 * the `RoomKind` from `roomKindFromName`; an unrecognised kind ('other') gets no
 * extra rules (just the common set). 'balcony' covers external/utility spaces.
 */
const ROOM_RULES_BY_KIND: Partial<Record<RoomKind, readonly RoomRule[]>> = {
  living: [{ id: 'tv-point', label: 'TV / data points and aircon trunking in place' }],
  dining: [{ id: 'lighting', label: 'Pendant / feature lighting points centred over the table' }],
  bedroom: [
    { id: 'aircon', label: 'Aircon unit cools and drains; no water dripping' },
    { id: 'wardrobe', label: 'Built-in wardrobe doors & tracks aligned' },
  ],
  kitchen: [
    { id: 'water-stop', label: 'Water-stop valves and sink drainage leak-free' },
    { id: 'tiles', label: 'Wall & floor tiles — no hollow or cracked tiles' },
    { id: 'cabinets', label: 'Cabinet doors, drawers and hinges aligned' },
    { id: 'hood', label: 'Cooker-hood ducting and gas/induction points ready' },
  ],
  bath: [
    { id: 'waterproof', label: 'Floor falls to the trap; no ponding (waterproofing)' },
    { id: 'tiles', label: 'Wall & floor tiles — no hollow or cracked tiles' },
    { id: 'sanitary', label: 'WC, basin & shower mixer leak-free and well-sealed' },
    { id: 'exhaust', label: 'Exhaust fan / ventilation working' },
  ],
  study: [{ id: 'data', label: 'Data / network and ample power points for the desk' }],
  balcony: [
    { id: 'drainage', label: 'Floor trap drains freely; no ponding' },
    { id: 'railing', label: 'Railing / parapet secure and to height' },
  ],
}

/**
 * Appliance-ish furniture categories that imply an install / test / activation
 * step on move-in (utilities & white goods), mapped to the line they add. A
 * category not present among the placed items contributes nothing.
 */
const APPLIANCE_RULES: Partial<Record<FurnitureCategory, { id: string; label: string }>> = {
  kitchen: {
    id: 'kitchen',
    label: 'Kitchen appliances (hob, oven, hood) installed and tested',
  },
  appliances: {
    id: 'appliances',
    label: 'Fridge, water heater & other appliances powered and working',
  },
  laundry: {
    id: 'laundry',
    label: 'Washer / dryer plumbed, vented and run a test cycle',
  },
  electronics: {
    id: 'electronics',
    label: 'TV, network and AV equipment connected and tested',
  },
}
/** The appliance categories in the order their activation items should appear. */
const APPLIANCE_ORDER: readonly FurnitureCategory[] = [
  'kitchen',
  'appliances',
  'laundry',
  'electronics',
]

/** Generic key-handover / meter / documentation items — always included. */
const GENERIC_RULES: readonly RoomRule[] = [
  { id: 'keys', label: 'Collect all keys, access cards and remote controls' },
  { id: 'meters', label: 'Record electricity & water meter readings; activate utilities' },
  { id: 'main-switch', label: 'Test the main DB / circuit breakers and RCCB trip' },
  { id: 'water-main', label: 'Open the main water stopcock; check for leaks' },
  { id: 'defects', label: 'Log all defects and note the defect-liability period' },
  { id: 'documents', label: 'File warranties, manuals and as-built / renovation documents' },
]

/**
 * Build the move-in / handover checklist for a plan + its placed furniture.
 * Pure + deterministic; never throws on a partial/empty plan.
 *
 * Order: one group per plan room (in plan order), then the appliance-activation
 * group (only when an appliance category is present), then the generic handover
 * group (always last, always present).
 */
export function buildHandoverChecklist(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  keyCollectionDate?: string | null,
): HandoverChecklist {
  const groups: ChecklistGroup[] = []
  const rooms = Array.isArray(plan?.rooms) ? plan.rooms : []

  // --- Per-room snag groups -------------------------------------------------
  for (const room of rooms) {
    if (!room) continue
    // RM1: an explicit, user-set category wins; a room without one keeps the
    // legacy name classifier so its snag rules are byte-identical.
    const kind = room.category ? toRoomKind(room.category) : roomKindFromName(room.name)
    const extra = ROOM_RULES_BY_KIND[kind] ?? []
    const rules = [...COMMON_ROOM_RULES, ...extra]
    groups.push({
      kind: 'room',
      title: room.name || 'Room',
      items: rules.map((r) => ({ id: `room:${room.id}:${r.id}`, label: r.label })),
    })
  }

  // --- Appliance / utility activation group ---------------------------------
  // Which appliance categories are actually placed (resolved through the catalog).
  const presentCats = new Set<FurnitureCategory>()
  for (const it of Array.isArray(items) ? items : []) {
    const def = catalog?.[it?.defId]
    if (def) presentCats.add(def.category)
  }
  const applianceItems = APPLIANCE_ORDER.filter((c) => presentCats.has(c)).map((c) => {
    const rule = APPLIANCE_RULES[c]!
    return { id: `appliance:${rule.id}`, label: rule.label }
  })
  if (applianceItems.length > 0) {
    groups.push({ kind: 'appliances', title: 'Appliances & utilities', items: applianceItems })
  }

  // --- Generic handover group (always present) ------------------------------
  groups.push({
    kind: 'generic',
    title: 'Keys, meters & documents',
    items: GENERIC_RULES.map((r) => ({ id: `generic:${r.id}`, label: r.label })),
  })

  // --- Warranty & defect dates group (R4-8) ---------------------------------
  // Only when a key-collection date is set: turn the prose defect-liability line
  // into concrete DLP + HDB warranty-window deadline dates.
  const dates = buildHandoverDates(keyCollectionDate)
  if (dates) {
    groups.push({
      kind: 'generic',
      title: 'Warranty & defect dates',
      items: dates.entries.map((e) => ({
        id: `dates:${e.id}`,
        label: `${e.label}: ${formatHandoverDate(e.date)}`,
      })),
    })
  }

  const totalItems = groups.reduce((s, g) => s + g.items.length, 0)
  return { groups, totalItems }
}
