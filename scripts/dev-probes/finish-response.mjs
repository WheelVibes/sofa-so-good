/**
 * Traced response of the CEILING to a finish change — the reference `(s)` has to hit.
 *
 * Give it two renders of the same room and pose differing only in a finish, and it reports the
 * ceiling's luminance change and its R−B shift. Written for item `(s)` ALBEDO-FILL, whose whole
 * premise is that the app has no colour bleed at all: repaint a wall and nothing else notices.
 *
 * **Reproduces the documented traced response independently** (`v0.31.7.134`). On a Cycles A/B of
 * `livingDining` with `wall-paint-terracotta`, this measured **−17.4 %** ceiling luminance and
 * **+16.4** counts of R−B, against `v0.31.5.270`/`.271`'s recorded 16–20 % darkening and +8.8 to
 * +13.5 warming. Same sign, same order, from a separate pipeline — which is what makes it usable as
 * a target rather than a number to be matched.
 *
 * The ceiling band is the top 14 % of the frame, which at the canonical pose is ceiling throughout.
 * That is crude and deliberate: a geometric mask would be better, and the quantity of interest is a
 * RATIO between two frames at an identical pose, so any consistent band cancels the framing.
 *
 * Usage: `node scripts/dev-probes/finish-response.mjs <base.png> <changed.png>`
 */
import sharp from 'sharp'

const files = process.argv.slice(2)
const out = []
for (const f of files) {
  const meta = await sharp(f).metadata()
  const H = meta.height,
    W = meta.width
  const band = async (y0, y1) => {
    const { data } = await sharp(f)
      .extract({ left: 0, top: y0, width: W, height: y1 - y0 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    let l = 0,
      rb = 0,
      n = 0
    for (let i = 0; i < data.length; i += 3) {
      l += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      rb += data[i] - data[i + 2]
      n++
    }
    return { lum: l / n, rb: rb / n }
  }
  const ceil = await band(0, Math.round(H * 0.14))
  const whole = await band(0, H)
  out.push({ f: f.split('/').pop(), ceilLum: ceil.lum, ceilRB: ceil.rb, wholeLum: whole.lum })
}
console.log(
  `${'file'.padEnd(16)} ${'ceilLum'.padStart(8)} ${'ceilR-B'.padStart(8)} ${'wholeLum'.padStart(9)}`,
)
for (const o of out)
  console.log(
    `${o.f.padEnd(16)} ${o.ceilLum.toFixed(2).padStart(8)} ${o.ceilRB.toFixed(2).padStart(8)} ${o.wholeLum.toFixed(2).padStart(9)}`,
  )
if (out.length === 2) {
  const [a, b] = out
  console.log(`\nCycles response to terracotta walls:`)
  console.log(
    `  ceiling luminance  ${a.ceilLum.toFixed(2)} -> ${b.ceilLum.toFixed(2)}  = ${(100 * (b.ceilLum / a.ceilLum - 1)).toFixed(1)}%`,
  )
  console.log(
    `  ceiling R-B        ${a.ceilRB.toFixed(2)} -> ${b.ceilRB.toFixed(2)}  = ${b.ceilRB - a.ceilRB >= 0 ? '+' : ''}${(b.ceilRB - a.ceilRB).toFixed(2)} counts`,
  )
  console.log(
    `  whole frame        ${a.wholeLum.toFixed(2)} -> ${b.wholeLum.toFixed(2)}  = ${(100 * (b.wholeLum / a.wholeLum - 1)).toFixed(1)}%`,
  )
}
