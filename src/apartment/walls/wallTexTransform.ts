/**
 * Per-room wall-texture transform (tile size + angle) — the wall counterpart of
 * the room's `floorTexScale`/`floorTexAngle` (SweetHome3DJS texture parity).
 *
 * A tiled wall finish needs the same two dials a floor does: brick and subway
 * want their course size set to the real tile, panelling and wallpaper want a
 * run direction, and a feature wall often wants the pattern turned 90° from the
 * one beside it. Until this existed the angle/scale controls covered floors
 * only, so a wall could only ever show its finish at the material's authored
 * scale and orientation.
 *
 * The values live on the PLAN ROOM (like the floor pair), so they persist with
 * the design and reach every wall renderer that knows its room: the default
 * flat's `WallSegment` face planes and the extruded wall bodies in `RoomShell` /
 * `PlanRoomShell`.
 *
 * **One face can override its room.** An accent wall usually wants its own
 * direction — panelling turned against the room's brick, a feature wall run
 * vertically — so `finishes.wallTex` carries a per-FACE transform keyed
 * `${wallId}:${roomId}` (exactly like `wallAccents`), and a face resolves
 * override → room → nothing. Pass the wall id wherever the renderer knows it.
 *
 * Every read of that map is optional-chained: a design saved before per-face
 * direction existed rehydrates with no `wallTex` key at all, and an unguarded
 * `finishes.wallTex[key]` threw inside `WallSegment`'s face — which
 * `SilentErrorBoundary` swallowed, so every wall in the flat quietly lost its
 * finish. New state fields need the same treatment.
 */

import { useMemo } from 'react'
import type { FloorPlan, PlanRoom } from '../../floorplan/types'
import type { UvTransform } from '../../materials/worldUv'
import { useStore } from '../../state/store'

/** A room's wall-texture transform, or `undefined` when it is the identity
 *  (both dials absent/neutral) — callers then take the untouched-UV path, which
 *  is byte-identical to the pre-feature behaviour. Pure. */
export function wallTexTransform(
  room?: Pick<PlanRoom, 'wallTexScale' | 'wallTexAngle'> | null,
): UvTransform | undefined {
  if (!room) return undefined
  const scale = room.wallTexScale
  const angle = room.wallTexAngle
  if (!scale && !angle) return undefined
  return { scale, angle }
}

/** Same for a room id against a plan — the shape the renderers have on hand. */
export function wallTexTransformFor(plan: FloorPlan, roomId?: string): UvTransform | undefined {
  if (!roomId) return undefined
  return wallTexTransform(plan.rooms.find((r) => r.id === roomId))
}

/**
 * The room's wall-texture transform as a STABLE value for a render path.
 *
 * The two dials are selected as scalars, not as an object: a selector that built
 * `{scale, angle}` would return a fresh identity on every store update and
 * re-render every wall in the flat. The memoised object is then safe to put in a
 * geometry `useMemo`'s dependency list.
 */
function useSurfaceTexTransform(
  surface: 'floor' | 'wall',
  roomId?: string,
): UvTransform | undefined {
  const scale = useStore((s) => {
    const room = roomId ? s.floorPlan.rooms.find((r) => r.id === roomId) : undefined
    return surface === 'floor' ? room?.floorTexScale : room?.wallTexScale
  })
  const angle = useStore((s) => {
    const room = roomId ? s.floorPlan.rooms.find((r) => r.id === roomId) : undefined
    return surface === 'floor' ? room?.floorTexAngle : room?.wallTexAngle
  })
  return useMemo(() => (!scale && !angle ? undefined : { scale, angle }), [scale, angle])
}

/** Key for a wall FACE override — the same `${wallId}:${roomId}` shape the
 *  accent-wall overrides use, so one wall's two sides stay independent. */
export function wallFaceKey(wallId: string, roomId: string): string {
  return `${wallId}:${roomId}`
}

/**
 * A wall face's transform: its own override when it has one, else the room's.
 * `wallId` is optional so a renderer that genuinely has no per-face identity
 * still gets the room-level answer.
 */
export function useWallTexTransform(roomId?: string, wallId?: string): UvTransform | undefined {
  const room = useSurfaceTexTransform('wall', roomId)
  const face = useStore((s) =>
    wallId && roomId ? s.finishes.wallTex?.[wallFaceKey(wallId, roomId)] : undefined,
  )
  const faceScale = face?.scale
  const faceAngle = face?.angle
  return useMemo(
    () =>
      faceScale === undefined && faceAngle === undefined
        ? room
        : { scale: faceScale, angle: faceAngle },
    [room, faceScale, faceAngle],
  )
}

/** The floor half: the room's lay direction + tile size for its FLOOR finish.
 *  Needed at every floor render site, not just the plan overview — the room
 *  editor and the curated flat draw their floors through other components, and
 *  a direction the user set has to hold on all of them. */
export function useFloorTexTransform(roomId?: string): UvTransform | undefined {
  return useSurfaceTexTransform('floor', roomId)
}
