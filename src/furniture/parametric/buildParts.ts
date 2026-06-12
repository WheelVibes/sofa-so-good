/**
 * Parametric furniture generator (PF1) — the pure, render-agnostic part model.
 *
 * `buildParametric(spec)` turns a clamped `ParametricSpec` into a flat list of
 * box `ParametricPart`s in the primitive's local frame: footprint **centred**
 * on X/Z, **floor-anchored** at y=0, **front face toward +Z** (the app
 * convention — same as `cabinet/cabinetModel.ts`).
 *
 * Structural rules enforced here (so no spec can author a floating or
 * unsupported piece):
 *  - side panels run floor → top (they ARE the supports; sideboard-on-legs
 *    instead rests the carcass on legs inset within the footprint);
 *  - shelves span exactly between their bay's panels (side ↔ divider);
 *  - a bay wider than `MAX_BAY_SPAN` gets centre divider(s) so shelves never
 *    span unsupported;
 *  - the back panel is inset between the sides, behind the shelves;
 *  - doors are proud of the carcass front, each leaf ≤ `MAX_DOOR_LEAF` wide;
 *  - the wardrobe hanging rail spans its bay just under the top shelf.
 */

import {
  AUTO_SHELF_SPACING,
  clampSpec,
  MAX_BAY_SPAN,
  MAX_DOOR_LEAF,
  type ParametricSpec,
} from './spec'

export type ParametricPartRole =
  | 'side'
  | 'top'
  | 'bottom'
  | 'back'
  | 'shelf'
  | 'divider'
  | 'plinth'
  | 'leg'
  | 'door'
  | 'handle'
  | 'rail'

export interface ParametricPart {
  role: ParametricPartRole
  /** Centre position [x, y, z] (m); footprint-centred, floor at y=0. */
  position: [number, number, number]
  /** Box size [w, h, d] (m). */
  size: [number, number, number]
}

export interface ParametricModel {
  parts: ParametricPart[]
  /** Overall bounding footprint (m) — the collision/catalog footprint. */
  bounds: { w: number; d: number; h: number }
  /** Number of open compartments across the width (1 + dividers). */
  bays: number
  /** Hinged door leaves emitted (0 when doors are off / open front). */
  doorCount: number
  /** Shelves emitted per bay (resolved from 'auto'). */
  shelvesPerBay: number
}

const PANEL_T = 0.018 // side/top/bottom/shelf/divider panel thickness
const BACK_T = 0.012 // back panel thickness
const DOOR_T = 0.018 // door leaf thickness
const REVEAL = 0.003 // gap between door leaves
const PLINTH_H = 0.06 // recessed toe-kick height
const PLINTH_RECESS = 0.04 // how far the plinth tucks back from the front
const LEG_H = 0.12 // sideboard leg height (within the 0.10–0.15 norm)
const LEG_T = 0.04 // square leg thickness
const HANDLE_W = 0.014
const RAIL_T = 0.025 // hanging-rail cross-section

/** Evenly-spaced bay boundaries: ≥1 divider whenever a single span would
 *  exceed MAX_BAY_SPAN. Returns the number of bays (dividers = bays - 1). */
export function bayCount(innerW: number): number {
  return Math.max(1, Math.ceil(innerW / MAX_BAY_SPAN))
}

/** Auto shelf count per bay for an inner height: one shelf per ~0.35 m of
 *  clear height (so spacing lands in the comfortable 0.32–0.38 m band). */
export function autoShelfCount(innerH: number): number {
  return Math.max(0, Math.round(innerH / AUTO_SHELF_SPACING) - 1)
}

/** Hinged-door leaf count for an opening width: each leaf ≤ MAX_DOOR_LEAF. */
export function doorLeafCount(openingW: number): number {
  return Math.max(1, Math.ceil(openingW / MAX_DOOR_LEAF))
}

