import { describe, expect, it } from 'vitest'
import { levelAsPlan, planLevels } from './levels'
import { planCollisionWalls } from './planGeometry'
import { PLAN_TEMPLATES } from './templates'

/**
 * ROOM-RECT-WALLS (v0.31.8.60) — how far each room rectangle stops short of its
 * own wall.
 *
 * ## Why this is worth a test
 *
 * The arranger snaps furniture to the ROOM RECTANGLE
 * (`arrangeGeometry.ts:planRoomRect`, inset 0.12) plus `snapToWall`'s 0.06, so a
 * piece lands 0.18 m from the rect edge. If the rect edge is not the wall face,
 * that 0.18 becomes 0.18 + the shortfall — which is exactly how
 * `applianceWall.test.ts` ends up with eight appliances at 0.32 m: 0.18 + 0.15.
 * v0.31.8.59 recorded that 0.14-0.15 m difference as an unexplained cluster;
 * this is the explanation.
 *
 * ## The mechanism
 *
 * Room rectangles are authored against the wall **centreline** with a constant
 * offset, while a wall's half-thickness VARIES — internal walls are 0.1 m thick
 * (half 0.05), external ones 0.2 m (half 0.1). So one authored constant cannot
 * be flush against both:
 *
 * | rect authored at | vs INTERNAL wall | vs EXTERNAL wall |
 * | --- | --- | --- |
 * | centreline | −0.05 (rect overlaps the wall body) | −0.10 |
 * | centreline + 0.1 | **+0.05 short** | 0.00 flush |
 * | centreline + 0.2 | **+0.15 short** | +0.10 |
 *
 * and the measured histogram lands on exactly those values.
 *
 * ## What this test is and is not
 *
 * It is a RATCHET over the shipped library, not a correctness bar — a 0.05 m
 * sliver behind a wardrobe harms nobody on its own. It exists so that (a) the
 * numbers cannot drift unnoticed, and (b) whoever fixes `planRoomRect` to snap
 * against the wall FACE sees the populations collapse into `flush`, which is the
 * signal that the fix worked.
 *
 * **Do NOT "fix" this by editing the expected counts.** They are a measurement.
 *
 * Distinct from `templateEnclosure.test.ts` and `docs/open-graphics-decisions.md`
 * item (f), which are about whole MISSING partitions (0.7-1.0 m gaps). This is
 * about rooms that have their wall and stop 5-15 cm short of it.
 */

/** Median distance from a rect edge to the nearest wall FACE, sampled 5x. */
function edgeShortfall(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  walls: ReturnType<typeof planCollisionWalls>,
): number {
  const ds: number[] = []
  for (let k = 1; k <= 5; k++) {
    const t = k / 6
    const mx = ax + (bx - ax) * t
    const mz = az + (bz - az) * t
    let best = Number.POSITIVE_INFINITY
    for (const w of walls) {
      const vx = w.bx - w.ax
      const vz = w.bz - w.az
      const l2 = vx * vx + vz * vz
      const u = l2 > 0 ? Math.max(0, Math.min(1, ((mx - w.ax) * vx + (mz - w.az) * vz) / l2)) : 0
      best = Math.min(
        best,
        Math.hypot(mx - (w.ax + u * vx), mz - (w.az + u * vz)) - w.thickness / 2,
      )
    }
    ds.push(best)
  }
  ds.sort((a, b) => a - b)
  return ds[2] as number
}

/** Every rect edge that has a wall within 0.3 m, bucketed by shortfall. */
function survey() {
  const buckets = { overlapping: 0, flush: 0, short05: 0, short15: 0, other: 0 }
  let withWall = 0
  for (const tpl of PLAN_TEMPLATES) {
    for (const level of planLevels(tpl)) {
      const lp = levelAsPlan(tpl, level)
      const walls = planCollisionWalls(lp, {})
      if (walls.length === 0) continue
      for (const r of lp.rooms ?? []) {
        const x0 = r.origin[0]
        const z0 = r.origin[1]
        const x1 = x0 + r.width
        const z1 = z0 + r.depth
        const edges: [number, number, number, number][] = [
          [x0, z0, x1, z0],
          [x0, z1, x1, z1],
          [x0, z0, x0, z1],
          [x1, z0, x1, z1],
        ]
        for (const [ax, az, bx, bz] of edges) {
          const d = edgeShortfall(ax, az, bx, bz, walls)
          if (d > 0.3 || d < -0.3) continue
          withWall++
          if (d < -0.02) buckets.overlapping++
          else if (d <= 0.02) buckets.flush++
          else if (d <= 0.07) buckets.short05++
          else if (d >= 0.13 && d <= 0.17) buckets.short15++
          else buckets.other++
        }
      }
    }
  }
  return { withWall, buckets }
}

describe('room rectangles against their own walls', () => {
  it('records the shortfall populations, which are the authoring offsets', () => {
    const { withWall, buckets } = survey()
    // 573 -> 575 in v0.31.8.66: `tpl-hdb-maisonette` and `tpl-hdb-exec` each
    // gained their household shelter's missing fourth RC wall, so one more room
    // edge on each now has a wall behind it.
    expect(withWall).toBe(575)
    expect(buckets).toEqual({
      // Rect drawn ON the wall centreline, so it eats into the wall body.
      overlapping: 58,
      // 226 -> 229 in v0.31.8.63 (`tpl-hdb-3room`'s shelter, two walls) and
      // 229 -> 231 in v0.31.8.66 (`tpl-hdb-maisonette` and `tpl-hdb-exec`, one
      // each). All authored with the centrelines offset half a thickness so the
      // FACES land on the room edge. New walls should be flush.
      flush: 231,
      // Rect at centreline + 0.1, against a 0.1 m INTERNAL wall.
      short05: 186,
      // Rect at centreline + 0.2, against a 0.1 m INTERNAL wall. These are the
      // ones that push a snapped appliance out to 0.18 + 0.15 = 0.33 m.
      short15: 86,
      other: 14,
    })
  }, 120_000)

  it('fewer than half the edges are flush, which is the point of the entry', () => {
    // Stated separately so the headline cannot quietly invert: if a future
    // change makes MOST edges flush, this fails and the counts above must be
    // re-recorded deliberately.
    const { withWall, buckets } = survey()
    expect(buckets.flush / withWall).toBeLessThan(0.5)
  }, 120_000)
})
