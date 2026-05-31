import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector2 } from 'three';
import { WINDOWS, DOORS, FLAT } from './constants';
import { wallThicknessMetres } from './wallSegments';
import { WindowPane } from './Window';
import { DoorLeaf } from './Door';
import type { ClippedWall, RoomShell as RoomShellData } from './roomShell';

/** A single clipped wall as a plain box spanning start→end. Cutouts are not
 *  carved (a planner only needs the room's shape); the room's window panes and
 *  door leaves render in front of the solid wall.
 *
 *  The wall hides itself when it sits between the orbit camera and the room
 *  centre — i.e. the camera is on the wall's outward side — so you always see
 *  into the room (IKEA-planner-style camera-facing wall reveal). */
function ClippedWallBox({ wall, center }: { wall: ClippedWall; center: [number, number] }) {
  const ref = useRef<Mesh>(null);
  const [sx, sz] = wall.start;
  const [ex, ez] = wall.end;
  const len = Math.hypot(ex - sx, ez - sz);
  const midX = (sx + ex) / 2;
  const midZ = (sz + ez) / 2;

  // Outward normal = from room centre toward the wall mid, projected to the
  // wall's facing axis. The wall is axis-aligned, so the normal is whichever
  // of ±X / ±Z points away from the centre.
  const toMid = new Vector2(midX - center[0], midZ - center[1]);
  const horizontal = Math.abs(ez - sz) < 1e-3; // runs along X → faces ±Z
  const normal = horizontal
    ? new Vector2(0, Math.sign(toMid.y) || 1)
    : new Vector2(Math.sign(toMid.x) || 1, 0);

  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const cam = state.camera.position;
    // Vector from wall mid to camera, in the XZ plane.
    const camDir = new Vector2(cam.x - midX, cam.z - midZ);
    // Camera is on the outward side when it aligns with the outward normal.
    m.visible = camDir.dot(normal) <= 0.05;
  });

  if (len < 1e-6) return null;
  const t = wallThicknessMetres(wall.spec);
  const h = wall.spec.topHeight ?? FLAT.ceilingHeight;
  const angle = Math.atan2(ez - sz, ex - sx); // rotation about Y
  return (
    <mesh ref={ref} position={[midX, h / 2, midZ]} rotation={[0, -angle, 0]} castShadow={false}>
      <boxGeometry args={[len, h, t]} />
      <meshStandardMaterial color="#ece8e1" roughness={0.95} metalness={0} />
    </mesh>
  );
}

/** Renders only the walls of an isolated room (clipped to its footprint) plus
 *  a floor plane per rect. Lightweight: no ceiling, no skirting, no exterior.
 *  Windows/doors are filtered to the room's own openings. */
export function RoomShell({ shell }: { shell: RoomShellData }) {
  const windowSet = new Set(shell.windowIds);
  const doorSet = new Set(shell.doorIds);
  return (
    <group>
      {/* Per-rect floor plane (flat, Performance look). */}
      {shell.rects.map((r, i) => {
        const w = r.x1 - r.x0;
        const d = r.z1 - r.z0;
        return (
          <mesh
            key={`floor-${i}`}
            position={[(r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[w, d]} />
            <meshStandardMaterial color="#cfc9bf" roughness={0.95} metalness={0} />
          </mesh>
        );
      })}
      {shell.walls.map((w, i) => (
        <ClippedWallBox key={`${w.wallId}-${i}`} wall={w} center={shell.center} />
      ))}
      {WINDOWS.filter((w) => windowSet.has(w.id)).map((w) => (
        <WindowPane key={w.id} spec={w} />
      ))}
      {DOORS.filter((d) => doorSet.has(d.id)).map((d) => (
        <DoorLeaf key={d.id} spec={d} />
      ))}
    </group>
  );
}
