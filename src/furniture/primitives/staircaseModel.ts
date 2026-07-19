/**
 * Pure, render-agnostic staircase geometry. `buildStaircase` turns a
 * declarative `StaircaseSpec` into a flat list of axis-aligned `StaircasePart`s
 * (treads, risers, landings, railing posts + handrails, and the spiral newel)
 * so the geometry can be unit-tested without a GPU. The `Staircase.tsx`
 * renderer maps each part onto a single box (or, for the newel, a cylinder)
 * mesh — mirroring how `cabinet/cabinetModel.ts` separates `buildCabinet` from
 * its renderer.
 *
 * Conventions (shared with the other primitives): real metres, floor-anchored
 * (every part's Y is the centre of a box that sits on the floor or on the part
 * below it), footprint-centred about the origin, the first flight ascending
 * toward +Z. `position` is the box centre `[x, y, z]`; `size` is `[w, h, d]`;
 * `rot` is an optional Y-axis rotation in radians (used by turned flights +
 * spiral treads).
 */

type StaircasePartKind = 'tread' | 'riser' | 'landing' | 'post' | 'rail' | 'newel'

export interface StaircasePart {
  kind: StaircasePartKind
  position: [number, number, number]
  size: [number, number, number]
  /** Y-axis rotation in radians (default 0). */
  rot?: number
  /** X-axis rotation (pitch, default 0) — tilts a Z-running handrail up its rake. */
  pitch?: number
  /** Z-axis rotation (roll, default 0) — tilts an X-running handrail up its rake. */
  roll?: number
}

export type StaircaseStyle = 'straight' | 'lshape' | 'ushape' | 'spiral'
export type StaircaseRailing = 'none' | 'side' | 'both'

export interface StaircaseSpec {
  style: StaircaseStyle
  steps: number
  width: number
  riserHeight: number
  treadDepth: number
  railing: StaircaseRailing
}

/** Tread slab thickness (the visible board the foot lands on). */
const TREAD_THICK = 0.05
/** Handrail height above the tread nosing. */
const RAIL_HEIGHT = 0.9
/** Square cross-section of railing posts + handrail. */
const RAIL_T = 0.04
/** Spiral central newel post radius (the box footprint encodes the diameter). */
const NEWEL_R = 0.06

/** Clamp a dimension to a small positive minimum so zero/negative props never
 *  produce degenerate (or inverted) geometry. */
function clampDim(v: number, min: number): number {
  return Number.isFinite(v) && v > min ? v : min
}

/** Normalise + clamp a raw spec so the builders below can trust their inputs. */
function sanitize(spec: StaircaseSpec): Required<StaircaseSpec> {
  return {
    style: spec.style,
    steps: Math.max(1, Math.round(Number.isFinite(spec.steps) ? spec.steps : 1)),
    width: clampDim(spec.width, 0.3),
    riserHeight: clampDim(spec.riserHeight, 0.05),
    treadDepth: clampDim(spec.treadDepth, 0.1),
    railing: spec.railing,
  }
}

/** One tread board + the solid riser block beneath it. The tread top sits at
 *  the per-step rise; the riser fills from the step below up to the tread
 *  underside so nothing floats. `cx`/`cz` centre the run; `axis`/`dir` choose
 *  the climbing direction; `rot` orients a turned flight. */
function flightTreads(
  s: Required<StaircaseSpec>,
  count: number,
  baseY: number,
  cx: number,
  cz: number,
  axis: 'x' | 'z',
  dir: 1 | -1,
  rot: number,
): StaircasePart[] {
  const parts: StaircasePart[] = []
  const along = s.treadDepth
  for (let i = 0; i < count; i++) {
    const topY = baseY + (i + 1) * s.riserHeight
    // Offset of this tread's centre measured along the climbing axis.
    const offset = dir * (i + 0.5 - count / 2) * along
    const ax = axis === 'x' ? cx + offset : cx
    const az = axis === 'z' ? cz + offset : cz
    const w = axis === 'z' ? s.width : along
    const d = axis === 'z' ? along : s.width
    parts.push({
      kind: 'tread',
      position: [ax, topY - TREAD_THICK / 2, az],
      size: [w, TREAD_THICK, d],
      rot,
    })
    // Riser fills the gap below this tread board down to the step below it.
    const riserTop = topY - TREAD_THICK
    const riserBottom = baseY + i * s.riserHeight
    const riserH = riserTop - riserBottom
    if (riserH > 0) {
      parts.push({
        kind: 'riser',
        position: [ax, riserTop - riserH / 2, az],
        size: [w, riserH, d],
        rot,
      })
    }
  }
  return parts
}

