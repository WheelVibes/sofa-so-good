/** Tiled / masonry procedural patterns (tile, hexagon, checker, subway, brick). */
import { blank, type Fields, setPx, shade } from '../fieldKit'
import { clamp01, makeFbm, mulberry32 } from '../noise'

export function tileFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 22
  const tilesPerRow = 2
  const cell = S / tilesPerRow
  const groutW = S * 0.018
  const rand = mulberry32(seed)
  const cellTint: number[] = []
  for (let i = 0; i < tilesPerRow * tilesPerRow; i++) cellTint.push(0.94 + rand() * 0.12)
  const speck = makeFbm(seed + 3, 3, 50)
  // Aged grout: low-freq dirt fbm darkens the joints unevenly so they read as
  // lived-in rather than a pristine uniform line (RZ4). Fine micro fbm breaks
  // up the glossy ceramic-face roughness so the sheen isn't perfectly uniform.
  const groutDirt = makeFbm(seed + 17, 3, 7)
  const microRough = makeFbm(seed + 53, 4, 85)
  const grout: [number, number, number] = [base[0] * 0.62, base[1] * 0.62, base[2] * 0.6]
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cx = Math.floor(x / cell)
      const cy = Math.floor(y / cell)
      const inX = x - cx * cell
      const inY = y - cy * cell
      const distEdge = Math.min(inX, cell - inX, inY, cell - inY)
      const i = y * S + x
      if (distEdge < groutW) {
        // Recessed grout line, darkened unevenly by accumulated dirt; dirtier
        // patches read slightly rougher.
        const t = distEdge / groutW
        const ag = 0.74 + groutDirt(x / S, y / S) * 0.26
        setPx(
          f,
          i,
          grout[0] * ag,
          grout[1] * ag,
          grout[2] * ag,
          0.05 + t * 0.1,
          clamp01(0.86 + (1 - ag) * 0.5),
        )
      } else {
        const tint = cellTint[cy * tilesPerRow + cx]
        const sp = (speck(x / S, y / S) - 0.5) * 0.06
        const factor = clamp01(tint + sp)
        const [r, g, b] = shade(base, factor)
        // Glossy ceramic: low roughness, slight variance + micro break-up.
        setPx(
          f,
          i,
          r,
          g,
          b,
          0.85,
          clamp01(0.18 + Math.abs(sp) * 1.5 + (microRough(x / S, y / S) - 0.5) * 0.07),
        )
      }
    }
  }
  return f
}

/**
 * Honeycomb hexagon tile (a kitchen/bath staple). Voronoi cells over an offset
 * triangular lattice give hexagons; grout lines fall where the nearest two cell
 * centres are roughly equidistant. Seamless: the lattice is periodic over the
 * tile (cols/rows divide it, rows even so the half-row offset wraps) and centre
 * distances are measured toroidally, so cells crossing the edge match up.
 */
