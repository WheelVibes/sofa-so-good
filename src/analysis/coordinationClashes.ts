/**
 * Cross-discipline coordination checks (G9) — pure data core.
 *
 * Every discipline the app models is currently checked only against ITSELF:
 * `collision/` tests furniture against furniture and walls, `socketAdvisory.ts`
 * counts outlets per room, `ceilingClearance.ts` measures a ceiling treatment,
 * and the MEP points feed schedules and the RCP without ever being compared to
 * anything. Coordinating the disciplines against EACH OTHER is what a designer
 * does when they lay the drawings over one another, and it catches the errors
 * that are cheap on paper and expensive on site.
 *
 * This module reuses the accurate resolvers the rest of the app already trusts
 * rather than re-deriving geometry: `collision/placement.ts:itemFootprintParts`
 * (the shape-aware convex decomposition — so a round table doesn't claim bbox
 * corners), `elevation/projectElevation.ts:itemHeight` (the ONE height
 * resolver), `floorplan/ceilingClearance.ts` and `floorplan/types.ts:
 * pointInRoom`.
 *
 * **Scope, stated honestly.** This is an INDICATIVE coordination aid, not a
 * clash-detection engine: it compares 2D footprints plus a single height per
 * item, so it knows nothing about an item's internal voids (a socket behind an
 * open-backed shelving unit is reported as obstructed), nor about pipe/duct
 * routes in three dimensions. It reports what it can prove from the plan.
 *
 * Pure + deterministic (no store, no three, no DOM) → unit-testable directly.
 */

import type { OBB } from '../collision/obb'
import { itemFootprintParts } from '../collision/placement'
import { itemHeight } from '../elevation/projectElevation'
import { buildCeilingClearance } from '../floorplan/ceilingClearance'
import { itemsOnLevel, planLevels, roomAtPoint } from '../floorplan/levels'
import { ELECTRICAL_MOUNT_DEFAULTS_MM, PLUMBING_MOUNT_DEFAULTS_MM } from '../floorplan/mepPoints'
import type { FloorPlan, PlanElectricalPoint, PlanPlumbingPoint } from '../floorplan/types'
import { pointInRoom } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'

/** What kind of coordination problem was found. */
export type ClashKind =
  /** An MEP point falls inside a furniture footprint that is tall enough to
   *  cover it — installed, paid for, and unreachable. */
  | 'mep-behind-furniture'
  /** An item is taller than the finished clearance under its room's designed
   *  ceiling treatment — it will not fit. */
  | 'item-under-ceiling-drop'

/** One reported coordination problem. */
export interface CoordinationClash {
  kind: ClashKind
  /** `high` = the design cannot be built / the fitting is unusable as drawn;
   *  `medium` = buildable but wrong, or dependent on an assumption. */
  severity: 'high' | 'medium'
  /** One-line summary naming both sides of the clash. */
  title: string
  /** The numbers behind it, so a user can judge the call themselves. */
  detail: string
  roomName?: string
  /** Ids for cross-referencing / highlighting a specific offender. */
  pointId?: string
  itemId?: string
}

export interface CoordinationClashResult {
  clashes: CoordinationClash[]
  highCount: number
  /** True when nothing was found (also true for an empty/unfurnished plan). */
  allClear: boolean
  /** How many MEP points and items were actually compared — so a "0 clashes"
   *  result can be distinguished from "nothing to check". */
  checked: { mepPoints: number; items: number }
}

/** True when world point (x, z) lies inside the oriented box. */
function pointInObb(o: OBB, x: number, z: number): boolean {
  const dx = x - o.cx
  const dz = z - o.cz
  const cos = Math.cos(-o.rot)
  const sin = Math.sin(-o.rot)
  // Rotate the point into the box's local frame, then compare against extents.
  const lx = dx * cos - dz * sin
  const lz = dx * sin + dz * cos
  return Math.abs(lx) <= o.hx && Math.abs(lz) <= o.hz
}

/** Resolved mount height (mm AFFL) for an electrical/plumbing point. */
function mountMm(
  p: { kind: string; mountHeightMm?: number },
  defaults: Record<string, number>,
): number {
  if (typeof p.mountHeightMm === 'number' && Number.isFinite(p.mountHeightMm)) {
    return p.mountHeightMm
  }
  return defaults[p.kind] ?? 0
}

