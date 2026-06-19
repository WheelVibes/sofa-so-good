import { Html } from '@react-three/drei'
import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { useShallow } from 'zustand/react/shallow'
import type { EqualSpacing } from '../collision/equalSpacing'
import { noExportUserData } from '../export/sceneGltf'
import { planBounds } from '../floorplan/types'
import { useStore } from '../state/store'
import { formatLength } from '../utils/measurement'
import { useDisposeGeometry } from './geometryUtil'

const GUIDE_COLOR = '#ff3df0' // magenta — the established alignment-guide hue
const LIFT = 0.03
const TICK = 0.07 // half-length of the cross-tick caps drawn at gap ends (m)

/**
 * Magenta alignment guides shown while dragging furniture: a constant-X or
 * constant-Z line through the centre the dragged item snapped to, so it's
 * obvious when pieces line up. Spans the apartment footprint.
 *
 * Also renders EQUAL-SPACING hints (Coohom / Figma style): when the dragged item
 * forms a gap equal to gaps among nearby items (or a wall), matching bracket +
 * tick pairs are drawn at each equal gap with the measured distance, so the user
 * can land on even spacing. Detection is the pure `detectEqualSpacingAxis`; the
 * drag controller also snaps to the equal-gap centre when within tolerance.
 */
export function AlignmentGuides() {
  const guides = useStore(useShallow((s) => s.dragGuides))
  const spacings = useStore(useShallow((s) => s.dragSpacings))
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

  if (guides.length === 0 && spacings.length === 0) return null
  return (
    <>
      {guides.length > 0 && (
        <lineSegments
          geometry={geometry}
          position={[0, LIFT, 0]}
          renderOrder={5}
          userData={noExportUserData()}
        >
          <lineBasicMaterial
            color={GUIDE_COLOR}
            transparent
            opacity={0.9}
            depthWrite={false}
            depthTest={false}
          />
        </lineSegments>
      )}
      {spacings.map((s) => (
        <SpacingIndicator key={s.axis} spacing={s} />
      ))}
    </>
  )
}

/** Pull the dragged item's centre on the cross-axis so X-spacing brackets sit on
 *  its row (Z) and Z-spacing brackets on its column (X). Falls back to the gap's
 *  own midpoint if the item isn't found. */
function useDragCrossCoord(axis: 'x' | 'z'): number | null {
  const id = useStore((s) => s.draggingItemId)
  const items = useStore(useShallow((s) => s.items))
  const it = id ? items.find((i) => i.id === id) : null
  if (!it) return null
  return axis === 'x' ? it.position[1] : it.position[0]
}

/** One axis' equal-spacing relationship: a flat bracket per gap (with end ticks)
 *  plus a distance badge, all in the alignment-guide hue. */
function SpacingIndicator({ spacing }: { spacing: EqualSpacing }) {
  const units = useStore((s) => s.units)
  const cross = useDragCrossCoord(spacing.axis) ?? 0
  const label = formatLength(spacing.size, units)

  const geometry = useMemo(() => {
    const pts: number[] = []
    for (const g of spacing.gaps) {
      if (spacing.axis === 'x') {
        // Bracket along X at z = cross.
        pts.push(g.from, 0, cross, g.to, 0, cross)
        // End ticks (run along Z).
        pts.push(g.from, 0, cross - TICK, g.from, 0, cross + TICK)
        pts.push(g.to, 0, cross - TICK, g.to, 0, cross + TICK)
      } else {
        pts.push(cross, 0, g.from, cross, 0, g.to)
        pts.push(cross - TICK, 0, g.from, cross + TICK, 0, g.from)
        pts.push(cross - TICK, 0, g.to, cross + TICK, 0, g.to)
      }
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return geo
  }, [spacing, cross])
  useDisposeGeometry(geometry)

  return (
    <group userData={noExportUserData()}>
      <lineSegments geometry={geometry} position={[0, LIFT + 0.001, 0]} renderOrder={6}>
        <lineBasicMaterial
          color={GUIDE_COLOR}
          transparent
          opacity={0.95}
          depthWrite={false}
          depthTest={false}
        />
      </lineSegments>
      {spacing.gaps.map((g, i) => {
        const mid = (g.from + g.to) / 2
        const pos: [number, number, number] =
          spacing.axis === 'x' ? [mid, LIFT + 0.05, cross] : [cross, LIFT + 0.05, mid]
        return (
          <Html key={i} position={pos} center distanceFactor={9}>
            <div className="spacing-badge mono">{label}</div>
          </Html>
        )
      })}
    </group>
  )
}
