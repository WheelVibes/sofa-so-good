/**
 * WEATHER-PHOTOS — what a real interior looks like WITH and WITHOUT a direct sun beam.
 *
 * The corpus at `/tmp/refs/final` has no weather label; `v0.34.1.12` recorded that as the reason a
 * weather comparison could not be made, and building one is what this probe is. It reuses
 * `showroom-parity.mjs`'s metrics and crop unchanged so the bands are directly comparable with
 * every figure already published against that corpus.
 *
 * **The label is BEAM / NO-BEAM, not clear / overcast, and the distinction is not pedantry.**
 * A photograph cannot reliably tell an overcast sky from a clear sky the room simply faces away
 * from: the same Berlin flat appears here both with hard sun patches (`p15`) and with none
 * (`p12`), one sunny afternoon, two orientations. What a photograph CAN show is whether a direct
 * beam is landing in the room — and that is the physical variable the app's grade actually moves,
 * so it is the right one to label. Where the sky itself is visible and unambiguously grey
 * (`p52`, `r17`) the two readings coincide.
 *
 * **Criterion, stated so the labels can be re-checked against the contact sheets:**
 *   · `beam`    — a hard-edged bright patch cast on a floor, wall or furniture, and/or visible
 *                 blue sky through the window.
 *   · `diffuse` — no cast sun patch anywhere in frame, and the sky through the window reads
 *                 white / grey / occluded.
 *   · `indet`   — excluded. Covers artificial-light-dominated frames, frames with no window, and
 *                 a near-duplicate cluster (`p12/p13/p14` ≈ `r01/r02/r03`, the same rooms shot
 *                 twice) which would otherwise weight one apartment six times.
 *
 * **Only POSE-ROBUST claims are made.** The corpus notes are explicit that photographs support
 * "qualitative screening and pose-robust bounds"; framing varies wildly within each class, so a
 * single number is meaningless and only a separation between two DISTRIBUTIONS counts.
 *
 * **`localContrast` is the control and must NOT separate.** It measures surface micro-detail —
 * pile, weave, grain — which is a property of the rooms and the cameras, not of the weather. If it
 * separates as strongly as the tonal metrics, the labelling has picked up something about the
 * photographs rather than about the light, and nothing else in the table is trustworthy.
 *
 * ## VERDICT (2026-09-12): this corpus cannot adjudicate weather, and that is the finding
 *
 * Run as shipped — 8 `beam`, 9 `diffuse` — **not one of the nine metrics separates the two
 * classes.** Not `p05`, not `range`, not `nearWhite`, not `warmth`, and not the control either.
 * Medians move in consistent directions (`deepDark` 5.1x, `p05` 0.55x, `nearWhite` 1.80x) but every
 * band overlaps, because within-class framing spread is larger than the between-class difference.
 * That is exactly the limit the corpus notes record: photographs here are good for "qualitative
 * screening and pose-robust bounds", and a whole-frame tonal statistic over 17 differently-framed
 * rooms is neither.
 *
 * **The control earned its keep by firing FIRST.** Before the duplicates were removed,
 * `localContrast` was the ONLY metric that separated — the control, and nothing else. That is the
 * signature of a labelling confound rather than a light effect, and it was: `/tmp/refs/final`
 * merges the `p` and `r` pools without deduplicating, so `r17` ≡ `p52` and `r21` ≡ `p62` were
 * being counted twice. With them dropped the spurious separation goes away too. **A metric that
 * must score zero is worth more than the metric it guards** — meta-rule xciv, and the second time
 * in this arc a metric was built and discarded before one discriminated (here: none did).
 *
 * So the app's weather grade takes its NUMBERS from Cycles plus published meteorology
 * (`src/scene/lighting/weather.ts`) and takes only its QUALITATIVE target from the photographs:
 * flat, near-neutral, no cast patch, and a window that is bright without blowing out. Do not
 * re-run this expecting a band to fit against.
 *
 *   node scripts/dev-probes/weather-photos.mjs --refs /tmp/refs/final
 */
