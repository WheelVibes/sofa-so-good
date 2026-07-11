import { planWallThickness } from '../../floorplan/planGeometry'
import type { FloorPlan, PlanOpening } from '../../floorplan/types'
import { wallLength } from '../../floorplan/types'
import { isCurvedWall, pointAtArcLength, wallArcLength } from '../../floorplan/wallArc'
import type { WallSpec } from '../types'
import { THRESHOLD_OVERLAP, type ThresholdRect, thresholdRects } from './thresholdRects'

/**
 * Custom-plan doorway threshold patches (DOOR-GAP-LEAK, PlanShell analog).
 *
 * `PlanRoomFloor` covers room *interiors* only and a door opening cuts its wall
 * to y=0 (`wallBoxes` leaves a clear floor→head gap), so the wall-thickness
 * strip inside every plan doorway is unfloored — exactly the hole the default
 * flat plugged with `thresholdRects` + `Thresholds.tsx`. Here the neutral
 * `UnroomedFloor` (1 cm below the room floors) usually shows through instead of
 * bare sky, but that still reads as a pale grey slot under every closed leaf
 * (and IS open sky when the outline trace fails or on upper storeys past the
 * slab edge).
 *
 * This is a pure ADAPTER: it maps `PlanWall`/`PlanOpening` onto the `WallSpec`
 * shape the shared {@link thresholdRects} expects (openings become cutouts on
 * their host wall; per-wall/plan thickness overrides via `planWallThickness`)
 * rather than duplicating the rect math. A door on a *curved* wall becomes a
 * straight pseudo-wall along the chord under the opening — the patch lands at
 * the chord midpoint with the local tangent heading (same approximation as the
 * leaf/collision chords). Rendered by `PlanThresholds` in `PlanShell.tsx`.
 */
export function planThresholdRects(
  plan: Pick<FloorPlan, 'walls' | 'openings' | 'wallThickness'>,
): ThresholdRect[] {
  const specs: WallSpec[] = []
  const thickness = new Map<string, number>()
  for (const wall of plan.walls) {
    const t = planWallThickness(wall, plan as FloorPlan)
    const doors = plan.openings.filter((o) => o.wallId === wall.id && o.kind === 'door')
    if (doors.length === 0) continue
    if (isCurvedWall(wall)) {
      // One straight pseudo-wall per door: the chord under the opening, with a
      // single cutout spanning it (arc-length offsets clamped into the wall).
      const len = wallArcLength(wall)
      for (const o of doors) {
        const s0 = Math.max(0, Math.min(len, o.offset))
        const s1 = Math.max(s0, Math.min(len, o.offset + o.width))
        if (s1 - s0 < 1e-4) continue
        const a = pointAtArcLength(wall, s0)
        const b = pointAtArcLength(wall, s1)
        const chord = Math.hypot(b.x - a.x, b.z - a.z)
        if (chord < 1e-4) continue
        const id = `${wall.id}#${o.id}`
        specs.push({
          id,
          start: [a.x, a.z],
          end: [b.x, b.z],
          thickness: wall.thickness,
          cutouts: [{ kind: 'door', offset: 0, width: chord, sill: o.sill, head: o.head }],
        })
        thickness.set(id, t)
      }
      continue
    }
    const len = wallLength(wall)
    if (len === 0) continue
    specs.push({
      id: wall.id,
      start: wall.start,
      end: wall.end,
      thickness: wall.thickness,
      cutouts: doors
        .map((o) => {
          // Clamp the span into the wall (mirrors wallBoxes) so a stale offset
          // can't push a patch past the wall's end.
          const s0 = Math.max(0, Math.min(len, o.offset))
          const s1 = Math.max(s0, Math.min(len, o.offset + o.width))
          return { kind: 'door' as const, offset: s0, width: s1 - s0, sill: o.sill, head: o.head }
        })
        .filter((c) => c.width > 1e-4),
    })
    thickness.set(wall.id, t)
  }
  // Pseudo-wall ids (`wall#opening`) collapse back to the host wall id so the
  // patch fades with the REAL wall's reveal state.
  return thresholdRects(specs, (w) => thickness.get(w.id) ?? 0.1).map((r) => ({
    ...r,
    wallId: r.wallId.includes('#') ? r.wallId.slice(0, r.wallId.indexOf('#')) : r.wallId,
  }))
}

/**
 * Room-editor variant (`PlanRoomShell`): the shell's opening entries already
 * carry the resolved world centre + host-wall heading (`atan2(dx, dz)`, the
 * same yaw convention as {@link thresholdRects}), so the patch is direct — one
 * per floor-level door, door width along the wall, host-wall thickness (+ the
 * shared tuck-under overlap) across it. Same skip rules as `thresholdRects`
 * (windows and raised-sill doors keep a solid sill segment).
 */
export function roomShellThresholdRects(
  entries: readonly {
    opening: Pick<PlanOpening, 'kind' | 'sill' | 'width' | 'wallId'>
    center: [number, number]
    angle: number
  }[],
  thicknessOf: (wallId: string) => number,
): ThresholdRect[] {
  const out: ThresholdRect[] = []
  for (const { opening: o, center, angle } of entries) {
    if (o.kind !== 'door' || o.sill > 0.001 || o.width < 1e-4) continue
    out.push({
      cx: center[0],
      cz: center[1],
      length: o.width,
      depth: thicknessOf(o.wallId) + THRESHOLD_OVERLAP * 2,
      angle,
      wallId: o.wallId,
    })
  }
  return out
}
