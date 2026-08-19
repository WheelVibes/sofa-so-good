/** Wood-grain procedural patterns (planks, parquet, herringbone). */
import { blank, type Fields, setPx } from '../fieldKit'
import { clamp01, makeFbm, mulberry32 } from '../noise'
import { grainLean, plankHash, shearAcross } from '../woodPlank'

export function woodFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 9
  const rand = mulberry32(seed)
  // (The former per-caller opts — collapsed variation for the vinyl reuse —
  // were retired when `vinylFields` became its own painter (SNV-BOARDS);
  // these constants reproduce the long-standing natural-board output exactly.)
  const valVar = 0.24
  const warmVar = 0.16
  const bandContrast = 0.16
  const knotChance = 0.6
  const planks = 6 // boards stacked across the tile
  const plankH = S / planks
  // Per-plank tint with correlated warmth (real boards vary in hue + value).
  // The rand() consumption ORDER is fixed (val, warm, phase, knot roll + knot
  // params) so the default opts reproduce the pre-opts output byte-identically.
  const plank = Array.from({ length: planks }, (_, i) => {
    // Mean-preserving spreads: defaults reproduce the pre-opts constants
    // exactly (0.86 + rand·0.24 and 0.94 + rand·0.16).
    const val = 0.98 - valVar / 2 + rand() * valVar // brightness, mean 0.98
    const warm = 1.02 - warmVar / 2 + rand() * warmVar // >1 warmer, mean 1.02
    const phase = rand() * 10
    // A couple of knots per board at random positions along its length.
    const knots =
      rand() < knotChance ? [{ u: rand(), v: 0.25 + rand() * 0.5, r: 0.012 + rand() * 0.02 }] : []
    // Per-board grain lean (PC2-WOOD-GRAIN-FLOW) — keyed by a stateless hash so it
    // doesn't perturb the val/warm/phase/knots stream above.
    const lean = grainLean(seed, i)
    return { val, warm, phase, knots, lean }
  })
  // Cathedral grain: low-freq along the board, tight bands across it.
  const grainAlong = makeFbm(seed + 7, 4, 3)
  const fineGrain = makeFbm(seed + 99, 3, 28)
  // High-frequency roughness break-up: real varnished timber never has a
  // perfectly uniform sheen — micro scuffs / pore tooth make the gloss vary
  // texel-to-texel (RZ4). Cheap fbm, only touches the roughness map.
  const microRough = makeFbm(seed + 211, 3, 70)
  for (let y = 0; y < S; y++) {
    const pi = Math.floor(y / plankH)
    const yInPlank = (y % plankH) / plankH // 0..1
    const pk = plank[pi]
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      // Bands run along the board (x); warp them with low-freq noise so the
      // grain meanders like real timber rather than ruled lines.
      const warp = grainAlong(u * 1.2 + pk.phase, v * 1.5) - 0.5
      // Lean the grain bands per board so the figure flows board-to-board.
      const across = shearAcross(yInPlank, u, pk.lean)
      const band = Math.abs(Math.sin((across + warp * 0.6) * Math.PI * 9 + pk.phase))
      const fg = fineGrain(u * 4, v)
      // Grain lines darken; fine noise adds tooth.
      let factor = pk.val * (0.92 - band * bandContrast + (fg - 0.5) * 0.06)

      // Knots: dark elliptical cores with a tight ring.
      let knotH = 0
      for (const k of pk.knots) {
        const du = u - k.u
        const dv = (yInPlank - k.v) * 0.6
        const d = Math.hypot(du, dv)
        if (d < k.r * 3) {
          const core = d < k.r ? 1 : 0
          const ring = Math.abs(Math.sin((d / k.r) * 3.5)) * (1 - d / (k.r * 3))
          factor *= 1 - core * 0.55 - ring * 0.25
          knotH = Math.max(knotH, ring * 0.4 + core * 0.5)
        }
      }

      // Plank groove (dark + recessed micro-bevel between boards).
      // JOINT-SCALE: real board bevels are 1–2 mm; the old 3.5%-of-plank band
      // (~7 mm each side) darkened to 0.45 read as thick black rules.
      const edge = Math.min(yInPlank, 1 - yInPlank)
      const groove = edge < 0.015 ? edge / 0.015 : 1
      factor *= 0.62 + 0.38 * groove

      // Apply warmth: scale R up / B down around the value.
      const r = base[0] * factor * pk.warm
      const g = base[1] * factor
      const b = base[2] * factor * (2 - pk.warm)
      const h = clamp01(0.55 * groove + band * 0.3 + knotH)
      // Satin-varnished boards: fairly glossy, grain lines slightly rougher,
      // plus a faint micro break-up so the sheen isn't dead-flat.
      const rough = clamp01(
        0.42 + band * bandContrast + (1 - groove) * 0.2 + (microRough(u, v) - 0.5) * 0.08,
      )
      setPx(f, y * S + x, r, g, b, h, rough)
    }
  }
  return f
}

