/**
 * Parametric furniture (PF2) — indicative price model.
 *
 * Scales a flat-pack-style estimate (SGD) from the generated part list: board
 * area at a per-m² rate (cut + edging + fixings included) plus per-fitting
 * adders for doors/hinges, rails, legs, and drawers. Mid-market Singapore
 * ballpark in the same spirit as `furniturePrices.ts` — **clearly an estimate**,
 * labelled so in the UI. Pure + unit-tested.
 */

import type { ParametricModel, ParametricPart } from './buildParts'

/** SGD per m² of panel (melamine/laminated board, cut + edged + fixings). */
const BOARD_RATE = 52
/** Per door leaf (hinges + soft-close + handle hardware). */
const DOOR_ADDER = 28
/** Per hanging rail. */
const RAIL_ADDER = 14
/** Per leg. */
const LEG_ADDER = 9
/** Per drawer front (drawer box + slides + handle hardware). */
const DRAWER_ADDER = 35
/** Flat base (packaging / minimum job). */
const BASE = 30
/** Worktop slab: higher rate for stone/quartz laminate vs board (SGD/m²). */
const WORKTOP_RATE = 180

/** Largest-face area (m²) of a box part — board panels are thin boxes, so the
 *  largest face is the board's sheet area. */
export function partBoardArea(part: ParametricPart): number {
  const [a, b, c] = [...part.size].sort((x, y) => x - y)
  void a // thinnest dimension = board thickness, not material area
  return b * c
}

/** Indicative price (SGD) for a generated model, rounded to the nearest $5. */
export function estimatePrice(model: ParametricModel): number {
  let area = 0
  let worktopArea = 0
  let doors = 0
  let rails = 0
  let legs = 0
  let drawers = 0
  for (const p of model.parts) {
    // Handles + drawer handles are counted with their door/drawer.
    if (p.role === 'handle' || p.role === 'drawer-handle') continue
    if (p.role === 'rail') {
      rails++
      continue
    }
    if (p.role === 'leg') {
      legs++
      continue
    }
    if (p.role === 'drawer-front') {
      drawers++
      continue
    }
    // Worktop slab uses a premium per-m² rate (stone/quartz laminate).
    if (p.role === 'worktop') {
      worktopArea += partBoardArea(p)
      continue
    }
    area += partBoardArea(p)
    if (p.role === 'door') doors++
  }
  const raw =
    BASE +
    area * BOARD_RATE +
    worktopArea * WORKTOP_RATE +
    doors * DOOR_ADDER +
    rails * RAIL_ADDER +
    legs * LEG_ADDER +
    drawers * DRAWER_ADDER
  return Math.max(5, Math.round(raw / 5) * 5)
}
