import { Html } from '@react-three/drei'
import { FLAT, ROOMS } from '../apartment/constants'
import { roomCentroid } from '../apartment/rooms'
import { useStore } from '../state/store'
import { formatRoomSize } from '../utils/measurement'

export function MeasurementOverlay() {
  const show = useStore((s) => s.showMeasurements)
  if (!show) return null
  return (
    <group>
      {Object.values(ROOMS).map((r) => {
        const [cx, cz] = roomCentroid(r.id)
        const cy = (r.ceilingHeight ?? FLAT.ceilingHeight) / 2
        const main = r.width * r.depth
        const ext = r.extension ? r.extension.width * r.extension.depth : 0
        const area = main + ext
        return (
          <Html key={r.id} position={[cx, cy, cz]} center distanceFactor={10}>
            <div className="rounded bg-white/90 px-2 py-1 text-xs text-neutral-800 shadow whitespace-nowrap pointer-events-none">
              <div className="font-semibold">{r.name}</div>
              <div>{formatRoomSize(r.width, r.depth, area)}</div>
            </div>
          </Html>
        )
      })}
    </group>
  )
}
