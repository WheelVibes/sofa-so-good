/**
 * HDB renovation compliance hints (feature F34).
 *
 * Singapore HDB flats are governed by strict renovation rules — full hacking of
 * structural / reinforced-concrete walls is prohibited, wet areas must keep
 * their waterproofing membranes and cannot be freely relocated, heavy stone
 * finishes add dead load, and facade windows/grilles can't be altered at will.
 * This module produces a *non-binding* advisory report over a `FloorPlan`: a
 * list of guidance hints with a severity and a citation, so the UI can surface
 * "you may need a permit / check with HDB" nudges. It is NOT a pass/fail
 * compliance check and is phrased conservatively as guidance only.
 *
 * Pure + unit-testable: depends only on `floorplan/types`. The rules are a
 * data-driven array (`RULES`) of small pure functions so they stay auditable
 * and easy to extend. Every threshold lives in `COMPLIANCE_THRESHOLDS`.
 */

import { allPlanOpenings, allPlanRooms, allPlanWalls } from '../floorplan/levels'
import { type FloorPlan, type PlanRoom, planRoomArea, wallLength } from '../floorplan/types'

/** Advisory severity. `permit` = likely needs HDB permit / professional sign-off. */
type ComplianceSeverity = 'permit' | 'caution' | 'info'

/** A single non-binding renovation advisory. */
export interface Advisory {
  /** Stable id (rule id, suffixed per-target where a rule fires multiple times). */
  id: string
  severity: ComplianceSeverity
  title: string
  detail: string
  /** Room this advisory relates to, when room-scoped. */
  roomId?: string
  /** Which HDB guideline area this references. */
  cite: string
}

/** The full advisory report for a plan. */
export interface ComplianceReport {
  advisories: Advisory[]
  /** Count of `permit`-severity advisories. */
  permitCount: number
  /** Count of `caution`-severity advisories. */
  cautionCount: number
}

/** Tunable heuristic thresholds, kept in one auditable place. */
const COMPLIANCE_THRESHOLDS = {
  /** Walls at/over this length (m) are treated as likely load-bearing spans. */
  structuralWallLengthM: 4,
  /** Rooms at/over this area (m²) are treated as "large" for floor-loading. */
  largeRoomAreaM2: 12,
  /** Ceiling heights outside this band (m) look altered vs. the ~2.6m HDB norm. */
  ceilingMinM: 2.4,
  ceilingMaxM: 3,
} as const

const CITE_RENOVATION = 'HDB Home Improvement / Renovation Guidelines'
const CITE_STRUCTURAL = 'HDB Renovation Guidelines — structural / RC walls'
const CITE_WET = 'HDB Renovation Guidelines — wet areas / waterproofing'
const CITE_LOADING = 'HDB Renovation Guidelines — floor loading'
const CITE_FACADE = 'HDB Renovation Guidelines — windows / facade'

/** A room is a "wet area" (bathroom / toilet / kitchen) by its name. */
function isWetAreaName(name: string): boolean {
  return /\b(bath|bathroom|toilet|wc|washroom|kitchen|wet)\b/i.test(name ?? '')
}

/** Loose match for kitchen vs. bathroom, for tailored wording. */
function isKitchenName(name: string): boolean {
  return /kitchen/i.test(name ?? '')
}

/**
 * Each rule is a pure function producing zero or more advisories from the plan.
 * Composed by `buildComplianceReport`; add a rule by appending to `RULES`.
 */
interface ComplianceRule {
  id: string
  run: (plan: FloorPlan) => Advisory[]
}

/** Rule: thick/external or long walls are likely structural — hacking needs a permit. */
function ruleStructuralWalls(plan: FloorPlan): Advisory[] {
  if (!Array.isArray(plan.walls)) return []
  const out: Advisory[] = []
  for (const w of plan.walls) {
    if (!w) continue
    const isExternal = w.thickness === 'external'
    const isLong = wallLength(w) >= COMPLIANCE_THRESHOLDS.structuralWallLengthM
    if (!isExternal && !isLong) continue
    const reason = isExternal
      ? 'External / perimeter wall'
      : `Long internal wall (${wallLength(w).toFixed(1)}m)`
    out.push({
      id: `structural-wall:${w.id}`,
      severity: 'permit',
      title: 'Likely structural wall — hacking is restricted',
      detail:
        `${reason} is likely load-bearing reinforced concrete. Full or partial ` +
        'hacking of structural / RC walls is generally not allowed and may require ' +
        'an HDB renovation permit with a Professional Engineer (PE) endorsement. ' +
        'Check with HDB and your contractor before removing or opening up this wall.',
      cite: CITE_STRUCTURAL,
    })
  }
  return out
}

