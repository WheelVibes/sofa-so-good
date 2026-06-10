import { useMemo } from 'react'
import { BackSide, MeshStandardMaterial } from 'three'
import { isFeatureEnabled } from '../../features/featureFlags'
import type { CeilingConfig } from '../../floorplan/types'
import { worldUvPlaneGeometry, worldUvShapeGeometry } from '../../materials/worldUv'
import { RoomCeiling } from '../ceiling/RoomCeiling'

/**
 * A flat white ceiling for a user-authored plan room, placed at the room's
 * ceiling height. It reuses {@link PlanRoomFloor}'s exact footprint placement
 * (rect via `worldUvPlaneGeometry`, polygon via `worldUvShapeGeometry`) but
 * renders the **back** side only, so — like the default flat's `Ceiling` — it's
 * visible from below (walk mode) yet culled from the orbit/dollhouse view above.
 */
interface Props {
  origin: [number, number]
  width: number
  depth: number
  height: number
  polygon?: [number, number][]
  /** Optional ceiling treatment (tray/coffered/dropped). Absent → flat. */
  ceiling?: CeilingConfig
}

// One shared material: uniform matte white, back-faces only (downward-facing).
const CEILING_MATERIAL = new MeshStandardMaterial({
  color: '#fafafa',
  roughness: 1,
  side: BackSide,
})

export function PlanRoomCeiling({ origin, width, depth, height, polygon, ceiling }: Props) {
  const isPoly = !!polygon && polygon.length >= 3
  const geometry = useMemo(
    () => (isPoly ? worldUvShapeGeometry(polygon!) : worldUvPlaneGeometry(width, depth)),
    [isPoly, polygon, width, depth],
  )
  // A designed ceiling (tray/coffered/dropped) replaces the flat plane.
  if (ceiling && ceiling.style !== 'flat' && isFeatureEnabled('ceilingDesign')) {
    const poly: [number, number][] = isPoly
      ? polygon!
      : [
          [origin[0], origin[1]],
          [origin[0] + width, origin[1]],
          [origin[0] + width, origin[1] + depth],
          [origin[0], origin[1] + depth],
        ]
    return <RoomCeiling polygon={poly} height={height} config={ceiling} />
  }
  // Polygon verts are absolute world metres (no offset); a rect centres on its
  // origin. Both share the floor's [-π/2] tilt so the back face points down.
  const position: [number, number, number] = isPoly
    ? [0, height, 0]
    : [origin[0] + width / 2, height, origin[1] + depth / 2]
  return (
    <mesh
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      material={CEILING_MATERIAL}
      geometry={geometry}
    />
  )
}
