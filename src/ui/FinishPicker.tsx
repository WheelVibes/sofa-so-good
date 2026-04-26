import { useShallow } from 'zustand/react/shallow';
import { ROOMS } from '../apartment/constants';
import { useMaterials } from '../materials/useMaterial';
import { useStore } from '../state/store';
import type { MaterialCategory, MaterialDef } from '../materials/types';
import type { RoomId } from '../apartment/types';

/**
 * Right-side panel shown when a room is selected (click on the floor).
 * Floor / wall tabs each present a swatch grid of available materials —
 * built-ins first, then user uploads with an "Uploaded" badge.
 *
 * Wall finishes are stored in the slice (FinishesSlice.walls) but not
 * yet rendered — Phase 3.4 wires them into the Walls component. The
 * picker is built and tested now so the slice has a real consumer.
 */
export function FinishPicker() {
  const roomId = useStore((s) => s.selectedRoomId) as RoomId | null;
  const finishes = useStore(useShallow((s) => s.finishes));
  const setFloorFinish = useStore((s) => s.setFloorFinish);
  const setWallFinish = useStore((s) => s.setWallFinish);
  const selectRoom = useStore((s) => s.selectRoom);
  const materials = useMaterials();

  if (!roomId) return null;
  const room = ROOMS[roomId];
  if (!room || room.external) return null;

  const groups: Record<MaterialCategory, MaterialDef[]> = {
    floor: [],
    wall: [],
  };
  for (const m of Object.values(materials)) groups[m.category].push(m);

  return (
    <aside className="absolute right-3 top-3 z-10 w-64 max-h-[80vh] overflow-y-auto rounded-lg bg-white/95 p-4 text-xs text-neutral-700 shadow">
      <header className="mb-3 flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-neutral-900">{room.name}</div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-500">
            Finishes
          </div>
        </div>
        <button
          onClick={() => selectRoom(null)}
          className="text-neutral-400 hover:text-neutral-700"
          aria-label="Close finish picker"
        >
          ×
        </button>
      </header>

      <SwatchGroup
        label="Floor"
        items={groups.floor}
        active={finishes.floor[roomId]}
        onSelect={(id) => setFloorFinish(roomId, id)}
      />
      <SwatchGroup
        label="Walls"
        items={groups.wall}
        active={finishes.walls[roomId]}
        onSelect={(id) => setWallFinish(roomId, id)}
      />
    </aside>
  );
}

interface SwatchGroupProps {
  label: string;
  items: MaterialDef[];
  active: string;
  onSelect: (id: string) => void;
}

function SwatchGroup({ label, items, active, onSelect }: SwatchGroupProps) {
  return (
    <section className="mb-4 last:mb-0">
      <div className="mb-2 font-semibold text-neutral-700">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        {items.map((m) => {
          const isUser = m.kind === 'textured' && m.source === 'user';
          const isActive = m.id === active;
          return (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              className={
                'group relative flex flex-col overflow-hidden rounded border ' +
                (isActive
                  ? 'border-blue-500 ring-2 ring-blue-200'
                  : 'border-neutral-200 hover:border-neutral-400')
              }
              title={m.name}
            >
              <span
                className="block h-10 w-full"
                style={{ backgroundColor: m.swatch }}
              />
              <span className="block px-1 py-1 text-[10px] leading-tight">
                {m.name}
              </span>
              {isUser ? (
                <span className="absolute right-0 top-0 rounded-bl bg-amber-100 px-1 text-[8px] uppercase tracking-wide text-amber-800">
                  user
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