/** Rule: wet areas need intact waterproofing and can't be freely relocated. */
function ruleWetAreaWaterproofing(plan: FloorPlan): Advisory[] {
  if (!Array.isArray(plan.rooms)) return []
  const out: Advisory[] = []
  for (const r of plan.rooms) {
    if (!r || !isWetAreaName(r.name)) continue
    const kind = isKitchenName(r.name) ? 'kitchen' : 'bathroom / toilet'
    out.push({
      id: `wet-area:${r.id}`,
      severity: 'caution',
      title: `Wet area (${r.name}) — waterproofing & relocation rules apply`,
      detail:
        `Re-tiling or re-finishing the floor of this ${kind} may disturb the ` +
        'waterproofing membrane; the membrane should be reinstated and water-ponding ' +
        'tested afterwards. Relocating wet areas beyond their designated zones is ' +
        'restricted under HDB rules. Check with HDB / your contractor before changing ' +
        'the floor finish or moving the wet area.',
      roomId: r.id,
      cite: CITE_WET,
    })
  }
  return out
}

/** Rule: heavy stone / screed finishes add dead load — advisory on larger / wet rooms. */
function ruleFloorLoading(plan: FloorPlan): Advisory[] {
  if (!Array.isArray(plan.rooms)) return []
  const out: Advisory[] = []
  for (const r of plan.rooms) {
    if (!r) continue
    const area = planRoomArea(r)
    const isLarge = area >= COMPLIANCE_THRESHOLDS.largeRoomAreaM2
    const isWet = isWetAreaName(r.name)
    if (!isLarge && !isWet) continue
    out.push({
      id: `floor-loading:${r.id}`,
      severity: 'info',
      title: `Floor loading — heavy finishes in ${r.name}`,
      detail:
        'Thick natural-stone slabs, terrazzo, or a deep cement screed add ' +
        'significant dead load to the floor slab. HDB flats have a permissible floor ' +
        'loading limit; over a larger or wet room this is worth confirming. Prefer ' +
        'thin tiles / lightweight build-ups, and check the loading with your contractor.',
      roomId: r.id,
      cite: CITE_LOADING,
    })
  }
  return out
}

/** Rule: facade windows / grilles can't be altered freely. */
function ruleFacadeWindows(plan: FloorPlan): Advisory[] {
  if (!Array.isArray(plan.openings) || !Array.isArray(plan.walls)) return []
  const externalWallIds = new Set(
    plan.walls.filter((w) => w && w.thickness === 'external').map((w) => w.id),
  )
  const out: Advisory[] = []
  for (const o of plan.openings) {
    if (o?.kind !== 'window' || !externalWallIds.has(o.wallId)) continue
    out.push({
      id: `facade-window:${o.id}`,
      severity: 'caution',
      title: 'Facade window — alterations are restricted',
      detail:
        'Windows on the external facade are part of the building envelope. Replacing ' +
        'window grilles, enlarging openings, or installing full-height windows is ' +
        'restricted: grilles must meet HDB-approved designs and facade alterations ' +
        'generally need approval. Check with HDB / your window contractor.',
      cite: CITE_FACADE,
    })
  }
  return out
}

