import { Html } from '@react-three/drei';
import { ROOMS, FLAT } from '../apartment/constants';
import { roomCentroid } from '../apartment/rooms';
import { useStore } from '../state/store';
import { formatRoomSize } from '../utils/measurement';

export function MeasurementOverlay() {
  const show = useStore((s) => s.showMeasurements);
  if (!show) return null;
  return (
    <group>
      {Object.values(ROOMS).map((r) => {
          const [cx, cz] = roomCentroid(r.id);
          const cy = (r.ceilingHeight ?? FLAT.ceilingHeight) / 2;
          const main = r.width * r.depth;
          const ext = (r.extensions ?? []).reduce((acc, e) => acc + e.width * e.depth, 0);
          const area = main + ext;
          // For L-shaped rooms (any extensions), the main W × D label is
          // the south arm / primary rectangle, not a bounding-box dimension.
          // The total area is the sum across all sub-rectangles. Showing
          // both keeps the user honest about what the room actually looks
          // like — `4.00 × 5.40 m` for a room with a narrower north arm
          // would be misleading.
          const lShape = (r.extensions?.length ?? 0) > 0;
          return (
            <Html key={r.id} position={[cx, cy, cz]} center distanceFactor={10}>
              <div className="rounded bg-white/90 px-2 py-1 text-xs text-neutral-800 shadow whitespace-nowrap pointer-events-none">
                <div className="font-semibold">{r.name}</div>
                <div>
                  {lShape
                    ? `L-shape · ${area.toFixed(1)} m²`
                    : formatRoomSize(r.width, r.depth, area)}
                </div>
              </div>
            </Html>
          );
        })}
    </group>
  );
}
