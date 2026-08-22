import { Html, Line } from '@react-three/drei'
import { noExportUserData } from '../export/sceneGltf'
import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'
import { formatLength } from '../utils/measurement'

const MARKER_COLOR = '#f59e0b' // amber — matches the orbit-mode TapeMeasure palette

/** A small floor-independent sphere marker at a real 3D measure endpoint
 *  (unlike `TapeMeasure`'s floor-plane ring, a walk-mode aim can land on a
 *  wall or furniture top, so the marker has no fixed Y). */
function EndpointMarker({ point }: { point: [number, number, number] }) {
  return (
    <mesh position={point} renderOrder={6}>
      <sphereGeometry args={[0.045, 16, 16]} />
      <meshBasicMaterial color={MARKER_COLOR} depthTest={false} depthWrite={false} transparent />
    </mesh>
  )
}

/**
 * Walk-mode point-to-point measure (WALK-MEASURE): renders the amber segment +
 * endpoint markers between `walkMeasureA` and `walkMeasureB` — or the live aim
 * point while `B` isn't set yet (`walkMeasureLive`, written by
 * `FirstPersonCamera`'s throttled aim loop) — plus a floating distance label
 * at the midpoint. Reuses the orbit-mode `TapeMeasure`'s amber palette and
 * `formatLength`, adapted to real 3D points (a walk-mode aim can hit a wall or
 * furniture top, not just the floor plane `TapeMeasure` assumes).
 *
 * Tagged `noExport` (both for GLTF scene export AND so `FirstPersonCamera`'s
 * own measure raycast — `collision/walkMeasureHit.ts` — never measures to
 * this overlay's own markers/line while aiming for the next point).
 */
export function WalkMeasureOverlay() {
  const cameraMode = useStore((s) => s.cameraMode)
  const enabled = useFeature('walkMeasure')
  const a = useStore((s) => s.walkMeasureA)
  const b = useStore((s) => s.walkMeasureB)
  const live = useStore((s) => s.walkMeasureLive)
  const units = useStore((s) => s.units)

  if (cameraMode !== 'firstPerson' || !enabled || !a) return null

  const endB = b ?? live
  const dist = endB ? Math.hypot(endB[0] - a[0], endB[1] - a[1], endB[2] - a[2]) : null
  const mid: [number, number, number] | null =
    endB && dist !== null && dist > 1e-4
      ? [(a[0] + endB[0]) / 2, (a[1] + endB[1]) / 2, (a[2] + endB[2]) / 2]
      : null

  return (
    <group userData={noExportUserData()}>
      <EndpointMarker point={a} />
      {b ? <EndpointMarker point={b} /> : null}
      {endB && dist !== null && dist > 1e-4 ? (
        <Line points={[a, endB]} color={MARKER_COLOR} lineWidth={2} dashed={!b} />
      ) : null}
      {mid && dist !== null ? (
        <Html position={mid} center distanceFactor={9} zIndexRange={[15, 0]}>
          <div className="measure-chip tabular-nums">{formatLength(dist, units)}</div>
        </Html>
      ) : null}
    </group>
  )
}
