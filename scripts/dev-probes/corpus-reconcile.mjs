/**
 * CORPUS-RECONCILE — the two app corpora disagree; find out how much of that is composition.
 *
 * `showroom-parity.mjs` compares the app to a photograph corpus, but there are now TWO app corpora
 * on disk and they were built for different purposes:
 *
 * - `/tmp/photoreal/allposes` (`photoreal-defect-sweep`, ~41 frames) is a DEFECT SWEEP: it goes
 *   looking for trouble, so it is deliberately full of tight fittings close-ups (taps, sockets,
 *   backsplash, doors, a fan-coil unit), grazing-light shots, and night poses, alongside a handful
 *   of wide room views.
 * - `/tmp/view-matrix4` (`view-matrix.mjs`, 22 frames) is a MATRIX: 2 quality tiers x (3 orbit
 *   azimuths + 3 room-editor rooms + 5 walk poses), and the 5 walk poses were chosen to be spread
 *   room-to-room hero views, not close-ups.
 *
 * So a metric computed over "every daylit, non-orbit, non-editor frame" in each corpus is not
 * measuring the same THING even though it carries the same name: the first corpus's population is
 * mostly tight-detail frames, the second's is entirely hero frames. `p05` (shadow floor) and
 * `warmth` (R-B) are both known to move with how much of the frame a single near, lit surface
 * occupies, so a disagreement between "mostly close-ups" and "entirely wide views" is expected
 * BEFORE any render defect is invoked.
 *
 * **What this probe adds over `showroom-parity.mjs`.** It classifies every frame along three axes
 * — pose kind (interior / orbit / editor), day vs night, and hero vs tight-detail framing — and
 * recomputes the metric bands per stratum, so the 120.3-vs-32.5 (`p05`) and +24.9-vs-3.4 (`warmth`)
 * splits reported for `v0.34.1.13` can be attributed to composition, residual render difference, or
 * both, rather than asserted as one or the other.
 *
 * **The hero-vs-detail split needs a criterion that is measured, not read off the filename**, since
 * filenames are an artifact of how each sweep was authored (one names fixtures, the other names
 * quality tiers) and are not available for a corpus that arrives without them. The criterion here:
 *
 *   1. Downsample the analysis grid (`GRID` from `showroom-parity.mjs`, so identical to the metric
 *      grid) to a coarse block grid (8x6) and take each block's mean luminance.
 *   2. Flood-fill the block grid into regions of blocks whose means are all within a tolerance of
 *      their seed (`largestUniformFraction`), i.e. find the largest tonally-uniform, spatially
 *      CONTIGUOUS patch.
 *   3. A frame where one such patch covers a large fraction of the grid is read as "one near surface
 *      dominates the frame" — a tight detail shot of a door, panel, or backsplash is close to
 *      edge-to-edge one material under one light. A hero room view has a floor, a wall, a ceiling,
 *      and usually a window at different tones, so no single patch dominates.
 *
 * This is a COMPOSITION proxy, not a depth measurement — there is no depth buffer to read here, only
 * pixels. It is deliberately CONTIGUITY-aware (not just "many blocks share a similar tone", which a
 * hero view can satisfy by coincidence when a floor and a ceiling happen to average alike) because
 * that was checked and rejected first: a non-contiguous "close-to-median" count put the living-room
 * wide shot and the fan-coil-unit close-up on the same side.
 *
 * **Known miss, reported rather than hidden.** The proxy conflates "close to camera" with "smooth
 * under a fixed-resolution kernel": a close-up of a genuinely detailed small object (the kitchen
 * sink tap, the socket plate) reads as textured rather than uniform, so it scores toward "hero" by
 * this criterion despite being a tight framing by any human judgement. That miss is visible in the
 * classification table this probe prints and is called out in the report; it is not corrected here
 * because doing so from pixels alone (without a depth buffer) would be exactly the kind of
 * eyeballed patch this probe exists to avoid.
 *
 *   node scripts/dev-probes/corpus-reconcile.mjs --refs /tmp/refs/final \
 *     --corpus1 /tmp/photoreal/allposes --corpus2 /tmp/view-matrix4
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { band, CROP, GRID, metrics, rec709 } from './showroom-parity.mjs'

/** Fraction of the analysis grid a single block must differ from a region's seed to leave it. */
export const BLOCK_TOL = 14

