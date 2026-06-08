/**
 * Parametric cabinet engine (K1) — the pure, render-agnostic geometry model for
 * millimetre-customisable kitchen/bath cabinets (Coohom/Planner-5D parity).
 *
 * `buildCabinet(spec)` turns a small spec (type + dimensions + front style +
 * toe-kick/countertop/cornice toggles) into a flat list of box `CabinetPart`s
 * positioned in the primitive's local frame: footprint **centred** on X/Z,
 * **floor-anchored** at y=0, **front face toward +Z** (the app's convention).
 * The renderer (`primitives/CabinetModule.tsx`) maps each part to a textured
 * mesh; this module owns every dimension + structural decision so the geometry
 * is unit-testable without a GPU.
 *
 * Structural rules enforced here (so the catalog can't author a floating or
 * inside-out cabinet):
 *  - the toe-kick (base/tall) sits on the floor and is *recessed* from the
 *    carcass front so feet tuck under;
 *  - the carcass body rests on the toe-kick (its bottom == toe-kick height);
 *  - the countertop (base only) sits exactly on the carcass top with a small
 *    front/side overhang;
 *  - the cornice (tall/wall only) caps the carcass top;
 *  - every door/drawer front is *proud* of the carcass front face;
 *  - the column count drives evenly-divided fronts with consistent reveals.
 */

export type CabinetType = 'base' | 'wall' | 'tall'
export type CabinetFront = 'slab' | 'shaker' | 'drawers' | 'glass' | 'open'

export interface CabinetSpec {
  type: CabinetType
  /** Overall carcass width (m). */
  width: number
  /** Carcass body height (m) — excludes toe-kick, countertop and cornice. */
  height: number
  /** Carcass depth (m). */
  depth: number
  /** Number of front columns (doors / drawer stacks), 1–4. */
  columns: number
  front: CabinetFront
  /** Toe-kick height (m); ignored (forced 0) for wall cabinets. */
  toeKick: number
  /** Base cabinets only: add a countertop slab. */
  countertop: boolean
  /** Countertop thickness (m). */
  countertopThickness: number
  /** Tall/wall cabinets only: add a top cornice/crown cap. */
  cornice: boolean
  /** Rows of drawers per column when `front === 'drawers'`. */
  drawerRows: number
}

export type CabinetPartRole =
  | 'carcass'
  | 'toeKick'
  | 'countertop'
  | 'cornice'
  | 'door'
  | 'drawer'
  | 'glass'
  | 'handle'
  | 'shelf'

export interface CabinetPart {
  role: CabinetPartRole
  /** Centre position [x, y, z] in metres (footprint-centred, floor at y=0). */
  position: [number, number, number]
  /** Box size [w, h, d] in metres. */
  size: [number, number, number]
}

export interface CabinetModel {
  parts: CabinetPart[]
  /** Floor → top of the tallest element (countertop or cornice or carcass). */
  totalHeight: number
  /** Overall bounding footprint incl. countertop overhang. */
  bounds: { w: number; d: number; h: number }
}

const FRONT_T = 0.018 // door/drawer panel thickness
const REVEAL = 0.003 // gap around and between fronts
const TOEKICK_RECESS = 0.05 // how far the toe-kick tucks back from the front
const HANDLE_W = 0.018
const COUNTERTOP_OVERHANG = 0.02 // front + side overhang of a base countertop

