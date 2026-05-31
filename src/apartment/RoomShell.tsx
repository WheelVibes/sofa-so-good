import { WALLS, WINDOWS, DOORS } from './constants';
import { WallSegment } from './walls/WallSegment';
import { WindowPane } from './Window';
import { DoorLeaf } from './Door';
import type { RoomShell as RoomShellData } from './roomShell';

/** Renders only the walls of an isolated room plus a floor plane per rect.
 *  Lightweight: no ceiling, no skirting trim, no exterior, flat material.
 *  Windows/doors are filtered to the room's own openings so nothing floats
 *  over a wall that isn't rendered. */
export function RoomShell({ shell }: { shell: RoomShellData }) {
  const wallSet = new Set(shell.wallIds);
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
      {WALLS.filter((w) => wallSet.has(w.id)).map((w) => (
        <WallSegment key={w.id} wall={w} />
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
