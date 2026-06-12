/**
 * Parametric furniture generator (PF2) — the pure, render-agnostic part model.
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
 *  - drawer fronts are inset within each bay and stacked floor → top;
 *  - the wardrobe hanging rail spans its bay just under the top shelf.
 *  - desk worktop rests on four legs (or a pedestal with stacked drawers).
 */

import {
  AUTO_SHELF_SPACING,
  bayStyle,
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
  | 'worktop'
  | 'drawer-front'
  | 'drawer-handle'

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
  /** Drawer fronts emitted (across all bays). */
  drawerCount: number
}

const PANEL_T = 0.018 // side/top/bottom/shelf/divider panel thickness
const BACK_T = 0.012 // back panel thickness
const DOOR_T = 0.018 // door leaf thickness
const REVEAL = 0.003 // gap between door leaves / drawer fronts
const PLINTH_H = 0.06 // recessed toe-kick height
const PLINTH_RECESS = 0.04 // how far the plinth tucks back from the front
const LEG_H = 0.12 // sideboard leg height (within the 0.10–0.15 norm)
const LEG_T = 0.04 // square leg thickness
const HANDLE_W = 0.014
const HANDLE_D = 0.02
const RAIL_T = 0.025 // hanging-rail cross-section
const DRAWER_FRONT_T = 0.016 // drawer-front panel thickness (slightly thinner than door)
const DRAWER_HANDLE_H = 0.012 // small horizontal bar handle
const DRAWER_HANDLE_W_MAX = 0.12 // max handle bar width

// Desk constants
const DESK_LEG_T = 0.05 // square leg cross-section
const DESK_WORKTOP_T = 0.025 // worktop thickness
const DESK_PEDESTAL_W = 0.38 // pedestal column width
const DESK_PEDESTAL_INSET = 0.02 // pedestal inset from the outer face

// Kitchen-run constants
const KT_TOE_H = 0.1 // toe-kick (plinth) height — HDB/IKEA standard
const KT_TOE_INSET = 0.05 // how far the toe-kick recesses from the front face
const KT_WORKTOP_T = 0.04 // worktop slab thickness (stone/laminate)
const KT_WORKTOP_OVERHANG = 0.02 // worktop overhang proud of carcass front
const KT_UPPER_DEPTH = 0.35 // upper cabinet depth (shallower than base)
const KT_UPPER_H = 0.72 // upper cabinet height
const KT_UPPER_GAP = 0.18 // gap between worktop top and upper cabinet underside

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

/** Number of stacked drawer fronts that fit in a compartment height, at
 *  ~0.18 m per drawer (ergonomic band for a sideboard / wardrobe lower section). */
export function drawerStackCount(innerH: number): number {
  const DRAWER_H_TARGET = 0.18
  return Math.max(1, Math.round(innerH / DRAWER_H_TARGET))
}

/** Add stacked drawer fronts + small horizontal handles for one bay. */
function addDrawerFronts(
  parts: ParametricPart[],
  bayX: number,
  bayW: number,
  innerBottom: number,
  innerTop: number,
  frontZ: number,
): number {
  const innerH = innerTop - innerBottom
  const count = drawerStackCount(innerH)
  const drawerH = (innerH - REVEAL * (count + 1)) / count
  const inset = 0.003 // slight inset within the opening for a recessed look
  const frontW = bayW - inset * 2
  const handleBarW = Math.min(DRAWER_HANDLE_W_MAX, frontW * 0.35)
  for (let i = 0; i < count; i++) {
    const y = innerBottom + REVEAL * (i + 1) + drawerH * (i + 0.5)
    parts.push({
      role: 'drawer-front',
      position: [bayX, y, frontZ + DRAWER_FRONT_T / 2],
      size: [frontW, drawerH - REVEAL, DRAWER_FRONT_T],
    })
    // Small horizontal pull centred on the front face
    parts.push({
      role: 'drawer-handle',
      position: [bayX, y, frontZ + DRAWER_FRONT_T + HANDLE_D / 2],
      size: [handleBarW, DRAWER_HANDLE_H, HANDLE_D],
    })
  }
  return count
}

