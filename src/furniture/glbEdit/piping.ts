/**
 * GLB Asset Designer — Stage 5 piping/seam preset. One tap on a selected box or
 * extrude part generates a thin round SWEEP part (Stage-1 `sweep` geometry
 * reused) tracing the part's TOP-FACE perimeter as a rounded-rect, grouped with
 * the host so they move together — sofa/cushion piping with no manual path work.
 *
 * The perimeter path is pure math (`roundedRectPathPoints`, unit-tested); it is
 * stored on the sweep part as explicit `sweepPoints` (which override the preset
 * `sweepPath` in `shapeProfiles.sweepGeometry`). The piping's finish defaults to
 * the host part's colour, slightly darkened, so it reads as an upholstered welt.
 */

import { Color } from 'three'
import {
  type AssetEditSpec,
  newPartGroupId,
  newPartId,
  type PartGroup,
  partGroupForPart,
  partGroups,
  type ShapePart,
} from './editSpec'

/** Kinds the piping preset can trace (a flat-topped footprint). */
export function canPipe(part: ShapePart | null | undefined): part is ShapePart {
  return !!part && (part.kind === 'box' || part.kind === 'extrude')
}

export interface PipingParams {
  /** Welt tube diameter (m). */
  tubeDiameter: number
  /** How far in from the part's edge the piping sits (m). */
  edgeInset: number
}

export const PIPING_DEFAULTS: PipingParams = { tubeDiameter: 0.014, edgeInset: 0.02 }
export const PIPING_LIMITS = {
  tubeDiameter: { min: 0.006, max: 0.03, step: 0.001 },
  edgeInset: { min: 0, max: 0.08, step: 0.005 },
} as const

/**
 * Perimeter of a rounded rectangle `width × depth` (centred at the origin, in the
 * XZ plane at y = 0), corner radius `radius`, `segPerCorner` arc samples per
 * corner. Returns an ordered, non-repeating loop of `[x, 0, z]` points (the
 * caller closes the sweep). Radius is clamped to half the smaller side. Pure.
 */
export function roundedRectPathPoints(
  width: number,
  depth: number,
  radius: number,
  segPerCorner = 5,
): [number, number, number][] {
  const hw = Math.max(1e-3, width / 2)
  const hd = Math.max(1e-3, depth / 2)
  const r = Math.max(0, Math.min(radius, hw, hd))
  const pts: [number, number, number][] = []
  // Four corner centres, each swept through a 90° arc (CCW in the XZ plane).
  // Angles chosen so consecutive corners chain into a continuous loop.
  const corners: [number, number, number][] = [
    [hw - r, hd - r, 0], // +X/+Z, start heading from +X edge
    [-(hw - r), hd - r, Math.PI / 2], // -X/+Z
    [-(hw - r), -(hd - r), Math.PI], // -X/-Z
    [hw - r, -(hd - r), (3 * Math.PI) / 2], // +X/-Z
  ]
  for (const [cx, cz, a0] of corners) {
    if (r <= 1e-6) {
      // Square corner — a single vertex at the corner (arc collapses).
      pts.push([cx, cz, 0])
      continue
    }
    for (let s = 0; s <= segPerCorner; s++) {
      const a = a0 + (s / segPerCorner) * (Math.PI / 2)
      pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a), 0])
    }
  }
  // The arc math kept the coordinates in slots [x, z]; rebuild as [x, 0, z] and
  // drop exact consecutive duplicates (shared corner samples).
  const loop: [number, number, number][] = []
  for (const [x, z] of pts) {
    const last = loop[loop.length - 1]
    if (!last || Math.abs(last[0] - x) > 1e-6 || Math.abs(last[2] - z) > 1e-6) {
      loop.push([x, 0, z])
    }
  }
  return loop
}

/** The host part's top-face Y (part-local): box/extrude size[1] is full height,
 *  so the top face sits at +h/2. */
function topFaceY(part: ShapePart): number {
  return part.size[1] / 2
}

/** Darken a hex colour toward black by `factor` (0…1 kept). */
function darken(hex: string, factor = 0.72): string {
  try {
    return `#${new Color(hex).multiplyScalar(factor).getHexString()}`
  } catch {
    return hex
  }
}

/**
 * Build the piping sweep part for a host box/extrude (Stage 5). Traces the host's
 * top-face perimeter (inset by `edgeInset`, rounded by the host bevel), as a round
 * tube of `tubeDiameter`, positioned to sit on the host (same part-local origin),
 * darkened from the host colour. Pure — returns the `ShapePart` (with fresh id).
 */
export function buildPipingPart(host: ShapePart, params: PipingParams): ShapePart {
  const w = host.size[0]
  const d = host.size[2]
  const inset = Math.max(0, Math.min(params.edgeInset, w / 2 - 0.005, d / 2 - 0.005))
  const innerW = Math.max(0.01, w - 2 * inset)
  const innerD = Math.max(0.01, d - 2 * inset)
  // Round the piping to the host's own corner radius (minus the inset) when it has
  // one, else a soft default so the welt turns corners smoothly.
  const hostBevel = host.bevel ?? 0
  const seedRadius = hostBevel > 0 ? hostBevel : Math.min(innerW, innerD) * 0.12
  const radius = Math.max(0.006, Math.min(seedRadius, innerW / 2, innerD / 2))
  const y = topFaceY(host)
  const points = roundedRectPathPoints(innerW, innerD, radius).map(
    (p) => [p[0], y, p[2]] as [number, number, number],
  )
  const span = Math.max(w, d)
  return {
    id: newPartId(),
    kind: 'sweep',
    name: 'Piping',
    // Share the host's origin so grouping + moving keeps them registered.
    position: [...host.position] as [number, number, number],
    rotation: host.rotation ? ([...host.rotation] as [number, number, number]) : undefined,
    size: [span, params.tubeDiameter, span],
    sweepProfile: 'circle',
    sweepPath: 'ring',
    sweepPoints: points,
    color: darken(host.color),
    roughness: host.roughness ?? 0.6,
    metalness: host.metalness ?? 0.05,
  }
}

/**
 * Add piping to a host part: build the sweep welt, append it, and GROUP it with
 * the host so they move together (join the host's existing transform group, or
 * mint a new "…piping" group over the pair). Returns `{ spec, groupId, pipingId }`
 * (pipingId null when the host can't be piped). Pure — the caller commits +
 * selects.
 */
export function addPiping(
  spec: AssetEditSpec,
  hostId: string,
  params: PipingParams,
): { spec: AssetEditSpec; groupId: string | null; pipingId: string | null } {
  const host = spec.parts.find((p) => p.id === hostId)
  if (!canPipe(host)) return { spec, groupId: null, pipingId: null }
  const piping = buildPipingPart(host, params)
  const parts = [...spec.parts, piping]
  const existing = partGroupForPart(spec, hostId)
  if (existing) {
    // Join the host's group so the welt rides with it.
    const next = partGroups(spec).map((g) =>
      g.id === existing.id ? { ...g, partIds: [...g.partIds, piping.id] } : g,
    )
    return { spec: { ...spec, parts, partGroups: next }, groupId: existing.id, pipingId: piping.id }
  }
  const id = newPartGroupId()
  const group: PartGroup = { id, name: 'Piping', partIds: [hostId, piping.id] }
  return {
    spec: { ...spec, parts, partGroups: [...partGroups(spec), group] },
    groupId: id,
    pipingId: piping.id,
  }
}