/** Coarse block grid for the framing criterion — coarse enough that a hero view's floor/wall/
 * ceiling/window fall in different blocks, fine enough that a detail close-up still spans several. */
export const BLOCK_COLS = 8
export const BLOCK_ROWS = 6

/** A single connected tonal patch covering this fraction of the block grid or more is read as one
 * near surface dominating the frame. Chosen as the point separating named fixture/door/panel close-
 * ups from named wide room views in a manual check of `/tmp/photoreal/allposes` (see module doc);
 * not a universal constant, just this probe's line. */
export const DETAIL_FRACTION = 0.4

/** Per-block mean luminance over a `cols` x `rows` grid. Pure — takes a luminance buffer, not a file. */
export function blockMeans(lum, w, h, cols, rows) {
  const bw = Math.floor(w / cols)
  const bh = Math.floor(h / rows)
  const out = new Float64Array(cols * rows)
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      let sum = 0
      let n = 0
      for (let y = by * bh; y < (by + 1) * bh; y++) {
        for (let x = bx * bw; x < (bx + 1) * bw; x++) {
          sum += lum[y * w + x]
          n++
        }
      }
      out[by * cols + bx] = n ? sum / n : 0
    }
  }
  return out
}

/**
 * Largest connected (4-neighbour) fraction of the block grid within `tol` of its own seed value.
 * Contiguity matters: two blocks that merely share a similar mean by coincidence (a floor and a
 * ceiling, say) must not be counted as the same surface unless a chain of near-equal neighbours
 * actually connects them.
 */
export function largestUniformFraction(bm, cols, rows, tol = BLOCK_TOL) {
  const n = cols * rows
  const visited = new Array(n).fill(false)
  let best = 0
  for (let seed = 0; seed < n; seed++) {
    if (visited[seed]) continue
    const seedVal = bm[seed]
    const stack = [seed]
    visited[seed] = true
    let size = 0
    while (stack.length) {
      const i = stack.pop()
      size++
      const x = i % cols
      const y = Math.floor(i / cols)
      const neighbours = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]
      for (const [nx, ny] of neighbours) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        const ni = ny * cols + nx
        if (visited[ni]) continue
        if (Math.abs(bm[ni] - seedVal) <= tol) {
          visited[ni] = true
          stack.push(ni)
        }
      }
    }
    best = Math.max(best, size)
  }
  return n ? best / n : 0
}

/** 'detail' when a single patch dominates the frame, else 'hero'. See `DETAIL_FRACTION`. */
export function classifyFraming(fraction, threshold = DETAIL_FRACTION) {
  return fraction >= threshold ? 'detail' : 'hero'
}

/**
 * Pose kind from a filename, covering BOTH naming conventions on disk: `allposes` names things
 * like `01-00-orbit-13h.png` / `21-19-editor-living.png`; `view-matrix4` uses `<tier>__<mode>__
 * <pose>.png` with `mode` one of `orbit` / `editor` / `walk`. Order matters: check `orbit` before
 * `editor` is irrelevant here since the tokens are disjoint, but editor must be its own branch —
 * `showroom-parity.mjs`'s `isInteriorPose` only excludes `orbit`, and silently accepted editor
 * frames as "interior" in the past export; this probe treats editor as its own non-interior kind.
 */
export function classifyPoseKind(filename) {
  if (/orbit/i.test(filename)) return 'orbit'
  if (/editor/i.test(filename)) return 'editor'
  return 'interior'
}

export function classifyNight(filename) {
  return /night/i.test(filename)
}

/** Stratum label for an interior, day frame. Orbit/editor/night are reported separately, never
 * folded into this label, because they answer a different question (see module doc + view-matrix.mjs). */
export function stratumLabel(poseKind, night, framing) {
  if (poseKind !== 'interior') return poseKind
  if (night) return 'interior-night'
  return `interior-day-${framing}`
}