/**
 * The room containing an MEP point, on the point's OWN storey.
 *
 * Was "across every storey", which read as deliberate and was wrong: a socket
 * on the ground floor does not clash with a room above it, and with storeys
 * sharing one XZ space the old form returned whichever room sat at that
 * coordinate on any floor. MEP points are level-tagged, so the gate is free.
 */
function roomAt(plan: FloorPlan, p: { x: number; z: number; levelId?: string }) {
  return roomAtPoint(plan, p.x, p.z, p.levelId) ?? undefined
}

function itemLabel(item: FurnitureItem, def: FurnitureDef): string {
  return item.label?.trim() || def.name || item.defId
}

/**
 * Compare the disciplines against each other and report what conflicts.
 *
 * `electrical`/`plumbing` are the plan's PERSISTED MEP points (the same source
 * the schedules and the MEP sheets read), so a design with no points placed
 * simply reports nothing rather than guessing from furniture.
 */
export function buildCoordinationClashes(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  electrical: PlanElectricalPoint[] = [],
  plumbing: PlanPlumbingPoint[] = [],
): CoordinationClashResult {
  const clashes: CoordinationClash[] = []

  // Resolve each item ONCE: footprint parts + height + label.
  const resolved = items.flatMap((it) => {
    const def = catalog[it.defId]
    if (!def?.defaultFootprint) return []
    return [
      {
        item: it,
        parts: itemFootprintParts(it, def),
        heightMm: itemHeight(it, def) * 1000,
        label: itemLabel(it, def),
      },
    ]
  })

  // 1 — An MEP point buried behind furniture. The point is obstructed when it
  //     falls inside the item's footprint AND sits within the item's vertical
  //     extent (items are floor-anchored, so that is 0 → height).
  const mep: { p: PlanElectricalPoint | PlanPlumbingPoint; mm: number; trade: string }[] = [
    ...electrical.map((p) => ({
      p,
      mm: mountMm(p, ELECTRICAL_MOUNT_DEFAULTS_MM as Record<string, number>),
      trade: 'Electrical',
    })),
    ...plumbing.map((p) => ({
      p,
      mm: mountMm(p, PLUMBING_MOUNT_DEFAULTS_MM as Record<string, number>),
      trade: 'Plumbing',
    })),
  ]

  for (const { p, mm, trade } of mep) {
    for (const r of resolved) {
      if (mm > r.heightMm) continue
      if (!r.parts.some((part) => pointInObb(part, p.x, p.z))) continue
      const room = roomAt(plan, p)
      clashes.push({
        kind: 'mep-behind-furniture',
        severity: 'high',
        title: `${trade} ${p.kind} is behind ${r.label}`,
        detail: `Point at ${Math.round(mm)} mm AFFL sits inside the ${r.label} footprint (${Math.round(r.heightMm)} mm tall) — it would be built in and unreachable.`,
        roomName: room?.name,
        pointId: p.id,
        itemId: r.item.id,
      })
      // One report per point: naming every overlapping item adds noise, not
      // information — the fix is to move the point or the item either way.
      break
    }
  }

  // 2 — An item taller than the finished clearance under its room's designed
  //     ceiling treatment (a bulkhead / dropped ceiling it cannot fit under).
  const zones = buildCeilingClearance(plan).zones
  if (zones.length > 0) {
    const levels = planLevels(plan)
    for (const level of levels) {
      const onLevel = new Set(itemsOnLevel(items, level.id).map((i) => i.id))
      for (const zone of zones) {
        const room = level.rooms.find((r) => r.id === zone.roomId)
        if (!room) continue
        for (const r of resolved) {
          if (!onLevel.has(r.item.id)) continue
          if (r.heightMm <= zone.clearanceMm) continue
          if (!pointInRoom(room, r.item.position[0], r.item.position[1])) continue
          clashes.push({
            kind: 'item-under-ceiling-drop',
            severity: 'high',
            title: `${r.label} is taller than the ${zone.style} ceiling above it`,
            detail: `${Math.round(r.heightMm)} mm tall against ${Math.round(zone.clearanceMm)} mm finished clearance (a ${Math.round(zone.dropMm)} mm drop) — it will not fit.`,
            roomName: zone.roomName,
            itemId: r.item.id,
          })
        }
      }
    }
  }

  const highCount = clashes.filter((c) => c.severity === 'high').length
  return {
    clashes,
    highCount,
    allClear: clashes.length === 0,
    checked: { mepPoints: mep.length, items: resolved.length },
  }
}
