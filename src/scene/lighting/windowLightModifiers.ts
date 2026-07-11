/**
 * windowLightModifiers.ts
 *
 * Pure functions for window-glass tint and curtain light attenuation.
 *
 * ## Glass tint
 * Each window is treated as having a clear glass pane by default. A user-specified
 * tint (e.g. amber, warm-white, blue) is mixed into the sun-light colour. In the
 * Performance tier this is a colour-only modulation (no extra geometry/shader cost).
 * The tint is stored as a hex string on the FurnitureItem for a `window-glass` item;
 * but for now the system uses a GLOBAL tint stored in the windowLightSignal. This
 * function is kept pure and testable.
 *
 * ## Curtain attenuation
 * When a Curtain (or RollerBlind) item's footprint overlaps a window's 1D extent
 * along the wall AND the curtain faces approximately the same wall, the sun
 * intensity through that window is dimmed by how DRAWN it is (CURTAIN-DRAW) and
 * its OPACITY level (CURTAIN-OPACITY, `draperyOpacity.ts`): at full cover each
 * treatment passes its opacity floor — sheer ≈ 0.45, light-filtering ≈ 0.30,
 * room-darkening ≈ 0.12, blackout ≈ 0.02 (blocks essentially all). An open
 * (tied-back) curtain passes 1.0. Stacked treatments combine multiplicatively.
 *
 * The final scene attenuation averages each window's factor across all windows.
 *
 * All computations are 2D (floor plan). Zero allocations on re-reads.
 */

import type { WallSpec, WindowSpec } from '../../apartment/types'
import type { FurnitureItem } from '../../furniture/types'
import { draperyOpacityLevel, draperyTransmit } from '../../materials/draperyOpacity'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WindowModifiers {
  /** Scalar 0..1 multiplied into the directional-light (sun) intensity.
   *  1 = unobstructed, 0 = all windows fully blocked. */
  attenuation: number
  /** Tint colour blended into sun colour: [r,g,b] each 0..1. [1,1,1] = neutral. */
  glassTint: [number, number, number]
}

export interface CurtainOverlapResult {
  /** Fraction of the window width that is covered (0..1). */
  coveredFraction: number
  /** Whether the covering curtain is sheer fabric (passes some light). */
  isSheer: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a 6-digit hex colour string to [r,g,b] in 0..1 range. */
export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  if (h.length !== 6) return [1, 1, 1]
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return [r, g, b]
}

/** Wall direction angle in XZ-plane (radians). */
function wallAngle(wall: WallSpec): number {
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  return Math.atan2(dz, dx)
}

/**
 * Project a world position [x,z] onto a wall's 1D axis and return the offset
 * from wall.start (positive = toward wall.end).
 */
function projectOntoWall(wall: WallSpec, x: number, z: number): number {
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const len = Math.hypot(dx, dz)
  if (len === 0) return 0
  const ux = dx / len
  const uz = dz / len
  const px = x - wall.start[0]
  const pz = z - wall.start[1]
  return px * ux + pz * uz
}

/**
 * Distance from a world position to a wall's centreline (the perpendicular
 * component — positive on either side).
 */
function distanceFromWall(wall: WallSpec, x: number, z: number): number {
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const len = Math.hypot(dx, dz)
  if (len === 0) return Math.hypot(x - wall.start[0], z - wall.start[1])
  const ux = dx / len
  const uz = dz / len
  const px = x - wall.start[0]
  const pz = z - wall.start[1]
  // Cross product magnitude = perpendicular distance
  return Math.abs(px * uz - pz * ux)
}

// ---------------------------------------------------------------------------
// Public pure functions
// ---------------------------------------------------------------------------

/**
 * Determine whether a curtain item overlaps a given window along the wall.
 *
 * Matching criteria:
 *   1. The item must be a 'curtains' or 'roller-blind' def (by defId prefix match)
 *   2. The item must be close to the wall (within MAX_WALL_DIST metres)
 *   3. The item's 1D extent along the wall must overlap the window's extent
 *
 * Returns null if there is no overlap, or the overlap result if there is.
 */
export function curtainWindowOverlap(
  item: FurnitureItem,
  wall: WallSpec,
  win: WindowSpec,
): CurtainOverlapResult | null {
  // Only curtain/blind items affect windows
  if (!isCurtainItem(item.defId)) return null

  // Read curtain dimensions: width defaults to the builtinCatalog default
  const curtainWidth = typeof item.props.width === 'number' ? item.props.width : 1.8

  // Distance from curtain to wall — must be within MAX_WALL_DIST
  const MAX_WALL_DIST = 0.5 // metres
  const d = distanceFromWall(wall, item.position[0], item.position[1])
  if (d > MAX_WALL_DIST) return null

  // Check angular alignment: curtain rotation vs wall angle
  // The curtain faces +Z by default; it should be rotated to face the wall.
  // We accept ±45° tolerance to keep it forgiving.
  const wAngle = wallAngle(wall)
  const cAngle = item.rotation
  // Normalise angular difference to [-PI, PI]
  let diff = ((cAngle - wAngle + Math.PI) % (2 * Math.PI)) - Math.PI
  if (diff < -Math.PI) diff += 2 * Math.PI
  const ANGLE_TOLERANCE = Math.PI / 2 - 0.01 // slightly under 90° so ±π/2 is excluded
  if (Math.abs(diff) > ANGLE_TOLERANCE) return null

  // Project curtain centre onto the wall axis
  const curtainCentre = projectOntoWall(wall, item.position[0], item.position[1])
  const curtainLeft = curtainCentre - curtainWidth / 2
  const curtainRight = curtainCentre + curtainWidth / 2

  // Window extent along wall
  const winLeft = win.offset
  const winRight = win.offset + win.width

  // Overlap interval
  const overlapLeft = Math.max(curtainLeft, winLeft)
  const overlapRight = Math.min(curtainRight, winRight)
  if (overlapRight <= overlapLeft) return null

  const coveredFraction = Math.min(1, (overlapRight - overlapLeft) / win.width)

  // Sheer = roller blind in 'sheer' mode, or a curtain with a light/translucent pattern
  const isSheer = isSheerItem(item)

  return { coveredFraction, isSheer }
}

