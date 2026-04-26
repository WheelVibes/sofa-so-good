import { useShallow } from 'zustand/react/shallow';
import { ROOMS } from '../constants';
import { useStore } from '../../state/store';
import type { RoomId } from '../types';
import { RoomFloor } from './RoomFloor';

/**
 * Replaces the previous monolithic apartment-shape Floor with one mesh
 * per room, each rendering its own per-room finish. AC ledge and any
 * `external: true` rooms are skipped — they have no interior floor.
 *
 * L-shaped rooms (mainBedroom, livingDining) emit two meshes that
 * share a material so the finish wraps the L without a visible seam.
 */
export function Floor() {
  const finishes = useStore(useShallow((s) => s.finishes.floor));

  return (
    <group>
      {(Object.keys(ROOMS) as RoomId[]).map((id) => {
        const r = ROOMS[id];
        if (r.external) return null;
        const matId = finishes[id];
        return (
          <group key={id}>
            <RoomFloor
              roomId={id}
              origin={r.origin as [number, number]}
              width={r.width}
              depth={r.depth}
              materialId={matId}
            />
            {r.extension ? (
              <RoomFloor
                roomId={id}
                origin={[
                  r.origin[0] + r.extension.offset[0],
                  r.origin[1] + r.extension.offset[1],
                ]}
                width={r.extension.width}
                depth={r.extension.depth}
                materialId={matId}
              />
            ) : null}
          </group>
        );
      })}
    </group>
  );
}
