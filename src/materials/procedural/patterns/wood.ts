/** Wood-grain procedural patterns (planks, parquet, herringbone). */
import { blank, type Fields, setPx } from '../fieldKit'
import { clamp01, makeFbm, mulberry32 } from '../noise'
import { grainLean, plankHash, shearAcross } from '../woodPlank'

export function woodFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 9
  const rand = mulberry32(seed)
  const planks = 6 // boards stacked across the tile
  const plankH = S / planks
  // Per-plank tint with correlated warmth (real boards vary in hue + value).
  const plank = Array.from({ length: planks }, (_, i) => {
    const val = 0.86 + rand() * 0.24 // brightness
    const warm = 0.94 + rand() * 0.16 // >1 warmer (more red, less blue)
    const phase = rand() * 10
    // A couple of knots per board at random positions along its length.
    const knots =
      rand() < 0.6 ? [{ u: rand(), v: 0.25 + rand() * 0.5, r: 0.012 + rand() * 0.02 }] : []
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
      let factor = pk.val * (0.92 - band * 0.16 + (fg - 0.5) * 0.06)

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

      // Plank groove (dark + recessed bevel between boards).
      const edge = Math.min(yInPlank, 1 - yInPlank)
      const groove = edge < 0.035 ? edge / 0.035 : 1
      factor *= 0.45 + 0.55 * groove

      // Apply warmth: scale R up / B down around the value.
      const r = base[0] * factor * pk.warm
      const g = base[1] * factor
      const b = base[2] * factor * (2 - pk.warm)
      const h = clamp01(0.55 * groove + band * 0.3 + knotH)
      // Satin-varnished boards: fairly glossy, grain lines slightly rougher,
      // plus a faint micro break-up so the sheen isn't dead-flat.
      const rough = clamp01(
        0.42 + band * 0.16 + (1 - groove) * 0.2 + (microRough(u, v) - 0.5) * 0.08,
      )
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
      const edgeAcross = Math.min(across, 1 - across)
      const grooveA = edgeAcross < 0.06 ? edgeAcross / 0.06 : 1
      const edgeAlong = Math.min(along, 1 - along)
      const grooveB = edgeAlong < 0.03 ? edgeAlong / 0.03 : 1
      const groove = Math.min(grooveA, grooveB)
      factor *= 0.5 + 0.5 * groove
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
      const edgeAcross = Math.min(acrossF, 1 - acrossF)
      const grooveA = edgeAcross < 0.07 ? edgeAcross / 0.07 : 1
      const edgeAlong = Math.min(alongF, 1 - alongF)
      const grooveB = edgeAlong < 0.05 ? edgeAlong / 0.05 : 1
      const groove = Math.min(grooveA, grooveB)
      factor *= 0.5 + 0.5 * groove
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
