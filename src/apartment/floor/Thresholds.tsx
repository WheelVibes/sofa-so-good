import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import { useStore } from '../../state/store'
import { WALLS } from '../constants'
import { wallThicknessMetres } from '../wallSegments'
import { getWallOpacity } from '../walls/wallReveal'
import { THRESHOLD_LIFT, type ThresholdRect, thresholdRects } from './thresholdRects'

const THRESHOLD_H = 0.02 // slab thickness below the top face (never visible)

/**
 * Floor patches under every doorway (DOOR-GAP-LEAK). Room floors stop at the
 * room interior boundary and a door cutout opens the wall to y=0, so without
 * these the strip of floor inside each doorway was a hole straight through to
 * the bright background below the flat — blown-out white strips at every
 * closed leaf's foot. A slim hardwood threshold strip (a recognisable HDB
 * detail) fills the slot; it tucks slightly under the adjacent room floors,
 * which render 0.4 mm above it, so there is no abutment crack and no
 * z-fighting. Default flat only (mirrors `Skirting`).
 *
 * Each patch fades with its host wall during the orbit reveal (same
 * `getWallOpacity` contract as Skirting/Door), so a faded wall doesn't leave
 * an opaque strip floating in the doorway.
 */
export function Thresholds() {
  // Recompute triggers for the module-level wall-thickness holder (same
  // pattern + rationale as Skirting).
  const wallThicknessDefault = useStore((s) => s.floorPlan.wallThickness)
  const planWalls = useStore((s) => s.floorPlan.walls)
  // biome-ignore lint/correctness/useExhaustiveDependencies: wallThicknessDefault + planWalls are intentional recompute triggers for the module-level thickness holder
  const rects = useMemo<ThresholdRect[]>(
    () => thresholdRects(WALLS, wallThicknessMetres),
    [wallThicknessDefault, planWalls],
  )

  const groupRef = useRef<Group>(null)
  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    for (let i = 0; i < g.children.length && i < rects.length; i++) {
      const mesh = g.children[i] as Mesh
      const op = getWallOpacity(rects[i].wallId)
      const mat = mesh.material as MeshStandardMaterial
      if (!mat) continue
      mesh.visible = op > 0.02
      const next = op < 0.985
      // Toggling `transparent` at runtime needs a recompile to blend (see
      // WallSegment); flip needsUpdate only on the actual transition.
      if (next !== mat.transparent) mat.needsUpdate = true
      mat.transparent = next
      mat.opacity = op
      // depthWrite stays ON (WALL-FADE-DEPTHWRITE), same as every reveal surface.
      mat.depthWrite = true
    }
  })

  return (
    <group ref={groupRef}>
      {rects.map((r, i) => (
        <mesh
          key={i}
          position={[r.cx, THRESHOLD_LIFT - THRESHOLD_H / 2, r.cz]}
          rotation={[0, r.angle, 0]}
          receiveShadow
        >
          <boxGeometry args={[r.depth, THRESHOLD_H, r.length]} />
          {/* Hardwood threshold strip — a shade darker than the door leaf. */}
          <meshStandardMaterial color="#7d6243" roughness={0.8} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}
