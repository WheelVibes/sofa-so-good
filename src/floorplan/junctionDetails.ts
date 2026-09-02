/**
 * Construction junction details (G3) — pure data core.
 *
 * A professional set carries large-scale details showing HOW a junction is
 * built, not just what goes where. This module derives the details the model can
 * state honestly, and deliberately does NOT invent the ones it cannot.
 *
 * **What is derivable, and why (audited 2026-09-02).** Every dimension below
 * comes from real design data:
 *  - **Dropped-ceiling / bulkhead** — `ceilingClearance.ts` gives `dropMm` and
 *    the finished `clearanceMm` per room from the SAME `buildCeiling` the 3D
 *    render uses.
 *  - **Wet-area waterproofing upturn** — `waterproofing.ts` gives the general
 *    (300 mm) and shower (1800 mm) upturn heights per wet room.
 *  - **Floor-level threshold** — `floorLevels.ts` gives each room's `floorLevelMm`
 *    and the step between two rooms across a doorway.
 *  - **Window sill / head** — `PlanOpening.sill`/`head` plus the host wall's
 *    resolved thickness.
 *
 * **What is NOT derivable, and is therefore not drawn.** The model stores trim
 * HEIGHTS but no PROFILES or specified projections:
 *  - skirting (`PlanWall.baseboard.height`, default 90 mm) and cornice
 *    (`crown.height`, default 70 mm) have no profile and no specified
 *    projection — the 3D render uses a hardcoded ~12 mm each side, a rendering
 *    constant, not a specification;
 *  - a shower kerb exists only as an ADVISORY in `floorLevels.ts`
 *    (`buildKerbAdvisories`), with no height or geometry;
 *  - worktop edge/nosing and door jamb/architrave profiles are not modelled at
 *    all.
 *
 * Drawing those would mean inventing dimensions a contractor would then build
 * to — the same trap G5 hit when a tile module looked derivable from a texture
 * period. They need a profile data model first (see `TODO.md`).
 *
 * Pure (no store, no three, no DOM) → unit-testable directly.
 */

import { buildCeilingClearance } from './ceilingClearance'
import { buildFloorTransitions } from './floorLevels'
import { planLevels } from './levels'
import { planWallThickness } from './planGeometry'
import type { FloorPlan } from './types'
import { buildWaterproofingZones, GENERAL_UPTURN_MM, SHOWER_UPTURN_MM } from './waterproofing'

/** Which junction a detail describes. */
type JunctionKind = 'ceiling-drop' | 'waterproofing-upturn' | 'floor-threshold' | 'window-sill'

/**
 * One dimensioned junction detail. Geometry is described as a labelled
 * dimension list rather than pre-rendered coordinates, so a renderer can lay it
 * out at whatever detail scale the sheet asks for.
 */
export interface JunctionDetail {
  /** Stable id, quotable from a plan callout, e.g. `D-CD-01`. */
  id: string
  kind: JunctionKind
  title: string
  /** Where in the design this detail was taken. */
  location: string
  /** Ordered dimensions, each in millimetres. */
  dimensions: { label: string; mm: number }[]
  /** Construction notes — what the detail is telling the reader to do. */
  notes: string[]
}

/**
 * Every junction detail derivable from this plan. Empty when the design has no
 * ceiling treatment, no wet area, no level change and no windows — in which
 * case there is genuinely nothing to detail.
 */