/** Returns true if the defId identifies a curtain or blind item. */
export function isCurtainItem(defId: string): boolean {
  return defId === 'curtains' || defId === 'roller-blind'
}

/** Returns true if this curtain/blind item is in "open" state (tied back = no obstruction). */
export function isCurtainOpen(item: FurnitureItem): boolean {
  return item.props.style === 'open'
}

/** Fraction of daylight that still passes when this treatment FULLY covers a
 *  window — its opacity/light-blocking floor (CURTAIN-OPACITY): sheer ≈ 0.45 …
 *  blackout ≈ 0.02. Driven by the item's `lightBlock` level (legacy
 *  `material: 'sheer'` → sheer). */
function curtainTransmission(item: FurnitureItem): number {
  return draperyTransmit(draperyOpacityLevel(item.props))
}

/** How much a window treatment covers its window, 0 (fully open → exterior light
 *  filters in) … 1 (fully closed → covers the window). Reads the graduated
 *  `drawAmount` (curtains) or `lower` (roller blinds) prop if present, else falls
 *  back to the legacy `style` flag ('open' → 0, else 1). This lets a partially
 *  open treatment attenuate proportionally. */
export function curtainDrawAmount(item: FurnitureItem): number {
  const d = item.props.drawAmount
  if (typeof d === 'number') return Math.min(1, Math.max(0, d))
  const l = item.props.lower
  if (typeof l === 'number') return Math.min(1, Math.max(0, l))
  return item.props.style === 'open' ? 0 : 1
}

/** Returns true if this is a sheer/translucent curtain. */
function isSheerItem(item: FurnitureItem): boolean {
  // RollerBlind has a 'material' prop that can be 'sheer'
  return item.props.material === 'sheer'
}

/**
 * Compute the attenuation factor for a single window given the list of items.
 *
 * factor 1.0 = unobstructed; each covering treatment passes its own opacity
 * floor (`curtainTransmission`: sheer ≈ 0.45 … blackout ≈ 0.02), so a drawn
 * blackout curtain blocks essentially all daylight while a sheer only softens it.
 * Treatments combine multiplicatively (stacked layers each block in turn).
 */
export function windowAttenuationFactor(
  wall: WallSpec,
  win: WindowSpec,
  items: ReadonlyArray<FurnitureItem>,
): number {
  let transmit = 1

  for (const item of items) {
    // Graduated by how drawn the curtain is: an open curtain (draw 0) lets the
    // exterior light fully through; a half-drawn one covers half. (CURTAIN-DRAW)
    const draw = curtainDrawAmount(item)
    if (draw <= 0.001) continue
    const overlap = curtainWindowOverlap(item, wall, win)
    if (!overlap) continue
    // Coverage of the window by this treatment, and the light it still passes at
    // full cover (its opacity level). Light through this layer = 1 at no cover,
    // → the floor at full cover.
    const cover = overlap.coveredFraction * draw
    const floor = curtainTransmission(item)
    transmit *= 1 - cover * (1 - floor)
  }

  return Math.max(0, Math.min(1, transmit))
}

/**
 * Aggregate attenuation across all windows in the scene.
 * The returned factor is the average across all windows (each window contributes
 * equally — a weighted-by-window-area version would be more accurate but this is
 * a deliberate cheap approximation).
 */
export function sceneAttenuationFactor(
  walls: ReadonlyArray<WallSpec>,
  items: ReadonlyArray<FurnitureItem>,
): number {
  const wallMap = new Map<string, WallSpec>()
  for (const w of walls) wallMap.set(w.id, w)

  let sum = 0
  let count = 0
  for (const wall of walls) {
    for (const cut of wall.cutouts) {
      if (cut.kind !== 'window' || !cut.refId) continue
      const win: WindowSpec = {
        id: cut.refId,
        wallId: wall.id,
        offset: cut.offset,
        width: cut.width,
        sill: cut.sill,
        head: cut.head,
      }
      sum += windowAttenuationFactor(wall, win, items)
      count++
    }
  }
  return count === 0 ? 1.0 : sum / count
}

/**
 * Compute the glass-tint colour from the global tint preference.
 * tintHex '#ffffff' or '' → neutral [1,1,1], no effect.
 * A warm amber like '#f5d8a0' → sun takes on that tint.
 * The tint is applied as a component-wise multiply of the sun colour.
 */
export function glassTintRgb(tintHex: string): [number, number, number] {
  if (!tintHex || tintHex === '#ffffff' || tintHex === '') return [1, 1, 1]
  return hexToRgb01(tintHex)
}

/**
 * Compute the aggregate WindowModifiers for the current scene state.
 */
export function computeWindowModifiers(
  walls: ReadonlyArray<WallSpec>,
  items: ReadonlyArray<FurnitureItem>,
  glassTintHex: string,
): WindowModifiers {
  return {
    attenuation: sceneAttenuationFactor(walls, items),
    glassTint: glassTintRgb(glassTintHex),
  }
}
