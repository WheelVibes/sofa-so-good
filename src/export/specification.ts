/**
 * Written specification (G7) — pure data core.
 *
 * The schedules say WHICH product goes WHERE. A specification says to what
 * standard, on what substrate, within what tolerance, and what is excluded —
 * and it is the document that protects a homeowner in a dispute. Without it a
 * contractor can install exactly the specified tile, badly, and still be fully
 * compliant with the handover package.
 *
 * Two deliberate constraints on the content:
 *
 * 1. **Clauses are derived, never boilerplate.** A clause is emitted only for
 *    work the design actually contains — no tiling clause for an untiled home,
 *    no waterproofing clause without a wet area. A spec listing trades that
 *    aren't in scope trains the reader to skim it.
 * 2. **No standard code numbers are asserted.** Workmanship is stated in plain
 *    language with conventional tolerances (a 2 m straightedge, a 3 mm lippage
 *    limit). Naming a specific standard edition that turned out to be wrong or
 *    superseded would be worse than naming none — a fabricated citation reads
 *    as authoritative. {@link SPEC_SCOPE_NOTE} says so on the document, and
 *    every clause leaves `standardRef` for a user to fill in.
 *
 * Pure (no store, no three, no DOM) → unit-testable directly.
 */

import type { RoomTileCoursing } from '../floorplan/tileCoursing'

/** The trade a clause is addressed to — mirrors the trade-pack recipients. */
export type SpecTrade =
  | 'tiler'
  | 'painter'
  | 'waterproofing'
  | 'carpenter'
  | 'electrician'
  | 'plumber'

/** One specification clause. */
export interface SpecClause {
  /** Stable clause id, e.g. `TIL-01` — quotable in a variation or a dispute. */
  id: string
  trade: SpecTrade
  title: string
  /** What is being installed, named from the design where possible. */
  product: string
  /** What it is installed onto. */
  substrate: string
  /** Preparation required before installation. */
  preparation: string
  /** How the work must be executed. */
  workmanship: string
  /** The measurable acceptance criterion. */
  tolerance: string
  /** What this clause does NOT cover — the half a schedule always omits. */
  exclusions: string
  /** Left blank for the user/QS to cite a project standard. Never asserted
   *  here; see the module header. */
  standardRef: string
}

/** Printed on the specification document itself. */
export const SPEC_SCOPE_NOTE =
  'Indicative specification generated from the design. Clauses state workmanship and tolerances in plain language; they cite no standard code numbers — confirm the applicable standards, editions and any authority requirements for your project before issuing for tender or construction.'

export interface SpecificationInput {
  /** Distinct floor/wall/ceiling finish names actually used, for the tiling and
   *  painting clauses. */
  finishNames: { floor: string[]; wall: string[]; ceiling: string[] }
  /** Tile coursing rows (G5) — presence drives the tiling setting-out clause. */
  coursing?: RoomTileCoursing[]
  /** Names of wet/hard-service rooms with a waterproofing zone. */
  wetRoomNames?: string[]
  /** Carpentry/joinery item names actually placed. */
  carpentryNames?: string[]
  /** Counts of designed MEP points, to decide whether those clauses apply. */
  mep?: { electrical: number; plumbing: number }
}

export interface Specification {
  clauses: SpecClause[]
  scopeNote: string
  /** Trades with no clause, so a reader can see what the document does NOT
   *  cover rather than assuming it is exhaustive. */
  tradesNotCovered: SpecTrade[]
}

const ALL_TRADES: SpecTrade[] = [
  'tiler',
  'painter',
  'waterproofing',
  'carpenter',
  'electrician',
  'plumber',
]

