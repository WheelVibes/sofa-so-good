import { describe, expect, it } from 'vitest'
import { obbCorners } from '../collision/obb'
import { itemFootprint } from '../collision/placement'
import { levelAsPlan, planLevels } from '../floorplan/levels'
import { planCollisionWalls } from '../floorplan/planGeometry'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { furnishPlanItems } from '../furniture/furnishPlan'
import { LAYOUT_PRESETS } from '../furniture/layoutPresets'

/**
 * APPLIANCE-WALL (v0.31.8.58) — a fridge, stove or washing machine that stands
 * in the middle of the room.
 *
 * These are not free-standing furniture. A stove needs a wall for its hood and
 * flue, a fridge needs one for its coils and its door swing, a washing machine
 * needs plumbing at one. An appliance marooned mid-floor is wrong in the render
 * AND wrong as a contractor reference, which is the harder of the two to argue
 * away.
 *
 * ## The threshold is derived, not chosen
 *
 * `autoArrange.ts:snapToWall` places a piece at `gap = 0.06` from the room RECT,
 * and `arrangeGeometry.ts:planRoomRect` insets that rect `0.12` from the room's
 * own origin — which in these templates is the wall FACE. So a correctly snapped
 * piece sits at exactly **0.18 m** from the wall face, and the corpus confirms
 * it: the readings cluster hard on 0.18.
 *
 * `LOOSE_M` is 0.28 — a full 10 cm BEYOND the snap distance, which no inset
 * artefact can explain. A first cut of this sweep used 0.15 m and reported "38
 * of 53", a number that was measuring the threshold rather than the layouts
 * (v0.31.8.57 recorded that and declined to publish it).
 *
 * **Do NOT add an entry to silence a failure.** A new entry means the arranger
 * has marooned another appliance.
 */
const SNAP_M = 0.18
const LOOSE_M = SNAP_M + 0.1

/** Floor-standing appliances that must have a wall behind them. */
const APPLIANCE = /^(refrigerator|stove|washing-machine|oven|dishwasher)/

function segSegDist(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
) {
  const pt = (px: number, pz: number, x1: number, z1: number, x2: number, z2: number) => {
    const vx = x2 - x1
    const vz = z2 - z1
    const l2 = vx * vx + vz * vz
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - x1) * vx + (pz - z1) * vz) / l2)) : 0
    return Math.hypot(px - (x1 + t * vx), pz - (z1 + t * vz))
  }
  return Math.min(
    pt(ax, az, cx, cz, dx, dz),
    pt(bx, bz, cx, cz, dx, dz),
    pt(cx, cz, ax, az, bx, bz),
    pt(dx, dz, ax, az, bx, bz),
  )
}

/** Clear gap (m) from an item's footprint to the nearest wall FACE. */
function gapToNearestWall(
  item: Parameters<typeof itemFootprint>[0],
  def: Parameters<typeof itemFootprint>[1],
  walls: ReturnType<typeof planCollisionWalls>,
): number {
  const corners = obbCorners(itemFootprint(item, def))
  let best = Number.POSITIVE_INFINITY
  for (const w of walls) {
    let m = Number.POSITIVE_INFINITY
    for (let i = 0; i < 4; i++) {
      const a = corners[i] as [number, number]
      const b = corners[(i + 1) % 4] as [number, number]
      m = Math.min(m, segSegDist(a[0], a[1], b[0], b[1], w.ax, w.az, w.bx, w.bz))
    }
    best = Math.min(best, m - w.thickness / 2)
  }
  return best
}

/** `template/def`, worst first. */
// 15 -> 6 in v0.31.8.71 (WALL-SNAP-SHORTFALL + MOUNT-HEIGHT-CLASH): every appliance whose distance was
// 0.18 m of intended gap plus a 0.15 m rect shortfall now sits where the
// arranger meant it. The nine removed were the whole 0.32 m cluster plus
// `tpl-hdb-jumbo`'s washing machine at 0.33.
// 6 -> 3 in v0.31.8.75 (WALL-BACKED-EDGE + WINDOW-KEEPOUT-IN-RESCUE): all three
// service-yard washing machines. They stood on rect edges that were not walls —
// `tpl-hdb-3room`'s Service Yard has a wall on its NORTH edge and none within
// 0.80 m on the other three — because `snapToWall` chose its edge from the
// piece's SEEDED position. A washing machine needs a wall for its plumbing.
const KNOWN_MAROONED: string[] = [
  'tpl-condo-3bed/stove 1.05',
  'tpl-condo-1bed/stove 0.59',
  'tpl-hdb-2room/stove 0.52',
]

const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')