/** A square landing slab whose top sits flush with the tread top at `topY`. */
function landing(topY: number, cx: number, cz: number, side: number): StaircasePart {
  return {
    kind: 'landing',
    position: [cx, topY - TREAD_THICK / 2, cz],
    size: [side, TREAD_THICK, side],
  }
}

/** Posts + ONE continuous sloped handrail for one side of a flight. Each post
 *  rises from a tread nosing to handrail height; a single rail box spans from
 *  the first post to the last, tilted up the flight's rake (about X for a
 *  Z-running flight, about Z for an X-running one) so it reads as a real
 *  connected rail — not disjoint per-tread caps. `lateral` offsets the run to
 *  the chosen side of the climbing axis. */
function railRun(
  s: Required<StaircaseSpec>,
  count: number,
  baseY: number,
  cx: number,
  cz: number,
  axis: 'x' | 'z',
  dir: 1 | -1,
  lateral: number,
  rot: number,
): StaircasePart[] {
  const parts: StaircasePart[] = []
  const along = s.treadDepth
  for (let i = 0; i < count; i++) {
    const topY = baseY + (i + 1) * s.riserHeight
    const offset = dir * (i + 0.5 - count / 2) * along
    // Position along the climbing axis, then push out laterally to the side.
    const px = axis === 'z' ? cx + lateral : cx + offset
    const pz = axis === 'z' ? cz + offset : cz + lateral
    parts.push({
      kind: 'post',
      position: [px, topY + RAIL_HEIGHT / 2, pz],
      size: [RAIL_T, RAIL_HEIGHT, RAIL_T],
      rot,
    })
  }
  // One continuous rail spanning the flight. The flight is centred on its axis
  // (post offsets sum to 0), so the rail centres on cx/cz laterally offset; its
  // mid-height is the average of the first + last post tops. Length covers the
  // full run plus a nosing overhang at each end.
  const hyp = Math.hypot(along, s.riserHeight)
  const rake = Math.atan2(s.riserHeight, along)
  const railLen = count * hyp
  const cy = baseY + RAIL_HEIGHT + (s.riserHeight * (count + 1)) / 2
  const rx = axis === 'z' ? cx + lateral : cx
  const rz = axis === 'z' ? cz : cz + lateral
  parts.push({
    kind: 'rail',
    position: [rx, cy, rz],
    size: axis === 'z' ? [RAIL_T, RAIL_T, railLen] : [railLen, RAIL_T, RAIL_T],
    rot,
    // Tilt up the rake: about X for a Z-flight, about Z for an X-flight. The
    // sign flips with the climbing direction so a doubling-back flight (U-shape)
    // still rises toward its own top.
    pitch: axis === 'z' ? -dir * rake : 0,
    roll: axis === 'x' ? dir * rake : 0,
  })
  return parts
}

/** Single-side / both-side railing for a flight along the given axis. */
function flightRailing(
  s: Required<StaircaseSpec>,
  count: number,
  baseY: number,
  cx: number,
  cz: number,
  axis: 'x' | 'z',
  dir: 1 | -1,
  rot: number,
): StaircasePart[] {
  if (s.railing === 'none') return []
  // Inset the balusters/rail a hair inboard of the tread edge so the rail's
  // outer face is NOT coplanar with the tread edge (which z-fights) and it reads
  // as a real set-in guard rather than flush with the stringer.
  const half = s.width / 2 - RAIL_T
  const parts = railRun(s, count, baseY, cx, cz, axis, dir, half, rot)
  if (s.railing === 'both') {
    parts.push(...railRun(s, count, baseY, cx, cz, axis, dir, -half, rot))
  }
  return parts
}

function buildStraight(s: Required<StaircaseSpec>): StaircasePart[] {
  // Footprint-centre the run on Z: centre tread offsets span [-D/2, +D/2].
  const parts = flightTreads(s, s.steps, 0, 0, 0, 'z', 1, 0)
  parts.push(...flightRailing(s, s.steps, 0, 0, 0, 'z', 1, 0))
  return parts
}

/** Split the step budget into `flights` of roughly equal size, leaving at least
 *  one step per flight. */