/** Join a name list for prose, or a neutral fallback when empty. */
function nameList(names: string[] | undefined, fallback: string): string {
  const clean = (names ?? []).map((n) => n.trim()).filter(Boolean)
  if (clean.length === 0) return fallback
  const unique = [...new Set(clean)]
  if (unique.length === 1) return unique[0]!
  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`
}

/**
 * Build the specification for a design. Emits clauses only for work the design
 * contains; `tradesNotCovered` names the rest explicitly.
 */
export function buildSpecification(input: SpecificationInput): Specification {
  const clauses: SpecClause[] = []
  const seq: Record<string, number> = {}
  const nextId = (prefix: string): string => {
    seq[prefix] = (seq[prefix] ?? 0) + 1
    return `${prefix}-${String(seq[prefix]).padStart(2, '0')}`
  }

  const hasTiling = (input.coursing?.length ?? 0) > 0
  if (hasTiling) {
    clauses.push({
      id: nextId('TIL'),
      trade: 'tiler',
      title: 'Tiling — bedding and setting out',
      product: nameList(input.finishNames.floor, 'tile finish as scheduled'),
      substrate:
        'Levelled screed or slab, clean, sound, dry and free of laitance, curing compound and loose material.',
      preparation:
        'Prime as the adhesive manufacturer requires. Make good hollows and high spots before setting out; do not correct substrate level with adhesive bed thickness.',
      workmanship:
        'Set out from the origin given on the tile setting-out table so perimeter cuts are equal on opposite sides. Solid-bed each tile with no voids; back-butter large formats. Keep joints continuous and of uniform width, and align floor joints to wall joints where both are tiled.',
      tolerance:
        'Level/plane within 3 mm under a 2 m straightedge. Lippage between adjacent tiles not more than 1 mm. Joint width uniform within 1 mm. No perimeter cut narrower than a quarter tile unless shown on the drawing.',
      exclusions:
        'Substrate levelling screeds, waterproofing membrane, movement joints and sealants to junctions, and tile supply wastage allowance.',
      standardRef: '',
    })
  }

  const wetRooms = input.wetRoomNames ?? []
  if (wetRooms.length > 0) {
    clauses.push({
      id: nextId('WPF'),
      trade: 'waterproofing',
      title: 'Waterproofing — wet areas',
      product: 'Waterproofing membrane system to wet areas as scheduled.',
      substrate: `Floor and wall substrates to ${nameList(wetRooms, 'the wet areas')}, clean, sound and dry.`,
      preparation:
        'Form coves/fillets at floor-to-wall junctions. Seal around all penetrations (wastes, traps, pipe sleeves) before membrane application.',
      workmanship:
        'Apply the full system — primer, reinforcement to junctions and penetrations, and the specified number of coats — continuously across the floor and up the wall upturn shown on the drawings. Protect from traffic until cured.',
      tolerance:
        'Continuous film with no pinholes, thin spots or unbonded areas. Falls to outlets continuous with no ponding. Upturn heights not less than shown.',
      exclusions: 'Screeds and falls, tiling over the membrane, and sanitaryware installation.',
      standardRef: '',
    })
    clauses.push({
      id: nextId('WPF'),
      trade: 'waterproofing',
      title: 'Waterproofing — testing before covering',
      product: 'Water-ponding test of each completed wet area.',
      substrate: 'Completed and cured membrane, before any tiling or screeding over it.',
      preparation: 'Seal outlets and fill to the depth agreed with the main contractor.',
      workmanship:
        'Hold water and inspect the soffit and adjacent areas for the agreed period. Record the result and obtain sign-off BEFORE covering. Rectify and re-test any failure in full.',
      tolerance:
        'No loss of level beyond evaporation, and no evidence of moisture below or adjacent.',
      exclusions:
        'Making good finishes disturbed by a failed test (see the rectification clause of the contract).',
      standardRef: '',
    })
  }

  const wallNames = input.finishNames.wall
  const ceilNames = input.finishNames.ceiling
  if (wallNames.length > 0 || ceilNames.length > 0) {
    clauses.push({
      id: nextId('PNT'),
      trade: 'painter',
      title: 'Painting and decorating',
      product: nameList([...wallNames, ...ceilNames], 'paint finish as scheduled'),
      substrate:
        'Plastered/skim-coated walls and ceilings, cured, dry and free of dust and contamination.',
      preparation:
        'Make good cracks, nail holes and joints. Sand to a smooth even surface. Apply the sealer/primer appropriate to the substrate, including a mist coat on new plaster.',
      workmanship:
        'Apply the specified number of coats, each fully cured before the next. Cut in cleanly to trim, sockets and switch plates. Maintain uniform colour and sheen with no roller lap marks, brush ropiness, runs, missed areas or grinning of the substrate. Keep a wet edge on each continuous surface.',
      tolerance:
        'Uniform colour and sheen viewed at 1.5 m in the room’s finished lighting. No visible lap marks, holidays or fat edges. Cut-in lines straight within 2 mm.',
      exclusions:
        'Plastering and skim coats, protective covering of adjacent finishes, and final builders clean.',
      standardRef: '',
    })
  }

  const carpentry = input.carpentryNames ?? []
  if (carpentry.length > 0) {
    clauses.push({
      id: nextId('CPT'),
      trade: 'carpenter',
      title: 'Carpentry and joinery — fabrication and installation',
      product: nameList(carpentry, 'joinery as scheduled'),
      substrate: 'Walls and floors as built, dimensions verified on site before fabrication.',
      preparation:
        'Take site dimensions after wall finishes are complete. Confirm board, laminate and edging codes and all hardware with the client before cutting. Confirm service positions behind and within the run.',
      workmanship:
        'Fabricate to the carpentry elevations and sections. Scribe to walls, floors and ceilings so no gap is filled with sealant alone. Fix securely to substrate with concealed fixings. Align and adjust every door, drawer and sliding element so gaps are even and operation is smooth over the full travel.',
      tolerance:
        'Face alignment of adjacent components within 1 mm. Reveal/shadow gaps uniform within 1 mm across a run. Fronts plumb and level within 2 mm over 2 m. Nothing binding or fouling through its full travel.',
      exclusions:
        'Stone or solid-surface worktops, appliance supply, electrical connection within the run, and making good wall finishes disturbed by fixing.',
      standardRef: '',
    })
  }

  const elec = input.mep?.electrical ?? 0
  if (elec > 0) {
    clauses.push({
      id: nextId('ELE'),
      trade: 'electrician',
      title: 'Electrical installation — accessories and positions',
      product: `${elec} designed electrical point${elec === 1 ? '' : 's'} as scheduled.`,
      substrate: 'Walls and ceilings as built; conduits and back boxes set before finishing.',
      preparation:
        'Set out every position on site against the electrical plan and agree it with the client BEFORE cutting or chasing. Check nothing is obstructed by joinery or furniture shown on the plan.',
      workmanship:
        'Install accessories plumb and square, flush to the finished wall face with no gap or packing visible behind the plate. Group adjacent plates on a common centreline. Keep the mount heights scheduled unless a variation is agreed in writing.',
      tolerance:
        'Plates plumb within 1 mm across the plate. Mount heights within 5 mm of scheduled. Adjacent plates aligned within 1 mm.',
      exclusions:
        'Distribution board works, circuit design, protective device sizing, cable sizing, and testing and certification — all of which require a licensed electrical worker and are outside this specification.',
      standardRef: '',
    })
  }

  const plumb = input.mep?.plumbing ?? 0
  if (plumb > 0) {
    clauses.push({
      id: nextId('PLB'),
      trade: 'plumber',
      title: 'Plumbing — points and sanitaryware',
      product: `${plumb} designed plumbing point${plumb === 1 ? '' : 's'} as scheduled.`,
      substrate:
        'Walls and floors as built, with waterproofing complete and tested where applicable.',
      preparation:
        'Set out every point against the plumbing plan and confirm against the sanitaryware and joinery actually ordered before forming penetrations.',
      workmanship:
        'Seal every penetration through a waterproofed surface. Fix sanitaryware level, secure and hard to the finished surface. Provide accessible isolation to each fixture. Pressure-test before concealing any pipework.',
      tolerance:
        'Fixtures level within 1 mm across their width. Falls to wastes continuous with no ponding. No leakage at test pressure held for the agreed period.',
      exclusions:
        'Sanitaryware supply, hot-water system works, and any works to the incoming supply.',
      standardRef: '',
    })
  }

  const covered = new Set(clauses.map((c) => c.trade))
  return {
    clauses,
    scopeNote: SPEC_SCOPE_NOTE,
    tradesNotCovered: ALL_TRADES.filter((t) => !covered.has(t)),
  }
}
