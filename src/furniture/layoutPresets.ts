import type { RoomId } from '../apartment/types'
import type { RoomCategory } from '../floorplan/types'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { defaultLayout } from './defaultLayout'
import type { LayoutEntry } from './defaults/types'
import { boutiqueSuite } from './presets/boutiqueSuite'
import { brokenPlan } from './presets/brokenPlan'
import { coastal } from './presets/coastal'
import { cozyTropical } from './presets/cozyTropical'
import { entertainer } from './presets/entertainer'
import { familyNursery } from './presets/familyNursery'
import { japandi } from './presets/japandi'
import { minimalist } from './presets/minimalist'
import { modernLuxe } from './presets/modernLuxe'
import { modernMono } from './presets/modernMono'
import { moveIn } from './presets/moveIn'
import { openLounge } from './presets/openLounge'
import { peranakanAccent } from './presets/peranakanAccent'
import { scandiCalm } from './presets/scandiCalm'
import { socialLounge } from './presets/socialLounge'
import type { LayoutPreset } from './presets/types'
import { warmIndustrial } from './presets/warmIndustrial'
import { wfhStudio } from './presets/wfhStudio'
import type { ParamProps } from './types'
import { defaultParamProps } from './types'

/**
 * Full-flat layout presets. Each preset (in `./presets/<id>.ts`) reuses the
 * curated default placements and restyles them — overriding cosmetic props per
 * item type and setting a coordinated floor + wall palette — and may re-model
 * specific rooms. This file is the registry + the hydration logic that turns a
 * preset into a placed, restyled item list.
 */
export type { LayoutPreset }

/** Default-layout item-id prefix for each room (see src/furniture/defaults/).
 *  A `rooms` override for a room drops the defaults sharing its prefix. */
const ROOM_PREFIX: Partial<Record<RoomId, string>> = {
  mainBedroom: 'default-main',
  bedroom2: 'default-b2',
  bedroom3: 'default-b3',
  livingDining: 'default-ld',
  kitchen: 'default-k',
  bath1: 'default-bath1',
  bath2: 'default-bath2',
  serviceYard: 'default-sy',
}

/** RM2: the fixed default flat's per-room-id `RoomCategory`, mirroring
 *  `roomCategory.ts`'s regexes for the built-in template's own room names —
 *  lets `buildPresetItems` resolve `preset.categoryStyle` for a room whose
 *  items only carry an id PREFIX (no live `PlanRoom`/`category` to resolve
 *  via `roomCategory(room)`, unlike `furnishPlanItems`'s custom-plan path). */
const ROOM_ID_CATEGORY: Partial<Record<RoomId, RoomCategory>> = {
  mainBedroom: 'masterBedroom',
  bedroom2: 'bedroom',
  bedroom3: 'bedroom',
  livingDining: 'living',
  kitchen: 'kitchen',
  bath1: 'bath',
  bath2: 'bath',
  serviceYard: 'serviceYard',
}

/** The default flat's `RoomCategory` for one of its fixed room ids, so a caller
 *  can resolve `preset.categoryStyle` / `preset.dryFloorByCategory` without
 *  duplicating `ROOM_ID_CATEGORY` (v0.31.8.17). */
export function presetRoomCategory(room: RoomId): RoomCategory | undefined {
  return ROOM_ID_CATEGORY[room]
}

/** `[idPrefix, category]` pairs derived from the two maps above, used to
 *  resolve a hydrated default item's room category from its id prefix. */
const PREFIX_CATEGORY: [string, RoomCategory][] = (Object.keys(ROOM_PREFIX) as RoomId[])
  .map((r): [string, RoomCategory] | null => {
    const prefix = ROOM_PREFIX[r]
    const category = ROOM_ID_CATEGORY[r]
    return prefix && category ? [`${prefix}-`, category] : null
  })
  .filter((p): p is [string, RoomCategory] => p !== null)