export function buildJunctionDetails(plan: FloorPlan): JunctionDetail[] {
  const out: JunctionDetail[] = []
  const seq: Record<string, number> = {}
  const id = (prefix: string): string => {
    seq[prefix] = (seq[prefix] ?? 0) + 1
    return `D-${prefix}-${String(seq[prefix]).padStart(2, '0')}`
  }

  // 1 — Dropped ceiling / bulkhead. One detail per DISTINCT drop, not per room:
  //     a set with eight identical 100 mm drops needs one detail, referenced
  //     eight times.
  const zones = buildCeilingClearance(plan).zones
  const byDrop = new Map<number, string[]>()
  for (const z of zones) {
    if (z.dropMm <= 0) continue
    const list = byDrop.get(z.dropMm) ?? []
    list.push(z.roomName)
    byDrop.set(z.dropMm, list)
  }
  for (const [dropMm, rooms] of [...byDrop.entries()].sort((a, b) => a[0] - b[0])) {
    const zone = zones.find((z) => z.dropMm === dropMm)
    out.push({
      id: id('CD'),
      kind: 'ceiling-drop',
      title: 'Dropped ceiling at wall junction',
      location: rooms.join(', '),
      dimensions: [
        { label: 'Drop below slab soffit', mm: dropMm },
        { label: 'Finished clearance (FFL to ceiling)', mm: zone?.clearanceMm ?? 0 },
      ],
      notes: [
        'Suspended framing fixed to the slab soffit; confirm hanger spacing with the ceiling installer.',
        'Board and skim to a flush junction with the wall unless a shadow gap is shown.',
        zone && !zone.pass
          ? 'FINISHED CLEARANCE IS BELOW THE 2.4 m MINIMUM — resolve before construction.'
          : 'Finished clearance meets the 2.4 m minimum.',
      ],
    })
  }

  // 2 — Wet-area waterproofing upturn. The general and shower upturns are
  //     distinct details because the heights differ by 1500 mm.
  const wet = buildWaterproofingZones(plan, [])
  if (wet.length > 0) {
    const showerRooms = wet.filter((z) => z.showerDetected).map((z) => z.roomName)
    out.push({
      id: id('WP'),
      kind: 'waterproofing-upturn',
      title: 'Waterproofing upturn at wet-area wall',
      location: wet.map((z) => z.roomName).join(', '),
      dimensions: [{ label: 'General wall upturn above FFL', mm: GENERAL_UPTURN_MM }],
      notes: [
        'Membrane continuous from the floor up the wall; form a cove/fillet at the junction.',
        'Reinforce the junction and every penetration before the finish coats.',
        'Tile over the cured membrane — never bed tiles into it.',
      ],
    })
    if (showerRooms.length > 0) {
      out.push({
        id: id('WP'),
        kind: 'waterproofing-upturn',
        title: 'Waterproofing upturn at shower wall',
        location: showerRooms.join(', '),
        dimensions: [{ label: 'Shower wall upturn above FFL', mm: SHOWER_UPTURN_MM }],
        notes: [
          'Full-height upturn to the shower run, lapped into the general upturn beyond.',
          'Ponding-test the completed membrane and obtain sign-off BEFORE tiling.',
        ],
      })
    }
  }

  // 3 — Floor-level threshold at a doorway between rooms at different FFLs.
  const transitions = buildFloorTransitions(plan)
  const bySteps = new Map<number, string[]>()
  for (const t of transitions) {
    const step = Math.abs(t.stepMm)
    if (step <= 0) continue
    const list = bySteps.get(step) ?? []
    list.push(`${t.roomAName} → ${t.roomBName}`)
    bySteps.set(step, list)
  }
  for (const [stepMm, doors] of [...bySteps.entries()].sort((a, b) => a[0] - b[0])) {
    out.push({
      id: id('TH'),
      kind: 'floor-threshold',
      title: 'Floor-level threshold at doorway',
      location: doors.join(', '),
      dimensions: [{ label: 'Step between finished floor levels', mm: stepMm }],
      notes: [
        'Set out the level change under the door leaf so it is concealed when shut.',
        'Provide a threshold trim suited to both finishes; seal the joint in a wet-area doorway.',
        stepMm >= 15
          ? 'Step exceeds 15 mm — a trip hazard; confirm it is intended and consider a ramped transition.'
          : 'Step is within the usual flush-transition range.',
      ],
    })
  }

  // 4 — Window sill / head, one detail per distinct (sill, head, wall
  //     thickness) combination.
  const windowKey = new Map<string, { sill: number; head: number; thick: number; ids: string[] }>()
  // Iterate EVERY storey (F13): `plan.openings`/`plan.walls` are ground-only,
  // so an upstairs window would have been silently omitted from the detail
  // sheet. Each opening is matched against ITS OWN level's walls.
  for (const level of planLevels(plan)) {
    for (const o of level.openings ?? []) {
      if (o.kind !== 'window') continue
      const wall = (level.walls ?? []).find((w) => w.id === o.wallId)
      if (!wall) continue
      const thick = Math.round(planWallThickness(wall, plan) * 1000)
      const sill = Math.round((o.sill ?? 0) * 1000)
      const head = Math.round((o.head ?? 0) * 1000)
      const key = `${sill}/${head}/${thick}`
      const entry = windowKey.get(key) ?? { sill, head, thick, ids: [] }
      entry.ids.push(o.name?.trim() || o.id)
      windowKey.set(key, entry)
    }
  }
  for (const entry of [...windowKey.values()].sort((a, b) => a.sill - b.sill)) {
    out.push({
      id: id('WS'),
      kind: 'window-sill',
      title: 'Window sill and head',
      location: entry.ids.join(', '),
      dimensions: [
        { label: 'Sill height above FFL', mm: entry.sill },
        { label: 'Head height above FFL', mm: entry.head },
        { label: 'Opening height', mm: Math.max(0, entry.head - entry.sill) },
        { label: 'Wall thickness (reveal depth)', mm: entry.thick },
      ],
      notes: [
        'Reveal depth is the wall thickness; confirm the finished reveal after wall finishes.',
        'Slope any external sill away from the opening and seal the frame perimeter.',
      ],
    })
  }

  return out
}
