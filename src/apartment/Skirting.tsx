import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import { useStore } from '../state/store'
import { FLAT, WALLS } from './constants'
import { buildWallSegments, wallThicknessMetres } from './wallSegments'
import { getWallOpacity } from './walls/wallReveal'

const SKIRT_H = 0.09 // skirting board height
const PROUD = 0.012 // how far it sticks out past each wall face

interface Strip {
  cx: number
  cy: number
  cz: number
  length: number
  thickness: number
  height: number
  angle: number
  /** Host wall — the strip fades with it during the camera reveal. */
  wallId: string
}

/**
 * Wall trim — skirting boards along the foot of every wall, built
 * non-invasively from the wall segments (door openings already excluded;
 * window sills get skirting). A slim trim, slightly proud of each wall face.
 * Default flat only. (Crown molding was removed: a light fixed-colour band at
 * the wall top read as a discoloured strip against coloured/accent walls and
 * interrupted the clean floor-to-ceiling wall the painted face already gives.)
 *
 * Each strip fades with its host wall during the orbit "dollhouse" reveal —
 * `getWallOpacity(wallId)` mirrors the value `WallSegment` publishes (1 for
 * internal walls, which never fade) — so a faded external wall no longer leaves
 * an opaque skirting band at the floor (the rest of the wall goes translucent).
 */
export function Skirting() {
  // Re-derive strip widths when the plan-wide default OR any per-wall override
  // changes (the metres come from `wallThicknessMetres`, a module-level holder,
  // so these aren't referenced directly — they're intentional recompute triggers).
  const wallThicknessDefault = useStore((s) => s.floorPlan.wallThickness)
  const planWalls = useStore((s) => s.floorPlan.walls)
  // biome-ignore lint/correctness/useExhaustiveDependencies: wallThicknessDefault + planWalls are intentional recompute triggers for the module-level thickness holder
  const strips = useMemo<Strip[]>(() => {
    const out: Strip[] = []
    for (const wall of WALLS) {
      const len = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
      if (len === 0) continue
      const ux = (wall.end[0] - wall.start[0]) / len
      const uz = (wall.end[1] - wall.start[1]) / len
      const angle = Math.atan2(ux, uz)
      const t = wallThicknessMetres(wall) + PROUD * 2
      for (const seg of buildWallSegments(wall, FLAT.ceilingHeight)) {
        const a = seg.start
        const b = seg.end
        if (b - a < 0.02) continue
        const cx = wall.start[0] + (ux * (a + b)) / 2
        const cz = wall.start[1] + (uz * (a + b)) / 2
        if (seg.bottom < 0.001) {
          out.push({
            cx,
            cy: SKIRT_H / 2,
            cz,
            length: b - a,
            thickness: t,
            height: SKIRT_H,
            angle,
            wallId: wall.id,
          })
        }
      }
    }
    return out
  }, [wallThicknessDefault, planWalls])

  // Fade each strip with its host wall (same per-wall opacity the windows/doors
  // read), so external-wall skirting goes translucent in the orbit reveal
  // instead of leaving an opaque band at the floor. Children order matches
  // `strips` (one mesh per strip, in order), so we index in lockstep.
  const groupRef = useRef<Group>(null)
  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    for (let i = 0; i < g.children.length && i < strips.length; i++) {
      const mesh = g.children[i] as Mesh
      const op = getWallOpacity(strips[i].wallId)
      const mat = mesh.material as MeshStandardMaterial
      if (!mat) continue
      mesh.visible = op > 0.02
      const next = op < 0.985
      // Toggling `transparent` at runtime needs a recompile to blend (see
      // WallSegment); flip needsUpdate only on the actual transition.
      if (next !== mat.transparent) mat.needsUpdate = true
      mat.transparent = next
      mat.opacity = op
      mat.depthWrite = op > 0.6
    }
  })

  return (
    <group ref={groupRef}>
      {strips.map((s, i) => (
        <mesh key={i} position={[s.cx, s.cy, s.cz]} rotation={[0, s.angle, 0]} receiveShadow>
          <boxGeometry args={[s.thickness, s.height, s.length]} />
          <meshStandardMaterial color="#eceae4" roughness={0.7} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}
