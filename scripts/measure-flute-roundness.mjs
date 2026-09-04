/**
 * Measure how ROUND a fluted panel's ribs read in a screenshot.
 *
 * Usage:
 *   node scripts/measure-flute-roundness.mjs <label>=<png> [<label>=<png> …]
 *
 * ## Why this exists — `ripple/px` is backwards for this question
 *
 * The painted-flute thread (v0.31.8.79 → .96) quoted a `ripple/px` figure: the
 * mean absolute difference between horizontally adjacent pixels. That metric
 * **rewards hard-edged stripes and penalises smooth gradients**, which is the
 * opposite of "reads as a round rib": a crisp flat stripe scores HIGH and a
 * properly shaded half-round scores LOW. v0.31.8.96 measured an experimental
 * `aoMap` at ripple 2.048 → 1.031 and would have called that a 2x regression,
 * when what actually happened was a 3x loss of rib CONTRAST — a different fault
 * that the number cannot distinguish. The TODO already warned the figure
 * conflated grain with form; it is worse than that, it is anti-correlated.
 *
 * ## What this measures instead
 *
 * Averages every scanline in the crop into one row, finds the rib period by
 * maximising folded variance, folds the row onto that period, and reports:
 *
 *   - `amp`       peak-to-trough of the folded per-rib profile. This is rib
 *                 CONTRAST — whether the ribs are distinguishable at all.
 *   - `roundness` corr(profile, cosine) − corr(profile, square). Positive means
 *                 the profile is shaped like a shaded cylinder; negative means
 *                 it is shaped like a printed stripe.
 *
 * Both matter and they are independent: a change can raise contrast while making
 * the profile MORE square (worse), which is exactly what a naive metric hides.
 *
 * The default crop is the head-on region of
 * `scripts/scenarios/feature-wall-finishes.json` at its recorded camera — the
 * face-on part is the whole difficulty, since the oblique third already reads.
 */
import sharp from 'sharp'

/** Head-on region of the panel in the `feature-wall-finishes` frame. */
const CROP = { left: 360, top: 200, width: 620, height: 740 }
const MIN_PERIOD = 6
const MAX_PERIOD = 40

function fold(row, period) {
  const acc = new Array(period).fill(0)
  const count = new Array(period).fill(0)
  for (let x = 0; x < row.length; x++) {
    acc[x % period] += row[x]
    count[x % period] += 1
  }
  return acc.map((v, i) => v / count[i])
}

/** The period whose folded profile has the most variance — i.e. the rib pitch. */
function bestPeriod(row) {
  let best = -1
  let bestPeriod = MIN_PERIOD
  for (let p = MIN_PERIOD; p <= MAX_PERIOD; p++) {
    const f = fold(row, p)
    const mean = f.reduce((a, b) => a + b, 0) / f.length
    const variance = f.reduce((a, b) => a + (b - mean) ** 2, 0) / f.length
    if (variance > best) {
      best = variance
      bestPeriod = p
    }
  }
  return bestPeriod
}

function corr(a, b) {
  const ma = a.reduce((x, y) => x + y, 0) / a.length
  const mb = b.reduce((x, y) => x + y, 0) / b.length
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return num / Math.sqrt(da * db)
}

async function profileFor(file) {
  const { data, info } = await sharp(file)
    .extract(CROP)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const row = new Array(info.width).fill(0)
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) row[x] += data[y * info.width + x] / info.height
  }
  const period = bestPeriod(row)
  const folded = fold(row, period)
  // Rotate the peak to index 0 so the cosine/square references line up.
  const peak = folded.indexOf(Math.max(...folded))
  const g = folded.map((_, i) => folded[(i + peak) % period])
  const cosine = g.map((_, i) => Math.cos((2 * Math.PI * i) / period))
  const square = g.map((_, i) => (i < period / 4 || i >= (3 * period) / 4 ? 1 : -1))
  return {
    period,
    amp: Math.max(...g) - Math.min(...g),
    roundness: corr(g, cosine) - corr(g, square),
  }
}

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('usage: node scripts/measure-flute-roundness.mjs <label>=<png> [...]')
  process.exit(1)
}
for (const arg of args) {
  const eq = arg.indexOf('=')
  const label = eq === -1 ? arg : arg.slice(0, eq)
  const file = eq === -1 ? arg : arg.slice(eq + 1)
  const r = await profileFor(file)
  console.log(
    `${label.padEnd(24)} period=${r.period}px  amp=${r.amp.toFixed(2)}  roundness=${r.roundness.toFixed(3)}`,
  )
}