export function hexagonFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 20
  const cols = 5
  const rows = 6 // even → the alternate-row x-offset wraps cleanly
  const dx = S / cols
  const dy = S / rows
  const rand = mulberry32(seed)
  const tint: number[] = []
  for (let i = 0; i < cols * rows; i++) tint.push(0.92 + rand() * 0.14)
  const speck = makeFbm(seed + 3, 3, 50)
  const groutDirt = makeFbm(seed + 17, 3, 7) // aged-grout dirt (RZ4)
  const grout: [number, number, number] = [base[0] * 0.6, base[1] * 0.6, base[2] * 0.58]
  const groutW = 3.5 // px threshold on the gap between the two nearest centres
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let best = Infinity
      let second = Infinity
      let bestCol = 0
      let bestRow = 0
      const cyApprox = Math.round(y / dy)
      for (let rr = -1; rr <= 1; rr++) {
        const rowRaw = cyApprox + rr
        const row = ((rowRaw % rows) + rows) % rows
        const offX = row % 2 ? 0.5 : 0
        const colApprox = Math.round(x / dx - offX)
        for (let cc = -1; cc <= 1; cc++) {
          const colRaw = colApprox + cc
          const centerX = (colRaw + offX) * dx
          const centerY = rowRaw * dy
          let ddx = x - centerX
          ddx -= S * Math.round(ddx / S)
          let ddy = y - centerY
          ddy -= S * Math.round(ddy / S)
          const d = ddx * ddx + ddy * ddy
          const colW = ((colRaw % cols) + cols) % cols
          if (d < best) {
            second = best
            best = d
            bestCol = colW
            bestRow = row
          } else if (d < second) {
            second = d
          }
        }
      }
      const edge = Math.sqrt(second) - Math.sqrt(best)
      const i = y * S + x
      if (edge < groutW) {
        const t = edge / groutW
        const ag = 0.74 + groutDirt(x / S, y / S) * 0.26
        setPx(
          f,
          i,
          grout[0] * ag,
          grout[1] * ag,
          grout[2] * ag,
          0.05 + t * 0.1,
          clamp01(0.86 + (1 - ag) * 0.5),
        )
      } else {
        const tt = tint[bestRow * cols + bestCol]
        const sp = (speck(x / S, y / S) - 0.5) * 0.05
        const [r, g, b] = shade(base, clamp01(tt + sp))
        setPx(f, i, r, g, b, 0.82, 0.2 + Math.abs(sp) * 1.5)
      }
    }
  }
  return f
}

export function checkerFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 0.6
  const cells = 4
  const cs = S / cells
  const grain = makeFbm(seed + 3, 3, 30)
  const dark: [number, number, number] = [base[0] * 0.26, base[1] * 0.26, base[2] * 0.28]
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cell = (Math.floor(x / cs) + Math.floor(y / cs)) % 2
      const col = cell === 0 ? base : dark
      const g = grain(x / S, y / S)
      const ex = Math.min(x % cs, cs - (x % cs))
      const ey = Math.min(y % cs, cs - (y % cs))
      const grout = Math.min(ex, ey) < 1.5 ? 0.8 : 1
      const [r, gg, b] = shade(col, clamp01((0.98 + (g - 0.5) * 0.04) * grout))
      setPx(f, y * S + x, r, gg, b, grout < 1 ? 0.2 : 0.08, 0.32)
    }
  }
  return f
}

/**
 * Basketweave parquet: a grid of square blocks, each holding K parallel wood
 * planks, with block orientation alternating like a checkerboard (horizontal /
 * vertical). Seamless because the block grid divides the tile evenly. The plank
 * shading reuses the wood look (warped latewood bands + tinted boards + recessed
 * grooves at plank/block edges), oriented per block.
 */
export function subwayFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 14
  const cols = 4
  const tw = S / cols // tile width
  const rows = 8 // even → half-offset running bond wraps; 2:1 tiles (tw = 2·th)
  const th = S / rows
  const grout = Math.max(2, Math.round(S / 150)) // thin joint
  const bevel = Math.max(3, Math.round(S / 90)) // soft edge bevel band
  const groutRgb: [number, number, number] = [218, 214, 206]
  const speck = makeFbm(seed + 7, 3, 60)
  const groutDirt = makeFbm(seed + 17, 3, 7) // aged-grout dirt (RZ4)
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / th)
    const yIn = y - row * th
    const offset = (row & 1) * (tw / 2)
    for (let x = 0; x < S; x++) {
      const xs = (((x + offset) % S) + S) % S
      const col = Math.floor(xs / tw)
      const xIn = xs - col * tw
      const edge = Math.min(xIn, tw - xIn, yIn, th - yIn)
      const i = y * S + x
      if (edge < grout) {
        // Recessed grout joint, unevenly darkened by accumulated dirt.
        const ag = 0.74 + groutDirt(x / S, y / S) * 0.26
        setPx(
          f,
          i,
          groutRgb[0] * ag,
          groutRgb[1] * ag,
          groutRgb[2] * ag,
          0.05,
          clamp01(0.8 + (1 - ag) * 0.5),
        )
        continue
      }
      // Ceramic face — bright, low roughness; a bevel band near the joint catches
      // light (raised height) so each tile reads as proud + glossy.
      const onBevel = edge < grout + bevel
      const bv = onBevel ? (edge - grout) / bevel : 1
      const sp = (speck(x / S, y / S) - 0.5) * 0.04
      const factor = clamp01(0.97 + sp + (onBevel ? (1 - bv) * 0.06 : 0))
      const [r, g, b] = shade(base, factor)
      const height = onBevel ? 0.5 + bv * 0.45 : 0.95
      setPx(f, i, r, g, b, height, 0.12 + Math.abs(sp) * 1.2)
    }
  }
  return f
}

