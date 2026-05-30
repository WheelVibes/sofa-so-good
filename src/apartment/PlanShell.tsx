import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Mesh, MeshStandardMaterial } from 'three';
import { useStore } from '../state/store';
import { wallBoxes, type WallBox } from '../floorplan/planGeometry';
import { wallLength, planBounds } from '../floorplan/types';
import { PlanRoomFloor } from './floor/PlanRoomFloor';
import type { MaterialId } from '../materials/types';

const DEFAULT_PLAN_FLOOR = 'floor-wood-oak';

/**
 * One plan wall, fading out in orbit mode when it sits between the camera and
 * the plan centre (so the dollhouse view isn't blocked by near walls).
 */
function FadeWall({ box, cx, cz }: { box: WallBox; cx: number; cz: number }) {
  const ref = useRef<Mesh>(null);
  const { camera } = useThree();
  const cameraMode = useStore((s) => s.cameraMode);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const mat = mesh.material as MeshStandardMaterial;
    let target = 1;
    if (cameraMode === 'orbit') {
      // Wall is "between" camera and centre when (K-W)·(C-W) < 0.
      const kx = camera.position.x - box.cx;
      const kz = camera.position.z - box.cz;
      const dx = cx - box.cx;
      const dz = cz - box.cz;
      if (kx * dx + kz * dz < 0) target = 0.12;
    }
    mat.opacity += (target - mat.opacity) * 0.18;
    mat.transparent = mat.opacity < 0.98;
    mat.depthWrite = mat.opacity > 0.6;
  });
  return (
    <mesh ref={ref} position={[box.cx, box.cy, box.cz]} rotation={[0, box.angle, 0]} castShadow receiveShadow>
      <boxGeometry args={[box.thickness, box.height, box.length]} />
      <meshStandardMaterial color="#ede9e2" roughness={0.9} transparent opacity={1} />
    </mesh>
  );
}

/**
 * Lightweight 3D shell for a user-authored floor plan: a grounding slab,
 * neutral per-room floors, and extruded walls with door/window openings (plus
 * glass panes in windows). Used in place of the curated <Apartment/> when a
 * non-default plan is active, so custom apartments are furnishable in 3D.
 */
export function PlanShell() {
  const plan = useStore((s) => s.floorPlan);
  const [ew, ed] = planBounds(plan);

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

      {/* Per-room floors (catalog finish, defaulting to oak) */}
      {plan.rooms.map((r) => {
        const mat = (r.floor ?? DEFAULT_PLAN_FLOOR) as MaterialId;
        return (
          <group key={r.id}>
            <PlanRoomFloor origin={r.origin} width={r.width} depth={r.depth} materialId={mat} />
            {r.extension && (
              <PlanRoomFloor
                origin={[r.origin[0] + r.extension.offset[0], r.origin[1] + r.extension.offset[1]]}
                width={r.extension.width}
                depth={r.extension.depth}
                materialId={mat}
              />
            )}
          </group>
        );
      })}

      {/* Walls (fade when between the orbit camera and the plan centre) */}
      {boxes.map((b, i) => (
        <FadeWall key={i} box={b} cx={ew / 2} cz={ed / 2} />
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
