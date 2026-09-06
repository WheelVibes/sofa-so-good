/**
 * ESTATE-SURROUND textures — procedurally painted, CC0-free by construction.
 *
 * Every painter returns an `HTMLCanvasElement` and tolerates a missing 2D context
 * (happy-dom in tests) by returning the blank, correctly-sized canvas — the same
 * contract as `backdropEquirect.ts`. Pixel content is deterministic (seeded).
 *
 * One façade TILE covers `TILE_BAYS × TILE_STOREYS` units and is repeated across a
 * block by UV scaling (`Estate.tsx:tileBoxUv`), so a single texture serves every
 * block whatever its size, and the repeat period (14.4 × 8.4 m) is long enough that
 * the eye does not catch it through a window. Day and night are two canvases: the
 * day albedo, and an emissive mask of the windows that are lit after dark.
 *
 * **ESTATE-CORRIDOR-NIGHT (flag `estateCorridorNightMask`, default on).** The
 * corridor night mask paints a THIN tube line + a wash confined to the upper part of
 * the void, not a gradient filling the whole corridor void — a full-height gradient,
 * at `Estate.tsx`'s night emissive scale (up to ×2.4) and the post stack's 1.35
 * bloom threshold, saturated and bloomed into one continuous white band the length
 * of a wing, erasing the storey lines a real HDB corridor reads by. The legacy mask
 * stays reachable with the flag off (`paintFacadeTile`'s `corridorNightMask` option,
 * set by the caller from the feature flag — the painter itself stays pure and never
 * reads a flag). See `paintFacadeTile`'s corridor branch for the exact values.
 */
import { mulberry32 } from '../../materials/procedural/noise'
import { BAY_W, STOREY_H } from './estateLayout'

export const TILE_BAYS = 4
export const TILE_STOREYS = 3
export const TILE_W_M = BAY_W * TILE_BAYS
export const TILE_H_M = STOREY_H * TILE_STOREYS
/** Pixels per metre on the façade tiles — ~3 cm texels, sharp through a window at 40–90 m. */
const FACADE_PX_PER_M = 72
export const FACADE_TILE_W = Math.round(TILE_W_M * FACADE_PX_PER_M) // 1037 → 1024-ish
export const FACADE_TILE_H = Math.round(TILE_H_M * FACADE_PX_PER_M)

/** Three HDB paint families (light, warm, cool) — linear-ish sRGB hex. */
export const WALL_PAINTS = ['#e9e6df', '#e3d9c6', '#d9dde0'] as const
const ACCENT_BANDS = ['#b5583f', '#3d6a8a', '#6f8f5a'] as const

function canvas(
  w: number,
  h: number,
): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, ctx: c.getContext('2d') }
}

