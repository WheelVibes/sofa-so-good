/**
 * REF-LINEAR-COMPARE — compare the app raster against a Cycles reference through the SAME tone
 * curve, which is the only way the comparison has ever been valid.
 *
 * **Why this exists.** Every app-vs-reference figure in the graphics-realism arc was taken in
 * displayed 8-bit counts, with the app's frame through three's AgX and the reference's through
 * Blender's. AGX-PARITY (v0.34.1.0) measured those two transforms against identical linear input
 * and found them up to 14 counts apart on the neutral axis and 44 in a channel on saturated
 * colour — so the two sets of counts were never the same quantity.
 *
 * The fix is not to invert AgX on the app frame (not a 1-D problem once a pixel has chroma) but to
 * take the reference's SCENE-REFERRED LINEAR buffer (`render_still.py --linear-exr`, written by
 * default through `render_from_manifest.py`) and push it through the APP'S transform
 * (`agx_three.py --image … --exposure <manifest.display.toneMappingExposure>`, a port verified
 * against a live three.js context to 0 counts on 1155 neutral channels and 1/159 on chroma).
 * Then both sides carry the identical curve and a count difference means something.
 *
 * **Patches, not a whole-frame crop.** The app and the reference do not show the same thing
 * through the window — the app renders the HDB estate backdrop, Cycles renders sky — so any crop
 * containing glazing measures the backdrop as if it were interior lighting. Patches are named,
 * interior-only, and clear of the HUD (the playbook's rule: a patch touching the HUD is invalid by
 * construction). `--mark` writes the patches onto both images so they can be checked by eye before
 * any number from them is believed.
 *
 * Usage:
 *   node scripts/dev-probes/ref-linear-compare.mjs --dir /tmp/bref --mark
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

/**
 * Regions EXCLUDED from the comparison, as fractions of the frame.
 *
 * The app raster and the reference render the identical exported scene, so the only structural
 * differences are (a) the app's HUD, which is opaque UI over the canvas, and (b) what is visible
 * THROUGH the glazing — the app draws the HDB estate backdrop where Cycles draws its physical sky.
 * Everything else is the same geometry, the same materials and the same camera, which makes a
 * whole-frame distribution over the remainder far more representative than a handful of patches.
 *
 * **This replaced a patch set.** Four hand-placed patches were tried first and three of them were
 * contaminated — `wall-left` straddled the TV, `floor-near` sat on the sideboard, `wall-right`
 * crossed a structural beam — which the sd guard flagged (33.9, 41.8) and the marked image
 * confirmed. Masking what actually differs needs no judgement about where a clean surface is.
 *
 * Valid for the default 4-room living/dining pose ONLY: a different pose puts the window
 * somewhere else, and the arc's standing rule is that a region set is verified for one pose.
 */
export const EXCLUDE = [
  { name: 'hud-toolbar', x: 0.34, y: 0.0, w: 0.32, h: 0.09 },
  { name: 'hud-measure', x: 0.9, y: 0.0, w: 0.1, h: 0.07 },
  { name: 'hud-minimap', x: 0.81, y: 0.79, w: 0.19, h: 0.21 },
  { name: 'hud-prompt', x: 0.42, y: 0.82, w: 0.19, h: 0.08 },
  // Generous: the estate backdrop and the sky disagree, and a few interior pixels lost to a wide
  // box costs far less than one column of backdrop counted as interior lighting.
  { name: 'glazing', x: 0.31, y: 0.22, w: 0.37, h: 0.47 },
]

export function toPixels(region, w, h) {
  return {
    left: Math.round(region.x * w),
    top: Math.round(region.y * h),
    width: Math.round(region.w * w),
    height: Math.round(region.h * h),
  }
}

/** `true` for pixels that take part in the comparison. */
export function buildMask(w, h, exclude = EXCLUDE) {
  const mask = new Uint8Array(w * h).fill(1)
  for (const r of exclude) {
    const p = toPixels(r, w, h)
    for (let y = p.top; y < Math.min(h, p.top + p.height); y++)
      for (let x = p.left; x < Math.min(w, p.left + p.width); x++) mask[y * w + x] = 0
  }
  return mask
}

