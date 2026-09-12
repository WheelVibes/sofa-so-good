/**
 * SHOWROOM-PARITY — the app's frames against a CORPUS of real apartment interiors.
 *
 * The goal this serves, in the maintainer's words: *"a high-definition virtual showroom that makes
 * the user feel like he is inside and looking at the apartment in real life."*
 *
 * **Why a corpus on both sides.** An earlier round compared ONE app pose against ONE photograph and
 * found a real defect — but a single pair cannot tell a defect from a coincidence of framing, and
 * `docs/hq-tracer-probe-notes.md` is emphatic that a patch set is verified for one pose only. So
 * both sides are distributions: N reference photographs, M app poses, and every finding is reported
 * as an overlap (or a gap) between two ranges rather than a difference between two numbers.
 *
 * **Every metric here is REGION-FREE and needs no hand-placed patch**, because a hand-placed patch
 * cannot be applied to a corpus. That rules out the aperture measurement the window-blowout round
 * used (it needs to know where the window is) and admits only whole-frame statistics. The cost is
 * that a metric can move because the framing changed rather than because the render did — which is
 * exactly why the corpus is needed, and why a difference matters only when the two DISTRIBUTIONS
 * separate, not when two images do.
 *
 * **One fixed crop rule, applied identically to both sides.** The app frames carry a HUD (toolbar
 * top-centre, minimap bottom-right, interaction pill bottom-centre) which is opaque UI and would
 * otherwise contribute its own flat, saturated statistics. The crop below removes it, and it is
 * applied to the photographs too so the rule cannot favour either side.
 *
 * What the metrics are for, and what defect each one is sensitive to:
 *
 * | metric | what it catches |
 * | --- | --- |
 * | `nearWhite` (>= 240) | does the frame contain a LIGHT SOURCE — a window that clips, as a camera exposed for a room always produces |
 * | `deepDark` (<= 16) | are there true blacks, or is everything lifted into a mid grey band |
 * | `range` (p95 - p05) | overall tonal reach |
 * | `sat` | the cold, lifeless cast a colourless indirect term produces |
 * | `localContrast` | micro-detail: pile, weave, grain. A render with flat materials reads as plastic |
 *
 *   node scripts/dev-probes/showroom-parity.mjs --refs /tmp/refs/kept --app /tmp/photoreal/sweepnow
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

/** Fixed crop, as fractions. Excludes the app HUD; applied to references too (see header). */
export const CROP = { x: 0.08, y: 0.13, w: 0.84, h: 0.67 }

/**
 * ⚠️ **`CROP` is wrong for PER-ROOM EDITOR frames, and it produced a false finding.**
 *
 * In the editor the room floats in a large flat grey backdrop and occupies only ~35 % of the frame,
 * so a whole-frame statistic is mostly measuring the backdrop. `v0.34.1.13` reported the editor as
 * "the worst cell in the matrix on colour" at saturation **0.038** against a reference median of
 * 0.184 — but the same frame cropped to the room itself reads **0.059**, so the background was
 * inflating the deficit by more than half.
 *
 * Use {@link ROOM_CROP} for an editor frame. It is read off the default-plan editor framing and is
 * therefore pose-specific, which is the standing caveat on every patch set in this arc.
 */
export const ROOM_CROP = { x: 0.26, y: 0.26, w: 0.48, h: 0.6 }

/** Analysis grid. Fixed so `localContrast` means the same thing on a 7360 px photo and an 800 px frame. */
export const GRID = { w: 900, h: 600 }

