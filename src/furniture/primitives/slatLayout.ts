/**
 * Pure layout maths for slatted / battened / grid primitives (room dividers,
 * fluted feature walls, screens, cube shelves, venetian blinds, drying racks).
 * Kept render-agnostic so it can be unit-tested without a GPU and reused by any
 * primitive that lays out a run of evenly-spaced battens. The primitive maps
 * the returned centres onto meshes or — for the common case of many identical
 * boxes/rods sharing one material — onto a single `InstancedBoxes` /
 * `InstancedCylinders` draw call (rotation-capable instances, so tilted slats
 * and splayed rods collapse to one draw call too).
 */

import type { BoxInstance } from './InstancedBoxes'

/** Batten count for a span that places `n` battens of `battenW` separated by a
 *  target `gap`, matching the `Math.max(1, Math.round((span-battenW)/(battenW+
 *  gap)))` idiom shared by the room divider's slats/grid. */
export function battenCount(span: number, battenW: number, gap: number): number {
  return Math.max(1, Math.round((span - battenW) / (battenW + gap)))
}

/** Even step between `n` battens spanning `span`, with the first/last centred
 *  `battenW/2` inside the ends (0 when there is a single batten). */
export function battenStep(span: number, battenW: number, n: number): number {
  return n > 1 ? (span - battenW) / (n - 1) : 0
}

/** Centre offset of batten `i` for the above step layout. */
export function battenOffset(span: number, battenW: number, step: number, i: number): number {
  return -span / 2 + battenW / 2 + i * step
}

/** Vertical-batten count for a fixed pitch (≥ a floor count). Mirrors the
 *  `Math.max(min, Math.round(width / pitch))` idiom used by the feature wall. */
export function pitchedCount(width: number, pitch: number, min: number): number {
  return Math.max(min, Math.round(width / pitch))
}

/** Centre offsets for `count` battens at a uniform `step = width/count`, each
 *  centred in its cell: `-width/2 + step/2 + i*step`. Used by the fixed-pitch
 *  feature wall. */
export function pitchedOffsets(width: number, count: number): number[] {
  const step = width / count
  return Array.from({ length: count }, (_, i) => -width / 2 + step / 2 + i * step)
}

// ── Venetian-blind slat stack ────────────────────────────────────────────────
// A venetian blind is a fixed stack of identical, uniformly-tilted slat boxes
// hung from the cassette; the raise/lower animation is a Y-scale on the parent
// group (unchanged), so the per-slat layout depends only on width + max drop.

/** Slat pitch (m) — one slat every ~8 cm of drop. */
export const VENETIAN_SLAT_PITCH = 0.08
/** Default slat tilt (rad, about local X) — the fixed venetian louvre angle. */
export const VENETIAN_SLAT_TILT = 0.5
const SLAT_THICKNESS = 0.006
const SLAT_DEPTH = 0.06
/** Slats sit slightly proud of the cassette centreline (matches the mesh z). */
const SLAT_Z = 0.045

/** Number of slats for a stack covering `maxDrop` — floored at 4 so a tiny
 *  blind still reads as slatted. Mirrors `Math.max(4, Math.round(maxDrop/0.08))`. */
export function venetianSlatCount(maxDrop: number): number {
  return Math.max(4, Math.round(maxDrop / VENETIAN_SLAT_PITCH))
}

/**
 * Instance transforms for a venetian slat stack, anchored at the cassette top
 * (y = 0) and descending. Each slat is a `width × SLAT_THICKNESS × SLAT_DEPTH`
 * box, uniformly tilted `tilt` rad about X, its centre at
 * `y = -(maxDrop/n)*(i+0.5)` — byte-for-byte the transforms the per-mesh
 * version produced, so the InstancedMesh renders identically. The parent group
 * still applies the `drop/maxDrop` Y-scale (raise/lower) on top.
 */
export function venetianSlatInstances(
  width: number,
  maxDrop: number,
  tilt: number = VENETIAN_SLAT_TILT,
): BoxInstance[] {
  const n = venetianSlatCount(maxDrop)
  const pitch = maxDrop / n
  return Array.from({ length: n }, (_, i) => ({
    position: [0, -pitch * (i + 0.5), SLAT_Z] as [number, number, number],
    rotation: [tilt, 0, 0] as [number, number, number],
    size: [width, SLAT_THICKNESS, SLAT_DEPTH] as [number, number, number],
  }))
}

// ── Drying-rack rod frame ────────────────────────────────────────────────────
// A foldable A-frame drying rack: two splayed leg frames (each an inverted-V of
// two tilted legs + a foot rail) joined by a run of horizontal drying bars.
// Every member is a plain metal rod → one rotation-capable InstancedCylinders
// draw call. All rods scale a unit cylinder as `[radius, length, radius]`.

const RACK_HEIGHT = 0.95
const RACK_SPREAD = 0.5
const RACK_BARS = 5
const RACK_LEG_R = 0.015
const RACK_LEG_SPLAY = 0.32
const RACK_RAIL_R = 0.012
const RACK_BAR_R = 0.008

/**
 * Instance transforms (unit-cylinder scale + rotation) for every rod of a drying
 * rack of the given `width`: 2 frames × (2 splayed legs + 1 foot rail) + a run of
 * `RACK_BARS` horizontal drying bars. Reproduces exactly the positions/rotations/
 * dimensions of the previous per-mesh `DryingRack` so the single instanced draw
 * call renders identically (the bars unify to the leg tessellation — see the
 * primitive's `radialSegments`). Faces +Z.
 */
export function dryingRackCylinders(width: number): BoxInstance[] {
  const halfW = width / 2
  const frames = [-RACK_SPREAD / 2, RACK_SPREAD / 2]
  const rods: BoxInstance[] = []
  for (const z of frames) {
    for (const s of [-1, 1]) {
      // Inverted-V leg: tilted ±RACK_LEG_SPLAY about Z, full height.
      rods.push({
        position: [s * halfW * 0.35, RACK_HEIGHT / 2, z],
        rotation: [0, 0, s * RACK_LEG_SPLAY],
        size: [RACK_LEG_R, RACK_HEIGHT, RACK_LEG_R],
      })
    }
    // Foot rail: horizontal (rotated PI/2 about Z), spanning 80% of the width.
    rods.push({
      position: [0, 0.02, z],
      rotation: [0, 0, Math.PI / 2],
      size: [RACK_RAIL_R, width * 0.8, RACK_RAIL_R],
    })
  }
  // Top drying bars spanning the two frames.
  for (let i = 0; i < RACK_BARS; i++) {
    const z = -RACK_SPREAD / 2 + (RACK_SPREAD * i) / (RACK_BARS - 1)
    rods.push({
      position: [0, RACK_HEIGHT - 0.04, z],
      rotation: [0, 0, Math.PI / 2],
      size: [RACK_BAR_R, width * 0.78, RACK_BAR_R],
    })
  }
  return rods
}
