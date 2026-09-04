/**
 * Fraction of the OUTERMOST ADDRESSABLE texel ring that is unwritten, per lightmap set.
 *
 * **What this measures and why it is the right thing to measure.** `computeBoxAtlasUv` maps a
 * face's bounding-box-normalised coordinates into the band `[margin, 1-margin]` of its atlas slot,
 * so a face's silhouette edge samples the band's outermost texels. If those were never shaded, the
 * edge renders black — which `v0.31.7.125` identified as the dotted seam down a column, after
 * coverage, per-map scale and margin mismatch had each been refuted.
 *
 * Populated slots only: an empty slot's ring is trivially zero and no face ever samples it, so
 * counting those inflated the first figure from 33.7 % to 58.9 %.
 *
 * Cheap on purpose — it reads PNGs and needs no render, so a padding change can be evaluated
 * without a browser or a pose.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readRed } from './read-image.mjs'
import { slotRect } from './slot-means.mjs'

/** Must match `lightmapUv.ts:LIGHTMAP_UV_MARGIN` and the bake's `make_box_uvs`. */
const UV_MARGIN = 0.04
/**
 * A texel is a HOLE only if it is exactly zero AND has a lit neighbour in the same slot.
 *
 * **The correction this encodes** (`v0.31.7.128`). The first version used a RELATIVE threshold,
 * `value / max < 0.002`. On an 8-bit file that is exactly zero -- fine -- but on a 16-bit file it
 * is anything under 131/65535, so a legitimately DARK texel counted as unwritten. That is why the
 * 8-bit and 16-bit arms both read 28.6 % and why `--fill-holes` appeared to miss its own target:
 * the fill writes a dark average into a dark region, which is CORRECT, and the metric called it a
 * failure. **The padding figures in `v0.31.7.125`-`.127` are measured against that flaw.**
 *
 * Adjacency is the other half. A legitimately empty slot is not a hole and no face samples it; a
 * zero next to real data is exactly the seam `?aoDebug=1` shows on a column edge.
 */
const HOLE_MAX = 0

export async function ringZeros(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.png'))
  let zero = 0
  let total = 0
  let dirty = 0
  for (const f of files) {
    // `max` deliberately unused: the corrected metric works in the FILE'S OWN units, because a
    // threshold relative to full scale is what made this probe wrong at 16-bit (see HOLE_MAX).
    const { v, w, h } = await readRed(join(dir, f))
    let fileZeros = 0
    for (let col = 0; col < 3; col += 1) {
      for (let row = 0; row < 2; row += 1) {
        const r = slotRect(col, row, w, h)
        const sw = r.x1 - r.x0
        const sh = r.y1 - r.y0
        const ix0 = r.x0 + Math.floor(UV_MARGIN * sw)
        const ix1 = r.x1 - Math.floor(UV_MARGIN * sw)
        const iy0 = r.y0 + Math.floor(UV_MARGIN * sh)
        const iy1 = r.y1 - Math.floor(UV_MARGIN * sh)
        let interior = 0
        for (let y = iy0 + 2; y < iy1 - 2; y += 1)
          for (let x = ix0 + 2; x < ix1 - 2; x += 1) if (v[y * w + x] > HOLE_MAX) interior += 1
        if (interior === 0) continue
        const lit = (x, y) =>
          x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1 && v[y * w + x] > HOLE_MAX
        for (let y = iy0; y < iy1; y += 1) {
          for (let x = ix0; x < ix1; x += 1) {
            if (!(x < ix0 + 1 || x >= ix1 - 1 || y < iy0 + 1 || y >= iy1 - 1)) continue
            total += 1
            if (v[y * w + x] > HOLE_MAX) continue
            // A zero with a lit neighbour IN THE SAME SLOT. A neighbour across a slot boundary is
            // a different face's data and is not fillable context.
            if (lit(x - 1, y) || lit(x + 1, y) || lit(x, y - 1) || lit(x, y + 1)) {
              zero += 1
              fileZeros += 1
            }
          }
        }
      }
    }
    if (fileZeros > 0) dirty += 1
  }
  return { files: files.length, total, zero, pct: total ? (100 * zero) / total : 0, dirty }
}

if (process.argv[1]?.endsWith('ring-zeros.mjs')) {
  for (const dir of process.argv.slice(2)) {
    const r = await ringZeros(dir)
    console.log(
      `${dir.padEnd(22)} maps=${String(r.files).padStart(4)}  ring=${String(r.total).padStart(7)}` +
        `  zero=${r.pct.toFixed(1).padStart(5)} %  maps with zeros=${r.dirty}/${r.files}`,
    )
  }
}
