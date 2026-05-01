import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ROOMS } from '../apartment/constants';
import { useMaterials } from '../materials/useMaterial';
import { useStore } from '../state/store';
import type { MaterialCategory, MaterialDef } from '../materials/types';
import type { RoomId } from '../apartment/types';
import { UploadMaterialDialog } from './upload/UploadMaterialDialog';
import { RemoteBrowseTab } from './catalog/RemoteBrowseTab';

type View = 'swatch' | 'browse';
type Surface = 'floor' | 'wall';

/**
 * Right-side panel shown when a room is selected. Floor / wall tabs
 * each present a swatch grid of available materials — built-ins, user
 * uploads (with an "Uploaded" badge), and any resolved remote materials
 * (with a provider tag).
 *
 * From here the user can also `Browse online…` which mounts the remote
 * material browser inline; resolving applies the material to the
 * last-edited surface and returns to the swatch view.
 */
export function FinishPicker() {
  const roomId = useStore((s) => s.selectedRoomId) as RoomId | null;
  const finishes = useStore(useShallow((s) => s.finishes));
  const setFloorFinish = useStore((s) => s.setFloorFinish);
  const setWallFinish = useStore((s) => s.setWallFinish);
  const selectRoom = useStore((s) => s.selectRoom);
  const removeUserMaterial = useStore((s) => s.removeUserMaterial);
  const bootstrapRemote = useStore((s) => s.bootstrapRemoteCatalog);
  const phStatus = useStore((s) => s.remoteIndexes.polyhaven.status);
  const materials = useMaterials();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [view, setView] = useState<View>('swatch');
  const [lastSurface, setLastSurface] = useState<Surface>('floor');

  useEffect(() => {
    if (view === 'browse' && phStatus === 'idle') void bootstrapRemote();
  }, [view, phStatus, bootstrapRemote]);

  if (!roomId) return null;
  const room = ROOMS[roomId];
  if (!room || room.external) return null;

  const groups: Record<MaterialCategory, MaterialDef[]> = {
    floor: [],
    wall: [],
  };
  for (const m of Object.values(materials)) groups[m.category].push(m);

  const handleSelect = (surface: Surface, id: string) => {
    setLastSurface(surface);
    if (surface === 'floor') setFloorFinish(roomId, id);
    else setWallFinish(roomId, id);
  };

  const handleResolved = (id: string) => {
    if (lastSurface === 'floor') setFloorFinish(roomId, id);
    else setWallFinish(roomId, id);
    setView('swatch');
  };

  const widthClass = view === 'browse' ? 'w-80' : 'w-64';

  return (
    <aside
      className={`absolute right-3 top-3 z-10 ${widthClass} flex max-h-[80vh] flex-col rounded-lg bg-white/95 text-xs text-neutral-700 shadow`}
    >
      <header className="flex items-start justify-between border-b border-neutral-200 px-4 py-2">
        <div className="flex items-center gap-2">
          {view === 'browse' && (
            <button
              onClick={() => setView('swatch')}
              className="text-neutral-500 hover:text-neutral-900"
              aria-label="Back to swatches"
            >
              ←
            </button>
          )}
          <div>
            <div className="text-sm font-semibold text-neutral-900">
              {view === 'browse' ? 'Browse materials' : room.name}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              {view === 'browse' ? `Apply to ${lastSurface}` : 'Finishes'}
            </div>
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

      {view === 'swatch' ? (
        <div className="overflow-y-auto p-4">
          <SwatchGroup
            label="Floor"
            items={groups.floor}
            active={finishes.floor[roomId]}
            onSelect={(id) => handleSelect('floor', id)}
            onRemoveUser={removeUserMaterial}
          />
          <SwatchGroup
            label="Walls"
            items={groups.wall}
            active={finishes.walls[roomId]}
            onSelect={(id) => handleSelect('wall', id)}
            onRemoveUser={removeUserMaterial}
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setView('browse')}
              className="flex-1 whitespace-nowrap rounded bg-neutral-800 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-900"
            >
              Browse
            </button>
            <button
              onClick={() => setUploadOpen(true)}
              className="flex-1 whitespace-nowrap rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
            >
              Upload
            </button>
          </div>
          <UploadMaterialDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <RemoteBrowseTab kind="material" onResolved={handleResolved} />
        </div>
      )}
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

function providerTag(def: MaterialDef): { label: string; cls: string } | null {
  if (def.kind !== 'textured') return null;
  if (def.source === 'user') return { label: 'user', cls: 'bg-amber-100 text-amber-800' };
  if (def.source === 'polyhaven') return { label: 'PH', cls: 'bg-emerald-100 text-emerald-800' };
  if (def.source === 'ambientcg') return { label: 'ACG', cls: 'bg-sky-100 text-sky-800' };
  return null;
}

function SwatchGroup({ label, items, active, onSelect, onRemoveUser }: SwatchGroupProps) {
  return (
    <section className="mb-4 last:mb-0">
      <div className="mb-2 font-semibold text-neutral-700">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        {items.map((m) => {
          const isUser = m.kind === 'textured' && m.source === 'user';
          const isActive = m.id === active;
          const tag = providerTag(m);
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
                className="block h-10 w-full bg-cover bg-center"
                style={{
                  backgroundColor: m.swatch,
                  backgroundImage:
                    m.kind === 'textured'
                      ? `url("${m.thumbUrl ?? m.runtimeUrls?.albedo ?? m.textures.albedo}")`
                      : undefined,
                }}
              />
              <span className="block px-1 py-1 text-[10px] leading-tight">
                {m.name}
              </span>
              {tag ? (
                <span
                  className={`absolute right-0 top-0 rounded-bl px-1 text-[8px] uppercase tracking-wide ${tag.cls}`}
                >
                  {tag.label}
                </span>
              ) : null}
              {isUser ? (
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
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
