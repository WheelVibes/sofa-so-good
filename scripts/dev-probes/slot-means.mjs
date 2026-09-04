/**
 * Mean baked value PER ATLAS SLOT for one or more lightmap keys.
 *
 * **Why this exists.** `v0.31.7.100`/`.101` chased a UV-vs-data mismatch through
 * two wrong hypotheses (row flip, then axis permutation) because the evidence was
 * always an aggregate or a picture. The bake assigns UVs to all six slots of a
 * closed box — measured directly — so the remaining question is not *where the
 * UVs point* but *what value each slot holds*. Six numbers per key answers it
 * without another render.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readRed } from './read-image.mjs'

const dir = process.argv[2] ?? 'public/assets/lightmaps'
const only = (process.argv[3] ?? '').split(',').filter(Boolean)

const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
const files = readdirSync(dir).filter((f) => f.endsWith('.png'))
const picked = only.length
  ? files.filter((f) => only.some((k) => f.includes(k)))
  : files.slice(0, 12)

/**
 * Pixel rect of atlas slot `(col, row)` in a `width x height` PNG.
 *
 * **The one thing to get right.** UV `v = 0` is the BOTTOM of the texture and
 * PNG row 0 is the TOP, so slot row 0 occupies the LOWER half of the image.
 * `v0.31.7.101` retracted a whole finding to a version of this that had the
 * flip backwards, so it is a named, tested function rather than inline algebra.
 */
export function slotRect(col, row, width, height) {
  return {
    x0: Math.round((col * width) / 3),
    x1: Math.round(((col + 1) * width) / 3),
    y0: Math.round(((1 - row) * height) / 2),
    y1: Math.round(((2 - row) * height) / 2),
  }
}

if (process.argv[1]?.endsWith('slot-means.mjs')) await main()

async function main() {
  // Inside `main`, not at module scope: `/tmp/agg.mjs` imported `slotRect` from
  // here and got this probe's header printed into its own output.
  console.log(`pass=${index.pass} dir=${dir} files=${picked.length}`)
  console.log(
    `${'file'.padEnd(26)} ${'res'.padEnd(9)}  slot means (col,row) 0,0 0,1 1,0 1,1 2,0 2,1   zeroSlots`,
  )
  for (const f of picked.sort()) {
    const { v: data, w: width, h: height, max } = await readRed(join(dir, f))
    const means = []
    let zero = 0
    for (let col = 0; col < 3; col += 1) {
      for (let row = 0; row < 2; row += 1) {
        // PNG row 0 is the TOP; UV v = 0 is the BOTTOM. Slot row 0 (v low) is
        // therefore the LOWER half of the image. Getting this backwards is the
        // exact bug `.101` retracted, so it is spelled out rather than inferred.
        const { x0, x1, y0, y1 } = slotRect(col, row, width, height)
        let sum = 0
        let n = 0
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            sum += data[y * width + x]
            n += 1
          }
        }
        const m = n ? (sum / n / max) * 255 : 0
        means.push(m)
        if (m < 1) zero += 1
      }
    }
    const cells = means.map((m) => m.toFixed(1).padStart(6)).join('')
    console.log(`${f.padEnd(26)} ${`${width}x${height}`.padEnd(9)} ${cells}   ${zero}`)
  }
}