export function brickFields(base: [number, number, number], seed: number, S: number): Fields {
  const f = blank(S)
  f.normalStrength = 5
  const cols = 5
  const bw = S / cols // brick width (px) — divides S → seamless horizontally
  const rows = 12 // even → the per-row half-offset wraps seamlessly
  const bh = S / rows // brick height (px)
  const mortar = Math.max(2, Math.round(S / 110)) // joint thickness (px)
  const mortarRgb: [number, number, number] = [188, 182, 172]
  const grain = makeFbm(seed + 5, 3, 26)
  // Aged mortar: low-freq dirt darkens the joints unevenly (RZ4, as for tile
  // grout); fine micro fbm breaks up the brick-face roughness so the matte clay
  // doesn't read perfectly uniform.
  const mortarDirt = makeFbm(seed + 23, 3, 6)
  const microRough = makeFbm(seed + 71, 3, 75)
  const hsh = (n: number) => {
    let t = (n * 2654435761) >>> 0
    t ^= t >>> 15
    t = (t * 2246822519) >>> 0
    return (t >>> 8) / 16777216
  }
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / bh)
    const yIn = y - row * bh
    const offset = (row & 1) * (bw / 2)
    for (let x = 0; x < S; x++) {
      const xs = (((x + offset) % S) + S) % S
      const col = Math.floor(xs / bw)
      const xIn = xs - col * bw
      const inMortar = xIn < mortar || xIn > bw - mortar || yIn < mortar || yIn > bh - mortar
      const i = y * S + x
      if (inMortar) {
        const g = grain(x / S, y / S)
        const ag = 0.78 + mortarDirt(x / S, y / S) * 0.22 // uneven dirt darkening
        const c = (0.92 + (g - 0.5) * 0.08) * ag
        setPx(
          f,
          i,
          mortarRgb[0] * c,
          mortarRgb[1] * c,
          mortarRgb[2] * c,
          0.12,
          clamp01(0.85 + (1 - ag) * 0.3),
        )
        continue
      }
      const id = row * 53 + col * 17
      // Per-brick value + warmth variation, plus fine intra-brick speckle.
      const val = 0.8 + hsh(id) * 0.35
      const warm = 0.96 + hsh(id + 1) * 0.1
      const speck = grain(x / S + id, y / S) - 0.5
      const factor = val * (1 + speck * 0.08)
      const r = base[0] * factor * warm
      const g = base[1] * factor
      const b = base[2] * factor * (2 - warm)
      // Bricks bulge slightly proud of the mortar; rougher than mortar, with a
      // faint micro break-up so the clay face isn't a flat matte slab.
      setPx(
        f,
        i,
        r,
        g,
        b,
        0.6 + speck * 0.1,
        clamp01(0.7 + speck * 0.15 + (microRough(x / S, y / S) - 0.5) * 0.08),
      )
    }
  }
  return f
}

/**
 * Board-and-batten panelling: a flat painted panel with evenly-spaced vertical
 * raised battens (with bevelled edges in the height map). Seamless — the batten
 * count divides the tile. `base` is the paint colour.
 */
