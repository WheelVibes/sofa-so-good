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
/** Below this fraction of full scale a texel renders as black. */
const DARK = 0.002

export async function ringZeros(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.png'))
  let zero = 0
  let total = 0
  let dirty = 0
  for (const f of files) {
    const { v, w, h, max } = await readRed(join(dir, f))
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
          for (let x = ix0 + 2; x < ix1 - 2; x += 1) if (v[y * w + x] / max >= DARK) interior += 1
        if (interior === 0) continue
        for (let y = iy0; y < iy1; y += 1) {
          for (let x = ix0; x < ix1; x += 1) {
            if (!(x < ix0 + 1 || x >= ix1 - 1 || y < iy0 + 1 || y >= iy1 - 1)) continue
            total += 1
            if (v[y * w + x] / max < DARK) {
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
