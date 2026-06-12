/**
 * Pure data model + math for the linked 360° tour (P-720) — the Coohom-style
 * "720° tour" where multiple panoramas captured around the home are linked by
 * clickable room-to-room hotspots.
 *
 * A tour is an ordered list of {@link PanoTourStop}s (id + label + capture
 * position). Hotspots are **derived, never hand-authored**: for each stop,
 * every other nearby same-storey stop becomes a hotspot at the yaw/pitch from
 * the capture eye toward that stop's position. All the maths live here (no
 * three/React imports) so the yaw/pitch/projection behaviour is unit-testable;
 * the three.js wiring stays in `PanoTourModal` / `PanoramaViewer`.
 *
 * Conventions (must match the capture + viewer):
 * - World frame: metres, +X east, +Z south (the apartment frame).
 * - Viewer yaw 0 faces world **−Z** (the equirect seam alignment in
 *   `viewerLook.ts` `SPHERE_YAW`); camera forward at yaw θ is
 *   `(−sin θ, 0, −cos θ)`, so the yaw toward a world offset (dx, dz) is
 *   `atan2(−dx, −dz)`.
 * - Pitch is positive looking up (`LookState.pitch`).
 */

import { type PlanRoom, pointInRoom } from '../../floorplan/types'
import type { LookState } from './viewerLook'

/** One panorama stop in the tour. */
export interface PanoTourStop {
  id: string
  /** Display name — defaults to the room at the capture position. */
  label: string
  /** Capture eye position [x, z] in apartment metres. */
  position: [number, number]
  /** Storey the stop was captured on; absent = ground floor. */
  levelId?: string
}

/** A derived link from the active stop toward another stop. */
export interface TourHotspot {
  stopId: string
  label: string
  /** Viewer yaw (radians) from the active stop's eye toward the target stop. */
  yaw: number
  /** Viewer pitch (radians); slightly below the horizon — the target reads as
   *  a spot on the floor a few metres away, not a point floating at eye level. */
  pitch: number
  /** Horizontal distance between the two capture points (metres). */
  distance: number
}

/** Standing eye height (m) — matches `PanoramaController`'s capture eye. */
export const PANO_EYE_HEIGHT = 1.55
/** Height (m) the hotspot marker visually anchors to at the target stop. */
export const HOTSPOT_ANCHOR_HEIGHT = 1.0
/** Two stops closer than this are effectively the same spot — no hotspot
 *  (also guards the atan2 yaw of coincident capture points). */
export const MIN_STOP_DISTANCE = 0.05
/** Hotspots are culled to nearby stops; farther rooms stay reachable from the
 *  stop strip. Generous enough to span an HDB flat corner-to-corner. */
export const MAX_HOTSPOT_DISTANCE = 14
/** Cap on tour size (mirrors the saved-views cap). */
export const MAX_TOUR_STOPS = 12

/** Viewer yaw (radians) that faces from `from` toward `to` (world [x, z]). */
export function yawToward(from: [number, number], to: [number, number]): number {
  return Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]))
}

/**
 * Derive the hotspots shown while viewing `active`: every other stop on the
 * same storey within `maxDistance`, sorted nearest-first. 0/1-stop tours and
 * cross-storey stops simply produce an empty list.
 */
export function stopHotspots(
  active: PanoTourStop,
  stops: PanoTourStop[],
  maxDistance: number = MAX_HOTSPOT_DISTANCE,
): TourHotspot[] {
  const level = active.levelId ?? 'ground'
  const out: TourHotspot[] = []
  for (const s of stops) {
    if (s.id === active.id) continue
    if ((s.levelId ?? 'ground') !== level) continue
    const distance = Math.hypot(
      s.position[0] - active.position[0],
      s.position[1] - active.position[1],
    )
    if (distance < MIN_STOP_DISTANCE || distance > maxDistance) continue
    out.push({
      stopId: s.id,
      label: s.label,
      yaw: yawToward(active.position, s.position),
      // Slightly below the horizon, flatter the farther away the stop is.
      pitch: Math.atan2(HOTSPOT_ANCHOR_HEIGHT - PANO_EYE_HEIGHT, distance),
      distance,
    })
  }
  return out.sort((a, b) => a.distance - b.distance)
}

/** Unit direction vector for a (yaw, pitch) look, in viewer/world space. */
export function lookDirection(yaw: number, pitch: number): [number, number, number] {
  const cp = Math.cos(pitch)
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp]
}

/** Margin past the viewport edge (in half-screens) before a marker is culled. */
const SCREEN_CULL_NDC = 1.2

/**
 * Project a hotspot direction (yaw, pitch) into the viewer's screen space for
 * the current look state. Returns `{ left, top }` in percent of the canvas
 * (CSS `left`/`top` for a centred marker), or `null` when the direction is
 * behind the camera / far outside the viewport.
 */
export function hotspotScreenPosition(
  look: LookState,
  yaw: number,
  pitch: number,
  aspect: number,
): { left: number; top: number } | null {
  const [dx, dy, dz] = lookDirection(yaw, pitch)
  // Into camera space: inverse of the camera's YXZ rotation — undo yaw, then pitch.
  const cy = Math.cos(-look.yaw)
  const sy = Math.sin(-look.yaw)
  const x1 = cy * dx + sy * dz
  const z1 = -sy * dx + cy * dz
  const cp = Math.cos(-look.pitch)
  const sp = Math.sin(-look.pitch)
  const y2 = cp * dy - sp * z1
  const z2 = sp * dy + cp * z1
  if (z2 > -1e-6) return null // behind the camera (camera looks down −Z)
  const tanHalfY = Math.tan((look.fov * Math.PI) / 180 / 2)
  const ndcX = x1 / -z2 / (tanHalfY * aspect)
  const ndcY = y2 / -z2 / tanHalfY
  if (Math.abs(ndcX) > SCREEN_CULL_NDC || Math.abs(ndcY) > SCREEN_CULL_NDC) return null
  return { left: ((ndcX + 1) / 2) * 100, top: ((1 - ndcY) / 2) * 100 }
}

/**
 * Default label for a stop captured at (x, z): the room there (the plan's own
 * lookup), numbered when that name is already taken — "Living/Dining",
 * "Living/Dining 2", … Falls back to "Stop" outside any room.
 */
export function defaultStopLabel(
  rooms: PlanRoom[],
  takenLabels: string[],
  x: number,
  z: number,
): string {
  const base = rooms.find((r) => pointInRoom(r, x, z))?.name ?? 'Stop'
  if (!takenLabels.includes(base)) return base
  let n = 2
  while (takenLabels.includes(`${base} ${n}`)) n++
  return `${base} ${n}`
}
