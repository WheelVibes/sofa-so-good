/**
 * ABSOLUTE per-frame brightness across two whole tours — the regression check for a lighting change.
 *
 * Deliberately NOT `frame-compare.mjs`, which normalises both frames to a common median so it can
 * compare tonal SHAPE exposure-invariantly. That is the right tool for app-versus-reference, and
 * exactly the wrong one here: when the question is "did this change make the flat gloomy", the
 * absolute level IS the quantity, and normalising it away would report no change by construction.
 *
 * Written to check `v0.31.7.223` (`IRRADIANCE_GAIN` 6 -> 4.2), because a ~30 % cut to the baked
 * indirect is the kind of change that reads as correct on a measured patch and as GLOOM in the
 * product — this repo already has a DEFAULT-GLOOM item from a near-black night frame.
 *
 * Frames are matched by FILENAME across the two directories, so it pairs a `walk-tour.mjs` run
 * against a control run of the same tour. It sorts by the darkest frame in arm A, prints the
 * per-frame delta, and counts frames under 40 counts — a single number for "did anything fall off
 * a cliff" that a mean would hide.
 *
 * The crop skips the outer border, where the vignette pass darkens by design and the UI overlays
 * sit; both would otherwise dilute the comparison.
 *
 *     node scripts/dev-probes/tour-diff.mjs <dirA> <dirB>
 */
import { readdirSync } from 'node:fs'
import sharp from 'sharp'

const [a, b] = [process.argv[2], process.argv[3]]
// Labels from the DIRECTORY NAMES. They were hardcoded as `gain4.2`/`gain6` for the change this
// probe was written for, and printed those headings for an unrelated gap-ceiling comparison — a
// caption that names the wrong variable is how a correct measurement gets filed under the wrong
// conclusion.
const [la, lb] = [a, b].map((d) => d.replace(/\/+$/, '').split('/').pop().slice(0, 12))
const files = readdirSync(a)
  .filter((f) => f.endsWith('.png'))
  .sort()
const rows = []
for (const f of files) {
  const stat = async (dir) => {
    const { data, info } = await sharp(`${dir}/${f}`)
      .extract({ left: 300, top: 200, width: 1960, height: 1100 })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true })
    let s = 0
    for (let i = 0; i < data.length; i++) s += data[i]
    return s / (info.width * info.height)
  }
  rows.push({ f: f.replace('.png', ''), A: await stat(a), B: await stat(b) })
}
rows.sort((x, y) => x.A - y.A)
console.log(`${'frame'.padEnd(20)} ${la.padStart(8)} ${lb.padStart(8)} ${'delta'.padStart(7)}`)
for (const r of rows)
  console.log(
    `${r.f.padEnd(20)} ${r.A.toFixed(1).padStart(8)} ${r.B.toFixed(1).padStart(8)} ${(r.A - r.B).toFixed(1).padStart(7)}`,
  )
const mA = rows.reduce((s, r) => s + r.A, 0) / rows.length
const mB = rows.reduce((s, r) => s + r.B, 0) / rows.length
console.log(
  `\nMEAN over ${rows.length} frames: ${la} ${mA.toFixed(1)}  ${lb} ${mB.toFixed(1)}  delta ${(mA - mB).toFixed(1)}`,
)
console.log(`darkest frame: ${rows[0].f} at ${rows[0].A.toFixed(1)} (was ${rows[0].B.toFixed(1)})`)
console.log(
  `frames under 40 counts: ${la} ${rows.filter((r) => r.A < 40).length}  ${lb} ${rows.filter((r) => r.B < 40).length}`,
)
