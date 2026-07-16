/**
 * GLB Asset Designer — Stage 4 precision maths: **align / distribute** the
 * selected parts and the **bounding-box extents** the align/distribute and the
 * live dimension readout share.
 *
 * Pure of the store + React (three's math classes only — no GPU), so every
 * decision is unit-testable. Operates on a part's serialisable `position` +
 * `size` + `rotation`, computing each part's world-axis-aligned bounding box
 * (kind-aware: a lathe/sweep read their diameter from `size[0]` on BOTH X and Z,
 * a torus spans its outer diameter on X/Z and its tube on Y, a mesh reads its
 * baked geometry bounds) and rotating that box into the asset frame.
 *
 * Align/distribute operate on the parts at their OWN local transform (the asset
 * root for an ungrouped part). A part inside a transform group is aligned within
 * that group's local frame — the common case is aligning ungrouped parts, for
 * which local = world.
 */

import { Euler, Matrix4 } from 'three'
import { type AssetEditSpec, type ShapePart, updatePart } from './editSpec'

const DEG = Math.PI / 180

/** Axis index for the three arrange/dimension axes. */
export type Axis3 = 'x' | 'y' | 'z'
const AXIS_INDEX: Record<Axis3, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }

/** How to align the selected parts on an axis. */
export type AlignMode = 'min' | 'center' | 'max'

/**
 * The part's LOCAL axis-aligned extent (full width/height/depth in metres,
 * before rotation), kind-aware. For most kinds `size` already IS the local AABB;
 * the radially-symmetric kinds (whose `size` packs a single diameter) and the
 * torus/mesh need a small remap so their box is honest. Pure.
 */
function partLocalExtent(part: ShapePart): [number, number, number] {
  const [w, h, d] = part.size
  switch (part.kind) {
    // Lathe (turned leg/bowl) + sweep (ring/moulding) read their diameter from
    // size[0] and are round in the XZ plane — X and Z both span that diameter.
    case 'lathe':
    case 'sweep':
      return [w, h, w]
    // Torus lies in three's XY plane: it spans its outer diameter (size[0]) on
    // X and Y and its tube diameter (size[1]) on Z.
    case 'torus':
      return [w, w, h]
    // Baked mesh (a CSG result): use the stored geometry bounds when available.
    case 'mesh': {
      const ext = meshExtent(part)
      return ext ?? [w, h, d]
    }
    default:
      return [w, h, d]
  }
}

/** The local extent of a baked mesh part from its stored positions, or null when
 *  the geometry is absent/empty. */
function meshExtent(part: ShapePart): [number, number, number] | null {
  const pos = part.geometry?.positions
  if (!pos || pos.length < 3) return null
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i < pos.length; i += 3) {
    minX = Math.min(minX, pos[i])
    maxX = Math.max(maxX, pos[i])
    minY = Math.min(minY, pos[i + 1])
    maxY = Math.max(maxY, pos[i + 1])
    minZ = Math.min(minZ, pos[i + 2])
    maxZ = Math.max(maxZ, pos[i + 2])
  }
  return [maxX - minX, maxY - minY, maxZ - minZ]
}

/** A part's world-axis-aligned extent (full size), accounting for its rotation:
 *  the rotated box's projection onto each axis = Σ_j |R[i][j]| · localHalf_j · 2.
 *  Pure. */
export function partWorldExtent(part: ShapePart): [number, number, number] {
  const [lx, ly, lz] = partLocalExtent(part)
  const r = part.rotation
  if (!r || (r[0] === 0 && r[1] === 0 && r[2] === 0)) return [lx, ly, lz]
  const m = new Matrix4().makeRotationFromEuler(
    new Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ'),
  )
  const e = m.elements // column-major: e[col*4 + row]
  const hx = lx / 2
  const hy = ly / 2
  const hz = lz / 2
  const ex = Math.abs(e[0]) * hx + Math.abs(e[4]) * hy + Math.abs(e[8]) * hz
  const ey = Math.abs(e[1]) * hx + Math.abs(e[5]) * hy + Math.abs(e[9]) * hz
  const ez = Math.abs(e[2]) * hx + Math.abs(e[6]) * hy + Math.abs(e[10]) * hz
  return [ex * 2, ey * 2, ez * 2]
}