/** Fine per-pixel-ish noise so a wall is not a flat fill (cheap: coarse rects). */
function speckle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rnd: () => number,
  n: number,
  alpha: number,
) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(rnd() * 255)
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`
    ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3)
  }
}

export interface FacadeTileOptions {
  kind: 'windows' | 'corridor'
  /** Paint family index into WALL_PAINTS. */
  paint: number
  /** When true, paints the emissive (night) mask instead of the day albedo. */
  night: boolean
  seed?: number
  /**
   * ESTATE-CORRIDOR-NIGHT (flag `estateCorridorNightMask`, set by the caller from the
   * feature flag — this painter stays pure and never reads flags itself). Only affects
   * the CORRIDOR night mask: a real HDB corridor at night reads as a thin bright tube
   * line under the slab, a modest cool wash on the back wall fading toward the parapet,
   * and a dark parapet — the storeys stay visually separate. The legacy mask (this flag
   * off) painted the tube 1.2 x 0.08 m at rgb(225,240,255) and a spill gradient
   * rgba(200,215,235,0.55 -> 0.05) over the ENTIRE void; at emissiveIntensity (1-daylight)^1.4
   * x 2.4 (`Estate.tsx:EXTERIOR_NIGHT_GLOW`) that filled the whole corridor void and
   * saturated/bloomed into one continuous glowing band the length of the wing. Kept
   * reachable (flag off) as a regression guard and rollback path.
   */
  corridorNightMask?: boolean
}

/**
 * One façade tile. WINDOWS side: per bay a two-leaf sliding window with curtains, a
 * small bathroom window, an aircon ledge with a condenser on some bays, and a thin
 * accent band along every third storey. CORRIDOR side: a 1.1 m parapet, the open
 * corridor behind it (back wall with a door + gate per bay), and a ceiling light.
 */
export function paintFacadeTile(opts: FacadeTileOptions): HTMLCanvasElement {
  const W = FACADE_TILE_W
  const H = FACADE_TILE_H
  const { c, ctx } = canvas(W, H)
  if (!ctx) return c
  const rnd = mulberry32(
    (opts.seed ?? 7) * 31 + opts.paint * 7 + (opts.kind === 'corridor' ? 3 : 0),
  )
  const pxm = FACADE_PX_PER_M
  const bayPx = BAY_W * pxm
  const stoPx = STOREY_H * pxm

  if (opts.night) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
  } else {
    ctx.fillStyle = WALL_PAINTS[opts.paint % WALL_PAINTS.length]
    ctx.fillRect(0, 0, W, H)
    speckle(ctx, W, H, rnd, 2600, 0.045)
    // Weathering: a faint darker wash under each storey's slab line.
    for (let s = 0; s < TILE_STOREYS; s++) {
      const yTop = H - (s + 1) * stoPx
      const g = ctx.createLinearGradient(0, yTop, 0, yTop + 0.35 * pxm)
      g.addColorStop(0, 'rgba(60,55,50,0.16)')
      g.addColorStop(1, 'rgba(60,55,50,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, yTop, W, 0.35 * pxm)
    }
  }

  for (let s = 0; s < TILE_STOREYS; s++) {
    // Storey s: y grows downward in canvas; floor line of storey s at yFloor.
    const yFloor = H - s * stoPx
    const yCeil = yFloor - stoPx
    for (let b = 0; b < TILE_BAYS; b++) {
      const x0 = b * bayPx
      const lit = rnd() < 0.42
      if (opts.kind === 'windows') {
        // Main window: 1.5 m wide × 1.2 m tall, sill at 0.9 m.
        const ww = 1.5 * pxm
        const wh = 1.2 * pxm
        const wx = x0 + 0.5 * pxm
        const wy = yFloor - 0.9 * pxm - wh
        if (opts.night) {
          if (lit) {
            ctx.fillStyle = rnd() < 0.7 ? 'rgb(255,214,150)' : 'rgb(230,235,255)'
            ctx.fillRect(wx, wy, ww, wh)
          }
        } else {
          // Frame
          ctx.fillStyle = '#cfd2d4'
          ctx.fillRect(wx - 0.05 * pxm, wy - 0.05 * pxm, ww + 0.1 * pxm, wh + 0.1 * pxm)
          // Glass: dark blue-grey with a diagonal sky reflection gradient.
          const g = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh)
          g.addColorStop(0, '#5f7386')
          g.addColorStop(0.5, '#3f4e5c')
          g.addColorStop(1, '#6a7d8f')
          ctx.fillStyle = g
          ctx.fillRect(wx, wy, ww, wh)
          // Curtain behind one leaf on some units.
          if (rnd() < 0.55) {
            const cur = ['#d8cfc2', '#c9d3cf', '#e2dccf', '#b9a58f'][Math.floor(rnd() * 4)]
            ctx.fillStyle = cur
            const leafW = ww / 2
            ctx.globalAlpha = 0.85
            ctx.fillRect(
              rnd() < 0.5 ? wx : wx + leafW,
              wy + 0.04 * pxm,
              leafW - 0.04 * pxm,
              wh - 0.08 * pxm,
            )
            ctx.globalAlpha = 1
          }
          // Mullion between the two sliding leaves.
          ctx.fillStyle = '#c4c7c9'
          ctx.fillRect(wx + ww / 2 - 0.02 * pxm, wy, 0.04 * pxm, wh)
        }
        // Bathroom window: 0.6 × 0.6 at 1.5 m sill, right end of the bay.
        const bw = 0.6 * pxm
        const bx = x0 + 2.6 * pxm
        const by = yFloor - 1.5 * pxm - bw
        if (opts.night) {
          if (rnd() < 0.25) {
            ctx.fillStyle = 'rgb(235,240,255)'
            ctx.fillRect(bx, by, bw, bw)
          }
        } else {
          ctx.fillStyle = '#cfd2d4'
          ctx.fillRect(bx - 0.04 * pxm, by - 0.04 * pxm, bw + 0.08 * pxm, bw + 0.08 * pxm)
          ctx.fillStyle = '#8fa0ad'
          ctx.fillRect(bx, by, bw, bw)
          // Aircon ledge under the bathroom window on ~60 % of bays: a concrete shelf
          // with a condenser unit.
          if (rnd() < 0.6) {
            ctx.fillStyle = '#b9b6ae'
            ctx.fillRect(x0 + 2.35 * pxm, yFloor - 1.3 * pxm, 1.1 * pxm, 0.12 * pxm)
            ctx.fillStyle = '#d9d8d3'
            ctx.fillRect(x0 + 2.5 * pxm, yFloor - 1.28 * pxm, 0.8 * pxm, 0.55 * pxm)
            ctx.fillStyle = '#7d7f7c'
            ctx.fillRect(x0 + 2.55 * pxm, yFloor - 1.2 * pxm, 0.7 * pxm, 0.4 * pxm)
          }
        }
        // Accent band along the slab of every third storey.
        if (!opts.night && s === 1) {
          ctx.fillStyle = ACCENT_BANDS[opts.paint % ACCENT_BANDS.length]
          ctx.fillRect(x0, yCeil, bayPx, 0.28 * pxm)
        }
      } else {
        // CORRIDOR side. Parapet 1.1 m, corridor void above it up to the slab.
        const parapetTop = yFloor - 1.1 * pxm
        const slabBottom = yCeil + 0.25 * pxm
        if (opts.night) {
          if (opts.corridorNightMask) {
            // ESTATE-CORRIDOR-NIGHT: a thin tube line (well under the legacy 0.08 m,
            // and dim enough at rgb(200,215,230) that ×2.4 + AgX no longer saturates)
            // plus a soft wash confined to the upper ~60% of the void — the lower
            // parapet-side 40% and the parapet band itself stay black, so storeys
            // read as separate lit tubes rather than one continuous glowing band.
            ctx.fillStyle = 'rgb(200,215,230)'
            ctx.fillRect(x0 + 0.9 * pxm, slabBottom + 0.05 * pxm, 1.2 * pxm, 0.05 * pxm)
            const washH = (parapetTop - slabBottom) * 0.6
            const g = ctx.createLinearGradient(0, slabBottom, 0, slabBottom + washH)
            g.addColorStop(0, 'rgba(200,215,230,0.18)')
            g.addColorStop(1, 'rgba(200,215,230,0)')
            ctx.fillStyle = g
            ctx.fillRect(x0, slabBottom, bayPx, washH)
          } else {
            // Legacy mask (flag off) — fluorescent tube under the slab plus a spill
            // gradient over the ENTIRE void. Kept byte-identical as a regression guard.
            ctx.fillStyle = 'rgb(225,240,255)'
            ctx.fillRect(x0 + 0.9 * pxm, slabBottom + 0.05 * pxm, 1.2 * pxm, 0.08 * pxm)
            const g = ctx.createLinearGradient(0, slabBottom, 0, parapetTop)
            g.addColorStop(0, 'rgba(200,215,235,0.55)')
            g.addColorStop(1, 'rgba(200,215,235,0.05)')
            ctx.fillStyle = g
            ctx.fillRect(x0, slabBottom, bayPx, parapetTop - slabBottom)
          }
        } else {
          // Corridor interior (back wall ~1.5 m behind the parapet): a slightly darker
          // beige with a door + gate per bay.
          ctx.fillStyle = '#c9c2b4'
          ctx.fillRect(x0, slabBottom, bayPx, parapetTop - slabBottom)
          // Ceiling shadow under the slab.
          const g = ctx.createLinearGradient(0, slabBottom, 0, slabBottom + 0.6 * pxm)
          g.addColorStop(0, 'rgba(40,35,30,0.55)')
          g.addColorStop(1, 'rgba(40,35,30,0)')
          ctx.fillStyle = g
          ctx.fillRect(x0, slabBottom, bayPx, 0.6 * pxm)
          // Door (0.95 × 2.1) with a metal gate in front.
          const dx = x0 + 1.3 * pxm
          const dh = 2.1 * pxm
          ctx.fillStyle = ['#7a5230', '#8a6a48', '#5e4a3a'][Math.floor(rnd() * 3)]
          ctx.fillRect(dx, yFloor - dh, 0.95 * pxm, dh - 1.1 * pxm)
          ctx.fillStyle = 'rgba(60,60,60,0.6)'
          for (let k = 0; k < 6; k++)
            ctx.fillRect(dx + k * 0.16 * pxm, yFloor - dh, 0.02 * pxm, dh - 1.1 * pxm)
          // Parapet: painted, with a darker coping line.
          ctx.fillStyle = WALL_PAINTS[opts.paint % WALL_PAINTS.length]
          ctx.fillRect(x0, parapetTop, bayPx, 1.1 * pxm)
          ctx.fillStyle = 'rgba(70,65,60,0.35)'
          ctx.fillRect(x0, parapetTop, bayPx, 0.06 * pxm)
          // Laundry poles out of the parapet on ~30 % of bays: a pole and a few garments.
          if (rnd() < 0.3) {
            ctx.fillStyle = '#9a9a96'
            ctx.fillRect(x0 + 0.6 * pxm, parapetTop - 0.05 * pxm, 2.2 * pxm, 0.04 * pxm)
            for (let k = 0; k < 3; k++) {
              ctx.fillStyle = ['#e8e4dc', '#4a6a9a', '#c05a5a', '#f0d59a'][Math.floor(rnd() * 4)]
              ctx.fillRect(
                x0 + (0.8 + k * 0.6) * pxm,
                parapetTop - 0.02 * pxm,
                0.4 * pxm,
                0.5 * pxm,
              )
            }
          }
        }
      }
    }
  }
  return c
}

/** Grass: layered blotches of three greens plus worn earth patches — deliberately no
 *  straight feature, because anything linear repeats visibly across a 24 m tile. */
export const GROUND_TILE_M = 24
export function paintGroundTile(seed = 3): HTMLCanvasElement {
  const S = 512
  const { c, ctx } = canvas(S, S)
  if (!ctx) return c
  const rnd = mulberry32(seed)
  ctx.fillStyle = '#4f6a3a'
  ctx.fillRect(0, 0, S, S)
  const greens = ['#5b7a42', '#4a6636', '#66804a', '#576f3e', '#6d8552']
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = greens[Math.floor(rnd() * greens.length)]
    ctx.globalAlpha = 0.35 + rnd() * 0.4
    const r = 5 + rnd() * 30
    const x = rnd() * S
    const y = rnd() * S
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2)
    ctx.fill()
    // Wrap the blotch across the tile seam so the repeat has no edge.
    if (x < r) {
      ctx.beginPath()
      ctx.ellipse(x + S, y, r, r * 0.7, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    if (y < r) {
      ctx.beginPath()
      ctx.ellipse(x, y + S, r, r * 0.7, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // Worn earth where feet cut across the grass.
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = '#8a7a5c'
    ctx.globalAlpha = 0.18 + rnd() * 0.2
    const r = 14 + rnd() * 40
    ctx.beginPath()
    ctx.ellipse(rnd() * S, rnd() * S, r, r * 0.45, rnd() * 3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  return c
}

/** Asphalt with a centre line and kerbs — road tile, 12 m along its length. */
export const ROAD_TILE_M = 12
export function paintRoadTile(seed = 5): HTMLCanvasElement {
  const S = 256
  const { c, ctx } = canvas(S, S)
  if (!ctx) return c
  const rnd = mulberry32(seed)
  ctx.fillStyle = '#4b4d4f'
  ctx.fillRect(0, 0, S, S)
  speckle(ctx, S, S, rnd, 500, 0.08)
  ctx.fillStyle = '#e8e2c6'
  ctx.fillRect(0, S / 2 - 3, S * 0.45, 6)
  ctx.fillStyle = '#c9c6bd'
  ctx.fillRect(0, 0, S, 10)
  ctx.fillRect(0, S - 10, S, 10)
  return c
}

/** Number of tree sprite variants (`paintTreeSprite(variant)`). */
export const TREE_VARIANTS = 3

/**
 * Rain-tree sprite with alpha. Singapore's estate tree is the rain tree (Samanea
 * saman): a broad UMBRELLA crown — wide, shallow, flat-topped — on a tall clear trunk,
 * far wider than it is deep. Painted as many small leaf clusters so the silhouette is
 * ragged rather than a lollipop, darker underneath, lit from above.
 */
export function paintTreeSprite(variant = 0): HTMLCanvasElement {
  const S = 512
  const { c, ctx } = canvas(S, S)
  if (!ctx) return c
  const rnd = mulberry32(101 + variant * 17)
  ctx.clearRect(0, 0, S, S)
  // Trunk + two main limbs.
  ctx.strokeStyle = '#4b3a2a'
  ctx.lineCap = 'round'
  ctx.lineWidth = S * 0.035
  ctx.beginPath()
  ctx.moveTo(S * 0.5, S)
  ctx.lineTo(S * 0.5, S * 0.55)
  ctx.stroke()
  ctx.lineWidth = S * 0.022
  for (const dx of [-0.16, 0.14]) {
    ctx.beginPath()
    ctx.moveTo(S * 0.5, S * 0.58)
    ctx.lineTo(S * (0.5 + dx), S * 0.42)
    ctx.stroke()
  }
  // Crown: an umbrella — clusters concentrated in a wide, shallow ellipse whose
  // top edge is flattish. Underside clusters darker; top clusters lighter.
  const cx = S * 0.5
  const cy = S * 0.38
  const rx = S * 0.46
  const ry = S * 0.19
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2
    const rr = Math.sqrt(rnd())
    const x = cx + Math.cos(a) * rx * rr * (0.85 + rnd() * 0.15)
    const y = cy + Math.sin(a) * ry * rr
    // Shade by height within the crown: top bright, bottom dark.
    const t = (y - (cy - ry)) / (2 * ry)
    const g = 118 - t * 62 + (rnd() - 0.5) * 18
    const r = g * 0.58 + (rnd() - 0.5) * 8
    const b = g * 0.42
    ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${0.86 + rnd() * 0.14})`
    const rad = S * (0.018 + rnd() * 0.03)
    ctx.beginPath()
    ctx.ellipse(x, y, rad * 1.3, rad, rnd() * 0.6, 0, Math.PI * 2)
    ctx.fill()
  }
  // A few drooping lower clusters break the ellipse.
  for (let i = 0; i < 24; i++) {
    const x = cx + (rnd() - 0.5) * rx * 1.6
    const y = cy + ry * (0.7 + rnd() * 0.55)
    ctx.fillStyle = `rgba(${34 + rnd() * 10},${58 + rnd() * 14},${28},0.9)`
    const rad = S * (0.014 + rnd() * 0.02)
    ctx.beginPath()
    ctx.ellipse(x, y, rad * 1.2, rad, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  return c
}
