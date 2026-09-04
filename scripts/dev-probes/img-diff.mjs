/**
 * Per-channel difference between two same-size images.
 *
 * For the question "did this change the picture?" when the two images are meant to
 * be IDENTICAL — a device switch, a refactor, a supposedly-equivalent flag. Reports
 * mean |diff|, the worst channel, the share of channels off by more than a
 * threshold, and each frame's own mean so a uniform shift is distinguishable from
 * localised disagreement.
 *
 * Not a substitute for looking at the frames: `v0.31.7.x` has several rounds where a
 * metric improved and the image got worse. Use it to decide whether looking is
 * necessary, and to put a number on "the same".
 *
 *   node scripts/dev-probes/img-diff.mjs a.png b.png [--tol=2]
 */
import process from 'node:process'
import sharp from 'sharp'

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--'))
if (files.length !== 2) {
  console.error('usage: img-diff.mjs <a.png> <b.png> [--tol=N]')
  process.exit(1)
}
const tolArg = args.find((a) => a.startsWith('--tol='))
const TOL = tolArg ? Number(tolArg.slice(6)) : 2

const load = async (f) => await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const [A, B] = await Promise.all(files.map(load))
if (A.info.width !== B.info.width || A.info.height !== B.info.height) {
  console.error(
    `size mismatch: ${A.info.width}x${A.info.height} vs ${B.info.width}x${B.info.height}`,
  )
  process.exit(1)
}

let sum = 0
let max = 0
let over = 0
let meanA = 0
let meanB = 0
const n = A.data.length
for (let i = 0; i < n; i++) {
  const d = Math.abs(A.data[i] - B.data[i])
  sum += d
  if (d > max) max = d
  if (d > TOL) over += 1
  meanA += A.data[i]
  meanB += B.data[i]
}
console.log(`  ${files[0]}  vs  ${files[1]}   ${A.info.width}x${A.info.height}`)
console.log(
  `  mean |diff| ${(sum / n).toFixed(3)} counts   max ${max}   channels >${TOL}: ${((100 * over) / n).toFixed(2)} %`,
)
console.log(
  `  own means: ${(meanA / n).toFixed(2)} vs ${(meanB / n).toFixed(2)}   delta ${((meanB - meanA) / n).toFixed(3)} counts`,
)
