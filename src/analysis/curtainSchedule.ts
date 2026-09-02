/**
 * Curtain / window-treatment specification.
 *
 * **The gap this closes.** The `curtains` trade pack listed each placed
 * treatment's name and its rendered width x height. Those are the ITEM's
 * footprint dimensions — what the 3D object is — not what a curtain maker
 * quotes from. A maker needs the **drop** (which is the number most often got
 * wrong, and is derivable from the opening the curtain hangs on), the
 * **fullness ratio**, and the resulting **fabric width**. Same shape as the
 * paint gap in v0.31.5.292: the app was handing over dimensions where the trade
 * needs quantities.
 *
 * Computed from the real opening geometry (`PlanOpening.sill`/`head`/`width`)
 * plus the room's ceiling height, so the drops move with the design instead of
 * being typed twice.
 *
 * **What is deliberately NOT computed, and why.** A track normally runs wider
 * than its opening — "returns" wrap to the wall and an "overlap" lets a pair
 * meet in the middle — but the sources consulted give no figure for that side
 * extension in millimetres. So the fabric width here is derived from the
 * OPENING width and labelled a MINIMUM, with the extension called out as the
 * installer's addition. Inventing "+150 mm per side" would have been easy and
 * would have put a fabricated dimension on a maker's order; the one nearby
 * figure the sources do give (150 mm single-track / 200 mm double-track) is a
 * recess DEPTH, a different dimension entirely, and conflating the two is
 * exactly the sort of plausible substitution this module refuses.
 *
 * Pure (no store, no three, no DOM).
 *
 * Sources: goodrichglobal.com "Curtain Length Guide: Floor, Sill and Puddle
 * Styles" and "How to Measure Curtains"; abangcurtain.sg "How To Measure
 * Curtains: HDB Guide"; dunelm.com "How to Measure for Curtains";
 * ixacurtains.com "What curtain fullness means".
 */

import type { PlanOpening } from '../floorplan/types'

/**
 * Hem clearance above the floor for a floor-length curtain (m).
 * "The hem just kiss the floor (about 1 cm clear)"; for a sliding door
 * "approximately 10mm to 15mm ... to allow the sliding door to operate without
 * catching the fabric". 15 mm is the safer end of that band.
 */
export const FLOOR_HEM_CLEARANCE_M = 0.015
/** Sill-length curtains "end right at the window sill or roughly 1 centimetre
 *  above it". */
const SILL_HEM_CLEARANCE_M = 0.01
/** "Below sill drops 10 to 15 cm below the sill for a fuller look." */
export const BELOW_SILL_DROP_M = 0.15

/** Fullness ratios. 2x is the standard rule ("the total width of your curtain
 *  panels should be at least double the width of your curtain rod"); 2.5x is
 *  the fuller/luxury look. */
export const FULLNESS = { standard: 2, full: 2.5 } as const

/** How far above the opening head the track is assumed to sit (m). A track is
 *  fixed above the head so the fabric covers it; this is an ASSUMPTION the
 *  output states, not a measured value — a ceiling-fixed track on a bulkhead
 *  can sit much higher. */
export const TRACK_ABOVE_HEAD_M = 0.1

type CurtainLengthStyle = 'sill' | 'below-sill' | 'floor'

interface CurtainDrop {
  style: CurtainLengthStyle
  /** Finished drop, track to hem (m). */
  dropM: number
}

export interface CurtainScheduleRow {
  openingId: string
  /** The room the treatment serves, resolved by the caller on its own storey. */
  roomName: string
  /** Bare opening width (m) — NOT the track length; see the module note. */
  openingWidthM: number
  /** Assumed track height above the floor (m). */
  trackHeightM: number
  /** Finished drop for each length style, so the choice is a decision rather
   *  than a re-measure. */
  drops: CurtainDrop[]
  /** Minimum fabric width at each fullness ratio (m), from the OPENING width. */
  fabricWidthM: { standard: number; full: number }
}

export interface CurtainSchedule {
  rows: CurtainScheduleRow[]
  note: string
}

export const CURTAIN_SCOPE_NOTE =
  `Drops are measured from an assumed track ${TRACK_ABOVE_HEAD_M * 1000} mm above the opening head ` +
  `— confirm the actual track height, which a ceiling-fixed or bulkhead-mounted track changes. ` +
  `Fabric widths are MINIMUMS derived from the bare opening width at ${FULLNESS.standard}x and ` +
  `${FULLNESS.full}x fullness; a track normally runs wider than its opening for returns and centre ` +
  `overlap, and that addition is the installer's — it is not estimated here. Allow for hems, ` +
  `headings and pattern repeat separately.`

/** Round to millimetres, so a printed figure is not spuriously precise. */
const mm = (v: number) => Math.round(v * 1000) / 1000

/**
 * Specification for one window opening's treatment.
 *
 * Returns `null` for anything that cannot be stated honestly: a non-window
 * opening, a degenerate width, or a ceiling lower than the opening head (which
 * would give a negative floor drop).
 */
export function curtainSpecForOpening(
  opening: PlanOpening,
  roomName: string,
  ceilingHeightM: number,
): CurtainScheduleRow | null {
  if (!opening || opening.kind !== 'window') return null
  const width = opening.width
  if (!(width > 0)) return null
  const sill = Math.max(0, opening.sill ?? 0)
  const head = opening.head ?? 0
  if (!(head > sill)) return null

  const trackHeight = Math.min(head + TRACK_ABOVE_HEAD_M, ceilingHeightM)
  if (!(trackHeight > sill)) return null

  const drops: CurtainDrop[] = (
    [
      { style: 'sill', dropM: mm(trackHeight - sill - SILL_HEM_CLEARANCE_M) },
      { style: 'below-sill', dropM: mm(trackHeight - sill + BELOW_SILL_DROP_M) },
      { style: 'floor', dropM: mm(trackHeight - FLOOR_HEM_CLEARANCE_M) },
    ] satisfies CurtainDrop[]
  ).filter((d) => d.dropM > 0)

  return {
    openingId: opening.id,
    roomName,
    openingWidthM: mm(width),
    trackHeightM: mm(trackHeight),
    drops,
    fabricWidthM: {
      standard: mm(width * FULLNESS.standard),
      full: mm(width * FULLNESS.full),
    },
  }
}

/** Input pairing each window with the room it serves — resolved by the caller
 *  so this module stays free of the level-resolution helpers. */
export interface CurtainScheduleInput {
  opening: PlanOpening
  roomName: string
  ceilingHeightM: number
}

/** Schedule for every window supplied, in the order given. */
export function buildCurtainSchedule(inputs: readonly CurtainScheduleInput[]): CurtainSchedule {
  const rows: CurtainScheduleRow[] = []
  for (const i of inputs) {
    const row = curtainSpecForOpening(i.opening, i.roomName, i.ceilingHeightM)
    if (row) rows.push(row)
  }
  return { rows, note: CURTAIN_SCOPE_NOTE }
}