async function maskedStats(file, w, h, mask) {
  const { data } = await sharp(file)
    .resize(w, h, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const lum = []
  let satSum = 0
  for (let i = 0, px = 0; px < w * h; px++, i += 3) {
    if (!mask[px]) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    lum.push(0.2126 * r + 0.7152 * g + 0.0722 * b)
    const mx = Math.max(r, g, b)
    satSum += mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx
  }
  lum.sort((a, b) => a - b)
  const q = (f) => +lum[Math.floor(lum.length * f)].toFixed(1)
  return {
    n: lum.length,
    p05: q(0.05),
    p25: q(0.25),
    p50: q(0.5),
    p75: q(0.75),
    p95: q(0.95),
    mean: +(lum.reduce((s, v) => s + v, 0) / lum.length).toFixed(1),
    sat: +(satSum / lum.length).toFixed(3),
  }
}

async function mark(file, out, w, h) {
  const rects = EXCLUDE.map((r) => {
    const p = toPixels(r, w, h)
    return `<rect x="${p.left}" y="${p.top}" width="${p.width}" height="${p.height}" fill="#ff00ff" fill-opacity="0.45" stroke="#ff00ff" stroke-width="2"/><text x="${p.left + 3}" y="${p.top + 13}" fill="#fff" font-size="11" font-family="monospace">${r.name}</text>`
  }).join('')
  await sharp(file)
    .resize(w, h, { fit: 'fill' })
    .composite([
      { input: Buffer.from(`<svg width="${w}" height="${h}">${rects}</svg>`), top: 0, left: 0 },
    ])
    .toFile(out)
}

/**
 * The CLI body is gated so the mask and the region table can be IMPORTED — by the unit test,
 * and by any probe that needs to exclude the same HUD and glazing. Running a comparison as a
 * side effect of `import` cost one debugging round already.
 */
async function main() {
  const args = process.argv.slice(2)
  const dir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : '/tmp/bref'
  const doMark = args.includes('--mark')

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  const app = path.join(dir, path.basename(manifest.raster ?? 'frame.png'))
  const refBlender = path.join(dir, 'cyc.png')
  const refThree = path.join(dir, 'cyc-three-agx.png')
  for (const f of [app, refBlender, refThree])
    if (!fs.existsSync(f))
      throw new Error(`missing ${f} — run render_from_manifest.py then agx_three.py`)

  // The reference's native size is the comparison grid: upsampling it to the raster's 2x would
  // invent detail, where downsampling the raster only averages what is there.
  const { width: W, height: H } = await sharp(refThree).metadata()

  /**
   * The TIER is printed first and loudly, because getting it wrong invalidates everything below
   * and the manifest has always carried it.
   *
   * The baked visibility lightmaps -- the app's entire interreflection term -- are gated to
   * `realistic` by intent (`VisibilityLightmaps.tsx`), and `light-distribution.mjs` defaults to
   * `TIER=performance`. So the DEFAULT invocation compares a reference against the one tier that
   * has no GI at all. That is not a hypothetical: the first run of this probe did exactly that and
   * reported a 36-count mean deficit as if it described the photoreal path, when the Realistic
   * figure is 4.7. `manifest.scene.tier` was sitting in the file the whole time and simply was not
   * read -- which is this repo's recurring lesson: prose cannot be the guard for something a
   * machine can check.
   */
  const tier = manifest.scene?.tier
  console.log(
    `scene: tier=${tier ?? 'UNKNOWN'} hour=${manifest.scene?.hour ?? '?'} plan=${manifest.scene?.plan?.id ?? '?'} room=${manifest.scene?.room ?? '?'}`,
  )
  if (tier !== 'realistic')
    console.log(
      `  ** WARNING: tier is ${tier ?? 'UNKNOWN'}, NOT realistic. The baked visibility lightmaps are\n` +
        '     gated to `realistic`, so this compares a physical reference against a render with NO\n' +
        '     interreflection term. Re-run the export with TIER=realistic before quoting anything\n' +
        '     from it as a photorealism figure.',
    )

  const display = manifest.display
  if (!display)
    console.log(
      '  ** WARNING: manifest has no `display` block (pre-v0.34.1.1 export). Cannot confirm the\n' +
        "     reference was converted at the raster's OWN toneMappingExposure; a mismatch there is\n" +
        '     worth more counts than anything this probe measures.',
    )
  else
    console.log(
      `app display: ${display.toneMapping} exposure ${display.toneMappingExposure} -> ${display.outputColorSpace}`,
    )
  console.log(`grid ${W}x${H} (reference native)\n`)

  const mask = buildMask(W, H)
  const kept = mask.reduce((a, b) => a + b, 0)
  console.log(
    `comparing ${kept} of ${W * H} px (${((kept / (W * H)) * 100).toFixed(1)} %) — HUD and glazing excluded\n`,
  )

  const a = await maskedStats(app, W, H, mask)
  const t = await maskedStats(refThree, W, H, mask)
  const b = await maskedStats(refBlender, W, H, mask)
  const KEYS = ['p05', 'p25', 'p50', 'p75', 'p95', 'mean']
  const row = (name, s) =>
    `${name.padEnd(30)}${KEYS.map((k) => String(s[k]).padStart(8)).join('')}   sat ${s.sat}`
  console.log(`${''.padEnd(30)}${KEYS.map((k) => k.padStart(8)).join('')}`)
  console.log(row('app raster (three AgX)', a))
  console.log(row('reference, THREE AgX', t))
  console.log(row('reference, BLENDER AgX', b))
  const delta = (x, y) => KEYS.map((k) => (x[k] - y[k] >= 0 ? '+' : '') + (x[k] - y[k]).toFixed(1))
  console.log('')
  console.log(
    `${'app - ref  VALID (same curve)'.padEnd(30)}${delta(a, t)
      .map((v) => v.padStart(8))
      .join('')}`,
  )
  console.log(
    `${'app - ref  OLD (mixed curves)'.padEnd(30)}${delta(a, b)
      .map((v) => v.padStart(8))
      .join('')}`,
  )
  console.log(
    `${'the TRANSFORM alone'.padEnd(30)}${delta(t, b)
      .map((v) => v.padStart(8))
      .join('')}`,
  )

  if (args.includes('--chroma')) {
    const rawOf = async (f) =>
      (
        await sharp(f)
          .resize(W, H, { fit: 'fill' })
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true })
      ).data
    const buckets = chromaBuckets(await rawOf(app), await rawOf(refThree), mask, W, H)
    console.log('\nchroma, bucketed by the REFERENCE saturation (ground truth), equal counts:\n')
    console.log('bin   ref sat   app sat    delta     ref R-B   app R-B    delta          n')
    for (const b of buckets)
      console.log(
        String(b.bin).padStart(3),
        String(b.refSat).padStart(9),
        String(b.appSat).padStart(9),
        (b.satDelta >= 0 ? '+' : '') + String(b.satDelta).padStart(8),
        String(b.refRB).padStart(11),
        String(b.appRB).padStart(9),
        (b.rbDelta >= 0 ? '+' : '') + String(b.rbDelta).padStart(8),
        String(b.n).padStart(10),
      )
    const lo = buckets[0]
    const hi = buckets[buckets.length - 1]
    console.log(
      `\nchroma RANGE across the buckets: reference ${lo.refSat} -> ${hi.refSat} ` +
        `(${(hi.refSat - lo.refSat).toFixed(3)}), app ${lo.appSat} -> ${hi.appSat} ` +
        `(${(hi.appSat - lo.appSat).toFixed(3)})`,
    )
  }

  const sweep = args.includes('--exposure-sweep')
    ? args[args.indexOf('--exposure-sweep') + 1]
        .split(',')
        .map((pair) => pair.split('='))
        .map(([e, f]) => [e, path.isAbsolute(f) ? f : path.join(dir, f)])
    : null
  if (sweep) await exposureSweep(app, sweep, W, H, mask)

  if (doMark) {
    await mark(app, path.join(dir, 'patches-app.png'), W, H)
    await mark(refThree, path.join(dir, 'patches-ref.png'), W, H)
    console.log(
      `\nmarked: ${dir}/patches-app.png and ${dir}/patches-ref.png — LOOK at these before quoting a number`,
    )
  }
}