function splitSteps(steps: number, flights: number): number[] {
  const out: number[] = []
  let remaining = steps
  for (let f = 0; f < flights; f++) {
    const left = flights - f
    const take = Math.max(1, Math.min(Math.round(remaining / left), remaining - (left - 1)))
    out.push(take)
    remaining -= take
  }
  return out
}

function buildLShape(s: Required<StaircaseSpec>): StaircasePart[] {
  const [n1, n2] = splitSteps(s.steps, 2)
  const parts: StaircasePart[] = []
  // First flight climbs +Z from the origin.
  const flight1Depth = n1 * s.treadDepth
  const cz1 = flight1Depth / 2
  parts.push(...flightTreads(s, n1, 0, 0, cz1, 'z', 1, 0))
  parts.push(...flightRailing(s, n1, 0, 0, cz1, 'z', 1, 0))
  // Landing at the top of flight 1.
  const landY = n1 * s.riserHeight
  const landZ = flight1Depth + s.width / 2
  parts.push(landing(landY, 0, landZ, s.width))
  // Second flight turns 90° and climbs +X off the landing. The turn is fully
  // expressed by `axis: 'x'` (flightTreads/railRun already swap the box dims +
  // march the run along X) — so `rot` stays 0. Passing a further Math.PI/2 here
  // used to DOUBLE-rotate every already-X-oriented box: treads ended up width-in-X
  // (overlapping enough to still read as connected) but the thin railing posts +
  // handrail segments were spun perpendicular to the run, so each post+rail pair
  // broke off into its own AABB component (the deferred harness finding).
  const cx2 = s.width / 2 + (n2 * s.treadDepth) / 2
  parts.push(...flightTreads(s, n2, landY, cx2, landZ, 'x', 1, 0))
  parts.push(...flightRailing(s, n2, landY, cx2, landZ, 'x', 1, 0))
  return parts
}

function buildUShape(s: Required<StaircaseSpec>): StaircasePart[] {
  const [n1, n2] = splitSteps(s.steps, 2)
  const parts: StaircasePart[] = []
  // Flight 1 climbs +Z.
  const flight1Depth = n1 * s.treadDepth
  const cz1 = flight1Depth / 2
  parts.push(...flightTreads(s, n1, 0, 0, cz1, 'z', 1, 0))
  parts.push(...flightRailing(s, n1, 0, 0, cz1, 'z', 1, 0))
  // Half-landing spanning the two parallel flights.
  const landSide = s.width * 2
  const landY = n1 * s.riserHeight
  const landZ = flight1Depth + landSide / 2
  parts.push(landing(landY, s.width / 2, landZ, landSide))
  // Flight 2 doubles back (−Z) alongside flight 1, offset by one width in +X.
  const cx2 = s.width
  const flight2Depth = n2 * s.treadDepth
  const cz2 = landZ - landSide / 2 - flight2Depth / 2
  parts.push(...flightTreads(s, n2, landY, cx2, cz2, 'z', -1, 0))
  parts.push(...flightRailing(s, n2, landY, cx2, cz2, 'z', -1, 0))
  return parts
}

function buildSpiral(s: Required<StaircaseSpec>): StaircasePart[] {
  const parts: StaircasePart[] = []
  // Central newel from the floor up to the last tread top.
  const totalRise = s.steps * s.riserHeight
  parts.push({
    kind: 'newel',
    position: [0, totalRise / 2, 0],
    size: [NEWEL_R * 2, totalRise, NEWEL_R * 2],
  })
  // Treads fan around the newel; each reaches out by `width`. The angular step
  // is sized so the outer ends roughly meet the chosen tread depth.
  const radius = s.width
  const midR = NEWEL_R + radius / 2
  const angStep = Math.min(Math.PI / 3, Math.max(0.2, s.treadDepth / Math.max(midR, 0.1)))
  for (let i = 0; i < s.steps; i++) {
    const topY = (i + 1) * s.riserHeight
    const ang = i * angStep
    const cx = Math.cos(ang) * midR
    const cz = Math.sin(ang) * midR
    // Tread wedge approximated by a box stretching from the newel outward.
    parts.push({
      kind: 'tread',
      position: [cx, topY - TREAD_THICK / 2, cz],
      size: [radius, TREAD_THICK, s.treadDepth],
      rot: ang,
    })
    // Riser fills below the tread down to the previous tread top (no float).
    const riserH = s.riserHeight - TREAD_THICK
    if (riserH > 0) {
      parts.push({
        kind: 'riser',
        position: [cx, topY - TREAD_THICK - riserH / 2, cz],
        size: [radius, riserH, s.treadDepth],
        rot: ang,
      })
    }
    // Outer-edge railing post + handrail segment.
    if (s.railing !== 'none') {
      const outR = NEWEL_R + radius - RAIL_T
      const px = Math.cos(ang) * outR
      const pz = Math.sin(ang) * outR
      parts.push({
        kind: 'post',
        position: [px, topY + RAIL_HEIGHT / 2, pz],
        size: [RAIL_T, RAIL_HEIGHT, RAIL_T],
        rot: ang,
      })
      parts.push({
        kind: 'rail',
        position: [px, topY + RAIL_HEIGHT, pz],
        size: [s.treadDepth, RAIL_T, RAIL_T],
        rot: ang,
      })
    }
  }
  return parts
}

