import { useShallow } from 'zustand/react/shallow';
import { useMaterials } from '../materials/useMaterial';
import { useStore } from '../state/store';
import type { MaterialDef } from '../materials/types';
import { ROOMS } from '../apartment/constants';
import type { RoomId } from '../apartment/types';
import { proceduralThumbnailDataUrl } from '../materials/procedural/generators';

function swatchImage(m: MaterialDef): string | undefined {
  if (m.kind === 'procedural') return `url("${proceduralThumbnailDataUrl(m.id, m.pattern, m.swatch)}")`;
  if (m.kind === 'textured') return `url("${m.thumbUrl ?? m.runtimeUrls?.albedo ?? m.textures.albedo}")`;
  return undefined;
}

/**
 * Accent-wall finishing panel — shown when a wall face is selected (clicked in
 * orbit mode). Paints that one wall face (the side facing the clicked room)
 * with a chosen finish, independent of the room's other walls. "Match room"
 * clears the override so the wall follows the room default again.
 */
export function WallAccentPicker() {
  const selectedWall = useStore((s) => s.selectedWall);
  const wallAccents = useStore(useShallow((s) => s.finishes.wallAccents));
  const roomWall = useStore(useShallow((s) => s.finishes.walls));
  const setWallAccent = useStore((s) => s.setWallAccent);
  const clearWallAccent = useStore((s) => s.clearWallAccent);
  const selectItem = useStore((s) => s.selectItem);
  const materials = useMaterials();

  if (!selectedWall) return null;
  const key = `${selectedWall.wallId}:${selectedWall.roomId}`;
  const roomName = ROOMS[selectedWall.roomId as RoomId]?.name ?? selectedWall.roomId;
  const current = wallAccents[key] ?? roomWall[selectedWall.roomId as RoomId];
  const walls = Object.values(materials).filter((m) => m.category === 'wall');

  return (
    <aside className="absolute right-3 top-3 z-10 w-64 rounded-lg bg-white/95 text-xs text-neutral-700 shadow">
      <header className="flex items-start justify-between border-b border-neutral-200 px-4 py-2">
        <div>
          <div className="text-sm font-semibold text-neutral-800">Accent wall</div>
          <div className="text-neutral-500">{roomName} side</div>
        </div>
        <button onClick={() => selectItem(null)} className="text-neutral-400 hover:text-neutral-700" aria-label="Close">
          ×
        </button>
      </header>
      <div className="grid grid-cols-5 gap-1.5 p-3">
        {walls.map((m) => (
          <button
            key={m.id}
            onClick={() => setWallAccent(key, m.id)}
            title={m.name}
            className={`aspect-square rounded border ${current === m.id ? 'border-neutral-800 ring-1 ring-neutral-800' : 'border-neutral-200'}`}
            style={{ backgroundColor: m.swatch, backgroundImage: swatchImage(m), backgroundSize: 'cover' }}
          />
        ))}
        {/* Custom colour */}
        <label
          title="Custom colour"
          className={`relative aspect-square cursor-pointer rounded border ${typeof current === 'string' && current.startsWith('#') ? 'border-neutral-800 ring-1 ring-neutral-800' : 'border-neutral-200'}`}
          style={{
            background:
              typeof current === 'string' && current.startsWith('#')
                ? current
                : 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          }}
        >
          <input
            type="color"
            value={typeof current === 'string' && current.startsWith('#') ? current : '#cccccc'}
            onChange={(e) => setWallAccent(key, e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Custom accent colour"
          />
        </label>
      </div>
      <div className="border-t border-neutral-200 px-3 py-2">
        <button
          onClick={() => clearWallAccent(key)}
          className="w-full rounded bg-neutral-100 px-2 py-1.5 text-left hover:bg-neutral-200"
        >
          ↺ Match room finish
        </button>
      </div>
    </aside>
  );
}