/** Saturation of one RGB triple, `(max - min) / max`. 0 for black, which is the right answer. */
export function saturation(r, g, b) {
  const mx = Math.max(r, g, b)
  return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx
}

/**
 * Bucket the masked pixels by the REFERENCE's own saturation and report how the app tracks it.
 *
 * **Bucketing by the reference, not the app, is the load-bearing choice.** The question is "where
 * does the app get chroma wrong", so the app's own error must not decide which bucket a pixel
 * lands in — that would be circular, and it is the shape of mistake this arc has made before
 * (a diagnostic answering the right question about the wrong thing).
 *
 * `R−B` is carried alongside because it is white-balance-invariant in the way the arc's chroma work
 * established: a global tint moves both channels together, a real bleed does not.
 */
export function chromaBuckets(appData, refData, mask, w, h, bins = 5) {
  const px = []
  for (let p = 0, i = 0; p < w * h; p++, i += 3) {
    if (!mask[p]) continue
    px.push({
      sr: saturation(refData[i], refData[i + 1], refData[i + 2]),
      sa: saturation(appData[i], appData[i + 1], appData[i + 2]),
      rbR: refData[i] - refData[i + 2],
      rbA: appData[i] - appData[i + 2],
    })
  }
  px.sort((x, y) => x.sr - y.sr)
  const out = []
  for (let b = 0; b < bins; b++) {
    const slice = px.slice(
      Math.floor((b * px.length) / bins),
      Math.floor(((b + 1) * px.length) / bins),
    )
    const mean = (k) => slice.reduce((t, v) => t + v[k], 0) / slice.length
    out.push({
      bin: b + 1,
      n: slice.length,
      refSat: +mean('sr').toFixed(3),
      appSat: +mean('sa').toFixed(3),
      satDelta: +(mean('sa') - mean('sr')).toFixed(3),
      refRB: +mean('rbR').toFixed(1),
      appRB: +mean('rbA').toFixed(1),
      rbDelta: +(mean('rbA') - mean('rbR')).toFixed(1),
    })
  }
  return out
}

