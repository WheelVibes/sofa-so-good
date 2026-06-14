import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { noExportUserData } from '../export/sceneGltf'
import { planBounds } from '../floorplan/types'
import { useStore } from '../state/store'
import { useDisposeGeometry } from './geometryUtil'

/**
 * Magenta alignment guides shown while dragging furniture: a constant-X or
 * constant-Z line through the centre the dragged item snapped to, so it's
 * obvious when pieces line up. Spans the apartment footprint.
 */
export function AlignmentGuides() {
  const guides = useStore(useShallow((s) => s.dragGuides))
  const plan = useStore((s) => s.floorPlan)
  const [W, D] = useMemo(() => planBounds(plan), [plan])

  const geometry = useMemo(() => {
    const pts: number[] = []
    for (const g of guides) {
      if (g.axis === 'x') pts.push(g.value, 0, 0, g.value, 0, D)
      else pts.push(0, 0, g.value, W, 0, g.value)
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return geo
  }, [guides, W, D])
  useDisposeGeometry(geometry)

  if (guides.length === 0) return null
  return (
    <lineSegments
      geometry={geometry}
      position={[0, 0.03, 0]}
      renderOrder={5}
      userData={noExportUserData()}
    >
      <lineBasicMaterial
        color="#ff3df0"
        transparent
        opacity={0.9}
        depthWrite={false}
        depthTest={false}
      />
    </lineSegments>
  )
}
