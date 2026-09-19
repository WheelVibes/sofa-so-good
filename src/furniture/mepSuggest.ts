/**
 * MEP point suggestion heuristics (MEP layer plan, G1, PR4) — derives a
 * starting electrical/plumbing layout from the placed furniture + doors.
 *
 * Moved VERBATIM from `ui/openDrawingSet.ts` (which used it as an inline,
 * export-time-only fallback) so there is exactly ONE derivation source
 * (plan-doc risk #4 — heuristic drift): both the drawing-set export fallback
 * (`openDrawingSet.ts`) and the editor's "Suggest MEP points" action
 * (`floorPlanSlice.suggestMepPoints`) call these same two functions. Pure —
 * no store/React imports. Furniture types can't be imported by
 * `src/floorplan` (would create an import cycle — same rationale as
 * `furnishPlan.ts`), so this lives in `src/furniture` instead and imports
 * `floorplan` types, never the reverse.
 *
 * One flag read (`hdbScaleAudit`, for the shower take-off height) is the single exception to
 * "pure" here — same shape as `defaults/curtainFlush.ts`. It is a constant selector, not
 * state: given a flag state the output is still deterministic, and tests set the flag
 * explicitly with `setResolvedFlags` rather than mocking a store.
 */

import { isFeatureEnabled } from '../features/featureFlags'
import type { ElectricalPoint } from '../floorplan/electricalPlan'
import { GROUND_LEVEL_ID, planLevels } from '../floorplan/levels'
import type { PlumbingPoint } from '../floorplan/plumbingPlan'
import type { FloorPlan } from '../floorplan/types'
import { wallLength } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from './types'

/** defIds / categories that imply a power point at the item's position. */
const SOCKET_RE =
  /refrigerator|washing-machine|microwave|oven|dishwasher|wine-cooler|stove|range-hood|soundbar|floor-speaker|aquarium|piano|monitor/

/** Derive an indicative electrical layout from the placed furniture + doors:
 *  appliances/electronics → sockets, aircon → aircon point, TV → TV point,
 *  shower/bathtub → water-heater, a desk → a double socket + data, and a light
 *  switch just inside each door. A sensible starting point the user can refine. */
export function deriveElectricalPoints(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): ElectricalPoint[] {
  const pts: ElectricalPoint[] = []
  for (const it of items) {
    const def = catalog[it.defId]
    if (!def) continue
    const [x, z] = it.position
    const id = it.defId
    // Carry the item's storey so per-storey sheets can filter (F13).
    const lvl = it.levelId ? { levelId: it.levelId } : {}
    if (/aircon/.test(id)) pts.push({ x, z, kind: 'aircon', ...lvl })
    else if (/tv-wall|flatscreen-tv/.test(id)) pts.push({ x, z, kind: 'tv-point', ...lvl })
    else if (/shower|bathtub/.test(id)) pts.push({ x, z, kind: 'water-heater', ...lvl })
    else if (/desk/.test(id)) {
      pts.push({ x, z, kind: 'socket-double', ...lvl })
      pts.push({ x: x + 0.25, z, kind: 'data', ...lvl })
    } else if (
      SOCKET_RE.test(id) ||
      def.category === 'appliances' ||
      def.category === 'electronics'
    )
      pts.push({ x, z, kind: 'socket', ...lvl })
  }
  // A light switch just inside each door (on the wall, nudged off the
  // centreline) — on every storey, tagged with its level.
  for (const level of planLevels(plan)) {
    if (!Array.isArray(level.openings) || !Array.isArray(level.walls)) continue
    const lvl = level.id !== GROUND_LEVEL_ID ? { levelId: level.id } : {}
    for (const o of level.openings) {
      if (o.kind !== 'door') continue
      const wall = level.walls.find((w) => w.id === o.wallId)
      if (!wall) continue
      const len = wallLength(wall)
      if (len === 0) continue
      const ux = (wall.end[0] - wall.start[0]) / len
      const uz = (wall.end[1] - wall.start[1]) / len
      const at = o.offset + o.width + 0.15 // just past the leaf
      pts.push({ x: wall.start[0] + ux * at, z: wall.start[1] + uz * at, kind: 'switch', ...lvl })
    }
  }
  return pts
}

/** Mount height (mm AFFL) of a washing machine's bib tap — clear of the machine's own 850 mm
 *  shell, which the generic 600 mm `PLUMBING_MOUNT_DEFAULTS_MM['water-point']` is not. */
const WASHER_TAP_HEIGHT_MM = 1150