describe('kitchen appliances stand against a wall', () => {
  it('matches the recorded marooned appliances exactly', () => {
    expect(movein).toBeDefined()
    const found: string[] = []
    for (const tpl of PLAN_TEMPLATES) {
      const items = furnishPlanItems(tpl, movein!, BUILTIN_CATALOG, {})
      for (const level of planLevels(tpl)) {
        const walls = planCollisionWalls(levelAsPlan(tpl, level), {})
        if (walls.length === 0) continue
        for (const it of items) {
          if ((it.levelId ?? 'ground') !== level.id) continue
          if (!APPLIANCE.test(String(it.defId))) continue
          const def = BUILTIN_CATALOG[it.defId]
          if (!def || def.mounted || def.noClip) continue
          const gap = gapToNearestWall(it, def, walls)
          if (gap > LOOSE_M) found.push(`${tpl.id}/${it.defId} ${gap.toFixed(2)}`)
        }
      }
    }
    found.sort((a, b) => Number(b.split(' ')[1]) - Number(a.split(' ')[1]) || a.localeCompare(b))
    expect(found).toEqual(KNOWN_MAROONED)
  }, 120_000)

  it('the sweep measures something — most appliances ARE snapped', () => {
    // Without this the list above could pass by measuring nothing. The snapped
    // majority is the control: it is what makes 0.18 m a derived constant rather
    // than a guess.
    let total = 0
    let snapped = 0
    for (const tpl of PLAN_TEMPLATES) {
      const items = furnishPlanItems(tpl, movein!, BUILTIN_CATALOG, {})
      for (const level of planLevels(tpl)) {
        const walls = planCollisionWalls(levelAsPlan(tpl, level), {})
        if (walls.length === 0) continue
        for (const it of items) {
          if ((it.levelId ?? 'ground') !== level.id) continue
          if (!APPLIANCE.test(String(it.defId))) continue
          const def = BUILTIN_CATALOG[it.defId]
          if (!def || def.mounted || def.noClip) continue
          total++
          if (gapToNearestWall(it, def, walls) <= LOOSE_M) snapped++
        }
      }
    }
    expect(total).toBeGreaterThan(30)
    expect(snapped).toBe(total - KNOWN_MAROONED.length)
    expect(snapped / total).toBeGreaterThan(0.55)
  }, 120_000)
})

/**
 * RANGE-HOOD-HOST (v0.31.8.58) — a hood must hang over its stove.
 *
 * Found while diagnosing the marooned stoves above: `tpl-condo-3bed` puts its
 * stove in the middle of the kitchen and its hood over the COUNTER, 1.13 m away.
 * A hood is not decoration — it is ducted extract over a specific appliance, and
 * a drawing that shows it somewhere else is a drawing a contractor would build
 * wrong.
 *
 * The orphan case is the worse one: four templates ship a hood with **no stove
 * in the home at all**. The likely cause is that the stove was removed by one of
 * the drop passes (`dropOverlaps` / `dropDoorBlockers` / `dropWallClippers`)
 * while its mounted hood, placed separately by `placeSeededMounts`, survived —
 * i.e. a mount outliving its host. Not yet confirmed, and not fixed here.
 *
 * **Do NOT add an entry to silence a failure.**
 */
const HOOD_OVER_STOVE_M = 0.15

/** Templates whose hood has no stove to hang over. */
const KNOWN_ORPHAN_HOODS = ['tpl-1bed', 'tpl-condo-1study', 'tpl-condo-studio', 'tpl-studio']

/** Templates whose hood is too far from the nearest stove, `id/metres`. */
const KNOWN_MISALIGNED_HOODS = ['tpl-condo-3bed/1.13']

describe('range hoods hang over their stove', () => {
  const hoodsAndStoves = (tplId: string) => {
    const tpl = PLAN_TEMPLATES.find((t) => t.id === tplId)
    if (!tpl) throw new Error(`no template ${tplId}`)
    const items = furnishPlanItems(tpl, movein!, BUILTIN_CATALOG, {})
    return {
      hoods: items.filter((i) => String(i.defId).startsWith('range-hood')),
      stoves: items.filter((i) => String(i.defId).startsWith('stove')),
    }
  }

  it('records exactly the templates whose hood has no stove', () => {
    const orphans: string[] = []
    for (const tpl of PLAN_TEMPLATES) {
      const { hoods, stoves } = hoodsAndStoves(tpl.id)
      if (hoods.length > 0 && stoves.length === 0) orphans.push(tpl.id)
    }
    expect(orphans.sort()).toEqual(KNOWN_ORPHAN_HOODS)
  }, 120_000)

  it('records exactly the hoods that hang away from their stove', () => {
    const bad: string[] = []
    for (const tpl of PLAN_TEMPLATES) {
      const { hoods, stoves } = hoodsAndStoves(tpl.id)
      if (stoves.length === 0) continue
      for (const h of hoods) {
        let best = Number.POSITIVE_INFINITY
        for (const st of stoves)
          best = Math.min(
            best,
            Math.hypot(h.position[0] - st.position[0], h.position[1] - st.position[1]),
          )
        if (best > HOOD_OVER_STOVE_M) bad.push(`${tpl.id}/${best.toFixed(2)}`)
      }
    }
    expect(bad.sort()).toEqual(KNOWN_MISALIGNED_HOODS)
  }, 120_000)

  it('most hoods ARE over their stove, so the two lists measure something', () => {
    let paired = 0
    let aligned = 0
    for (const tpl of PLAN_TEMPLATES) {
      const { hoods, stoves } = hoodsAndStoves(tpl.id)
      if (stoves.length === 0) continue
      for (const h of hoods) {
        paired++
        let best = Number.POSITIVE_INFINITY
        for (const st of stoves)
          best = Math.min(
            best,
            Math.hypot(h.position[0] - st.position[0], h.position[1] - st.position[1]),
          )
        if (best <= HOOD_OVER_STOVE_M) aligned++
      }
    }
    expect(paired).toBeGreaterThan(10)
    expect(aligned).toBe(paired - KNOWN_MISALIGNED_HOODS.length)
  }, 120_000)
})
