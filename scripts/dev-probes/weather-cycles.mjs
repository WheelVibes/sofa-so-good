/**
 * WEATHER-CYCLES — what the four weather worlds do to the INTERIOR, measured in linear.
 *
 * Reads the `wl-<condition>.png` set written by
 * `python/scripts/blender/render_weather.py --linear-stops <s>` — 16-bit PNGs rendered through
 * Blender's `Standard` view transform at a fixed exposure offset, so
 * `linear = srgb_to_linear(value) * 2^-s` exactly. **Everything here is in scene-linear**, which
 * AGX-PARITY (`v0.34.1.0`) makes mandatory: Blender's AgX and three's differ by up to 14 counts
 * on the neutral axis, so a ratio taken in displayed counts is not a ratio of light.
 *
 * **The question this answers, and the reason the app cannot answer it.** An overcast sky moves
 * energy out of the direct beam and into the dome; it does not simply dim everything. Outdoors
 * that trade is published (Kasten & Czeplak — see `weather_sky.py`). INDOORS it is not, because a
 * room is lit through an aperture: the beam reaches a small patch while the dome fills the whole
 * window, so the interior does not follow the exterior ratio. That indoor ratio is the number the
 * app's grade has to reproduce, and Cycles is the only thing here that can supply it.
 *
 * **Masks.** Three regions are excluded, and every arm gets the identical mask:
 *   · `glazing`  — the window, which is the SKY, not the room. Including it measures the weather
 *                  twice and swamps the interior (a clear-sky aperture is orders of magnitude
 *                  brighter than a wall).
 *   · `screen`   — the TV, an exported emissive that is constant across arms and would damp every
 *                  ratio toward 1.
 *   · `cove`     — the warm emissive strip along the ceiling, same argument.
 * They are RECTANGLES read off the rendered frame and are valid for ONE pose, which is this arc's
 * standing rule for any region set. `--mark` writes them onto a frame so they can be checked by
 * eye before any number from them is believed.
 *
 * **Controls that must hold, or the run is not evidence:**
 *   · `clear / clear = 1.000` on every statistic (it is the same file, so this only proves the
 *     arithmetic — quoted anyway, because a normalisation bug shows up here first).
 *   · The EXTERIOR (glazing region) ratios must land near the Kasten & Czeplak transmittances the
 *     worlds were calibrated to. If they do not, the sky did not reach the render and the interior
 *     numbers are measuring something else.
 *
 *   node scripts/dev-probes/weather-cycles.mjs --dir /tmp/weather/walk --stops 3 --mark
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

export const CONDITIONS = ['clear', 'partlyCloudy', 'overcast', 'rain']

/** Exclusions for the default-flat `living-far` WALK pose (10.87, 5.125, yaw 0, pitch −0.02). */
export const WALK_EXCLUDE = [
  { name: 'glazing', x: 0.325, y: 0.28, w: 0.36, h: 0.44 },
  { name: 'screen', x: 0.145, y: 0.42, w: 0.18, h: 0.28 },
  { name: 'cove', x: 0.6, y: 0.0, w: 0.4, h: 0.3 },
]

/**
 * Exclusions for the ORBIT pose. The dollhouse is a section cut seen from outside, so most of the
 * frame is sky and ground rather than room — the useful crop is the flat itself, and everything
 * outside it is excluded rather than a handful of features.
 */
export const ORBIT_EXCLUDE = [
  { name: 'outside-left', x: 0.0, y: 0.0, w: 0.26, h: 1.0 },
  { name: 'outside-right', x: 0.83, y: 0.0, w: 0.17, h: 1.0 },
  { name: 'outside-top', x: 0.0, y: 0.0, w: 1.0, h: 0.18 },
  { name: 'outside-bottom', x: 0.0, y: 0.84, w: 1.0, h: 0.16 },
]

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** Decode a 16-bit PNG to scene-linear RGB. `toColourspace('rgb16')` is load-bearing —
 *  `raw({depth:'ushort'})` alone silently hands back 8-bit values in 16-bit slots on this build
 *  (verified: max 255 across a frame that plainly contains white). */