/** Resolve a default-layout item's room category from its id prefix, or
 *  `undefined` if it doesn't belong to a mapped room (e.g. an authored
 *  `rooms`/`extraItems` entry, resolved separately). */
function categoryForEntryId(id: string): RoomCategory | undefined {
  return PREFIX_CATEGORY.find(([prefix]) => id.startsWith(prefix))?.[1]
}

/** Rooms a preset restyles (the "designed" living spaces; wet/utility rooms
 *  keep their hard-wearing finishes). Mirrors STYLE_ROOMS. */
export const PRESET_ROOMS: RoomId[] = [
  'mainBedroom',
  'bedroom2',
  'bedroom3',
  'livingDining',
  'corridor',
]

export const LAYOUT_PRESETS: LayoutPreset[] = [
  // 2025-26 SG theme gallery (`group: 'theme'`, 8) — SmartStart's primary grid.
  moveIn,
  scandiCalm,
  warmIndustrial,
  cozyTropical,
  japandi,
  modernLuxe,
  minimalist,
  peranakanAccent,
  // Layout variants (`group: 'layout'`) — demoted to a secondary "Layouts"
  // section (re-modelled arrangements, not a full cosmetic theme).
  openLounge,
  entertainer,
  brokenPlan,
  wfhStudio,
  socialLounge,
  boutiqueSuite,
  familyNursery,
  // Fading 2026 themes (no `group` — kept resolvable by id for old saved
  // designs, untagged from both gallery sections per the 2026-07-19 research).
  coastal,
  modernMono,
]

/** Hydrate one entry: schema defaults < the entry's own props < the preset's
 *  per-defId `style` override < the preset's per-room-category
 *  `categoryStyle` override (RM2, highest precedence — e.g. a bedroom reads
 *  calmer than the living room under the same theme). */
function hydrate(
  entry: LayoutEntry,
  style: Record<string, ParamProps>,
  categoryStyle?: Record<string, ParamProps>,
): LayoutEntry {
  const def = BUILTIN_CATALOG[entry.defId]
  const base = def?.kind === 'parametric' ? defaultParamProps(def) : {}
  const override = style[entry.defId] ?? {}
  const catOverride = categoryStyle?.[entry.defId] ?? {}
  return { ...entry, props: { ...base, ...entry.props, ...override, ...catOverride } }
}

/** Build the fully-hydrated, restyled item list for a preset. For every room
 *  with a re-modelled arrangement (`rooms`, plus the `livingDining` sugar) the
 *  matching default items (by id prefix) are dropped and the authored entries
 *  are used as-is (no `style` override — the authored props already encode
 *  the preset's exact intent — but `categoryStyle` still applies, RM2); all
 *  other default items are restyled in place. `extraItems` are appended last. */
export function buildPresetItems(preset: LayoutPreset): LayoutEntry[] {
  const overrides: Partial<Record<RoomId, LayoutEntry[]>> = { ...(preset.rooms ?? {}) }
  if (preset.livingDining) overrides.livingDining = preset.livingDining

  const droppedPrefixes = (Object.keys(overrides) as RoomId[])
    .map((r) => ROOM_PREFIX[r])
    .filter((p): p is string => Boolean(p))
    .map((p) => `${p}-`)

  const others = defaultLayout()
    .filter((e) => !droppedPrefixes.some((p) => e.id.startsWith(p)))
    .map((e) =>
      hydrate(e, preset.style, preset.categoryStyle?.[categoryForEntryId(e.id) ?? 'other']),
    )
  const overrideItems = (Object.entries(overrides) as [RoomId, LayoutEntry[]][]).flatMap(
    ([roomId, entries]) => {
      const category = ROOM_ID_CATEGORY[roomId]
      const catStyle = category ? preset.categoryStyle?.[category] : undefined
      return entries.map((e) => hydrate(e, {}, catStyle))
    },
  )

  let items = [...others, ...overrideItems]
  if (preset.extraItems) items = [...items, ...preset.extraItems.map((e) => hydrate(e, {}))]
  return items
}