/**
 * Factory vinyl strip flooring — the SNV sample board (SNV-BOARDS): a
 * grey-washed rift-oak PRINT. What the board actually shows (and the earlier
 * wood-painter reuse did not): dense fine STRAIGHT striations running the
 * strip's length (rift-sawn figure, not wavy cathedral bands), a few sparse
 * darker/lighter streaks, barely-there broad cathedral smears, one staggered
 * end-joint per strip (real strips are ~1.2 m long), tight V-seams, and a
 * uniform low-sheen matte face (every strip prints the same tone). The old
 * `woodFields` reuse produced wavy sine bands + isotropic noise that read as
 * zebra moiré at walking distance.
 */
export function vinylFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 4 // printed laminate — shallow embossed relief only
  const planks = 6
  const plankH = S / planks
  const striaeWarp = makeFbm(seed + 3, 3, 6)
  const striaeAmp = makeFbm(seed + 5, 3, 9)
  const streakN = makeFbm(seed + 9, 3, 12)
  const cathedralN = makeFbm(seed + 15, 3, 2.5)
  const micro = makeFbm(seed + 21, 3, 90)
  const endW = Math.max(1, S * 0.002) // end-joint half width (px) — hairline
  for (let y = 0; y < S; y++) {
    const pi = Math.floor(y / plankH)
    const across = (y % plankH) / plankH // 0..1 across the strip
    // Per-strip: near-identical print tone (factory laminate), a print phase
    // so strips don't repeat, and a staggered end-joint position.
    const val = 1 + (plankHash(pi * 17 + 1) - 0.5) * 0.05
    const warm = 1 + (plankHash(pi * 29 + 3) - 0.5) * 0.02
    const phase = plankHash(pi * 41 + 7) * 13
    const endU = plankHash(pi * 53 + 11)
    for (let x = 0; x < S; x++) {
      const u = x / S
      // Fine straight striations: a sine ladder across the strip, warped only
      // slightly along its length and amplitude-modulated so runs of grain
      // fade in/out instead of reading as ruled lines.
      const warp = (striaeWarp(u * 1.6 + phase, across * 2) - 0.5) * 1.4
      const s1 = Math.sin((across * 22 + warp * 0.55 + phase) * Math.PI * 2)
      const am = 0.35 + striaeAmp(u * 0.9 + phase, across * 6) * 0.65
      const striae = s1 * am * 0.065
      // Sparse elongated dark + light streaks (the board's character marks).
      const sk = streakN(u * 1.1 + phase, across * 10 + phase)
      const dk = clamp01((sk - 0.66) * 4)
      const lt = clamp01((0.34 - sk) * 4)
      // Barely-there broad cathedral smears.
      const catWarp = (cathedralN(u * 1.2 + phase, across) - 0.5) * 0.8
      const cat = Math.abs(Math.sin((across + catWarp) * Math.PI * 2 + phase)) ** 10 * 0.05
      const mc = (micro(u * 2, across + pi) - 0.5) * 0.035
      let factor = val * (0.9 + striae - dk * 0.14 + lt * 0.06 - cat + mc)
      // Hairline V-seam between strips + one staggered end joint per strip.
      // JOINT-SCALE: real vinyl strips sit flush with a ~1 mm micro-V — the
      // first cut used a 7 mm band darkened to 0.78, which read as thick dark
      // rules between every strip. ~1 px (≈2–3 mm) at a gentle 0.86 floor.
      const edge = Math.min(across, 1 - across)
      const seam = edge < 0.012 ? edge / 0.012 : 1
      const du = Math.abs(u - endU)
      const end = Math.min(du, 1 - du) * S < endW
      factor *= (0.86 + 0.14 * seam) * (end ? 0.9 : 1)
      const r = base[0] * factor * warm
      const g = base[1] * factor
      const b = base[2] * factor * (2 - warm)
      const h = clamp01(0.5 + striae * 1.6 - dk * 0.12 - (1 - seam) * 0.16 - (end ? 0.12 : 0))
      // Low-sheen matte laminate; grain and streaks vary the tooth subtly.
      const rough = clamp01(0.58 + striae * 0.9 + dk * 0.06 - lt * 0.03 + mc + (1 - seam) * 0.1)
      setPx(f, y * S + x, r, g, b, h, rough)
    }
  }
  return f
}