export function rec709(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Mean absolute deviation from a KxK box mean — a scale-fixed proxy for micro-detail.
 *
 * Deliberately not a gradient or an edge count: those are dominated by object silhouettes, which
 * differ between any two rooms. A box-mean residual responds to surface texture (carpet pile, weave,
 * grain) as much as to edges, and both corpora contain roughly the same amount of silhouette.
 */
export function localContrast(lum, w, h, k = 9) {
  const half = (k - 1) / 2
  let sum = 0
  let n = 0
  for (let y = half; y < h - half; y += 2) {
    for (let x = half; x < w - half; x += 2) {
      let acc = 0
      for (let dy = -half; dy <= half; dy++)
        for (let dx = -half; dx <= half; dx++) acc += lum[(y + dy) * w + (x + dx)]
      sum += Math.abs(lum[y * w + x] - acc / (k * k))
      n++
    }
  }
  return n ? sum / n : 0
}

/**
 * @param crop optional crop rectangle, as fractions. Defaults to {@link CROP}; pass
 * {@link ROOM_CROP} for a per-room EDITOR frame, where the default rectangle is mostly backdrop
 * (see ROOM_CROP's own note — it produced a published false finding). Additive: every existing
 * caller omits it and is byte-identical.
 */
export async function metrics(file, crop = CROP) {
  const meta = await sharp(file).metadata()
  const box = {
    left: Math.round(crop.x * meta.width),
    top: Math.round(crop.y * meta.height),
    width: Math.round(crop.w * meta.width),
    height: Math.round(crop.h * meta.height),
  }
  const { data } = await sharp(file)
    .extract(box)
    .resize(GRID.w, GRID.h, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const n = GRID.w * GRID.h
  const lum = new Float32Array(n)
  let satSum = 0
  let rbSum = 0
  let nearWhite = 0
  let deepDark = 0
  for (let p = 0, i = 0; p < n; p++, i += 3) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const l = rec709(r, g, b)
    lum[p] = l
    if (l >= 240) nearWhite++
    if (l <= 16) deepDark++
    const mx = Math.max(r, g, b)
    satSum += mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx
    rbSum += r - b
  }
  const sorted = Float32Array.from(lum).sort()
  const q = (f) => sorted[Math.floor(n * f)]
  return {
    p05: +q(0.05).toFixed(1),
    p50: +q(0.5).toFixed(1),
    p95: +q(0.95).toFixed(1),
    range: +(q(0.95) - q(0.05)).toFixed(1),
    nearWhite: +((100 * nearWhite) / n).toFixed(2),
    deepDark: +((100 * deepDark) / n).toFixed(2),
    sat: +(satSum / n).toFixed(4),
    // WARMTH. R-B is the arc's standing chroma metric because it is white-balance-invariant and
    // pose-robust (`docs/hq-tracer-probe-notes.md`), which makes it one of the few colour
    // quantities a photograph corpus can legitimately anchor.
    warmth: +(rbSum / n).toFixed(1),
    localContrast: +localContrast(lum, GRID.w, GRID.h).toFixed(2),
  }
}

/** p10 / p50 / p90 of a set of per-image values — the band a corpus occupies. */
export function band(values) {
  const v = [...values].sort((a, b) => a - b)
  const q = (f) => v[Math.floor((v.length - 1) * f)]
  return { p10: q(0.1), p50: q(0.5), p90: q(0.9), n: v.length }
}

const KEYS = [
  'nearWhite',
  'deepDark',
  'p05',
  'p50',
  'p95',
  'range',
  'sat',
  'warmth',
  'localContrast',
]

/**
 * Orbit/dollhouse frames are a cutaway of the whole flat seen from OUTSIDE it, not a view from
 * inside a room. Comparing one to an interior photograph measures the framing, not the render, and
 * including four of them shifted three metrics in the first run of this probe.
 */
export const isInteriorPose = (f) => !/orbit/i.test(f)

/** Night poses are named. Compared against a daylit corpus they are pure noise. */
export const isNightPose = (f) => /night/i.test(f)

async function runDir(dir, filter = () => true) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .filter(filter)
    .sort()
  const out = []
  for (const f of files) out.push({ file: f, ...(await metrics(path.join(dir, f))) })
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const refsDir = args[args.indexOf('--refs') + 1]
  const appDir = args[args.indexOf('--app') + 1]
  // Interior, daylit poses only by default — see `isInteriorPose` / `isNightPose`. `--all` opts out.
  const all = args.includes('--all')
  const keep = all ? () => true : (f) => isInteriorPose(f) && !isNightPose(f)
  const refs = await runDir(refsDir)
  const app = await runDir(appDir, keep)
  console.log(`references: ${refs.length} photographs   |   app: ${app.length} poses`)
  console.log(`crop ${JSON.stringify(CROP)} on a ${GRID.w}x${GRID.h} grid\n`)
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(v < 1 ? 4 : 1) : String(v))
  console.log(
    'metric'.padEnd(15) +
      'REFERENCES p10/p50/p90'.padEnd(30) +
      'APP p10/p50/p90'.padEnd(30) +
      'verdict',
  )
  for (const k of KEYS) {
    const r = band(refs.map((x) => x[k]))
    const a = band(app.map((x) => x[k]))
    // "Separated" = the app's median falls outside the references' p10..p90 band. A weaker claim
    // than a significance test and an honest one for n of this size.
    const outside = a.p50 < r.p10 || a.p50 > r.p90
    const dir = a.p50 < r.p10 ? 'LOW' : a.p50 > r.p90 ? 'HIGH' : 'overlaps'
    console.log(
      k.padEnd(15) +
        `${fmt(r.p10)} / ${fmt(r.p50)} / ${fmt(r.p90)}`.padEnd(30) +
        `${fmt(a.p10)} / ${fmt(a.p50)} / ${fmt(a.p90)}`.padEnd(30) +
        (outside ? `** ${dir} **` : dir),
    )
  }
  fs.writeFileSync(
    path.join(appDir, 'showroom-parity.json'),
    JSON.stringify({ refs, app }, null, 1),
  )
}