// ============================================================================
// Desk builder
// ============================================================================

function buildDesk(spec: ParametricSpec): ParametricModel {
  const { width: w, height: h, depth: d } = spec
  const parts: ParametricPart[] = []

  const worktopY = h - DESK_WORKTOP_T / 2
  const legH = h - DESK_WORKTOP_T // legs reach from floor → underside of worktop

  parts.push({
    role: 'worktop',
    position: [0, worktopY, 0],
    size: [w, DESK_WORKTOP_T, d],
  })

  if (spec.deskLegs === 'pedestal') {
    // Right-hand pedestal column: full-height box with stacked drawer fronts.
    const pedX = w / 2 - DESK_PEDESTAL_INSET - DESK_PEDESTAL_W / 2
    const pedZ = 0
    const pedH = legH
    // Back panel of the pedestal
    parts.push({
      role: 'back',
      position: [pedX, pedH / 2, -d / 2 + BACK_T / 2],
      size: [DESK_PEDESTAL_W, pedH, BACK_T],
    })
    // Left side of pedestal
    parts.push({
      role: 'side',
      position: [pedX - DESK_PEDESTAL_W / 2 + PANEL_T / 2, pedH / 2, pedZ],
      size: [PANEL_T, pedH, d],
    })
    // Right side of pedestal (outer side)
    parts.push({
      role: 'side',
      position: [pedX + DESK_PEDESTAL_W / 2 - PANEL_T / 2, pedH / 2, pedZ],
      size: [PANEL_T, pedH, d],
    })
    // Top + bottom of pedestal
    parts.push({
      role: 'top',
      position: [pedX, pedH - PANEL_T / 2, pedZ],
      size: [DESK_PEDESTAL_W, PANEL_T, d],
    })
    parts.push({
      role: 'bottom',
      position: [pedX, PANEL_T / 2, pedZ],
      size: [DESK_PEDESTAL_W, PANEL_T, d],
    })

    // Drawer fronts inside pedestal
    const pedInnerW = DESK_PEDESTAL_W - PANEL_T * 2
    const pedInnerBottom = PANEL_T
    const pedInnerTop = pedH - PANEL_T
    const frontZ = d / 2 // front face of pedestal
    addDrawerFronts(parts, pedX, pedInnerW, pedInnerBottom, pedInnerTop, frontZ)

    // Left leg (single round leg on the opposite side)
    const leftLegX = -(w / 2 - DESK_LEG_T / 2 - 0.02)
    for (const sz of [-1, 1]) {
      parts.push({
        role: 'leg',
        position: [leftLegX, legH / 2, sz * (d / 2 - DESK_LEG_T / 2 - 0.02)],
        size: [DESK_LEG_T, legH, DESK_LEG_T],
      })
    }
  } else {
    // Four legs inset within the footprint corners.
    const inset = DESK_LEG_T / 2 + 0.02
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push({
          role: 'leg',
          position: [sx * (w / 2 - inset), legH / 2, sz * (d / 2 - inset)],
          size: [DESK_LEG_T, legH, DESK_LEG_T],
        })
      }
    }
  }

  const drawerCount = parts.filter((p) => p.role === 'drawer-front').length

  return {
    parts,
    bounds: { w, d, h },
    bays: 1,
    doorCount: 0,
    shelvesPerBay: 0,
    drawerCount,
  }
}

// ============================================================================
// Kitchen-run builder
// ============================================================================

/**
 * Build a kitchen base-cabinet run (+ optional uppers).
 *
 * Origin: footprint centred on X/Z, floor at y=0, front face toward +Z.
 *
 * Structure (bottom → top):
 *  - Toe-kick plinth: KT_TOE_H tall, recessed KT_TOE_INSET from the front.
 *  - Carcass sides (run floor→top), back panel, bottom + top panels.
 *  - Per-bay dividers, each bay gets: door | stacked drawers | open.
 *  - Worktop slab: KT_WORKTOP_T thick, KT_WORKTOP_OVERHANG proud of front, 0.01 m side overhang.
 *  - Optional uppers: shallower cabinet box above worktop with KT_UPPER_GAP clearance.
 */