export async function readLinear(file, stops) {
  const { data, info } = await sharp(file)
    .toColourspace('rgb16')
    .removeAlpha()
    .raw({ depth: 'ushort' })
    .toBuffer({ resolveWithObject: true })
  const n = info.width * info.height
  const gain = 2 ** -stops
  const rgb = new Float64Array(n * 3)
  // The ENCODED extremes are kept so `stats` can report how much of each distribution sits on the
  // floor or the ceiling of the 16-bit file. A percentile taken from a crushed or clipped
  // distribution is a property of the exposure offset, not of the light — and this run has already
  // produced one table where every `p95` read exactly `2^-stops` because the frame was blown.
  const enc = new Uint16Array(n)
  for (let p = 0; p < n; p++) {
    let mx = 0
    for (let c = 0; c < 3; c++) {
      const v = data.readUInt16LE((p * 3 + c) * 2)
      if (v > mx) mx = v
      rgb[p * 3 + c] = srgbToLinear(v / 65535) * gain
    }
    enc[p] = mx
  }
  return { w: info.width, h: info.height, rgb, enc }
}

export function buildMask(w, h, regions, invert = false) {
  const mask = new Uint8Array(w * h).fill(invert ? 0 : 1)
  for (const r of regions) {
    const x0 = Math.round(r.x * w)
    const y0 = Math.round(r.y * h)
    const x1 = Math.min(w, x0 + Math.round(r.w * w))
    const y1 = Math.min(h, y0 + Math.round(r.h * h))
    for (let y = Math.max(0, y0); y < y1; y++)
      for (let x = Math.max(0, x0); x < x1; x++) mask[y * w + x] = invert ? 1 : 0
  }
  return mask
}

const REC709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

export function stats(frame, mask) {
  const { w, h, rgb, enc } = frame
  const lum = []
  let rs = 0
  let gs = 0
  let bs = 0
  let floorHits = 0
  let ceilHits = 0
  for (let p = 0; p < w * h; p++) {
    if (!mask[p]) continue
    const r = rgb[p * 3]
    const g = rgb[p * 3 + 1]
    const b = rgb[p * 3 + 2]
    lum.push(REC709(r, g, b))
    rs += r
    gs += g
    bs += b
    if (enc) {
      if (enc[p] === 0) floorHits++
      else if (enc[p] >= 65530) ceilHits++
    }
  }
  lum.sort((a, b) => a - b)
  const n = lum.length
  const q = (f) => lum[Math.min(n - 1, Math.floor(n * f))]
  const decile = (lo, hi) => {
    let s = 0
    const a = Math.floor(n * lo)
    const b = Math.floor(n * hi)
    for (let i = a; i < b; i++) s += lum[i]
    return s / Math.max(1, b - a)
  }
  const mean = lum.reduce((s, v) => s + v, 0) / n
  const meanLum = REC709(rs / n, gs / n, bs / n)
  return {
    n,
    mean,
    /** Fraction of masked pixels on the encoding's floor / ceiling. Read these FIRST. */
    onFloor: floorHits / n,
    onCeil: ceilHits / n,
    p05: q(0.05),
    p50: q(0.5),
    p95: q(0.95),
    // The DIRECT-BEAM signature: a sun patch makes the brightest tenth of the room far brighter
    // than the darkest tenth. Under a dome the two converge. Both deciles are interior-only, so
    // this cannot be moved by the window.
    top10: decile(0.9, 1.0),
    bottom10: decile(0.0, 0.1),
    // Chroma carried as a LUMINANCE-NORMALISED difference so it is a colour statement and not a
    // brightness one — the same normalisation `altitudeCurve.ts:daytimeSkyTint` uses.
    warmth: meanLum > 0 ? (rs / n - bs / n) / meanLum : 0,
    rOverL: meanLum > 0 ? rs / n / meanLum : 1,
    bOverL: meanLum > 0 ? bs / n / meanLum : 1,
  }
}