import fs from 'node:fs'
import path from 'node:path'
import { band, metrics } from './showroom-parity.mjs'

/** Hand labels, read off `/tmp/weather/label-{0..3}.png` contact sheets. See the criterion above. */
export const LABELS = {
  beam: ['p08', 'p15', 'p16', 'p17', 'p44', 'r19', 'r20', 'r22'],
  diffuse: ['p00', 'p01', 'p11', 'p45', 'p52', 'p62', 'p64', 'r11', 'r14'],
  /** BYTE-IDENTICAL duplicates of an image already in another class — `r17` ≡ `p52`, `r21` ≡
   *  `p62`, verified by every metric agreeing to the last decimal. `/tmp/refs/final` merges the
   *  `p` and `r` pools without deduplicating, so a class built from it double-weights whichever
   *  apartments appear in both. Excluded rather than silently counted twice. */
  duplicate: ['r17', 'r21'],
  indet: [
    'p06',
    'p09',
    'p12',
    'p13',
    'p14',
    'r01',
    'r02',
    'r03',
    'r09',
    'r10',
    'r13',
    'r15',
    'r16',
  ],
}

export const KEYS = [
  'p05',
  'p50',
  'p95',
  'range',
  'nearWhite',
  'deepDark',
  'sat',
  'warmth',
  'localContrast',
]

export function labelOf(file) {
  const stem = path.basename(file).replace(/\.[^.]+$/, '')
  for (const [k, v] of Object.entries(LABELS)) if (v.includes(stem)) return k
  return 'unlabelled'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const refs = args.includes('--refs') ? args[args.indexOf('--refs') + 1] : '/tmp/refs/final'
  const files = fs
    .readdirSync(refs)
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort()
  const rows = []
  for (const f of files)
    rows.push({ file: f, label: labelOf(f), ...(await metrics(path.join(refs, f))) })
  const missing = rows.filter((r) => r.label === 'unlabelled').map((r) => r.file)
  if (missing.length) console.log(`UNLABELLED (excluded): ${missing.join(', ')}`)

  const beam = rows.filter((r) => r.label === 'beam')
  const diff = rows.filter((r) => r.label === 'diffuse')
  console.log(
    `\nbeam n=${beam.length}   diffuse n=${diff.length}   indet n=${
      rows.filter((r) => r.label === 'indet').length
    }`,
  )
  console.log(
    '\nmetric'.padEnd(16) +
      'BEAM p10/p50/p90'.padEnd(28) +
      'DIFFUSE p10/p50/p90'.padEnd(28) +
      'p50 ratio'.padStart(10) +
      '  separated?',
  )
  const out = {}
  for (const k of KEYS) {
    const b = band(beam.map((x) => x[k]))
    const d = band(diff.map((x) => x[k]))
    // "Separated" = each class's median lies outside the other's p10..p90. Symmetric, weaker than
    // a significance test, and honest for n of this size — the same rule `showroom-parity.mjs`
    // uses against the app.
    const sep = (d.p50 < b.p10 || d.p50 > b.p90) && (b.p50 < d.p10 || b.p50 > d.p90)
    const fmt = (v) => (Math.abs(v) < 1 ? v.toFixed(4) : v.toFixed(1))
    out[k] = { beam: b, diffuse: d, separated: sep }
    console.log(
      k.padEnd(16) +
        `${fmt(b.p10)} / ${fmt(b.p50)} / ${fmt(b.p90)}`.padEnd(28) +
        `${fmt(d.p10)} / ${fmt(d.p50)} / ${fmt(d.p90)}`.padEnd(28) +
        (b.p50 === 0 ? '—' : (d.p50 / b.p50).toFixed(3)).padStart(10) +
        (sep ? '   ** YES **' : '   no'),
    )
  }
  fs.writeFileSync('/tmp/weather/weather-photos.json', JSON.stringify({ rows, out }, null, 1))
  console.log('\nper-image rows -> /tmp/weather/weather-photos.json')
}
