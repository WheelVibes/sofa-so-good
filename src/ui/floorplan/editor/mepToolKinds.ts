/**
 * Static MEP tool-group data (MEP layer, G1 PR3) — the 12 electrical/plumbing
 * kinds offered by the `'mep'` tool, shared between the desktop
 * `DrawToolPalette` MEP group and the mobile `PlanToolsSheet` MEP section so
 * both list the exact same buttons (no drift between the two surfaces).
 */
import { electricalKindLabel } from '../../../floorplan/electricalPlan'
import { plumbingKindLabel } from '../../../floorplan/plumbingPlan'
import type { ElectricalKind, PlumbingKind } from '../../../floorplan/types'

export interface MepKindEntry<K extends string = string> {
  family: 'electrical' | 'plumbing'
  kind: K
  /** Short button text (fits the palette's compact `action-grid` chips). */
  label: string
  /** Full description — the button/row's `title` tooltip. */
  title: string
}

/** Short button labels — `electricalKindLabel`/`plumbingKindLabel` (used for
 *  the `title`) are full sentences ("Single socket outlet") too long for a
 *  compact palette chip. */
const ELECTRICAL_SHORT_LABELS: Record<ElectricalKind, string> = {
  socket: 'Socket',
  'socket-double': 'Double socket',
  switch: 'Switch',
  data: 'Data point',
  'tv-point': 'TV point',
  aircon: 'Aircon point',
  'water-heater': 'Water heater',
}

const PLUMBING_SHORT_LABELS: Record<PlumbingKind, string> = {
  'water-point': 'Water point',
  drainage: 'Drainage',
  'floor-trap': 'Floor trap',
  'soil-pipe': 'Soil pipe',
  'water-heater': 'Water heater',
}

const ELECTRICAL_KINDS: ElectricalKind[] = [
  'socket',
  'socket-double',
  'switch',
  'data',
  'tv-point',
  'aircon',
  'water-heater',
]

const PLUMBING_KINDS: PlumbingKind[] = [
  'water-point',
  'drainage',
  'floor-trap',
  'soil-pipe',
  'water-heater',
]

/** Electrical kind entries, in a stable display order. */
export const ELECTRICAL_MEP_KINDS: MepKindEntry<ElectricalKind>[] = ELECTRICAL_KINDS.map(
  (kind) => ({
    family: 'electrical' as const,
    kind,
    label: ELECTRICAL_SHORT_LABELS[kind],
    title: electricalKindLabel(kind),
  }),
)

/** Plumbing kind entries, in a stable display order. */
export const PLUMBING_MEP_KINDS: MepKindEntry<PlumbingKind>[] = PLUMBING_KINDS.map((kind) => ({
  family: 'plumbing' as const,
  kind,
  label: PLUMBING_SHORT_LABELS[kind],
  title: plumbingKindLabel(kind),
}))
