import { walkLevel } from '../../floorplan/levels'
import type { FloorPlan, PlanRoom } from '../../floorplan/types'
import { roomPolygon } from '../../floorplan/types'

/**
 * Per-room specular probe placements (R7-L, ROOM-PROBES).
 *
 * **What this solves.** Diffuse light transport in this app is a Cycles path-traced bake
 * (`scene/visibilityLightmap.ts`, `replace` mode). Specular is *one* global procedural
 * Lightformer probe shared by the whole flat (`SceneEnvironment.tsx`, 64-256 px). So every
 * glossy surface — floor tile, glazed wall tile, chrome, the hob, appliance fronts — reflects a
 * generic studio rather than the room it is standing in. This module is the pure half of the
 * fix: it derives, per room, the AABB and capture point a **box-projected (parallax-corrected)**
 * cubemap needs (Lagarde & Zanuttini, *Local image-based lighting with parallax-corrected
 * cubemaps*, SIGGRAPH 2012 Talks — https://dl.acm.org/doi/10.1145/2343045.2343094).
 *
 * Pure and renderer-free, the way `daylitRooms.ts` and `planAttenuationWalls.ts` are, so the
 * geometry is unit-testable without a canvas. Named in the SINGULAR for the same reason
 * `visibilityLightmap.ts` is: the plural is the R3F component (`RoomProbes.tsx`), and a
 * case-insensitive filesystem cannot tell `roomProbes.ts` from `RoomProbes.tsx` apart.
 *
 * **The box is the ROOM, not the plan.** A cubemap captured at one point is only correct at that
 * point; box projection re-intersects the reflection ray with a proxy volume so the reflection
 * stays put as the camera walks. The proxy has to be the room — an HDB bathroom is 1.7 x 2.1 m
 * and a whole-flat box would put the reflected tile metres behind the wall.
 */

/** A room's specular probe: where the cubemap is captured, and the proxy box it is projected on. */
export interface RoomProbe {
  /** `PlanRoom.id` this probe belongs to. */
  roomId: string
  /** Capture position, world metres. Defaults to the box centre — which is what the projection
   *  maths assumes — but is carried separately because Lagarde's correction allows an off-centre
   *  capture and a future author-time nudge should not have to change the box. */
  center: readonly [number, number, number]
  /** Proxy AABB minimum corner, world metres. */
  boxMin: readonly [number, number, number]
  /** Proxy AABB maximum corner, world metres. */
  boxMax: readonly [number, number, number]
}

/** Fallback ceiling when neither the room nor the plan declares one (metres). Matches the
 *  `?? 2.6` the lightmap applier already uses for the same reason. */
const DEFAULT_CEILING_M = 2.6

/**
 * The proxy AABB for one room: its outline's bounding box in x/z, floor to its own ceiling in y.
 *
 * The room's OWN `ceilingHeight`, not the plan's — the bathrooms are 2.4 against walls built to
 * 2.6, and the same 200 mm difference that produced the WALL-HEAD-CLAMP defect would put a
 * reflected ceiling 200 mm too high here.
 */
export function roomProbeBox(
  room: PlanRoom,
  planCeiling: number | undefined,
): { boxMin: [number, number, number]; boxMax: [number, number, number] } {
  const poly = roomPolygon(room)
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const [x, z] of poly) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  const ceiling = room.ceilingHeight ?? planCeiling ?? DEFAULT_CEILING_M
  return { boxMin: [minX, 0, minZ], boxMax: [maxX, ceiling, maxZ] }
}

/**
 * One probe per room on the storey being viewed.
 *
 * Scoped to `walkLevel` for the reason `planAttenuationWalls` is: a probe captured in the room
 * directly above would be geometrically plausible and completely wrong.
 */
