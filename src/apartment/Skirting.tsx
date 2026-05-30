import { useMemo } from 'react';
import { WALLS } from './constants';
import { buildWallSegments, wallThicknessMetres } from './wallSegments';
import { FLAT } from './constants';

const HEIGHT = 0.09; // skirting board height
const PROUD = 0.012; // how far it sticks out past each wall face

interface Strip {
  cx: number;
  cz: number;
  length: number;
  thickness: number;
  angle: number;
}

/**
 * Skirting boards (baseboards) along the foot of every wall — a small but
 * high-impact realism detail. Built non-invasively from the wall segments
 * (floor-reaching solid spans + window sills; door openings already excluded),
 * so it never touches the WallSegment renderer. A slim trim, slightly proud of
 * each wall face. Default flat only.
 */
export function Skirting() {
  const strips = useMemo<Strip[]>(() => {
    const out: Strip[] = [];
    for (const wall of WALLS) {
      const len = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
      if (len === 0) continue;
      const ux = (wall.end[0] - wall.start[0]) / len;
      const uz = (wall.end[1] - wall.start[1]) / len;
      const angle = Math.atan2(ux, uz);
      const t = wallThicknessMetres(wall) + PROUD * 2;
      for (const seg of buildWallSegments(wall, FLAT.ceilingHeight)) {
        if (seg.bottom > 0.001) continue; // only floor-reaching spans
        const a = seg.start;
        const b = seg.end;
        if (b - a < 0.02) continue;
        out.push({
          cx: wall.start[0] + ux * (a + b) / 2,
          cz: wall.start[1] + uz * (a + b) / 2,
          length: b - a,
          thickness: t,
          angle,
        });
      }
    }
    return out;
  }, []);

  return (
    <group>
      {strips.map((s, i) => (
        <mesh key={i} position={[s.cx, HEIGHT / 2, s.cz]} rotation={[0, s.angle, 0]} receiveShadow>
          <boxGeometry args={[s.thickness, HEIGHT, s.length]} />
          <meshStandardMaterial color="#eceae4" roughness={0.7} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}