export function parquetFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 9
  const nb = 2 // blocks per axis — keeps the tile seamless
  const K = 4 // planks per block
  const B = S / nb // block size (px)
  const pw = B / K // plank width (px)
  const grain = makeFbm(seed + 7, 4, 3)
  const fine = makeFbm(seed + 99, 3, 28)
  // Deterministic per-plank hash → tint variation without a stateful RNG stream.
  const hsh = plankHash
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const bx = Math.floor(x / B)
      const by = Math.floor(y / B)
      const horizontal = ((bx + by) & 1) === 0
      const lx = x - bx * B
      const ly = y - by * B
      // across = position across the plank width (0..1); along = down its length.
      let across: number
      let along: number
      let plankIdx: number
      if (horizontal) {
        plankIdx = Math.floor(ly / pw)
        across = (ly - plankIdx * pw) / pw
        along = lx / B
      } else {
        plankIdx = Math.floor(lx / pw)
        across = (lx - plankIdx * pw) / pw
        along = ly / B
      }
      const pid = bx * 7 + by * 13 + plankIdx * 31
      const val = 0.84 + hsh(pid) * 0.26
      const warm = 0.95 + hsh(pid + 1) * 0.12
      const lean = grainLean(seed, pid)
      // Latewood bands run along the plank length; warp them so they meander.
      const warp = grain(along * 1.2 + (pid % 11), across * 1.5) - 0.5
      const leaned = shearAcross(across, along, lean)
      const band = Math.abs(Math.sin((leaned + warp * 0.5) * Math.PI * 7 + (pid % 7)))
      const fg = fine(along * 4, across)
      let factor = val * (0.92 - band * 0.14 + (fg - 0.5) * 0.06)
      // Recessed grooves between planks (across) and at plank ends (along).
      // JOINT-SCALE: micro-bevel widths (real parquet joints are 1–2 mm).
      const edgeAcross = Math.min(across, 1 - across)
      const grooveA = edgeAcross < 0.025 ? edgeAcross / 0.025 : 1
      const edgeAlong = Math.min(along, 1 - along)
      const grooveB = edgeAlong < 0.012 ? edgeAlong / 0.012 : 1
      const groove = Math.min(grooveA, grooveB)
      factor *= 0.68 + 0.32 * groove
      const r = base[0] * factor * warm
      const g = base[1] * factor
      const b = base[2] * factor * (2 - warm)
      const h = clamp01(0.5 * groove + band * 0.3)
      const rough = clamp01(0.42 + band * 0.16 + (1 - groove) * 0.2)
      setPx(f, y * S + x, r, g, b, h, rough)
    }
  }
  return f
}