/**
 * THE DISCRIMINATOR: is the app's light mis-SCALED or mis-DISTRIBUTED?
 *
 * The app's sun intensity is artistic, not physical (`v0.31.6.6`), so an absolute level difference
 * against a physical-sky reference proves nothing on its own — it could just be that the app's sun
 * is dimmer. A SHAPE difference is scale-invariant and therefore survives that objection.
 *
 * Convert the reference's linear EXR at several exposures, and ask whether ANY scalar lines the
 * two distributions up. If one does, the app is merely dim. If the residual at the tails cannot be
 * removed at any exposure, the app's dynamic range itself is wrong, and no gain fixes it.
 *
 * Pass the pre-converted frames as `<exposure>=<png>` pairs — conversion needs Blender, so this
 * stays a reader rather than shelling out to a renderer from inside a measurement.
 */
async function exposureSweep(app, arms, W, H, mask) {
  const a = await maskedStats(app, W, H, mask)
  const KEYS = ['p05', 'p25', 'p50', 'p75', 'p95', 'mean']
  console.log(`\n${'app'.padEnd(26)}${KEYS.map((k) => k.padStart(8)).join('')}`)
  console.log(`${''.padEnd(26)}${KEYS.map((k) => String(a[k]).padStart(8)).join('')}\n`)
  for (const [exposure, file] of arms) {
    const s = await maskedStats(file, W, H, mask)
    const d = KEYS.map((k) => (a[k] - s[k] >= 0 ? '+' : '') + (a[k] - s[k]).toFixed(1))
    console.log(
      `ref @ exposure ${exposure}`.padEnd(26) +
        KEYS.map((k) => String(s[k]).padStart(8)).join('') +
        '  | app-ref' +
        d.map((v) => v.padStart(8)).join(''),
    )
  }
  console.log(
    '\nRead the TAILS, not the middle: a scalar moves every percentile the same way, so a residual\n' +
      'that survives every exposure is a RANGE error and no gain will fix it.',
  )
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
