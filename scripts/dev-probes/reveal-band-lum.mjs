/**
 * Band-vs-adjacent luminance for WALL-REVEAL-DEPTH-PREPASS.
 *
 * The corner artefact this measures is a DOUBLE-COMPOSITED strip a few pixels wide at a corner
 * where walls of different thickness meet, so a whole-frame mean says nothing about it (the
 * measured img-diff over the pair is ~0.7 counts while the strip itself moves by tens). The
 * comparison that IS valid is the strip against the single-layer pixels immediately beside it on
 * the SAME wall: same wall, same lighting, same content behind, so the only difference is how
 * many times the faded wall's alpha was applied.
 *
 * The pixel SETS come from the verify scenario's raycast probe, which classifies each sampled
 * pixel by whether the nearest faded wall SURFACE belongs to the faded wall with the lowest
 * (earliest-drawn) `renderOrder`. Where it does not, the per-object front-to-back order of
 * WALL-REVEAL-SINGLE-LAYER is inverted at that pixel and the alpha accumulates — that is the
 * band. `renderOrder` is untouched by the pre-pass, so both arms classify the same pixels and
 * the comparison is a true A/B.
 *
 *   node scripts/dev-probes/reveal-band-lum.mjs <scenario.log> <out-dir> '<{"pose":"file.png"}>'
 */
import { readFileSync } from 'node:fs'
import process from 'node:process'
import sharp from 'sharp'

const [logPath, dir, prefixMap] = process.argv.slice(2)
if (!logPath || !dir || !prefixMap) {
  console.error('usage: reveal-band-lum.mjs <scenario.log> <out-dir> \'<{"pose":"file.png"}>\'')
  process.exit(1)
}
const log = readFileSync(logPath, 'utf8')
const poses = {}
for (const line of log.split('\n')) {
  const b = /\[probe\] band-band (\S+) (\[.*\])$/.exec(line)
  if (b) {
    poses[b[1]] ??= {}
    poses[b[1]].band = JSON.parse(b[2])
  }
  const o = /\[probe\] band-ok (\S+) (\[.*\])$/.exec(line)
  if (o) {
    poses[o[1]] ??= {}
    poses[o[1]].ok = JSON.parse(o[2])
  }
}
const files = JSON.parse(prefixMap)
// Rec. 709 luma — the band reads as a tonal step, not a hue shift.
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
// How far beside the band an "adjacent" sample may sit. Small, so it stays on the same wall.
const ADJACENT_PX = 6

for (const [pose, sets] of Object.entries(poses)) {
  if (!files[pose]) continue
  const { data, info } = await sharp(`${dir}/${files[pose]}`)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const at = ([x, y]) => {
    const i = (y * info.width + x) * info.channels
    return luma(data[i], data[i + 1], data[i + 2])
  }
  const band = new Set(sets.band.map(([x, y]) => `${x},${y}`))
  const adjacent = sets.ok.filter(([x, y]) => {
    for (let dy = -ADJACENT_PX; dy <= ADJACENT_PX; dy++)
      for (let dx = -ADJACENT_PX; dx <= ADJACENT_PX; dx++)
        if (band.has(`${x + dx},${y + dy}`)) return true
    return false
  })
  const mean = (a) => a.reduce((s, p) => s + at(p), 0) / (a.length || 1)
  const b = mean(sets.band)
  const a = mean(adjacent)
  // SAME-ROW pairing. The whole-set means above mix rows, and at a corner the band's background
  // (floor, sofa, wall beyond) is NOT the background of the pixels above and below it — measured,
  // band and adjacent differ by ~17 counts even with the artefact gone, which is scene content,
  // not compositing. Pairing each band sample with the nearest single-layer sample on its OWN ROW
  // holds the wall, the height and the background approximately fixed, which is the only form of
  // the comparison that isolates the layer count.
  const rows = new Map()
  for (const [x, y] of sets.ok) {
    if (!rows.has(y)) rows.set(y, [])
    rows.get(y).push(x)
  }
  const pairs = []
  for (const [x, y] of sets.band) {
    const row = rows.get(y)
    if (!row) continue
    let best = null
    let bd = Infinity
    for (const xx of row) {
      const d = Math.abs(xx - x)
      if (d >= 2 && d <= 12 && d < bd) {
        bd = d
        best = xx
      }
    }
    if (best !== null) pairs.push([x, y, best])
  }
  const paired =
    pairs.reduce((s, [x, y, xx]) => s + Math.abs(at([x, y]) - at([xx, y])), 0) / (pairs.length || 1)
  console.log(
    `${pose}  band n=${sets.band.length} mean=${b.toFixed(2)}  adjacent n=${adjacent.length} mean=${a.toFixed(2)}  |band-adjacent|=${Math.abs(b - a).toFixed(2)}  same-row paired n=${pairs.length} mean|band-adjacent|=${paired.toFixed(2)}`,
  )
}
