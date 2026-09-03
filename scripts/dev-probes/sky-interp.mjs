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
  return { data, n: info.width * info.height * info.channels }
}

/** Mean abs difference between `mid` and the average of `lo`/`hi`, and `mid`'s own mean. */
async function interpError(loF, midF, hiF) {
  const [lo, mid, hi] = await Promise.all([read(loF), read(midF), read(hiF)])
  let err = 0
  let sum = 0
  for (let i = 0; i < mid.n; i += 1) {
    // Linear in DISPLAY counts, which is what a texture lerp in the app would do.
    err += Math.abs((lo.data[i] + hi.data[i]) / 2 - mid.data[i])
    sum += mid.data[i]
  }
  return { mae: err / mid.n, mean: sum / mid.n }
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
  `${'case'.padEnd(30)} ${'MAE'.padStart(7)} ${'mean'.padStart(7)} ${'MAE %'.padStart(7)}`,
)
for (const c of cases) {
  const r = await interpError(`${dir}/a${c.lo}.png`, `${dir}/a${c.mid}.png`, `${dir}/a${c.hi}.png`)
  console.log(
    `${c.label.padEnd(30)} ${r.mae.toFixed(2).padStart(7)} ${r.mean.toFixed(1).padStart(7)} ${((100 * r.mae) / r.mean).toFixed(1).padStart(6)}%`,
  )
}