/** Rule: ceiling height outside the ~2.6m HDB norm looks altered. */
function ruleCeilingHeight(plan: FloorPlan): Advisory[] {
  if (!Array.isArray(plan.rooms)) return []
  const out: Advisory[] = []
  for (const r of plan.rooms) {
    if (!r) continue
    const h = roomCeilingHeight(r, plan)
    if (h == null) continue
    const altered = h < COMPLIANCE_THRESHOLDS.ceilingMinM || h > COMPLIANCE_THRESHOLDS.ceilingMaxM
    if (!altered) continue
    out.push({
      id: `ceiling-height:${r.id}`,
      severity: 'info',
      title: `Ceiling height in ${r.name} (${h.toFixed(2)}m) looks non-standard`,
      detail:
        'HDB flats are typically around 2.6m floor-to-ceiling (up to ~3m for some ' +
        'units). A markedly different height suggests a dropped/false ceiling or a ' +
        'raised floor — false ceilings must keep access to concealed services and ' +
        'meet fire requirements. Confirm the build-up with your contractor.',
      roomId: r.id,
      cite: CITE_RENOVATION,
    })
  }
  return out
}

/** Always-on informational note listing common permit-required works. */
function rulePermitRequiredWorks(_plan: FloorPlan): Advisory[] {
  return [
    {
      id: 'permit-works-info',
      severity: 'info',
      title: 'Some renovation works require an HDB permit',
      detail:
        'Common permit-required works include hacking of walls, demolishing / building ' +
        'walls, relocating or adding wet areas, replacing windows / grilles, and ' +
        'plumbing alterations. Your HDB-registered renovation contractor normally ' +
        'applies for the permit on your behalf. This advisory list is guidance only — ' +
        'always confirm the current rules with HDB.',
      cite: CITE_RENOVATION,
    },
  ]
}

/** Effective ceiling height for a room (per-room override, else plan default). */
function roomCeilingHeight(r: PlanRoom, plan: FloorPlan): number | null {
  if (typeof r.ceilingHeight === 'number') return r.ceilingHeight
  if (typeof plan.ceilingHeight === 'number') return plan.ceilingHeight
  return null
}

/** The ordered rule set. Append a `ComplianceRule` here to extend the advisor. */
const RULES: ComplianceRule[] = [
  { id: 'structural-walls', run: ruleStructuralWalls },
  { id: 'wet-area', run: ruleWetAreaWaterproofing },
  { id: 'floor-loading', run: ruleFloorLoading },
  { id: 'facade-windows', run: ruleFacadeWindows },
  { id: 'ceiling-height', run: ruleCeilingHeight },
  { id: 'permit-works', run: rulePermitRequiredWorks },
]

/**
 * Build the full compliance advisory report for a plan. Pure; tolerant of a
 * missing/empty plan (returns an empty report rather than throwing). Note the
 * always-on permit-works info note only fires for a non-empty plan, so a truly
 * empty plan yields zero advisories.
 */
export function buildComplianceReport(plan: FloorPlan): ComplianceReport {
  const advisories: Advisory[] = []
  if (plan && isNonEmptyPlan(plan)) {
    // Flatten EVERY storey once (F13) and run the rules against that.
    // `plan.walls`/`rooms`/`openings` are ground-only, so an upper-storey wall
    // or wet area was previously never assessed — and each rule reads geometry
    // directly, so normalising here fixes all of them in one place rather than
    // six. Callers pass the whole plan (`report.ts`), never a `levelAsPlan`
    // result, so whole-home is the correct reading.
    const wholeHome: FloorPlan = {
      ...plan,
      walls: allPlanWalls(plan),
      openings: allPlanOpenings(plan),
      rooms: allPlanRooms(plan),
    }
    for (const rule of RULES) {
      advisories.push(...rule.run(wholeHome))
    }
  }
  let permitCount = 0
  let cautionCount = 0
  for (const a of advisories) {
    if (a.severity === 'permit') permitCount++
    else if (a.severity === 'caution') cautionCount++
  }
  return { advisories, permitCount, cautionCount }
}

/** A plan is "non-empty" if it declares any walls, openings, or rooms. */
function isNonEmptyPlan(plan: FloorPlan): boolean {
  const walls = Array.isArray(plan.walls) ? plan.walls.length : 0
  const openings = Array.isArray(plan.openings) ? plan.openings.length : 0
  const rooms = Array.isArray(plan.rooms) ? plan.rooms.length : 0
  return walls + openings + rooms > 0
}
