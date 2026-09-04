/**
 * Did this screenshot render anything, or is it a loader / splash / blank?
 *
 * Usage:
 *   node scripts/measure-frame-detail.mjs <png|dir> [...]
 *   node scripts/measure-frame-detail.mjs /tmp/out            # every png in a dir
 *
 * ## Why this exists
 *
 * Three releases running, a scenario passed green while photographing something
 * that was not its subject: the walk/orbit transition splash (v0.31.8.88-.90),
 * then the BOOT LOADER in 489 of 495 screenshot-taking scenarios (v0.31.9.5-.6).
 * Both are silent — a `waitFor {css}` on a panel matches while the panel sits
 * behind the cover — so the only reliable tell was that the frame had almost no
 * detail in it.
 *
 * ## What it measures
 *
 * Mean absolute difference between horizontally adjacent pixels of the greyscale
 * frame, downsampled to 80x50 so it reads STRUCTURE and ignores texture noise.
 * A loader is a near-flat wash with one small glyph; a rendered scene or panel
 * has edges everywhere.
 *
 * Observed on this repo:
 *
 *   0.3 - 1.3   boot loader / transition splash / blank
 *   2.2 - 4.9   a rendered panel or UI-heavy frame
 *   6.9 - 10.0  a rendered 3D scene, or a panel full of swatches
 *
 * So `< 1.5` flags reliably and is what `--fail-under` defaults to. This is a
 * COVER detector, not a quality metric: a correctly-rendered but deliberately
 * plain frame (an empty-state panel on a flat background) can score low, so read
 * a flag as "look at this frame", not as "this frame is wrong".
 *
 * Exits non-zero if any frame is under the threshold, so a sweep can gate on it.
 */
import { readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import sharp from 'sharp'

const DOWN_W = 80
const DOWN_H = 50
const DEFAULT_FAIL_UNDER = 1.5

async function detail(file) {
  const { data, info } = await sharp(file)
    .greyscale()
    .resize(DOWN_W, DOWN_H, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  let sum = 0
  let n = 0
  for (let y = 0; y < info.height; y++) {
    for (let x = 1; x < info.width; x++) {
      sum += Math.abs(data[y * info.width + x] - data[y * info.width + x - 1])
      n += 1
    }
  }
  return n === 0 ? 0 : sum / n
}

function expand(target) {
  if (statSync(target).isDirectory()) {
    return readdirSync(target)
      .filter((f) => extname(f).toLowerCase() === '.png')
      .sort()
      .map((f) => join(target, f))
  }
  return [target]
}

const args = process.argv.slice(2)
let failUnder = DEFAULT_FAIL_UNDER
const targets = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--fail-under') {
    failUnder = Number(args[++i])
    continue
  }
  targets.push(args[i])
}
if (targets.length === 0) {
  console.error('usage: node scripts/measure-frame-detail.mjs <png|dir> [--fail-under 1.5]')
  process.exit(1)
}

let flagged = 0
for (const target of targets) {
  for (const file of expand(target)) {
    const d = await detail(file)
    const low = d < failUnder
    if (low) flagged += 1
    console.log(`${file.padEnd(64)} detail=${d.toFixed(2)}${low ? '  <-- NEAR BLANK' : ''}`)
  }
}
if (flagged > 0) {
  console.error(
    `\n${flagged} frame(s) under ${failUnder} — likely a loader/splash, not the subject.`,
  )
  process.exit(1)
}