function buildKitchenRun(spec: ParametricSpec): ParametricModel {
  const { width: w, height: h, depth: d } = spec
  const numBays = Math.max(1, Math.min(spec.bays, 6))
  const parts: ParametricPart[] = []

  // ---- Toe-kick plinth -------------------------------------------------------
  // Full-width, KT_TOE_H tall, inset from front by KT_TOE_INSET.
  const toeW = w - PANEL_T * 2
  const toeZ = -KT_TOE_INSET / 2 // centre on Z, tucked back
  parts.push({
    role: 'plinth',
    position: [0, KT_TOE_H / 2, toeZ],
    size: [toeW, KT_TOE_H, d - KT_TOE_INSET],
  })

  // ---- Worktop slab ----------------------------------------------------------
  // Sits at height h; overhangs the front by KT_WORKTOP_OVERHANG and sides by 0.01 m.
  const SIDE_OVERHANG = 0.01
  const worktopY = h - KT_WORKTOP_T / 2
  const worktopW = w + SIDE_OVERHANG * 2
  const worktopD = d + KT_WORKTOP_OVERHANG
  // Centre of the worktop slab on Z: it extends from -d/2-SIDE_OVERHANG to d/2+KT_WORKTOP_OVERHANG,
  // but Z is front-facing so front overhang goes in +Z direction.
  const worktopZ = KT_WORKTOP_OVERHANG / 2
  parts.push({
    role: 'worktop',
    position: [0, worktopY, worktopZ],
    size: [worktopW, KT_WORKTOP_T, worktopD],
  })

  // ---- Carcass shell ---------------------------------------------------------
  // Height of the carcass is from floor to underside of the worktop.
  const carcassTop = h - KT_WORKTOP_T // underside of worktop
  const sideH = carcassTop // sides run floor → worktop underside
  for (const sx of [-1, 1]) {
    parts.push({
      role: 'side',
      position: [sx * (w / 2 - PANEL_T / 2), sideH / 2, 0],
      size: [PANEL_T, sideH, d],
    })
  }
  const innerW = w - PANEL_T * 2

  // Top + bottom span between the sides (at carcass extents).
  parts.push({
    role: 'top',
    position: [0, carcassTop - PANEL_T / 2, 0],
    size: [innerW, PANEL_T, d],
  })
  parts.push({
    role: 'bottom',
    position: [0, KT_TOE_H + PANEL_T / 2, 0],
    size: [innerW, PANEL_T, d],
  })

  // Back panel inset between the sides, spanning bottom panel top → carcass top.
  const backBottom = KT_TOE_H
  const backH = carcassTop - backBottom
  parts.push({
    role: 'back',
    position: [0, backBottom + backH / 2, -d / 2 + BACK_T / 2],
    size: [innerW, backH, BACK_T],
  })

  // ---- Bay dividers ----------------------------------------------------------
  // Use the spec.bays count (not bayCount auto-sizing) since the user controls this.
  const bayW = (innerW - PANEL_T * (numBays - 1)) / numBays
  const innerBottom = KT_TOE_H + PANEL_T // top of the bottom panel
  const innerTop = carcassTop - PANEL_T // underside of the top panel
  const innerH = innerTop - innerBottom
  const shelfD = d - BACK_T - 0.02

  for (let b = 1; b < numBays; b++) {
    const x = -innerW / 2 + b * bayW + (b - 0.5) * PANEL_T
    parts.push({
      role: 'divider',
      position: [x, innerBottom + innerH / 2, BACK_T / 2],
      size: [PANEL_T, innerH, d - BACK_T],
    })
  }

  /** Centre X of bay `b` (0-based). */
  const bayX = (b: number) => -innerW / 2 + bayW / 2 + b * (bayW + PANEL_T)

  // ---- Per-bay fronts --------------------------------------------------------
  const frontZ = d / 2 // carcass front face
  const doorH = innerH - 2 * REVEAL
  const doorY = innerBottom + REVEAL + doorH / 2
  let doorCount = 0
  let drawerCount = 0
  let hasFront = false

  for (let b = 0; b < numBays; b++) {
    const style = bayStyle(spec, b)
    const cx = bayX(b)

    if (style === 'door') {
      hasFront = true
      const leaves = doorLeafCount(bayW)
      const leafW = (bayW - REVEAL * (leaves - 1)) / leaves
      doorCount += leaves
      for (let i = 0; i < leaves; i++) {
        const lx = cx - bayW / 2 + leafW / 2 + i * (leafW + REVEAL)
        const doorZ = frontZ + DOOR_T / 2
        parts.push({
          role: 'door',
          position: [lx, doorY, doorZ],
          size: [leafW, doorH, DOOR_T],
        })
        const hingeSign = i < leaves / 2 ? 1 : -1
        const handleH = Math.min(0.15, doorH * 0.35)
        parts.push({
          role: 'handle',
          position: [lx + hingeSign * (leafW / 2 - 0.04), doorY, doorZ + DOOR_T / 2 + 0.012],
          size: [HANDLE_W, handleH, HANDLE_D],
        })
      }
    } else if (style === 'drawer') {
      hasFront = true
      drawerCount += addDrawerFronts(parts, cx, bayW, innerBottom, innerTop, frontZ)
    }
    // 'open' bays: mid-height shelf
    if (style === 'open') {
      parts.push({
        role: 'shelf',
        position: [cx, innerBottom + innerH / 2, BACK_T / 2],
        size: [bayW, PANEL_T, shelfD],
      })
    }
  }

  // ---- Upper cabinets (optional) ---------------------------------------------
  // Mount a shallower carcass KT_UPPER_GAP above the worktop top face.
  let boundsH = h
  if (spec.hasUppers) {
    const upperBottom = h + KT_UPPER_GAP // base of the upper box
    const upperTop = upperBottom + KT_UPPER_H
    const upperD = KT_UPPER_DEPTH
    boundsH = upperTop

    // Upper cabinets are wall-mounted, flush to the back wall (z = -d/2).
    // Centre Z of the upper box body: -d/2 + upperD/2.
    const upperBodyZ = -d / 2 + upperD / 2
    for (const sx of [-1, 1]) {
      parts.push({
        role: 'side',
        position: [sx * (w / 2 - PANEL_T / 2), upperBottom + KT_UPPER_H / 2, upperBodyZ],
        size: [PANEL_T, KT_UPPER_H, upperD],
      })
    }
    // Top + bottom of the upper carcass.
    parts.push({
      role: 'top',
      position: [0, upperTop - PANEL_T / 2, upperBodyZ],
      size: [innerW, PANEL_T, upperD],
    })
    parts.push({
      role: 'bottom',
      position: [0, upperBottom + PANEL_T / 2, upperBodyZ],
      size: [innerW, PANEL_T, upperD],
    })
    // Back panel flush to the rear wall.
    parts.push({
      role: 'back',
      position: [0, upperBottom + KT_UPPER_H / 2, -d / 2 + BACK_T / 2],
      size: [innerW, KT_UPPER_H, BACK_T],
    })
    // Upper doors: full-height, per bay. Front face at z = -d/2 + upperD.
    const upperFrontZ = -d / 2 + upperD
    const upperDoorH = KT_UPPER_H - PANEL_T * 2 - 2 * REVEAL
    const upperDoorY = upperBottom + PANEL_T + REVEAL + upperDoorH / 2
    for (let b = 0; b < numBays; b++) {
      const cx = bayX(b)
      const leaves = doorLeafCount(bayW)
      const leafW = (bayW - REVEAL * (leaves - 1)) / leaves
      doorCount += leaves
      for (let i = 0; i < leaves; i++) {
        const lx = cx - bayW / 2 + leafW / 2 + i * (leafW + REVEAL)
        const upperDoorZ = upperFrontZ + DOOR_T / 2
        parts.push({
          role: 'door',
          position: [lx, upperDoorY, upperDoorZ],
          size: [leafW, upperDoorH, DOOR_T],
        })
        const hingeSign = i < leaves / 2 ? 1 : -1
        parts.push({
          role: 'handle',
          position: [
            lx + hingeSign * (leafW / 2 - 0.04),
            upperDoorY,
            upperDoorZ + DOOR_T / 2 + 0.012,
          ],
          size: [HANDLE_W, Math.min(0.12, upperDoorH * 0.3), HANDLE_D],
        })
      }
    }
  }

  const boundsD = d + (hasFront ? Math.max(DOOR_T, DRAWER_FRONT_T) : 0)
  return {
    parts,
    bounds: { w, d: boundsD, h: boundsH },
    bays: numBays,
    doorCount,
    shelvesPerBay: 0,
    drawerCount,
  }
}

