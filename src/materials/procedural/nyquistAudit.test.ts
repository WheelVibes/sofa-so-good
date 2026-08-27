// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NYQUIST_CYCLES_PER_TEXEL, topOctaveCyclesPerTexel } from './noise'

/**
 * WOOD-PORE-NYQUIST / FABRIC-FINE-NYQUIST, generalised into a guard.
 *
 * `makeFbm(seed, octaves, baseFreq)` multiplies its input by
 * `baseFreq * 2 ** octave`, and callers scale again (`fbm(u * A, …)`), so the
 * finest octave lands at `baseFreq * 2 ** (octaves - 1) * A` cycles across the
 * tile. A tile of S texels can only carry 0.5 cycles/texel; past that the field
 * is not fine detail, it is deterministic white noise — and
 * `heightToNormalRGBA` turns that into a per-texel random normal, which reads as
 * pebbly moulded plastic under specular light.
 *
 * **The binding size is 256, not 512.** `generators.ts:BASE_SIZE` is 256 on the
 * Performance tier, so every pattern bakes at 256 there whatever its
 * `PATTERN_SIZE_CAP`. A field tuned to be safe only at 512 still aliases for
 * those users.
 *
 * Two fields were found and fixed this way (the furniture wood pore at 13.5
 * cycles/texel, the upholstery weave's fuzz at 3.75). A full sweep then found
 * that **21 of 42 fields across the procedural painters aliased at 256** — half
 * of them. That is too much to fix and visually verify at once, so this test
 * turns the remainder into tracked, enforced debt: it parses the painter sources,
 * computes every field's top-octave frequency, and fails if any field NOT on
 * `KNOWN_ALIASED` is over the limit.
 *
 * **The allowlist may only shrink.** Fixing an entry means deleting its line.
 * Adding one requires a very good reason, because it means shipping a noise field
 * on purpose.
 *
 * Parsing source in a test is unusual, but this is a lint-style invariant with no
 * lint rule available, and the alternative — a comment asking people to remember
 * — demonstrably did not work: the second occurrence was introduced years after
 * the first.
 */

const DIR = path.join(process.cwd(), 'src/materials/procedural')
const FILES = [
  'patterns/wall.ts',
  'patterns/tile.ts',
  'patterns/stone.ts',
  'patterns/wood.ts',
  'patterns/fabric.ts',
  'stoneSurface.ts',
  'plasterSurface.ts',
  'metalBrush.ts',
  'upholsterySeams.ts',
  'woodPlank.ts',
  'tileSurface.ts',
]

/** The tile size that binds: Performance bakes every pattern at 256. */
const TILE = 256

/**
 * Fields known to alias, awaiting a fix + visual verification. Each entry is
 * debt, not an exemption. ONLY REMOVE ENTRIES.
 */
const KNOWN_ALIASED: ReadonlyArray<{ file: string; field: string }> = [
  // patterns/fabric.ts:fibre FIXED in v0.31.5.11 (was 3.44 — the worst in the repo).
  //
  // `patterns/stone.ts:pores` is a deliberate KEEP, not pending work. It aliases at
  // 2.81 cycles/texel, but it is THRESHOLDED (`p > 0.86`), so only ~14% of texels
  // fire and the aliasing shows up as sparse dark pinholes — which is exactly what
  // concrete pinholes look like. Verified on a close-up: it reads as plausible
  // mottled concrete, and "fixing" it would replace correct-looking sparse specks
  // with broad blobs. Frequency alone does not determine harm; AMPLITUDE and
  // THRESHOLDING do. Check the call site before touching any entry below.
  { file: 'patterns/stone.ts', field: 'pores' }, // 2.81 — thresholded, verified OK
  { file: 'stoneSurface.ts', field: 'fine' }, // 1.72
  { file: 'tileSurface.ts', field: 'peel' }, // 1.41
  { file: 'patterns/wall.ts', field: 'grain' }, // 1.25
  { file: 'patterns/tile.ts', field: 'sand' }, // 1.25
  { file: 'patterns/tile.ts', field: 'microRough' }, // 1.17
  { file: 'patterns/stone.ts', field: 'microRough' }, // 1.09
  { file: 'patterns/fabric.ts', field: 'warp' }, // 1.09
  { file: 'plasterSurface.ts', field: 'fine' }, // 1.00
  { file: 'patterns/wall.ts', field: 'brush' }, // 0.94
  { file: 'patterns/tile.ts', field: 'speck' }, // 0.94
  { file: 'patterns/tile.ts', field: 'striate' }, // 0.94
  { file: 'patterns/stone.ts', field: 'fine' }, // 0.94
  { file: 'patterns/stone.ts', field: 'grain' }, // 0.94
  { file: 'patterns/tile.ts', field: 'grain' }, // 0.94 (the freq-60 decl; tile.ts has two)
  { file: 'patterns/wall.ts', field: 'peel' }, // 0.75
  { file: 'patterns/fabric.ts', field: 'paper' }, // 0.63
]