/** Mount height (mm AFFL) of a shower mixer / riser take-off (HDB-SCALE-AUDIT).
 *
 *  BCA *Code on Accessibility in the Built Environment 2025*, cl. 5.8.9.1/.2: a shower's
 *  slide bar is at least 500 mm long with its **lower end 900 mm to 1100 mm above finished
 *  floor level** — the band a shower's wall take-off has to sit in. 1000 mm is its middle.
 *  https://file.go.gov.sg/bca-coa2025.pdf
 *
 *  The generic 600 mm `PLUMBING_MOUNT_DEFAULTS_MM['water-point']` put a shower's tap at
 *  knee height, below the bottom of the published range and below every SG practice figure
 *  found (no Singapore source publishes a mixer height directly — the slide bar is the
 *  citable anchor). Behind the `hdbScaleAudit` flag; off keeps the 600 mm default. */
const SHOWER_TAP_HEIGHT_MM = 1000

/**
 * SOIL-PIPE-BACK-WALL (W9). `plumbingModel.ts:resolvePlumbingFittings` snaps a soil-pipe point
 * to the nearest wall in the WHOLE plan, with no idea which wall a toilet is actually flush
 * against — fine in a room with only one nearby wall, wrong in a tight one with two. Bath2 (1.75
 * x 1.85 m) is exactly that: the WC's raw centre sits 0.38 m from the WEST wall it is mounted to
 * (tank against it, `defaults/bathrooms.ts:default-bath2-wc`) but only 0.30 m from the SOUTH
 * wall it merely happens to be near, so the nearest-wall search picked the south wall and the
 * derived stack rendered floor-to-ceiling in the open room instead of hugging a wall.
 *
 * Fix: derive the point at the toilet's BACK (tank) face instead of its centre — the same point
 * `defaults/bathrooms.ts` hand-places every shipped toilet relative to (tank at local −Z; a yaw
 * of `rotation` rotates local −Z to world `(−sin rotation, −cos rotation)`, the same convention
 * `wallSnap.ts:yawForNormal` uses for local +Z). Checked against both shipped positions: bath1's
 * WC (rotation π) lands 0.050 m off its south wall face and bath2's (rotation π/2) 0.050 m off
 * its west wall face — both exactly the `defaults/bathrooms.ts` `wallGap` — so the back point is
 * unambiguously closest to the CORRECT wall everywhere a toilet is placed by hand, not just in
 * bath2. Flag `soilPipeBackWall` (simple, default true); off reproduces the exact prior point
 * (the fixture centre).
 */
const TOILET_BACK_HALF_DEPTH_FALLBACK_M = 0.33

/** Derive an indicative plumbing layout from placed fixtures: a WC → soil pipe
 *  + cistern water point; basins / sinks / dishwashers → water + drainage;
 *  showers → floor trap + water; bathtubs → water + drainage; washing machines →
 *  water + floor trap; water heaters → a heater point. A sensible starting point
 *  the user can refine. */
export function derivePlumbingPoints(
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): PlumbingPoint[] {
  const pts: PlumbingPoint[] = []
  for (const it of items) {
    if (!catalog[it.defId]) continue
    const [x, z] = it.position
    const id = it.defId
    const lvl = it.levelId ? { levelId: it.levelId } : {}
    if (/toilet|^wc$/.test(id)) {
      const backHalf = isFeatureEnabled('soilPipeBackWall')
        ? (catalog[id].defaultFootprint?.d ?? TOILET_BACK_HALF_DEPTH_FALLBACK_M * 2) / 2
        : 0
      const bx = x - backHalf * Math.sin(it.rotation)
      const bz = z - backHalf * Math.cos(it.rotation)
      pts.push({ x: bx, z: bz, kind: 'soil-pipe', ...lvl })
      pts.push({ x: x + 0.2, z, kind: 'water-point', ...lvl })
    } else if (/shower/.test(id)) {
      pts.push({ x, z, kind: 'floor-trap', ...lvl })
      pts.push({
        x: x + 0.2,
        z,
        kind: 'water-point',
        ...(isFeatureEnabled('hdbScaleAudit') ? { mountHeightMm: SHOWER_TAP_HEIGHT_MM } : {}),
        ...lvl,
      })
    } else if (/washing-machine/.test(id)) {
      // A washer's bib tap goes on the wall ABOVE the machine (YARD-FITTINGS): at the generic
      // 600 mm default it resolves to a point BEHIND an 850 mm-tall machine, i.e. rendered
      // inside it and invisible. 1150 mm is where the tap actually sits in an HDB service yard.
      pts.push({ x, z, kind: 'water-point', mountHeightMm: WASHER_TAP_HEIGHT_MM, ...lvl })
      pts.push({ x: x + 0.2, z, kind: 'floor-trap', ...lvl })
    } else if (/water-heater|heater/.test(id)) {
      pts.push({ x, z, kind: 'water-heater', ...lvl })
    } else if (/sink|basin|bathtub|dishwasher/.test(id)) {
      pts.push({ x, z, kind: 'water-point', ...lvl })
      pts.push({ x: x + 0.2, z, kind: 'drainage', ...lvl })
    }
  }
  return pts
}