async function lumOf(file) {
  const meta = await sharp(file).metadata()
  const box = {
    left: Math.round(CROP.x * meta.width),
    top: Math.round(CROP.y * meta.height),
    width: Math.round(CROP.w * meta.width),
    height: Math.round(CROP.h * meta.height),
  }
  const { data } = await sharp(file)
    .extract(box)
    .resize(GRID.w, GRID.h, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const n = GRID.w * GRID.h
  const lum = new Float32Array(n)
  for (let p = 0, i = 0; p < n; p++, i += 3) lum[p] = rec709(data[i], data[i + 1], data[i + 2])
  return lum
}

async function classifyAndMeasure(dir, file) {
  const full = path.join(dir, file)
  const lum = await lumOf(full)
  const bm = blockMeans(lum, GRID.w, GRID.h, BLOCK_COLS, BLOCK_ROWS)
  const fraction = largestUniformFraction(bm, BLOCK_COLS, BLOCK_ROWS)
  const framing = classifyFraming(fraction)
  const poseKind = classifyPoseKind(file)
  const night = classifyNight(file)
  const m = await metrics(full)
  return {
    file,
    poseKind,
    night,
    fraction: +fraction.toFixed(3),
    framing,
    stratum: stratumLabel(poseKind, night, framing),
    ...m,
  }
}

async function loadCorpus(dir) {
  if (!dir || !fs.existsSync(dir)) return []
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort()
  const out = []
  for (const f of files) out.push(await classifyAndMeasure(dir, f))
  return out
}

/** References carry no filename convention at all — classify framing only; pose kind is always
 * 'interior' by construction (they are all photographs of apartment rooms) and night is read from
 * `buckets.json`'s "night/dim" bucket when present, else assumed day. */
async function loadRefs(dir) {
  if (!dir || !fs.existsSync(dir)) return []
  const bucketsPath = path.join(dir, 'buckets.json')
  const nightSet = new Set(
    fs.existsSync(bucketsPath)
      ? (JSON.parse(fs.readFileSync(bucketsPath, 'utf8'))['night/dim'] ?? [])
      : [],
  )
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort()
  const out = []
  for (const f of files) {
    const full = path.join(dir, f)
    const lum = await lumOf(full)
    const bm = blockMeans(lum, GRID.w, GRID.h, BLOCK_COLS, BLOCK_ROWS)
    const fraction = largestUniformFraction(bm, BLOCK_COLS, BLOCK_ROWS)
    const framing = classifyFraming(fraction)
    const m = await metrics(full)
    out.push({
      file: f,
      night: nightSet.has(f),
      fraction: +fraction.toFixed(3),
      framing,
      stratum: nightSet.has(f) ? 'ref-night' : `ref-day-${framing}`,
      ...m,
    })
  }
  return out
}

/**
 * Poses that both scripts happen to name recognisably the same room+viewpoint, so a median-vs-
 * median claim can be replaced with an actual pair. This is a short, hand-verified list (three
 * poses), not a general matcher — a fuzzy name matcher would itself be an eyeballed judgement
 * dressed up as code. `corpus1Match` matches the `allposes` filename (word-boundary substring);
 * `corpus2Pose` matches the `<tier>__walk__<pose>` token in `view-matrix4`.
 */
export const POSE_PAIRS = [
  { label: 'living-far', corpus1Match: 'living-far', corpus2Pose: 'living-far' },
  { label: 'kitchen-east', corpus1Match: 'kitchen-east', corpus2Pose: 'kitchen-east' },
  { label: 'bedroom2-door', corpus1Match: 'door-bedroom2', corpus2Pose: 'bedroom2-door' },
]

/** Find rows in a corpus whose filename contains `needle`. */
function findByNeedle(rows, needle) {
  return rows.filter((r) => r.file.includes(needle))
}

const METRIC_KEYS = ['p05', 'p50', 'p95', 'range', 'sat', 'warmth', 'localContrast']

function bandTable(rows, keys = METRIC_KEYS) {
  const out = { n: rows.length }
  for (const k of keys) out[k] = band(rows.map((r) => r[k]))
  return out
}

function printBand(label, b) {
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(v < 1 ? 4 : 1) : String(v))
  console.log(`\n${label}  (n=${b.n})`)
  for (const k of METRIC_KEYS) {
    const v = b[k]
    console.log(
      `  ${k.padEnd(14)} p10 ${fmt(v.p10).padStart(8)}  p50 ${fmt(v.p50).padStart(8)}  p90 ${fmt(v.p90).padStart(8)}`,
    )
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const i = args.indexOf(flag)
    return i === -1 ? undefined : args[i + 1]
  }
  const refsDir = get('--refs') ?? '/tmp/refs/final'
  const corpus1Dir = get('--corpus1') ?? '/tmp/photoreal/allposes'
  const corpus2Dir = get('--corpus2') ?? '/tmp/view-matrix4'

  console.log('Classifying and measuring frames (reads existing PNG/JPG on disk only)...\n')
  const refs = await loadRefs(refsDir)
  const c1 = await loadCorpus(corpus1Dir)
  const c2 = await loadCorpus(corpus2Dir)

  console.log(
    `references: ${refs.length}   corpus1 (allposes): ${c1.length}   corpus2 (view-matrix4): ${c2.length}`,
  )

  console.log('\n=== Per-frame classification ===')
  for (const [name, rows] of [
    ['corpus1', c1],
    ['corpus2', c2],
  ]) {
    console.log(`\n-- ${name} --`)
    for (const r of rows)
      console.log(`  ${r.stratum.padEnd(20)} fraction=${r.fraction.toFixed(3).padEnd(6)} ${r.file}`)
  }

  const refDayHero = refs.filter((r) => r.stratum === 'ref-day-hero')
  const refDayDetail = refs.filter((r) => r.stratum === 'ref-day-detail')
  const refDayAll = refs.filter((r) => !r.night)

  console.log('\n=== Reference bands ===')
  printBand('references — ALL day frames (unstratified)', bandTable(refDayAll))
  printBand('references — hero framing', bandTable(refDayHero))
  printBand('references — detail framing', bandTable(refDayDetail))

  for (const [name, rows] of [
    ['corpus1 (allposes)', c1],
    ['corpus2 (view-matrix4)', c2],
  ]) {
    console.log(`\n=== ${name} ===`)
    const interiorDay = rows.filter((r) => r.poseKind === 'interior' && !r.night)
    const hero = interiorDay.filter((r) => r.framing === 'hero')
    const detail = interiorDay.filter((r) => r.framing === 'detail')
    printBand(
      `${name} — interior/day, UNSTRATIFIED (mirrors the historical "walk-mode" figure)`,
      bandTable(interiorDay),
    )
    if (hero.length) printBand(`${name} — interior/day HERO`, bandTable(hero))
    if (detail.length) printBand(`${name} — interior/day DETAIL`, bandTable(detail))
  }

  console.log('\n=== Direct residual check: hero-vs-hero, detail-vs-detail across corpora ===')
  const c1Hero = c1.filter((r) => r.poseKind === 'interior' && !r.night && r.framing === 'hero')
  const c2Hero = c2.filter((r) => r.poseKind === 'interior' && !r.night && r.framing === 'hero')
  if (c1Hero.length && c2Hero.length) {
    printBand('corpus1 HERO', bandTable(c1Hero))
    printBand('corpus2 HERO', bandTable(c2Hero))
  } else {
    console.log('  (one side has no hero-framed interior/day frames — cannot pair)')
  }

  console.log(
    '\n=== Same-pose pairs (the one honest ratio: identical room + viewpoint, not medians of two populations) ===',
  )
  for (const { label, corpus1Match, corpus2Pose } of POSE_PAIRS) {
    const c1Rows = findByNeedle(c1, corpus1Match)
    const c2Rows = c2.filter((r) => r.file.includes(`__walk__${corpus2Pose}.png`))
    if (!c1Rows.length || !c2Rows.length) {
      console.log(`  ${label}: no match on one side, skipped`)
      continue
    }
    console.log(`\n  ${label}`)
    for (const r of c1Rows)
      console.log(
        `    corpus1  ${r.file.padEnd(40)} p05=${r.p05.toFixed(1).padStart(6)}  warmth=${r.warmth.toFixed(1).padStart(6)}`,
      )
    for (const r of c2Rows)
      console.log(
        `    corpus2  ${r.file.padEnd(40)} p05=${r.p05.toFixed(1).padStart(6)}  warmth=${r.warmth.toFixed(1).padStart(6)}`,
      )
  }

  const out = { refs, corpus1: c1, corpus2: c2 }
  fs.writeFileSync('/tmp/corpus-reconcile.json', JSON.stringify(out, null, 1))
  console.log('\nWrote /tmp/corpus-reconcile.json')
}
