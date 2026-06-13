/**
 * Procedurally-baked **equirectangular skyline** used by the `skyline` backdrop
 * (PHOTO-BACKDROP). Rendered once into a 2:1 canvas and set as `scene.background`
 * — a single texture with ZERO per-frame draw calls (vs the instanced 3D
 * estates), seen correctly through every window and never occluding the flat or
 * the sun. Its lack of parallax is physically correct for distant scenery.
 *
 * The layout maths (`buildSkylineBuildings`) is kept **pure + render-agnostic**
 * (no canvas) so it is unit-testable; `bakeSkylineCanvas` consumes it to paint
 * the texture. Asset-free by design, but shaped to be swapped for a real CC0
 * equirectangular photo later (same `EQUIRECT_W`×`EQUIRECT_H` background slot).
 */
import { mulberry32 } from '../materials/procedural/noise'

/** Equirectangular canvas size (2:1). Vertical resolution drives sky-gradient
 *  smoothness; this is a single GPU upload, not per-frame geometry. */
export const EQUIRECT_W = 2048
export const EQUIRECT_H = 1024
/** The horizon sits at the vertical centre of an equirectangular image. */
export const HORIZON_Y = EQUIRECT_H / 2

export interface SkylineBuilding {
  /** Left edge in pixels; may be negative or exceed `EQUIRECT_W` for the
   *  seam-wrap duplicate so the skyline tiles seamlessly around x=0/W. */
  x: number
  /** Width in pixels. */
  w: number
  /** Top edge in pixels (above the horizon → smaller than `HORIZON_Y`). */
  top: number
  /** Distance band 0 (near/tall/darker) … 1 (far/short/hazier) for atmospheric
   *  tint + window density. */
  depth: number
  /** Deterministic per-building seed for window-lighting variation. */
  seed: number
}

/**
 * Deterministic ring of building silhouettes around the full 360° horizon.
 * Two depth layers (a taller near layer over a shorter hazier far layer) give a
 * believable city profile. Buildings that cross the x=0/W seam are duplicated on
 * the opposite side so the equirect tiles without a visible cut.
 */
export function buildSkylineBuildings(seed = 0x5ca1e): SkylineBuilding[] {
  const rnd = mulberry32(seed)
  const out: SkylineBuilding[] = []

  const layer = (depth: number, minW: number, maxW: number, minH: number, maxH: number) => {
    let x = -rnd() * 60
    while (x < EQUIRECT_W) {
      const w = minW + rnd() * (maxW - minW)
      const h = minH + rnd() * (maxH - minH)
      const top = HORIZON_Y - h
      const b: SkylineBuilding = { x, w, top, depth, seed: Math.floor(rnd() * 0xffffff) }
      out.push(b)
      // Seam-wrap duplicate so a building straddling x=0/W tiles seamlessly.
      if (x + w > EQUIRECT_W) out.push({ ...b, x: x - EQUIRECT_W })
      if (x < 0) out.push({ ...b, x: x + EQUIRECT_W })
      // Small irregular gap between blocks (a few touch, most have sky between).
      x += w + (rnd() < 0.35 ? 0 : rnd() * 26)
    }
  }

  // Far hazier layer first (drawn behind), then the nearer taller layer.
  layer(1, 36, 96, 26, 96)
  layer(0, 48, 150, 70, 210)
  return out
}

/** Window grid for a building: returns the lit window cells (pixel rects) so the
 *  skyline reads as occupied blocks. Pure so it can be tested without a canvas. */
export function buildingWindows(
  b: SkylineBuilding,
): { x: number; y: number; w: number; h: number }[] {
  const rnd = mulberry32(b.seed)
  const cell = 11 + b.depth * 4 // far blocks get coarser, fewer windows
  const pad = 5
  const ww = cell * 0.5
  const wh = cell * 0.55
  const cols = Math.max(1, Math.floor((b.w - pad * 2) / cell))
  const rows = Math.max(1, Math.floor((HORIZON_Y - b.top - pad * 2) / cell))
  const lit: { x: number; y: number; w: number; h: number }[] = []
  // Near blocks light a few more windows; keep it sparse so daytime reads calm.
  const litChance = 0.16 - b.depth * 0.08
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rnd() < litChance) {
        lit.push({
          x: b.x + pad + c * cell + (cell - ww) / 2,
          y: b.top + pad + r * cell + (cell - wh) / 2,
          w: ww,
          h: wh,
        })
      }
    }
  }
  return lit
}

/**
 * Paint the equirectangular skyline into a fresh canvas. Returns the canvas
 * (caller wraps it in a `CanvasTexture`). Guards a missing 2D context (e.g.
 * happy-dom in tests) by returning the un-painted canvas rather than throwing.
 */
export function bakeSkylineCanvas(seed = 0x5ca1e): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = EQUIRECT_W
  canvas.height = EQUIRECT_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  // --- Sky: zenith → horizon vertical gradient (upper half of the equirect). ---
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y)
  sky.addColorStop(0, '#5d8fc4') // zenith — deeper blue
  sky.addColorStop(0.55, '#9fc0db')
  sky.addColorStop(1, '#dfe8ec') // horizon haze — pale
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, EQUIRECT_W, HORIZON_Y)

  // --- Ground: horizon → nadir (lower half), hazy neutral so it never distracts. ---
  const ground = ctx.createLinearGradient(0, HORIZON_Y, 0, EQUIRECT_H)
  ground.addColorStop(0, '#c4c6c0')
  ground.addColorStop(1, '#9a9c96')
  ctx.fillStyle = ground
  ctx.fillRect(0, HORIZON_Y, EQUIRECT_W, EQUIRECT_H - HORIZON_Y)

  // --- Buildings (far layer drawn first via array order). ---
  const buildings = buildSkylineBuildings(seed)
  for (const b of buildings) {
    // Atmospheric perspective: far blocks fade toward the horizon haze colour.
    const near = 1 - b.depth
    const r = Math.round(74 + (1 - near) * 90)
    const g = Math.round(86 + (1 - near) * 96)
    const bl = Math.round(104 + (1 - near) * 100)
    ctx.fillStyle = `rgb(${r},${g},${bl})`
    ctx.fillRect(b.x, b.top, b.w, HORIZON_Y - b.top)
    // Lit windows — warm, sparse.
    for (const win of buildingWindows(b)) {
      ctx.fillStyle = 'rgba(255,221,160,0.55)'
      ctx.fillRect(win.x, win.y, win.w, win.h)
    }
  }

  // --- Soft horizon haze band to blend skyline bases into the ground. ---
  const haze = ctx.createLinearGradient(0, HORIZON_Y - 28, 0, HORIZON_Y + 10)
  haze.addColorStop(0, 'rgba(223,232,236,0)')
  haze.addColorStop(1, 'rgba(223,232,236,0.85)')
  ctx.fillStyle = haze
  ctx.fillRect(0, HORIZON_Y - 28, EQUIRECT_W, 38)

  return canvas
}
