import { useMemo } from 'react'
import { FLAT, WALLS } from './constants'
import { buildWallSegments, wallThicknessMetres } from './wallSegments'

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
}

/**
 * Wall trim — skirting boards along the foot of every wall, built
 * non-invasively from the wall segments (door openings already excluded;
 * window sills get skirting). A slim trim, slightly proud of each wall face.
 * Default flat only. (Crown molding was removed: a light fixed-colour band at
 * the wall top read as a discoloured strip against coloured/accent walls and
 * interrupted the clean floor-to-ceiling wall the painted face already gives.)
 */
export function Skirting() {
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
          out.push({ cx, cy: SKIRT_H / 2, cz, length: b - a, thickness: t, height: SKIRT_H, angle })
        }
      }
    }
    return out
  }, [])

  return (
    <group>
      {strips.map((s, i) => (
        <mesh key={i} position={[s.cx, s.cy, s.cz]} rotation={[0, s.angle, 0]} receiveShadow>
          <boxGeometry args={[s.thickness, s.height, s.length]} />
          <meshStandardMaterial color="#eceae4" roughness={0.7} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}
