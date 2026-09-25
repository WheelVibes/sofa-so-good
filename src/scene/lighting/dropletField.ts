/**
 * WET-GLASS — the **geometry** of rain on a pane, with no canvas and no three.js.
 *
 * Two layers, because rain on a vertical window is two different things and conflating them is
 * the visible mistake:
 *
 * | layer | what it is | does it move? |
 * | --- | --- | --- |
 * | {@link beadField} | sessile drops **pinned** by contact-angle hysteresis | never |
 * | {@link runnelField} | drops that exceeded the retention limit and **ran** | yes, downward |
 *
 * A pane in rain is mostly the first kind. Scrolling a single texture that contains both would
 * slide the pinned drops as well, which reads as the whole window sliding — the exact
 * "everything animates" tell that makes an effect look like a game rather than a showroom. So the
 * two layers are generated separately, bound to two different map slots, and only one of them is
 * ever offset.
 *
 * Both fields are **tileable** on both axes: every drop that crosses an edge is emitted again at
 * the wrapped position, the same way `backdropHorizon.ts` duplicates a skyline building across the
 * equirect seam. The runnel layer additionally has to tile in Y *while scrolling*, which is why its
 * trails are cut to a whole number of tile heights rather than drawn to an arbitrary length.
 *
 * Deterministic (seeded `mulberry32`) so a droplet pattern is a fact about the build, not about the
 * session — a screenshot comparison across two boots has to compare the same drops.
 *
 * Sizes are in **tile fractions** (0..1), not pixels: the painter picks the resolution and the
 * material picks the physical tile size, so the same field serves a 128 px phone tile and a 512 px
 * desktop one without regenerating.
 */
import { mulberry32 } from '../../materials/procedural/noise'

/** One droplet: a spherical cap sitting on the glass. */
export interface Droplet {
  /** Centre in tile fractions, 0..1 (may sit slightly outside for the wrap duplicates). */
  cx: number
  cy: number
  /** Radius in tile fractions. */
  r: number
  /**
   * How much the cap bulges, 0..1. A real sessile water drop on float glass has a contact angle
   * well under 90°, so it is a shallow cap, not a hemisphere — `1` would be a full hemisphere and
   * reads as beads of mercury. Drives the normal-map slope, not the size.
   */
  bulge: number
}

/**
 * Emit `d` plus whichever wrapped copies are needed so a drop straddling an edge tiles.
 *
 * Only the axes the drop actually crosses get a duplicate (and the corner case gets three), so a
 * field of N drops costs a little over N entries rather than 9N.
 */
function withWraps(out: Droplet[], d: Droplet): void {
  out.push(d)
  const dx = d.cx - d.r < 0 ? 1 : d.cx + d.r > 1 ? -1 : 0
  const dy = d.cy - d.r < 0 ? 1 : d.cy + d.r > 1 ? -1 : 0
  if (dx) out.push({ ...d, cx: d.cx + dx })
  if (dy) out.push({ ...d, cy: d.cy + dy })
  if (dx && dy) out.push({ ...d, cx: d.cx + dx, cy: d.cy + dy })
}

/**
 * The PINNED layer: a scatter of small sessile drops covering the pane.
 *
 * `count` is per tile, and the tile is ~0.25 m of real glass (see `wetGlassTexture.ts`), so 90
 * drops is roughly 1400 drops per square metre — dense enough to read as rain at a glance and
 * sparse enough that the view through the pane is still a view (the field covers ~7 % of the tile;
 * `scripts/dev-probes/wet-glass-maps.ts` prints that figure). Radii are clustered small with a long
 * tail (`u^3`): most of what sits on a window is fine mist with a few coalesced drops in it, and a
 * field of uniform drops reads as a pattern rather than as weather.
 *
 * **The drops are deliberately LARGER than life, and that is a legibility floor rather than a
 * shortcut.** At this tile size the radii run 2.5–15 mm across, where a real sessile drop is more
 * like 1–6 mm. A 4 mm drop seen from three metres inside a room subtends about 0.08°, i.e. roughly
 * ONE pixel at a 1400 px wide 60° frame — physically-sized rain on a window is sub-pixel at
 * showroom viewing distance and would render as noise, not as drops. The upper end here (large
 * coalesced drops) is real; the median is pushed up to the smallest size that still resolves.
 */
export function beadField(count = 90, seed = 0x7a107): Droplet[] {
  const rnd = mulberry32(seed)
  const out: Droplet[] = []
  for (let i = 0; i < count; i++) {
    // `u^3` biases hard toward the small end and leaves a thin tail of big coalesced drops.
    const u = rnd()
    const r = 0.005 + u * u * u * 0.026
    withWraps(out, {
      cx: rnd(),
      cy: rnd(),
      r,
      // Bigger drops slump: a large sessile drop is flatter than a small one, which is why the
      // bulge falls with radius rather than being one constant.
      bulge: 0.72 - u * 0.22,
    })
  }
  return out
}

/** One runnel: a vertical trail of shrinking drops behind a leading head. */
export interface Runnel {
  /** The leading drop (largest, lowest on the pane). */
  head: Droplet
  /** The wake it left, head-adjacent first. */
  tail: Droplet[]
}

/**
 * The RUNNING layer: a few trails, each a big head dragging a thinning wake.
 *
 * **`count` is deliberately small.** Restraint is the whole design constraint here — a showroom
 * window with a dozen racing streaks is a car-game windscreen. Four trails per 0.25 m tile is
 * about what a real pane shows in steady (not driving) rain, and it is few enough that the eye
 * reads them one at a time instead of as texture.
 *
 * The wake is **cut to the tile height**: a trail is generated from the head upward until it runs
 * out of drops or out of tile, so scrolling the layer by whole tiles never reveals a cut end.
 */
export function runnelField(count = 4, seed = 0x51ea3): Runnel[] {
  const rnd = mulberry32(seed)
  const out: Runnel[] = []
  for (let i = 0; i < count; i++) {
    const cx = (i + 0.25 + rnd() * 0.5) / count
    const headR = 0.03 + rnd() * 0.018
    const head: Droplet = { cx, cy: rnd(), r: headR, bulge: 0.62 }
    const tail: Droplet[] = []
    // The wake is what the head failed to carry: each bead is smaller and a little off-axis,
    // because a real runnel wanders around the pinning sites it passes rather than falling straight.
    // The wake is ABOVE the head (tile `cy` runs 0 at the top to 1 at the bottom, matching the
    // painter's row order), because the head is the lowest point of a drop that is falling.
    let y = head.cy
    let r = headR
    let travelled = 0
    while (r > 0.004 && travelled < 0.9) {
      const step = r * (1.6 + rnd() * 1.4)
      y -= step
      travelled += step
      r *= 0.78 + rnd() * 0.12
      tail.push({ cx: cx + (rnd() - 0.5) * headR * 0.9, cy: ((y % 1) + 1) % 1, r, bulge: 0.68 })
    }
    out.push({ head, tail })
  }
  return out
}

/** Flatten a runnel set into one wrap-duplicated droplet list, ready for the painter. */
export function runnelDroplets(runnels: Runnel[]): Droplet[] {
  const out: Droplet[] = []
  for (const t of runnels) {
    withWraps(out, t.head)
    for (const d of t.tail) withWraps(out, d)
  }
  return out
}