/**
 * Build the full part list for a staircase. Pure + deterministic: same spec →
 * same parts. Bad input (zero/negative dims, sub-1 step counts, non-finite
 * numbers) is clamped to sane minimums.
 */
export function buildStaircase(spec: StaircaseSpec): StaircasePart[] {
  const s = sanitize(spec)
  switch (s.style) {
    case 'lshape':
      return buildLShape(s)
    case 'ushape':
      return buildUShape(s)
    case 'spiral':
      return buildSpiral(s)
    default:
      return buildStraight(s)
  }
}

/** Sanitised spec (clamped) — exposed so the renderer + footprint maths agree
 *  with the builder on the effective dimensions. */
export function sanitizeStaircase(spec: StaircaseSpec): Required<StaircaseSpec> {
  return sanitize(spec)
}

/** One box of the plan-projected (XZ) footprint, in the SAME local frame the
 *  builders use (origin = item position, first flight along +Z). Structurally a
 *  `FurnitureDef` `FootprintPart`; the `staircase` def maps these straight in. */
export interface StaircaseFootprintPart {
  dx: number
  dz: number
  w: number
  d: number
}

/**
 * Honest plan (XZ) footprint of a staircase as a small set of axis-aligned
 * boxes — the treads' + landing's ground projection, matching where
 * `buildStaircase` actually places geometry (an L/U-shape occupies an L/U in
 * plan, NOT the full enclosing box, so a piece can sit in the open corner and
 * collision/clearance is honest). Pure + deterministic; unit-tested. The item's
 * scale + rotation are applied on top by `collision/placement.ts`.
 */
export function staircaseFootprintParts(spec: StaircaseSpec): StaircaseFootprintPart[] {
  const s = sanitize(spec)
  const run = s.steps * s.treadDepth
  if (s.style === 'lshape') {
    const [n1, n2] = splitSteps(s.steps, 2)
    const flight1Depth = n1! * s.treadDepth
    const landZ = flight1Depth + s.width / 2
    const flight2Run = n2! * s.treadDepth
    return [
      { dx: 0, dz: flight1Depth / 2, w: s.width, d: flight1Depth },
      { dx: 0, dz: landZ, w: s.width, d: s.width },
      { dx: s.width / 2 + flight2Run / 2, dz: landZ, w: flight2Run, d: s.width },
    ]
  }
  if (s.style === 'ushape') {
    const [n1, n2] = splitSteps(s.steps, 2)
    const flight1Depth = n1! * s.treadDepth
    const landSide = s.width * 2
    const landZ = flight1Depth + landSide / 2
    const flight2Depth = n2! * s.treadDepth
    const cz2 = landZ - landSide / 2 - flight2Depth / 2
    return [
      { dx: 0, dz: flight1Depth / 2, w: s.width, d: flight1Depth },
      { dx: s.width / 2, dz: landZ, w: landSide, d: landSide },
      { dx: s.width, dz: cz2, w: s.width, d: flight2Depth },
    ]
  }
  if (s.style === 'spiral') {
    // Treads fan around the central newel out to `width` — a disc of radius
    // (NEWEL_R + width). A centred square that encloses that disc is a safe,
    // simple footprint (the sweep is often a partial arc, so this over-covers).
    const side = 2 * (NEWEL_R + s.width)
    return [{ dx: 0, dz: 0, w: side, d: side }]
  }
  // Straight: one centred box, depth = the true run (tracks the step count, so
  // a 24-step flight is honestly longer than a 13-step one).
  return [{ dx: 0, dz: 0, w: s.width, d: run }]
}
