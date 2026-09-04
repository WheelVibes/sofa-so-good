/**
 * How many Cycles sky equirects does `(z)`4 need?
 *
 * **The question this answers.** Item `(l)`'s fix is "ship the Cycles sky AND `backgroundIntensity`
 * ~4" — and neither works alone, so the physical sky is required. But the sun moves, so one baked
 * equirect will not do, and the design call was between a **baked key set with interpolation** and
 * an in-app Nishita implementation. That call is only a judgement if nobody measures the
 * interpolation error; with a number it is arithmetic.
 *
 * Renders are cheap enough to make this trivial: eight 512x256 equirects at 32 samples took
 * **17 seconds** on the GPU, so the measurement costs less than arguing about it.
 *
 * Reports, per candidate key spacing, the error of linearly interpolating the two neighbouring keys
 * against a directly-baked ground truth at the midpoint — in mean absolute counts and as a
 * percentage of the frame mean.
 */
import sharp from 'sharp'

const read = async (f) => {
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, n: info.width * info.height * info.channels, info }
}

/**
 * Mean abs difference between `mid` and the average of `lo`/`hi`, whole-frame AND on the regions a
 * window actually shows.
 *
 * **Why regions.** `(l)`'s target is the pane distribution through glazing, not the whole sky: a
 * window shows a narrow band around the horizon, which is the brightest and fastest-changing part of
 * the image. A whole-frame MAE averages that with the zenith and the ground half, both of which move
 * far less, so it can understate the error where it matters. `horizon` is rows 40-60 % of height
 * (the horizon sits at 50 % in an equirect); `bright10` is the top decile by value, wherever it is,
 * because a pane can face the sun.
 */
async function interpError(loF, midF, hiF) {
  const [lo, mid, hi] = await Promise.all([read(loF), read(midF), read(hiF)])
  const { width, height, channels } = mid.info
  const y0 = Math.round(height * 0.4)
  const y1 = Math.round(height * 0.6)
  let err = 0
  let sum = 0
  let bErr = 0
  let bSum = 0
  let bN = 0
  for (let i = 0; i < mid.n; i += 1) {
    // Linear in DISPLAY counts, which is what a texture lerp in the app would do.
    const e = Math.abs((lo.data[i] + hi.data[i]) / 2 - mid.data[i])
    err += e
    sum += mid.data[i]
    const row = Math.floor(i / (width * channels))
    if (row >= y0 && row < y1) {
      bErr += e
      bSum += mid.data[i]
      bN += 1
    }
  }
  const sorted = Array.from(mid.data.slice(0, mid.n)).sort((a, b) => b - a)
  const cut = sorted[Math.floor(sorted.length * 0.1)] ?? 255
  let hErr = 0
  let hSum = 0
  let hN = 0
  for (let i = 0; i < mid.n; i += 1) {
    if (mid.data[i] < cut) continue
    hErr += Math.abs((lo.data[i] + hi.data[i]) / 2 - mid.data[i])
    hSum += mid.data[i]
    hN += 1
  }
  return {
    mae: err / mid.n,
    mean: sum / mid.n,
    bandMae: bN ? bErr / bN : 0,
    bandMean: bN ? bSum / bN : 0,
    hiMae: hN ? hErr / hN : 0,
    hiMean: hN ? hSum / hN : 0,
  }
}

const cases = [
  { label: '15° keys, midpoint 7.5°', lo: 0, mid: 7.5, hi: 15 },
  { label: '15° keys, midpoint 22.5°', lo: 15, mid: 22.5, hi: 30 },
  { label: '30° keys, midpoint 15°', lo: 0, mid: 15, hi: 30 },
  { label: '30° keys, midpoint 45°', lo: 30, mid: 45, hi: 60 },
  { label: '60° keys, midpoint 30°', lo: 0, mid: 30, hi: 60 },
  { label: '30° keys, midpoint 60°', lo: 45, mid: 60, hi: 75 },
]
const dir = process.argv[2] ?? '/tmp/sky'
console.log(
  `${'case'.padEnd(30)} ${'all %'.padStart(7)} ${'horizon %'.padStart(10)} ${'bright10 %'.padStart(11)}`,
)
for (const c of cases) {
  const r = await interpError(`${dir}/a${c.lo}.png`, `${dir}/a${c.mid}.png`, `${dir}/a${c.hi}.png`)
  const pct = (e, m) => (m ? ((100 * e) / m).toFixed(2) : '-')
  console.log(
    `${c.label.padEnd(30)} ${pct(r.mae, r.mean).padStart(7)} ${pct(r.bandMae, r.bandMean).padStart(10)} ${pct(r.hiMae, r.hiMean).padStart(11)}`,
  )
}