interface Field {
  file: string
  field: string
  octaves: number
  baseFreq: number
  uvScale: number
  cyclesPerTexel: number
}

/** Extract every fbm field and its call-site u-scale from a painter source. */
function fieldsIn(file: string, src: string): Field[] {
  const out: Field[] = []
  const decl =
    /const\s+(\w+)\s*=\s*(?:\w+\s*>\s*0\s*\?\s*)?makeFbm\(\s*[^,]+,\s*([\d.]+)\s*,\s*([\w.]+)\s*\)/g
  for (const m of src.matchAll(decl)) {
    const name = m[1]
    const octaves = Number(m[2])
    let baseFreq = Number(m[3])
    if (Number.isNaN(baseFreq)) {
      // A named constant — resolve it from the same file.
      const c = src.match(new RegExp(`${m[3]}\\s*=\\s*([\\d.]+)`))
      baseFreq = c ? Number(c[1]) : Number.NaN
    }
    if (Number.isNaN(baseFreq)) continue
    const scales = new Set<number>()
    for (const c of src.matchAll(new RegExp(`\\b${name}\\(([^,)]+)\\s*,`, 'g'))) {
      // `field(x / S, …)` is `field(u, …)`; a trailing `+ phase` shifts, not scales.
      const norm = c[1].replace(/\b[xy]\s*\/\s*S\b/g, 'u')
      const noPhase = norm.replace(/\s*\+\s*[\w.]+\s*$/, '').trim()
      const mm = noPhase.match(/^\w+\s*\*\s*([\d.]+)$/)
      if (mm) scales.add(Number(mm[1]))
      else if (/^\w+$/.test(noPhase)) scales.add(1)
    }
    for (const uvScale of scales) {
      out.push({
        file,
        field: name,
        octaves,
        baseFreq,
        uvScale,
        cyclesPerTexel: topOctaveCyclesPerTexel(baseFreq, octaves, uvScale, TILE),
      })
    }
  }
  return out
}

const ALL: Field[] = FILES.flatMap((f) => {
  const p = path.join(DIR, f)
  return fs.existsSync(p) ? fieldsIn(f, fs.readFileSync(p, 'utf8')) : []
})

describe('procedural fbm fields stay inside the tile Nyquist limit', () => {
  it('parses a meaningful number of fields (guards against a broken parser)', () => {
    // A regex that silently stops matching would make this whole test vacuous.
    expect(ALL.length).toBeGreaterThan(30)
    expect(new Set(ALL.map((f) => f.file)).size).toBeGreaterThan(5)
  })

  it('no field aliases except the tracked allowlist', () => {
    const allowed = new Set(KNOWN_ALIASED.map((k) => `${k.file}|${k.field}`))
    const offenders = ALL.filter(
      (f) => f.cyclesPerTexel > NYQUIST_CYCLES_PER_TEXEL && !allowed.has(`${f.file}|${f.field}`),
    ).map(
      (f) =>
        `${f.file}:${f.field} — baseFreq ${f.baseFreq} x 2^${f.octaves - 1} x uvScale ${f.uvScale} = ` +
        `${f.cyclesPerTexel.toFixed(2)} cycles/texel at ${TILE} (limit ${NYQUIST_CYCLES_PER_TEXEL})`,
    )
    expect(offenders, `aliased fbm field(s) — see this file's docstring`).toEqual([])
  })

  it('every allowlist entry still exists and still aliases', () => {
    // Keeps the debt list honest: a fixed or renamed field must be deleted from
    // it, so the list cannot quietly rot into a meaningless exemption set.
    const stale: string[] = []
    for (const k of KNOWN_ALIASED) {
      const matches = ALL.filter((f) => f.file === k.file && f.field === k.field)
      if (!matches.length) stale.push(`${k.file}:${k.field} no longer exists — delete this entry`)
      else if (!matches.some((f) => f.cyclesPerTexel > NYQUIST_CYCLES_PER_TEXEL))
        stale.push(`${k.file}:${k.field} is now within Nyquist — delete this entry`)
    }
    expect(stale).toEqual([])
  })

  it('the wood painter (which paints the FLOORS) is clean', () => {
    const wood = ALL.filter((f) => f.file === 'patterns/wood.ts')
    expect(wood.length).toBeGreaterThan(4)
    for (const f of wood) {
      expect(
        f.cyclesPerTexel,
        `${f.field} aliases at ${f.cyclesPerTexel.toFixed(2)} cycles/texel`,
      ).toBeLessThan(NYQUIST_CYCLES_PER_TEXEL)
    }
  })
})
