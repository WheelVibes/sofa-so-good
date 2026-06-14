import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { noExportUserData } from '../export/sceneGltf'
import { planBounds } from '../floorplan/types'
import { canEditScene } from '../state/editing'
import { useStore } from '../state/store'
import { useDisposeGeometry } from './geometryUtil'

/**
 * Floor alignment grid. Shown while snap-to-grid is enabled so the user can
 * see exactly where furniture will land. Lines are world-aligned to the snap
 * points (multiples of `gridSize` from the apartment origin), with whole-metre
 * lines drawn brighter as a reference. Sits just above the floor slab.
 */
export function GridOverlay() {
  const snapEnabled = useStore((s) => s.snapEnabled)
  const editing = useStore(canEditScene)
  const gridSize = useStore((s) => s.gridSize)
  const plan = useStore((s) => s.floorPlan)
  const [boundW, boundD] = useMemo(() => planBounds(plan), [plan])

  const { minor, major } = useMemo(() => {
    const g = gridSize > 0 ? gridSize : 0.5
    // Pad one cell beyond the footprint so the grid fully covers the floor.
    const W = Math.ceil(boundW / g) * g
    const D = Math.ceil(boundD / g) * g
    const minorPts: number[] = []
    const majorPts: number[] = []
    const isMetre = (v: number) => Math.abs(v - Math.round(v)) < 1e-6
    // Lines parallel to Z (varying X).
    for (let x = 0; x <= W + 1e-6; x += g) {
      const arr = isMetre(x) ? majorPts : minorPts
      arr.push(x, 0, 0, x, 0, D)
    }
    // Lines parallel to X (varying Z).
    for (let z = 0; z <= D + 1e-6; z += g) {
      const arr = isMetre(z) ? majorPts : minorPts
      arr.push(0, 0, z, W, 0, z)
    }
    const mk = (pts: number[]) => {
      const geo = new BufferGeometry()
      geo.setAttribute('position', new Float32BufferAttribute(pts, 3))
      return geo
    }
    return { minor: mk(minorPts), major: mk(majorPts) }
  }, [gridSize, boundW, boundD])
  useDisposeGeometry(minor)
  useDisposeGeometry(major)

  if (!snapEnabled || !editing) return null
  return (
    <group position={[0, 0.02, 0]} userData={noExportUserData()}>
      <lineSegments geometry={minor} renderOrder={3}>
        <lineBasicMaterial color="#bcd8f5" transparent opacity={0.55} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={major} renderOrder={4}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.85} depthWrite={false} />
      </lineSegments>
    </group>
  )
}
