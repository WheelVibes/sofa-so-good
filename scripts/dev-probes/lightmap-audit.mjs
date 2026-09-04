/**
 * VALUE staleness: does each shipped lightmap still carry the irradiance a fresh bake computes?
 *
 * **Distinct from `lightmap-staleness.mjs`**, which asks whether a map is APPLIED — keys hash world
 * geometry, so a moved wall silently stops matching and the map is never used. This asks the other
 * question: for the maps that DO apply, is the value in them still right? Both can fail
 * independently, and this one is invisible in the app (a 44 %-low map renders as a slightly dim
 * room, not as a missing texture).
 *
 * **Why it was needed (`(z13)`).** Measured in linear light, `mainBedroom`'s GI sits ~35 % below a
 * Cycles reference while `livingDining` sits at ~1.0. The cause is per-map: the bedroom ceiling's
 * shipped map is **0.562x** a fresh bake at matched settings, while the living/dining floor map
 * matched a fresh bake to **0.1 %**. So the set is partly stale, and no global `IRRADIANCE_GAIN`
 * can correct a per-map error. In tone-mapped bytes the same surfaces read 0.976 and 0.939 — the
 * tone curve hid a 44 % data error, which is why this needs measuring rather than eyeballing.
 *
 * **The statistic is the mean over OCCUPIED texels, times `scale`.** `scale` is `pre_max * 1.02`,
 * so `texel * scale` recovers irradiance. The subtlety is which texels to average:
 *
 * A whole-map mean is invariant to the vertical flip between a `--uv box` bake and a
 * `--uv existing --uv-layer UVMap.001` one (glTF puts the UV origin top-left, Blender bottom-left),
 * which is why it was the first choice — but it is NOT invariant to atlas PACKING. `--uv box`
 * fills the slots the bake's own face classification picks; `--uv existing` fills whatever the
 * app's `uv1` says, including the mirror-slot fallback the index drives. Different occupied texel
 * COUNTS make the two whole-map means incomparable, and `v0.31.7.293`'s first run showed exactly
 * that signature: a bidirectional 0.64-1.77 spread that looked like real staleness in both
 * directions and was partly packing.
 *
 * Averaging over non-zero texels removes it: both maps cover the same physical surface, so the
 * mean of the light ON that surface is the same quantity however it is packed. Zero-texel
 * exclusion is imperfect where a genuinely black texel exists, which is why the count is reported
 * alongside — a large occupancy difference is a warning that the two maps are not comparable.
 *
 * Usage:
 *   node scripts/dev-probes/lightmap-audit.mjs <fresh-bake-dir>
 *
 * The fresh dir must have been baked at the settings the shipped index's `bake` block records, or
 * the comparison measures the settings rather than the staleness.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const freshDir = process.argv[2]
if (!freshDir) {
  console.error('usage: lightmap-audit.mjs <fresh-bake-dir>')
  process.exit(1)
}
const SHIPPED = join(import.meta.dirname, '..', '..', 'public', 'assets', 'lightmaps')

const entries = (p) => {
  const d = JSON.parse(readFileSync(join(p, 'index.json'), 'utf8'))
  return Array.isArray(d.maps) ? d.maps : Object.values(d.maps)
}

/** Mean over OCCUPIED (non-zero) texels, times `scale` — irradiance in bake units. */
async function meanE(dir, e) {
  const { data, info } = await sharp(join(dir, e.file ?? e.out.split('/').pop()))
    .raw()
    .toBuffer({ resolveWithObject: true })
  let sum = 0
  let n = 0
  for (let i = 0; i < data.length; i += info.channels) {
    const v = data[i] / 255
    if (v > 0) {
      sum += v
      n += 1
    }
  }
  return { e: n ? (sum / n) * e.scale : 0, occupied: n }
}

const shipped = new Map(entries(SHIPPED).map((e) => [e.key, e]))
const fresh = entries(freshDir)

const rows = []
for (const f of fresh) {
  const s = shipped.get(f.key)
  if (!s) continue
  const [sM, fM] = [await meanE(SHIPPED, s), await meanE(freshDir, f)]
  rows.push({
    key: f.key,
    area: s.area,
    shipped: sM.e,
    fresh: fM.e,
    ratio: fM.e > 0 ? sM.e / fM.e : 0,
    // Occupancy ratio: far from 1 means the two atlases pack this surface differently, so the
    // value ratio beside it is not trustworthy however clean it looks.
    occ: fM.occupied > 0 ? sM.occupied / fM.occupied : 0,
  })
}
rows.sort((a, b) => a.ratio - b.ratio)

console.log(`compared ${rows.length} of ${fresh.length} fresh maps against the shipped set\n`)
console.log(
  `${'key'.padEnd(10)} ${'area'.padStart(7)} ${'shipped'.padStart(9)} ${'fresh'.padStart(9)} ${'ship/fresh'.padStart(11)}`,
)
for (const r of rows) {
  console.log(
    `${r.key.padEnd(10)} ${`${r.area}m2`.padStart(7)} ${r.shipped.toFixed(4).padStart(9)} ${r.fresh.toFixed(4).padStart(9)} ${r.ratio.toFixed(3).padStart(11)} ${r.occ.toFixed(2).padStart(6)}`,
  )
}
const bad = rows.filter((r) => r.ratio < 0.9 || r.ratio > 1.1)
console.log(
  `\n${bad.length} of ${rows.length} outside ±10 % — median ratio ` +
    `${rows.length ? rows[Math.floor(rows.length / 2)].ratio.toFixed(3) : 'n/a'}`,
)
