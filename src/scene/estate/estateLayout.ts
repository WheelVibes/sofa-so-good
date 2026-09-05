/**
 * ESTATE-SURROUND — the HDB estate outside the windows, as GEOMETRY.
 *
 * Why geometry and not a better backdrop: `docs/open-graphics-decisions.md` item (r)
 * measured that anything painted into the equirect `scene.background` is PMREM
 * pre-filtered by three into "faint blue-grey blobs" — a crisp 2048×1024 skyline
 * bought 3 points of glazing spread where a photograph shows 35, and the cube route
 * was refuted too. The only path that keeps a legible exterior is to draw it. So the
 * surround is a handful of boxes: the flat's OWN slab block continuing left, right,
 * above and below it (with the common corridor outside the main door), neighbouring
 * slab and point blocks at HDB spacing, a ground plane at the storey's true depth,
 * roads and rain trees. All lit by the scene's own sun and hemisphere, so faces turn
 * with the hour for free, and switching to lit windows at night via an emissive map.
 *
 * This file is the PURE layout: numbers in, rectangles out. No three, no canvas, so
 * every placement rule is unit-tested (`estateLayout.test.ts`).
 *
 * ONE FRAME ONLY (ESTATE-DOOR-SIDE). Everything below is built in the CANONICAL frame:
 * footprint origin at (0,0), its width running along +x, and the common corridor on the
 * +z face — so the own block's windows always look down −z and the neighbours, roads and
 * trees are stated once instead of four mirrored times. Real plans open on any of the four
 * exterior faces (`tpl-hdb-5room` on −z, `tpl-hdb-3gen` on +x); `estateCorridor.ts` reads
 * the main door, swaps width/depth for the ±x faces, and hands `Estate.tsx` a yaw about the
 * footprint centre in multiples of 90° to rotate the whole group into place. A rigid
 * transform, never a reflection, so the corridor stays outside the main door and the window
 * façade stays opposite it.
 *
 * Dimensions are HDB-typical, stated so they can be corrected rather than guessed
 * at again: 2.8 m floor-to-floor (2.6 m clear + slab), a 3.6 m void deck, 3.6 m
 * unit bays along a slab block, blocks 60–90 m long and 12–16 storeys for the
 * 1980s–2000s stock a 4-room resale flat sits in, point blocks to 25 storeys,
 * inter-block spacing 30–60 m across an access road or carpark.
 */

import { mulberry32 } from '../../materials/procedural/noise'

export const STOREY_H = 2.8
export const VOID_DECK_H = 3.6
export const BAY_W = 3.6
export const ROOF_PARAPET_H = 0.9
const CORRIDOR_D = 1.5
const CORRIDOR_PARAPET_H = 1.1
/** Storey the flat sits on (#08). Ground is this many floors down. */
export const VIEW_STOREY = 8
/** Storeys in the flat's own block (above and below included). */
export const OWN_BLOCK_STOREYS = 12
/** How far the own block continues past each end of the flat, metres. */
const OWN_WING_LEN = 30

/** Which ±z face of a slab block carries its window façade (the other carries the corridor). */
type Side = '+z' | '-z'

export interface EstateBox {
  /** Centre X/Z in plan metres; Y range is absolute scene metres (floor of the flat = 0). */
  x: number
  z: number
  w: number
  d: number
  yMin: number
  yMax: number
}

interface EstateBlock {
  id: string
  /** Footprint centre + size. */
  x: number
  z: number
  w: number
  d: number
  storeys: number
  /** Yaw about +Y, radians — estates are rarely on a grid, and an oblique block gives
   *  the window view a vanishing line instead of a flat wall of bays. */
  yaw: number
  /** Which ±z face carries the window façade; the other carries the corridor. */
  windowSide: Side
  /** 0..2 — picks one of three wall paint families so blocks are not clones. */
  paint: number
}

interface EstateTree {
  x: number
  z: number
  /** Canopy height (m) and radius (m). */
  h: number
  r: number
}

interface EstateRoad {
  x: number
  z: number
  w: number
  d: number
}

export interface EstateLayout {
  /** Absolute Y of the ground plane (negative: the flat is upstairs). */
  groundY: number
  /** Y of the flat's own storey's structural floor top (0) — kept for readers. */
  ownFloorY: number
  /** Own-block boxes: wings, the storeys below, the storeys above, the corridor. */
  own: {
    westWing: EstateBox
    eastWing: EstateBox
    below: EstateBox
    /** Storeys above the flat's own ceiling. Absent after {@link sectionCut}. */
    above?: EstateBox
    corridorFloor: EstateBox
    corridorParapet: EstateBox
    /** Roof slab of the own block. Absent after {@link sectionCut}. */
    roof?: EstateBox
    /** The whole own-block footprint incl. wings (for the void-deck box + tests). */
    footprint: { x: number; z: number; w: number; d: number }
  }
  blocks: EstateBlock[]
  trees: EstateTree[]
  roads: EstateRoad[]
}