// ============================================================================
// Storage carcass builder (bookshelf / wardrobe / sideboard)
// ============================================================================

export function buildParametric(input: ParametricSpec): ParametricModel {
  const spec = clampSpec(input)
  const { width: w, height: h, depth: d, type } = spec

  // Delegate to the appropriate specialist builder.
  if (type === 'desk') return buildDesk(spec)
  if (type === 'kitchen-run') return buildKitchenRun(spec)

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
      // Only add shelf/rail for bays that are not fully drawers.
      const style = bayStyle(spec, b)
      if (style !== 'drawer') {
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
    }
  } else {
    shelvesPerBay =
      spec.shelves === 'auto'
        ? autoShelfCount(innerH)
        : Math.min(spec.shelves, Math.floor(innerH / 0.1))
    const spacing = innerH / (shelvesPerBay + 1)
    for (let b = 0; b < bays; b++) {
      // Skip shelves in drawer bays — they'd be hidden behind the fronts
      // and would require cut-outs, which the box model doesn't support.
      if (bayStyle(spec, b) === 'drawer') continue
      for (let s = 1; s <= shelvesPerBay; s++) {
        parts.push({
          role: 'shelf',
          position: [bayX(b), innerBottom + spacing * s, BACK_T / 2],
          size: [bayW, PANEL_T, shelfD],
        })
      }
    }
  }

  // ---- Per-bay fronts: doors + drawers + open --------------------------------
  // For wardrobe/sideboard we honour per-bay style. Bookshelf is always open.
  const canHaveFront = type === 'wardrobe' || type === 'sideboard'
  let doorCount = 0
  let drawerCount = 0
  let hasFront = false // whether any bay emits something proud of the carcass

  if (canHaveFront) {
    for (let b = 0; b < bays; b++) {
      const style = bayStyle(spec, b)
      const cx = bayX(b)
      const doorH = carcassTop - carcassBottom - 2 * REVEAL
      const doorY = carcassBottom + REVEAL + doorH / 2
      const frontZ = d / 2 // carcass front face

      if (style === 'door') {
        hasFront = true
        // One door leaf per bay (each bay is already ≤ MAX_DOOR_LEAF wide;
        // for wider bays use 2 leaves).
        const leaves = doorLeafCount(bayW)
        const leafW = (bayW - REVEAL * (leaves - 1)) / leaves
        doorCount += leaves
        for (let i = 0; i < leaves; i++) {
          const lx = cx - bayW / 2 + leafW / 2 + i * (leafW + REVEAL)
          const doorZ = frontZ + DOOR_T / 2
          parts.push({
            role: 'door',
            position: [lx, doorY, doorZ],
            size: [leafW, doorH, DOOR_T],
          })
          const hingeSign = i < leaves / 2 ? 1 : -1
          const handleH = Math.min(0.22, doorH * 0.3)
          const handleY = type === 'sideboard' ? doorY : doorY + doorH * 0.05
          parts.push({
            role: 'handle',
            position: [lx + hingeSign * (leafW / 2 - 0.04), handleY, doorZ + DOOR_T / 2 + 0.012],
            size: [HANDLE_W, handleH, HANDLE_D],
          })
        }
      } else if (style === 'drawer') {
        hasFront = true
        drawerCount += addDrawerFronts(parts, cx, bayW, innerBottom, innerTop, frontZ)
      }
      // 'open' bays emit nothing proud of the front face.
    }
  }

  const boundsD = d + (hasFront ? Math.max(DOOR_T, DRAWER_FRONT_T) : 0)
  return {
    parts,
    bounds: { w, d: boundsD, h },
    bays,
    doorCount,
    shelvesPerBay,
    drawerCount,
  }
}