async function markRegions(file, out, regions) {
  const meta = await sharp(file).metadata()
  const rects = regions
    .map((r) => {
      const x = Math.round(r.x * meta.width)
      const y = Math.round(r.y * meta.height)
      const w = Math.round(r.w * meta.width)
      const h = Math.round(r.h * meta.height)
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ff00ff" fill-opacity="0.4" stroke="#ff00ff" stroke-width="2"/><text x="${x + 4}" y="${y + 14}" fill="#fff" font-size="12" font-family="monospace">${r.name}</text>`
    })
    .join('')
  await sharp(file)
    .toColourspace('srgb')
    .composite([
      {
        input: Buffer.from(`<svg width="${meta.width}" height="${meta.height}">${rects}</svg>`),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toFile(out)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
  const dir = arg('--dir', '/tmp/weather/walk')
  const stops = Number(arg('--stops', 3))
  const mode = arg('--mode', /orbit/.test(dir) ? 'orbit' : 'walk')
  const exclude = mode === 'orbit' ? ORBIT_EXCLUDE : WALK_EXCLUDE

  const frames = {}
  for (const c of CONDITIONS) {
    const f = path.join(dir, `wl-${c}.png`)
    if (!fs.existsSync(f)) throw new Error(`missing ${f} — run render_weather.py --linear-stops`)
    frames[c] = await readLinear(f, stops)
  }
  const { w, h } = frames.clear
  const interior = buildMask(w, h, exclude)
  const glazing = buildMask(
    w,
    h,
    exclude.filter((r) => r.name === 'glazing'),
    true,
  )

  if (args.includes('--mark')) {
    const out = path.join(dir, 'weather-mask.png')
    await markRegions(path.join(dir, 'wl-clear.png'), out, exclude)
    console.log(`mask -> ${out}`)
  }

  const rows = {}
  for (const c of CONDITIONS) rows[c] = stats(frames[c], interior)
  const base = rows.clear

  console.log(
    `\n${mode} pose: ${dir}   (${base.n} interior px of ${w * h}, linear, ${stops} stops)`,
  )
  const cols = ['mean', 'p05', 'p50', 'p95', 'top10', 'bottom10']
  console.log(
    'condition'.padEnd(14) +
      cols.map((k) => k.padStart(11)).join('') +
      'top10/bot10'.padStart(13) +
      'p95/p05'.padStart(10) +
      'R-B/L'.padStart(9),
  )
  for (const c of CONDITIONS) {
    const s = rows[c]
    console.log(
      c.padEnd(14) +
        cols.map((k) => s[k].toExponential(3).padStart(11)).join('') +
        (s.top10 / s.bottom10).toFixed(2).padStart(13) +
        (s.p95 / s.p05).toFixed(2).padStart(10) +
        s.warmth.toFixed(4).padStart(9) +
        `   floor ${(100 * s.onFloor).toFixed(2)}% ceil ${(100 * s.onCeil).toFixed(2)}%`,
    )
  }
  const worst = Math.max(...CONDITIONS.map((c) => Math.max(rows[c].onFloor, rows[c].onCeil)))
  if (worst > 0.02) {
    console.log(
      `\n  !! ${(100 * worst).toFixed(1)} % of masked pixels sit on the encoding floor or ` +
        'ceiling. Re-render with a different --linear-stops before quoting a percentile.',
    )
  }
  console.log('\nRATIOS to clear (interior):')
  console.log(
    'condition'.padEnd(14) + cols.map((k) => k.padStart(11)).join('') + 'warmth Δ'.padStart(11),
  )
  for (const c of CONDITIONS) {
    const s = rows[c]
    console.log(
      c.padEnd(14) +
        cols.map((k) => (s[k] / base[k]).toFixed(4).padStart(11)).join('') +
        (s.warmth - base.warmth).toFixed(4).padStart(11),
    )
  }

  if (mode === 'walk') {
    console.log('\nCONTROL — EXTERIOR (glazing region) mean, must track the calibrated sky:')
    const exts = {}
    for (const c of CONDITIONS) exts[c] = stats(frames[c], glazing)
    for (const c of CONDITIONS) {
      console.log(
        `  ${c.padEnd(14)} ${exts[c].mean.toExponential(3)}   ratio ${(
          exts[c].mean / exts.clear.mean
        ).toFixed(4)}`,
      )
    }
  }

  fs.writeFileSync(
    path.join(dir, 'weather-cycles.json'),
    JSON.stringify({ dir, mode, stops, exclude, rows }, null, 1),
  )
}
