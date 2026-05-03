import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ROOMS } from '../apartment/constants';
import { useMaterials } from '../materials/useMaterial';
import { useStore } from '../state/store';
import type { MaterialCategory, MaterialDef } from '../materials/types';
import type { RoomId } from '../apartment/types';
import { UploadMaterialDialog } from './upload/UploadMaterialDialog';
import { formatBytes } from '../utils/bytes';

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
  const removeUserMaterial = useStore((s) => s.removeUserMaterial);
  const materials = useMaterials();
  const [uploadOpen, setUploadOpen] = useState(false);

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
        onRemoveUser={removeUserMaterial}
      />
      <SwatchGroup
        label="Walls"
        items={groups.wall}
        active={finishes.walls[roomId]}
        onSelect={(id) => setWallFinish(roomId, id)}
        onRemoveUser={removeUserMaterial}
      />
      <button
        onClick={() => setUploadOpen(true)}
        className="mt-2 w-full rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
      >
        Upload material…
      </button>
      <UploadMaterialDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </aside>
  );
}

interface SwatchGroupProps {
  label: string;
  items: MaterialDef[];
  active: string;
  onSelect: (id: string) => void;
  onRemoveUser: (id: string) => void;
}

function SwatchGroup({ label, items, active, onSelect, onRemoveUser }: SwatchGroupProps) {
  return (
    <section className="mb-4 last:mb-0">
      <div className="mb-2 font-semibold text-neutral-700">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        {items.map((m) => {
          const isUser = m.kind === 'textured' && m.source === 'user';
          const isActive = m.id === active;
          const size =
            m.kind === 'textured' && m.source !== 'user' ? m.sizeBytes : undefined;
          return (
            <div
              key={m.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(m.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelect(m.id);
              }}
              className={
                'group relative flex cursor-pointer flex-col overflow-hidden rounded border ' +
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
              <span className="block px-1 pt-1 text-[10px] leading-tight">
                {m.name}
              </span>
              {size ? (
                <span className="block px-1 pb-1 text-[8px] leading-tight text-neutral-400">
                  {formatBytes(size)}
                </span>
              ) : null}
              {isUser ? (
                <>
                  <span className="absolute right-0 top-0 rounded-bl bg-amber-100 px-1 text-[8px] uppercase tracking-wide text-amber-800">
                    user
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveUser(m.id);
                    }}
                    className="absolute right-0 bottom-0 hidden text-[10px] text-rose-600 group-hover:inline"
                    aria-label="Remove uploaded material"
                  >
                    ×
                  </button>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