export interface EstateLayoutInput {
  /** CANONICAL extent [width along the corridor face, depth away from it], metres, origin
   *  at (0,0). For a plan whose main door is on a ±x face the caller swaps the plan's own
   *  width/depth — see `estateCorridor.ts:estateFrame`. */
  extent: readonly [number, number]
  /** X range along the canonical +z corridor face that the corridor actually fronts
   *  (start,end). The rest of that face (a service yard, a bedroom) stays open to the air.
   *  An end that reaches the footprint edge is run out to the block end. */
  corridorSpan: readonly [number, number]
  seed?: number
}

/** Top of storey `n` (1-based) above ground: void deck first, then residential floors. */
export function storeyTopAboveGround(n: number): number {
  return VOID_DECK_H + Math.max(0, n - 1) * STOREY_H
}

/** Ground Y for a flat on `storey`, whose finished floor is y = 0. */
export function groundYForStorey(storey: number): number {
  // The flat's floor is the TOP of storey (storey−1)'s slab, i.e. the bottom of `storey`.
  return -storeyTopAboveGround(storey - 1)
}

export function buildEstateLayout(input: EstateLayoutInput): EstateLayout {
  const [pw, pd] = input.extent
  const rnd = mulberry32(input.seed ?? 20260905)
  const groundY = groundYForStorey(VIEW_STOREY)
  const roofY = groundY + storeyTopAboveGround(OWN_BLOCK_STOREYS)
  const corridorZ = pd + CORRIDOR_D / 2

  // Own block: the flat's slab continues either side. Depth = the plan's depth so the
  // wing façades are flush with the flat's own exterior faces.
  const westWing: EstateBox = {
    x: -OWN_WING_LEN / 2,
    z: pd / 2,
    w: OWN_WING_LEN,
    d: pd,
    yMin: groundY,
    yMax: roofY,
  }
  const eastWing: EstateBox = {
    x: pw + OWN_WING_LEN / 2,
    z: pd / 2,
    w: OWN_WING_LEN,
    d: pd,
    yMin: groundY,
    yMax: roofY,
  }
  // The floors below and above the flat itself, spanning the flat's footprint only (the
  // wings already cover their own full height). 0.15 m slab: the flat's floor at 0 sits
  // on it, and its ceiling (2.6 m) carries the slab of the storey above.
  const below: EstateBox = { x: pw / 2, z: pd / 2, w: pw, d: pd, yMin: groundY, yMax: -0.15 }
  const above: EstateBox = {
    x: pw / 2,
    z: pd / 2,
    w: pw,
    d: pd,
    yMin: STOREY_H - 0.05,
    yMax: roofY,
  }
  // The corridor fronts the main door; whichever end of the span reaches the flat's own
  // footprint edge runs on to the block end, so the run reads as a real common corridor
  // (a lift lobby somewhere off-screen) rather than a two-metre balcony.
  const [cs, ce] = input.corridorSpan
  const corrStart = cs <= 1e-6 ? -OWN_WING_LEN : cs
  const corrStop = ce >= pw - 1e-6 ? pw + OWN_WING_LEN : ce
  const corridorFloor: EstateBox = {
    x: (corrStart + corrStop) / 2,
    z: corridorZ,
    w: corrStop - corrStart,
    d: CORRIDOR_D,
    yMin: -0.15,
    yMax: 0,
  }
  const parapetZ = pd + CORRIDOR_D - 0.075
  const corridorParapet: EstateBox = {
    x: corridorFloor.x,
    z: parapetZ,
    w: corridorFloor.w,
    d: 0.15,
    yMin: 0,
    yMax: CORRIDOR_PARAPET_H,
  }
  const roof: EstateBox = {
    x: pw / 2,
    z: pd / 2,
    w: pw + 2 * OWN_WING_LEN,
    d: pd + CORRIDOR_D,
    yMin: roofY,
    yMax: roofY + ROOF_PARAPET_H,
  }
  // Nudge the roof box so it stays over the corridor side.
  roof.z = pd / 2 + CORRIDOR_D / 2

  const footprint = { x: pw / 2, z: pd / 2, w: pw + 2 * OWN_WING_LEN, d: pd }

  // Neighbours. `far` is the window side, `near` the corridor side. Blocks are parallel
  // slabs staggered along X, one point block for a skyline. In the canonical frame the
  // corridor is always +z, so the own block's windows always look down −z: `winSign` is
  // the constant that names that invariant (kept as a name, not inlined, because every
  // neighbour offset below is stated relative to it).
  const winSign = -1
  const blocks: EstateBlock[] = []
  const slab = (
    id: string,
    x: number,
    z: number,
    w: number,
    storeys: number,
    windowSide: Side,
    paint: number,
    yawDeg = 0,
  ) =>
    blocks.push({
      id,
      x,
      z,
      w,
      d: 11,
      storeys,
      yaw: (yawDeg * Math.PI) / 180,
      windowSide,
      paint,
    })
  const pt = (id: string, x: number, z: number, storeys: number, paint: number) =>
    blocks.push({ id, x, z, w: 26, d: 26, storeys, yaw: 0, windowSide: '+z', paint })

  // Window side: a slab across the access road and carpark (~60 m, the common HDB
  // spacing that leaves sky above a 12-storey neighbour from an 8th-storey window),
  // set slightly oblique; a second further out; a point block for the skyline.
  const wf = winSign > 0 ? '-z' : '+z'
  slab('n1', pw / 2 - 10 + rnd() * 8, winSign * 62 + pd / 2, 74, 12, wf, 0, 11 * winSign)
  slab('n2', pw / 2 + 58 + rnd() * 10, winSign * 104 + pd / 2, 66, 14, wf, 1, -6 * winSign)
  slab(
    'n3',
    pw / 2 - 84 + rnd() * 10,
    winSign * 108 + pd / 2,
    72,
    16,
    winSign > 0 ? '+z' : '-z',
    2,
    4,
  )
  pt('p1', pw / 2 + 96 + rnd() * 10, winSign * 54 + pd / 2, 25, 1)
  // Corridor side: one slab across the carpark, set back further.
  slab(
    's1',
    pw / 2 + 10 + rnd() * 10,
    -winSign * 58 + pd / 2,
    84,
    12,
    winSign > 0 ? '+z' : '-z',
    2,
    -7,
  )
  pt('p2', pw / 2 - 95 + rnd() * 10, -winSign * 52 + pd / 2, 20, 0)

  // Roads: one along each side of our block, between it and the first neighbour.
  const roads: EstateRoad[] = [
    { x: pw / 2, z: winSign * 30 + pd / 2, w: 320, d: 7 },
    { x: pw / 2, z: -winSign * 30 + pd / 2, w: 320, d: 7 },
  ]

  // Rain trees along the roads and between blocks, never inside a footprint.
  const trees: EstateTree[] = []
  const inBox = (x: number, z: number, b: { x: number; z: number; w: number; d: number }, m = 3) =>
    Math.abs(x - b.x) < b.w / 2 + m && Math.abs(z - b.z) < b.d / 2 + m
  const occupied = [footprint, ...blocks]
  let tries = 0
  while (trees.length < 60 && tries < 2000) {
    tries++
    const x = pw / 2 + (rnd() - 0.5) * 260
    const z = pd / 2 + (rnd() - 0.5) * 240
    if (occupied.some((b) => inBox(x, z, b))) continue
    if (roads.some((r) => inBox(x, z, r, 1))) continue
    // Keep the immediate window view partly open: thin out trees right in front.
    if (Math.abs(z - pd / 2) < 12) continue
    trees.push({ x, z, h: 12 + rnd() * 6, r: 6 + rnd() * 4 })
  }

  return {
    groundY,
    ownFloorY: 0,
    own: { westWing, eastWing, below, above, corridorFloor, corridorParapet, roof, footprint },
    blocks,
    trees,
    roads,
  }
}