export function buildParametric(input: ParametricSpec): ParametricModel {
  const spec = clampSpec(input)
  const { width: w, height: h, depth: d, type } = spec

  const parts: ParametricPart[] = []
  const onLegs = type === 'sideboard' && spec.base === 'legs'
  const wantPlinth = type !== 'sideboard' || spec.base === 'plinth'

  // ---- Vertical datum -------------------------------------------------------
  // On legs the carcass floats on legs; otherwise the carcass bottom panel sits
  // just above the floor (sides still reach the floor) over a recessed plinth.
  const carcassBottom = onLegs ? LEG_H : PLINTH_H
  const carcassTop = h // top panel's top face == overall height

  // ---- Base: plinth or legs -------------------------------------------------
  if (onLegs) {
    // Four square legs inset within the footprint, floor → carcass underside.
    const inset = LEG_T / 2 + 0.02
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push({
          role: 'leg',
          position: [sx * (w / 2 - inset), LEG_H / 2, sz * (d / 2 - inset)],
          size: [LEG_T, LEG_H, LEG_T],
        })
      }
    }
  } else if (wantPlinth) {
    // Recessed toe-kick on the floor, tucked back from the front face.
    parts.push({
      role: 'plinth',
      position: [0, PLINTH_H / 2, -PLINTH_RECESS / 2],
      size: [w - PANEL_T * 2, PLINTH_H, d - PLINTH_RECESS],
    })
  }

  // ---- Carcass shell ---------------------------------------------------------
  // Side panels: on a plinth base they run floor → top (they are the visible
  // supports); on legs they span the carcass only (the legs reach the floor).
  const sideBottom = onLegs ? carcassBottom : 0
  const sideH = carcassTop - sideBottom
  for (const sx of [-1, 1]) {
    parts.push({
      role: 'side',
      position: [sx * (w / 2 - PANEL_T / 2), sideBottom + sideH / 2, 0],
      size: [PANEL_T, sideH, d],
    })
  }
  const innerW = w - PANEL_T * 2

  // Top + bottom panels span between the sides.
  parts.push({
    role: 'top',
    position: [0, carcassTop - PANEL_T / 2, 0],
    size: [innerW, PANEL_T, d],
  })
  parts.push({
    role: 'bottom',
    position: [0, carcassBottom + PANEL_T / 2, 0],
    size: [innerW, PANEL_T, d],
  })

  // Back panel: inset between the sides, spanning bottom → top, at the rear.
  const backH = carcassTop - carcassBottom
  parts.push({
    role: 'back',
    position: [0, carcassBottom + backH / 2, -d / 2 + BACK_T / 2],
    size: [innerW, backH, BACK_T],
  })

  // ---- Bays + dividers -------------------------------------------------------
  const bays = bayCount(innerW)
  const bayW = (innerW - PANEL_T * (bays - 1)) / bays
  const innerBottom = carcassBottom + PANEL_T // top of the bottom panel
  const innerTop = carcassTop - PANEL_T // underside of the top panel
  const innerH = innerTop - innerBottom
  // Divider panels between bays: bottom panel → top panel, behind the doors.
  for (let b = 1; b < bays; b++) {
    const x = -innerW / 2 + b * bayW + (b - 0.5) * PANEL_T
    parts.push({
      role: 'divider',
      position: [x, innerBottom + innerH / 2, BACK_T / 2],
      size: [PANEL_T, innerH, d - BACK_T],
    })
  }
  /** Centre X of bay `b` (0-based). */
  const bayX = (b: number) => -innerW / 2 + bayW / 2 + b * (bayW + PANEL_T)

  // ---- Interior: shelves (+ wardrobe rail) ------------------------------------
  const shelfD = d - BACK_T - 0.02 // clear the back panel + a nose recess
  let shelvesPerBay: number
  if (type === 'wardrobe') {
    // Fixed layout: one top shelf with a hanging rail below it, per bay.
    shelvesPerBay = 1
    const shelfY = innerTop - 0.3 // shelf ~30 cm below the top
    for (let b = 0; b < bays; b++) {
      parts.push({
        role: 'shelf',
        position: [bayX(b), shelfY, BACK_T / 2],
        size: [bayW, PANEL_T, shelfD],
      })
      parts.push({
        role: 'rail',
        position: [bayX(b), shelfY - 0.08, BACK_T / 2],
        size: [bayW, RAIL_T, RAIL_T],
      })
    }
  } else {
    shelvesPerBay =
      spec.shelves === 'auto'
        ? autoShelfCount(innerH)
        : Math.min(spec.shelves, Math.floor(innerH / 0.1))
    const spacing = innerH / (shelvesPerBay + 1)
    for (let b = 0; b < bays; b++) {
      for (let s = 1; s <= shelvesPerBay; s++) {
        parts.push({
          role: 'shelf',
          position: [bayX(b), innerBottom + spacing * s, BACK_T / 2],
          size: [bayW, PANEL_T, shelfD],
        })
      }
    }
  }

  // ---- Doors -----------------------------------------------------------------
  // Wardrobe doors cover the full front; sideboard doors cover the carcass
  // front. Leaves divide the opening evenly, each ≤ MAX_DOOR_LEAF.
  const wantDoors = (type === 'wardrobe' || type === 'sideboard') && spec.doors
  let doorCount = 0
  if (wantDoors) {
    doorCount = doorLeafCount(innerW)
    const leafW = (innerW - REVEAL * (doorCount - 1)) / doorCount
    const doorH = carcassTop - carcassBottom - 2 * REVEAL
    const doorY = carcassBottom + REVEAL + doorH / 2
    const doorZ = d / 2 + DOOR_T / 2 // proud of the carcass front
    for (let i = 0; i < doorCount; i++) {
      const cx = -innerW / 2 + leafW / 2 + i * (leafW + REVEAL)
      parts.push({ role: 'door', position: [cx, doorY, doorZ], size: [leafW, doorH, DOOR_T] })
      // Vertical bar handle near each leaf's opening edge (mirrored pairs).
      const hingeSign = i < doorCount / 2 ? 1 : -1
      const handleH = Math.min(0.22, doorH * 0.3)
      const handleY = type === 'sideboard' ? doorY : doorY + doorH * 0.05
      parts.push({
        role: 'handle',
        position: [cx + hingeSign * (leafW / 2 - 0.04), handleY, doorZ + DOOR_T / 2 + 0.012],
        size: [HANDLE_W, handleH, 0.02],
      })
    }
  }

  const boundsD = d + (wantDoors ? DOOR_T : 0)
  return {
    parts,
    bounds: { w, d: boundsD, h },
    bays,
    doorCount,
    shelvesPerBay,
  }
}
