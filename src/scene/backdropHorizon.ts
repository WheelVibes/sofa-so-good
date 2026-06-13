/**
 * Pure, render-agnostic **horizon art generators** for the equirectangular photo
 * backdrops (`backdropEquirect.ts`). No canvas / three deps so the layout maths is
 * unit-testable; the baker consumes these to paint each preset's horizon band.
 *
 * Three horizon kinds: a city `buildings` skyline, a `trees` treeline, and layered
 * `hills`. All deterministic (seeded `mulberry32`) and sized to the equirect.
 */
import { mulberry32 } from '../materials/procedural/noise'

/** Equirectangular canvas size (2:1). One GPU upload, not per-frame geometry.
 *  The horizon sits at the vertical centre of an equirectangular image. */
export const EQUIRECT_W = 2048
export const EQUIRECT_H = 1024
export const HORIZON_Y = EQUIRECT_H / 2

// ---------------------------------------------------------------------------
// City buildings
// ---------------------------------------------------------------------------

export interface SkylineBuilding {
  /** Left edge in pixels; may be negative or exceed `EQUIRECT_W` for the
   *  seam-wrap duplicate so the skyline tiles seamlessly around x=0/W. */
  x: number
  /** Width in pixels. */
  w: number
  /** Top edge in pixels (above the horizon → smaller than `HORIZON_Y`). */
  top: number
  /** Distance band 0 (near/tall/darker) … 1 (far/short/hazier). */
  depth: number
  /** Deterministic per-building seed for window-lighting variation. */
  seed: number
}

/**
 * Deterministic ring of building silhouettes around the full 360° horizon. Two
 * depth layers (a taller near layer over a shorter hazier far layer). Buildings
 * crossing the x=0/W seam are duplicated on the opposite side so the equirect
 * tiles without a visible cut.
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
      if (x + w > EQUIRECT_W) out.push({ ...b, x: x - EQUIRECT_W })
      if (x < 0) out.push({ ...b, x: x + EQUIRECT_W })
      x += w + (rnd() < 0.35 ? 0 : rnd() * 26)
    }
  }

  layer(1, 36, 96, 26, 96) // far hazier layer (drawn first)
  layer(0, 48, 150, 70, 210) // near taller layer
  return out
}

/** Lit window cells (pixel rects) for a building. `litScale` boosts the lit
 *  fraction (e.g. a dusk skyline lights far more windows). Pure / testable. */
export function buildingWindows(
  b: SkylineBuilding,
  litScale = 1,
): { x: number; y: number; w: number; h: number }[] {
  const rnd = mulberry32(b.seed)
  const cell = 11 + b.depth * 4
  const pad = 5
  const ww = cell * 0.5
  const wh = cell * 0.55
  const cols = Math.max(1, Math.floor((b.w - pad * 2) / cell))
  const rows = Math.max(1, Math.floor((HORIZON_Y - b.top - pad * 2) / cell))
  const lit: { x: number; y: number; w: number; h: number }[] = []
  const litChance = Math.min(0.95, (0.16 - b.depth * 0.08) * litScale)
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

// ---------------------------------------------------------------------------
// Treeline
// ---------------------------------------------------------------------------

export interface HorizonTree {
  /** Canopy centre x in pixels (seam-wrapped duplicates included). */
  cx: number
  /** Canopy radius in pixels. */
  r: number
  /** Depth band 0 (near/large/darker) … 1 (far/small/hazier). */
  depth: number
}

/** A continuous tree line along the horizon — overlapping canopies, two depth
 *  layers, seam-wrapped. Deterministic / testable. */
export function buildTreeline(seed = 0x7ee5): HorizonTree[] {
  const rnd = mulberry32(seed)
  const out: HorizonTree[] = []
  const layer = (depth: number, minR: number, maxR: number) => {
    let x = -rnd() * 40
    while (x < EQUIRECT_W) {
      const r = minR + rnd() * (maxR - minR)
      const t: HorizonTree = { cx: x + r, r, depth }
      out.push(t)
      if (x + r * 2 > EQUIRECT_W) out.push({ ...t, cx: t.cx - EQUIRECT_W })
      if (x < 0) out.push({ ...t, cx: t.cx + EQUIRECT_W })
      x += r * (1.1 + rnd() * 0.5)
    }
  }
  layer(1, 16, 30) // far row
  layer(0, 26, 52) // near row
  return out
}

// ---------------------------------------------------------------------------
// Hills
// ---------------------------------------------------------------------------

export interface HillBand {
  /** Baseline y (ridge sits this far above the horizon at amplitude 0). */
  baseY: number
  /** Vertical amplitude of the rolling ridge, in pixels. */
  amp: number
  /** Angular frequency (radians per pixel) of the ridge undulation. */
  freq: number
  /** Phase offset in radians. */
  phase: number
  /** Depth band 0 (near/darker) … 1 (far/hazier). */
  depth: number
}

/** Ridge height (pixel y) of a hill band at column x — pure helper shared by the
 *  baker and tests so the curve is verifiable without a canvas. */
export function hillRidgeY(band: HillBand, x: number): number {
  const u = 0.5 + 0.5 * Math.sin(band.freq * x + band.phase)
  // A second harmonic adds gentle irregularity without breaking seam-tiling.
  const v = 0.5 + 0.5 * Math.sin(band.freq * 2 * x + band.phase * 1.7)
  return band.baseY - band.amp * (0.7 * u + 0.3 * v)
}

/** A back-to-front stack of rolling hill ridges receding into haze.
 *  Frequencies are integer multiples of 2π/EQUIRECT_W so every ridge tiles
 *  seamlessly across the x=0/W seam. Deterministic / testable. */
export function buildHillBands(seed = 0x4111): HillBand[] {
  const rnd = mulberry32(seed)
  const bands: HillBand[] = []
  const n = 4
  const base = (2 * Math.PI) / EQUIRECT_W
  for (let i = 0; i < n; i++) {
    const depth = i / (n - 1) // 0 near … 1 far
    bands.push({
      baseY: HORIZON_Y - (10 + depth * 70), // far bands sit higher (smaller y)
      amp: 26 + (1 - depth) * 40,
      freq: base * (2 + Math.floor(rnd() * 3)), // 2–4 full waves around the ring
      phase: rnd() * Math.PI * 2,
      depth,
    })
  }
  // Draw far (high depth) first so nearer ridges overlap in front.
  return bands.sort((a, b) => b.depth - a.depth)
}