/** Absolute Y range of a neighbour block's residential storeys (above its void deck). */
export function blockYRange(groundY: number, storeys: number): { deckTop: number; roofY: number } {
  return { deckTop: groundY + VOID_DECK_H, roofY: groundY + storeyTopAboveGround(storeys) }
}

/**
 * Cut the OWN block at a horizontal plane, building-section style (ORBIT-SECTION-CUT,
 * 2026-09-05). The orbit dollhouse looks down into the flat with its ceiling culled — the
 * storeys above (`own.above`/`own.roof`) would put an opaque slab over that open top, and the
 * wings would rise the full `OWN_BLOCK_STOREYS` beside it, both wrong for a view whose whole
 * point is seeing in. This returns a new layout with `own.above`/`own.roof` REMOVED and the
 * wings' `yMax` clamped to `cutY` — everything else (the storeys below, the corridor, every
 * neighbour block, the ground, roads and trees) is untouched, because only the own block above
 * the cut plane is unreal to look at; the rest of the estate is real geometry either way.
 *
 * Pure: no three, no randomness — same shape as {@link buildEstateLayout}, so it is trivial to
 * unit-test and trivial to prove a no-cut caller is byte-identical to the plain layout.
 */
export function sectionCut(layout: EstateLayout, cutY: number): EstateLayout {
  return {
    ...layout,
    own: {
      ...layout.own,
      westWing: { ...layout.own.westWing, yMax: Math.min(layout.own.westWing.yMax, cutY) },
      eastWing: { ...layout.own.eastWing, yMax: Math.min(layout.own.eastWing.yMax, cutY) },
      above: undefined,
      roof: undefined,
    },
  }
}