/** An axis-aligned box in the asset frame. */
export interface Bounds3 {
  min: [number, number, number]
  max: [number, number, number]
  center: [number, number, number]
  size: [number, number, number]
}

/** One part's world AABB (centre = its position, extent = `partWorldExtent`). */
function partBounds(part: ShapePart): Bounds3 {
  const [ex, ey, ez] = partWorldExtent(part)
  const [px, py, pz] = part.position
  const min: [number, number, number] = [px - ex / 2, py - ey / 2, pz - ez / 2]
  const max: [number, number, number] = [px + ex / 2, py + ey / 2, pz + ez / 2]
  return { min, max, center: [px, py, pz], size: [ex, ey, ez] }
}

/** Union AABB over a set of parts. Returns null for an empty set. */
export function selectionBounds(parts: ShapePart[]): Bounds3 | null {
  if (parts.length === 0) return null
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const p of parts) {
    const b = partBounds(p)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i])
      max[i] = Math.max(max[i], b.max[i])
    }
  }
  const size: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ]
  return { min, max, center, size }
}

/** Kill float dust + normalise -0. */
function clean(v: number): number {
  const r = Number(v.toFixed(6))
  return r === 0 ? 0 : r
}

/**
 * Align the given parts on one axis. `min`/`max` flush every part's low/high
 * face to the extreme low/high face across the selection; `center` centres every
 * part on the selection's overall bounding-box centre. Only the chosen axis
 * coordinate moves — the other two are preserved. A part's rotation-aware extent
 * keeps its far face where the user expects. Returns the spec unchanged when
 * fewer than 2 given ids resolve. Pure — one spec transition = one undo step.
 */
export function alignParts(
  spec: AssetEditSpec,
  ids: string[],
  axis: Axis3,
  mode: AlignMode,
): AssetEditSpec {
  const i = AXIS_INDEX[axis]
  const parts = ids
    .map((id) => spec.parts.find((p) => p.id === id))
    .filter((p): p is ShapePart => !!p)
  if (parts.length < 2) return spec
  const bounds = parts.map((p) => partBounds(p))
  const lo = Math.min(...bounds.map((b) => b.min[i]))
  const hi = Math.max(...bounds.map((b) => b.max[i]))
  const mid = (lo + hi) / 2
  let next = spec
  parts.forEach((p, k) => {
    const half = bounds[k].size[i] / 2
    const target = mode === 'min' ? lo + half : mode === 'max' ? hi - half : mid
    const pos = [...p.position] as [number, number, number]
    pos[i] = clean(target)
    if (pos[i] !== p.position[i]) next = updatePart(next, p.id, { position: pos })
  })
  return next
}

/**
 * Distribute the given parts evenly along one axis so the GAP between adjacent
 * bounding boxes is equal (the professional "distribute spacing" default). The
 * two outermost parts stay put; the rest are re-spaced between them. Needs ≥3
 * parts (fewer has nothing to distribute). Returns the spec unchanged otherwise.
 * Pure — one spec transition = one undo step.
 */
export function distributeParts(spec: AssetEditSpec, ids: string[], axis: Axis3): AssetEditSpec {
  const i = AXIS_INDEX[axis]
  const parts = ids
    .map((id) => spec.parts.find((p) => p.id === id))
    .filter((p): p is ShapePart => !!p)
  if (parts.length < 3) return spec
  const entries = parts
    .map((p) => ({ part: p, b: partBounds(p) }))
    .sort((a, z) => a.b.min[i] - z.b.min[i])
  const first = entries[0].b.min[i]
  const last = entries[entries.length - 1].b.max[i]
  const totalExtent = entries.reduce((s, e) => s + e.b.size[i], 0)
  const gap = (last - first - totalExtent) / (entries.length - 1)
  let cursor = first
  let next = spec
  for (const e of entries) {
    const half = e.b.size[i] / 2
    const target = clean(cursor + half)
    if (target !== e.part.position[i]) {
      const pos = [...e.part.position] as [number, number, number]
      pos[i] = target
      next = updatePart(next, e.part.id, { position: pos })
    }
    cursor += e.b.size[i] + gap
  }
  return next
}