/**
 * Running-bond exposed brick: rows of bricks offset by half a brick each row,
 * with recessed mortar joints and per-brick colour/value variation. Seamless —
 * the column count divides the tile and the row count is even so the half-offset
 * alternation wraps. `base` is the brick colour; mortar is a fixed warm grey.
 */
/**
 * Glossy ceramic subway/metro tile — running-bond 2:1 rectangles with thin grout
 * and a soft bevel at each tile edge (the classic kitchen-backsplash / bathroom
 * wall finish). Distinct from `brick` (matte, earthy, thick mortar): high tint,
 * low roughness, crisp thin joints. Seamless — cols divide the tile, rows even so
 * the half-offset running bond wraps.
 */
export function herringboneFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 9
  const across = 16 // plank-widths across the tile (divides S → seamless)
  const W = S / across // plank width (px)
  const n = 4 // plank length L = n·W
  const P = 2 * n // orientation period in W-units; across (16) is a multiple → seamless
  const grain = makeFbm(seed + 7, 4, 3)
  const fine = makeFbm(seed + 99, 3, 28)
  const hsh = plankHash
  const wrap = (v: number) => ((v % across) + across) % across
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const xw = x / W
      const yw = y / W
      const fx = Math.floor(xw)
      const fy = Math.floor(yw)
      const g = (((fx + fy) % P) + P) % P
      const horizontal = g < n
      let acrossF: number
      let alongF: number
      let pid: number
      if (horizontal) {
        // Horizontal plank: spans n cells along x; `g` is the offset within it.
        acrossF = yw - fy
        alongF = (g + (xw - fx)) / n
        pid = wrap(fx - g) * 131 + wrap(fy) * 17 + 1
      } else {
        // Vertical plank: spans n cells along y; offset within it is g − n.
        const go = g - n
        acrossF = xw - fx
        alongF = (go + (yw - fy)) / n
        pid = wrap(fx) * 271 + wrap(fy - go) * 29 + 7
      }
      const val = 0.84 + hsh(pid) * 0.26
      const warm = 0.94 + hsh(pid + 1) * 0.14
      const lean = grainLean(seed, pid)
      // Latewood bands run along the plank length; warp so they meander.
      const warp2 = grain(alongF * 1.2 + (pid % 11), acrossF * 1.5) - 0.5
      const leaned = shearAcross(acrossF, alongF, lean)
      const band = Math.abs(Math.sin((leaned + warp2 * 0.5) * Math.PI * 7 + (pid % 7)))
      const fg = fine(alongF * 4, acrossF)
      let factor = val * (0.92 - band * 0.14 + (fg - 0.5) * 0.06)
      // Recessed grooves: across the width (plank sides) + at the butt ends.
      // JOINT-SCALE: micro-bevel widths (real herringbone joints are 1–2 mm).
      const edgeAcross = Math.min(acrossF, 1 - acrossF)
      const grooveA = edgeAcross < 0.03 ? edgeAcross / 0.03 : 1
      const edgeAlong = Math.min(alongF, 1 - alongF)
      const grooveB = edgeAlong < 0.02 ? edgeAlong / 0.02 : 1
      const groove = Math.min(grooveA, grooveB)
      factor *= 0.68 + 0.32 * groove
      const r = base[0] * factor * warm
      const gg = base[1] * factor
      const b = base[2] * factor * (2 - warm)
      const h = clamp01(0.5 * groove + band * 0.3)
      const rough = clamp01(0.42 + band * 0.16 + (1 - groove) * 0.2)
      setPx(f, y * S + x, r, gg, b, h, rough)
    }
  }
  return f
}
