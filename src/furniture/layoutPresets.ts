import type { RoomId } from '../apartment/types'
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
import { modernMono } from './presets/modernMono'
import { moveIn } from './presets/moveIn'
import { openLounge } from './presets/openLounge'
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
  moveIn,
  scandiCalm,
  warmIndustrial,
  cozyTropical,
  japandi,
  coastal,
  openLounge,
  entertainer,
  brokenPlan,
  wfhStudio,
  socialLounge,
  minimalist,
  boutiqueSuite,
  familyNursery,
  modernMono,
]

/** Hydrate one entry: schema defaults < the entry's own props < an optional
 *  per-defId style override (highest precedence). */
function hydrate(entry: LayoutEntry, style: Record<string, ParamProps>): LayoutEntry {
  const def = BUILTIN_CATALOG[entry.defId]
  const base = def?.kind === 'parametric' ? defaultParamProps(def) : {}
  const override = style[entry.defId] ?? {}
  return { ...entry, props: { ...base, ...entry.props, ...override } }
}

/** Build the fully-hydrated, restyled item list for a preset. For every room
 *  with a re-modelled arrangement (`rooms`, plus the `livingDining` sugar) the
 *  matching default items (by id prefix) are dropped and the authored entries
 *  are used as-is (no style override); all other default items are restyled in
 *  place. `extraItems` are appended last. */
export function buildPresetItems(preset: LayoutPreset): LayoutEntry[] {
  const overrides: Partial<Record<RoomId, LayoutEntry[]>> = { ...(preset.rooms ?? {}) }
  if (preset.livingDining) overrides.livingDining = preset.livingDining

  const droppedPrefixes = (Object.keys(overrides) as RoomId[])
    .map((r) => ROOM_PREFIX[r])
    .filter((p): p is string => Boolean(p))
    .map((p) => `${p}-`)

  const others = defaultLayout()
    .filter((e) => !droppedPrefixes.some((p) => e.id.startsWith(p)))
    .map((e) => hydrate(e, preset.style))
  const overrideItems = (Object.values(overrides).flat() as LayoutEntry[]).map((e) =>
    hydrate(e, {}),
  )

  let items = [...others, ...overrideItems]
  if (preset.extraItems) items = [...items, ...preset.extraItems.map((e) => hydrate(e, {}))]
  return items
}