/** Clamp helper — defends against out-of-range catalog/inspector values. */
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function buildCabinet(input: CabinetSpec): CabinetModel {
  const type = input.type
  const w = clamp(input.width, 0.2, 1.4)
  const carcassH = clamp(input.height, 0.2, 2.4)
  const d = clamp(input.depth, 0.2, 0.9)
  const columns = clamp(Math.round(input.columns), 1, 4)
  const front = input.front
  const toe = type === 'wall' ? 0 : clamp(input.toeKick, 0, 0.2)
  const wantCountertop = type === 'base' && input.countertop
  const ctT = wantCountertop ? clamp(input.countertopThickness, 0.02, 0.08) : 0
  const wantCornice = type !== 'base' && input.cornice
  const corniceH = wantCornice ? 0.05 : 0
  const drawerRows = clamp(Math.round(input.drawerRows), 1, 5)

  const carcassBottom = toe
  const carcassTop = carcassBottom + carcassH
  const frontProudZ = d / 2 + FRONT_T / 2 // centre Z of a proud front panel

  const parts: CabinetPart[] = []

  // Toe-kick: on the floor, recessed back from the carcass front face.
  if (toe > 0) {
    parts.push({
      role: 'toeKick',
      position: [0, toe / 2, -TOEKICK_RECESS / 2],
      size: [w - 0.01, toe, d - TOEKICK_RECESS],
    })
  }

  // Carcass body — the box the fronts close over.
  parts.push({
    role: 'carcass',
    position: [0, carcassBottom + carcassH / 2, 0],
    size: [w, carcassH, d],
  })

  // Countertop (base) — sits on the carcass top with a slight overhang.
  if (wantCountertop) {
    parts.push({
      role: 'countertop',
      position: [0, carcassTop + ctT / 2, COUNTERTOP_OVERHANG / 2],
      size: [w + COUNTERTOP_OVERHANG, ctT, d + COUNTERTOP_OVERHANG],
    })
  }

  // Cornice (tall/wall) — caps the carcass top.
  if (wantCornice) {
    parts.push({
      role: 'cornice',
      position: [0, carcassTop + corniceH / 2, 0.005],
      size: [w + 0.01, corniceH, d + 0.01],
    })
  }

  // Fronts: `columns` evenly-divided panels across the width.
  const colW = (w - REVEAL * (columns + 1)) / columns
  const frontH = carcassH - 2 * REVEAL
  for (let c = 0; c < columns; c++) {
    const cx = -w / 2 + REVEAL + colW / 2 + c * (colW + REVEAL)
    if (front === 'open') {
      // Open shelving: no front; evenly-spaced internal shelves.
      const shelves = Math.max(1, Math.floor(carcassH / 0.32))
      for (let s = 1; s <= shelves; s++) {
        const y = carcassBottom + (carcassH * s) / (shelves + 1)
        parts.push({ role: 'shelf', position: [cx, y, 0], size: [colW, 0.018, d - 0.03] })
      }
      continue
    }
    if (front === 'drawers') {
      const gap = REVEAL
      const dh = (frontH - gap * (drawerRows - 1)) / drawerRows
      for (let r = 0; r < drawerRows; r++) {
        const y = carcassBottom + REVEAL + dh / 2 + r * (dh + gap)
        parts.push({ role: 'drawer', position: [cx, y, frontProudZ], size: [colW, dh, FRONT_T] })
        parts.push({
          role: 'handle',
          position: [cx, y + dh / 2 - 0.03, frontProudZ + FRONT_T / 2 + 0.01],
          size: [colW * 0.45, HANDLE_W, 0.02],
        })
      }
      continue
    }
    // slab / shaker / glass: one door per column.
    const cy = carcassBottom + carcassH / 2
    parts.push({ role: 'door', position: [cx, cy, frontProudZ], size: [colW, frontH, FRONT_T] })
    if (front === 'glass') {
      // Recessed glass pane inset within the door frame.
      parts.push({
        role: 'glass',
        position: [cx, cy, frontProudZ - 0.002],
        size: [colW - 0.06, frontH - 0.06, 0.004],
      })
    }
    // Vertical bar handle on the cabinet's outward edge of each door.
    const hingeSign = c < columns / 2 ? 1 : -1
    parts.push({
      role: 'handle',
      position: [cx + hingeSign * (colW / 2 - 0.035), cy, frontProudZ + FRONT_T / 2 + 0.01],
      size: [HANDLE_W, Math.min(0.16, frontH * 0.4), 0.02],
    })
  }

  const topY = wantCountertop ? carcassTop + ctT : carcassTop + corniceH
  return {
    parts,
    totalHeight: topY,
    bounds: {
      w: w + (wantCountertop ? COUNTERTOP_OVERHANG : 0),
      d: d + (wantCountertop ? COUNTERTOP_OVERHANG : 0) + FRONT_T,
      h: topY,
    },
  }
}
