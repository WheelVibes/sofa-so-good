import { useMemo } from 'react';
import { useStore } from '../state/store';
import { wallBoxes } from '../floorplan/planGeometry';
import { wallLength } from '../floorplan/types';

/**
 * Lightweight 3D shell for a user-authored floor plan: a grounding slab,
 * neutral per-room floors, and extruded walls with door/window openings (plus
 * glass panes in windows). Used in place of the curated <Apartment/> when a
 * non-default plan is active, so custom apartments are furnishable in 3D.
 */
export function PlanShell() {
  const plan = useStore((s) => s.floorPlan);
  const [ew, ed] = plan.extent;

  const boxes = useMemo(() => plan.walls.flatMap((w) => wallBoxes(plan, w)), [plan]);

  // Window glass panes (between sill and head, in the wall gap).
  const windows = useMemo(() => {
    return plan.openings
      .filter((o) => o.kind === 'window')
      .map((o) => {
        const wall = plan.walls.find((w) => w.id === o.wallId);
        if (!wall) return null;
        const len = wallLength(wall);
        if (len === 0) return null;
        const dx = (wall.end[0] - wall.start[0]) / len;
        const dz = (wall.end[1] - wall.start[1]) / len;
        const angle = Math.atan2(dx, dz);
        const s = o.offset + o.width / 2;
        return {
          id: o.id,
          cx: wall.start[0] + dx * s,
          cz: wall.start[1] + dz * s,
          cy: (o.sill + o.head) / 2,
          width: o.width,
          height: o.head - o.sill,
          angle,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [plan]);

  return (
    <group>
      {/* Grounding slab */}
      <mesh position={[ew / 2, -0.1, ed / 2]} receiveShadow>
        <boxGeometry args={[ew + 0.5, 0.2, ed + 0.5]} />
        <meshStandardMaterial color="#9a958d" roughness={0.95} />
      </mesh>

      {/* Per-room floors */}
      {plan.rooms.map((r) => (
        <group key={r.id}>
          <mesh position={[r.origin[0] + r.width / 2, 0.005, r.origin[1] + r.depth / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[r.width, r.depth]} />
            <meshStandardMaterial color="#c9b89d" roughness={0.85} />
          </mesh>
          {r.extension && (
            <mesh
              position={[r.origin[0] + r.extension.offset[0] + r.extension.width / 2, 0.005, r.origin[1] + r.extension.offset[1] + r.extension.depth / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
            >
              <planeGeometry args={[r.extension.width, r.extension.depth]} />
              <meshStandardMaterial color="#c9b89d" roughness={0.85} />
            </mesh>
          )}
        </group>
      ))}

      {/* Walls */}
      {boxes.map((b, i) => (
        <mesh key={i} position={[b.cx, b.cy, b.cz]} rotation={[0, b.angle, 0]} castShadow receiveShadow>
          <boxGeometry args={[b.thickness, b.height, b.length]} />
          <meshStandardMaterial color="#ede9e2" roughness={0.9} />
        </mesh>
      ))}

      {/* Window glass */}
      {windows.map((w) => (
        <mesh key={w.id} position={[w.cx, w.cy, w.cz]} rotation={[0, w.angle, 0]}>
          <boxGeometry args={[0.03, w.height, w.width]} />
          <meshStandardMaterial color="#bcd6e6" transparent opacity={0.32} roughness={0.1} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}