export function planRoomProbes(plan: FloorPlan, viewLevelId: string): RoomProbe[] {
  const level = walkLevel(plan, viewLevelId)
  const out: RoomProbe[] = []
  for (const room of level.rooms) {
    const { boxMin, boxMax } = roomProbeBox(room, plan.ceilingHeight)
    // Degenerate rooms (a mid-draw custom plan) would make the projection divide by a zero
    // extent; skip rather than ship a NaN into a shader uniform.
    if (!(boxMax[0] - boxMin[0] > 0.05) || !(boxMax[2] - boxMin[2] > 0.05)) continue
    if (!(boxMax[1] - boxMin[1] > 0.05)) continue
    out.push({
      roomId: room.id,
      center: [
        (boxMin[0] + boxMax[0]) / 2,
        (boxMin[1] + boxMax[1]) / 2,
        (boxMin[2] + boxMax[2]) / 2,
      ],
      boxMin,
      boxMax,
    })
  }
  return out
}

/**
 * The probe whose box contains `(x, z)`, or `null`.
 *
 * Boxes are the rooms' bounding boxes, so an L-shaped room's box can overlap a neighbour's. The
 * tie-break is the SMALLEST box containing the point: the 1.7 m bathroom inside a living room's
 * L is the room a surface there actually reflects.
 */
export function probeAt(probes: readonly RoomProbe[], x: number, z: number): RoomProbe | null {
  let best: RoomProbe | null = null
  let bestArea = Number.POSITIVE_INFINITY
  for (const p of probes) {
    if (x < p.boxMin[0] || x > p.boxMax[0] || z < p.boxMin[2] || z > p.boxMax[2]) continue
    const area = (p.boxMax[0] - p.boxMin[0]) * (p.boxMax[2] - p.boxMin[2])
    if (area < bestArea) {
      bestArea = area
      best = p
    }
  }
  return best
}

/**
 * The TS twin of `boxProjectEnv.ts`'s GLSL `roomProbeCorrect`, so the maths can be pinned by a
 * unit test rather than by eye. Keep the two in step — the shader is the one that ships, this is
 * the one that is provable.
 *
 * Given a world-space reflection direction leaving `worldPos`, return the direction from the
 * probe's capture point to where that ray hits the proxy box.
 */
export function parallaxCorrect(
  dir: readonly [number, number, number],
  worldPos: readonly [number, number, number],
  probe: RoomProbe,
): [number, number, number] {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1
  const n: [number, number, number] = [dir[0] / len, dir[1] / len, dir[2] / len]
  let t = Number.POSITIVE_INFINITY
  for (let i = 0; i < 3; i++) {
    // Sign-preserving epsilon: a ray exactly parallel to an axis divides by zero, and one
    // Infinity in the min() is harmless while a NaN is not.
    const d = Math.abs(n[i]) < 1e-5 ? (n[i] < 0 ? -1e-5 : 1e-5) : n[i]
    const hit = ((d > 0 ? probe.boxMax[i] : probe.boxMin[i]) - worldPos[i]) / d
    if (hit < t) t = hit
  }
  // A fragment outside its own box (a mesh assigned by centroid that overhangs) would otherwise
  // get a negative intersection and sample the opposite side of the room.
  if (!(t > 0)) t = 0
  return [
    worldPos[0] + n[0] * t - probe.center[0],
    worldPos[1] + n[1] * t - probe.center[1],
    worldPos[2] + n[2] * t - probe.center[2],
  ]
}

/**
 * GPU memory the probe set costs, MB.
 *
 * `PMREMGenerator._allocateTargets`: `3 * max(cubeSize, 112)` x `4 * cubeSize`, and this app's
 * targets are `HalfFloatType` RGBA, 8 bytes per texel. Reported on every capture because a
 * silent VRAM cost is how a feature undoes a whole brief spent reclaiming it.
 */
export function probeVramMb(resolution: number, rooms: number): number {
  const cubeSize = 2 ** Math.floor(Math.log2(Math.max(1, resolution)))
  return (3 * Math.max(cubeSize, 112) * (4 * cubeSize) * 8 * rooms) / (1024 * 1024)
}
