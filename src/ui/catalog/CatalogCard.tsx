import type { FurnitureDef } from '../../furniture/types';
import { isUserDef } from '../../furniture/catalog';
import { usePlacementDrag } from './usePlacementDrag';
import { CategoryIcon } from './CategoryIcon';
import { useBuiltinThumbnail } from './thumbnails';

interface CatalogCardProps {
  def: FurnitureDef;
  onDelete?: () => void;
}

/** GLB-backed defs carry a render-time `scale`; the catalog card's
 *  metric label should reflect the as-placed footprint (raw × scale).
 *  Parametric defs have no `scale` field — their `defaultFootprint`
 *  already reads in real-world units. */
function displayScale(def: FurnitureDef): number {
  if (def.kind === 'gltf') return def.scale ?? 1;
  return 1;
}

export function CatalogCard({ def, onDelete }: CatalogCardProps) {
  const isUser = isUserDef(def);
  const onClick = usePlacementDrag(def);
  const thumb = useBuiltinThumbnail(def);
  return (
    <div
      onClick={onClick}
      className="group relative flex cursor-pointer flex-col items-stretch gap-1 rounded border border-neutral-200 bg-white p-2 text-left text-xs hover:border-blue-400 hover:bg-blue-50"
    >
      <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded bg-neutral-100">
        {thumb ? (
          <img src={thumb} alt={def.name} className="h-full w-full object-contain" />
        ) : (
          <CategoryIcon
            category={def.category}
            className="h-6 w-6 text-neutral-300"
          />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <CategoryIcon
          category={def.category}
          className="h-4 w-4 shrink-0 text-neutral-500 group-hover:text-blue-600"
        />
        <span className="truncate font-medium text-neutral-800">{def.name}</span>
      </div>
      <span className="text-[10px] text-neutral-500">
        {(def.defaultFootprint.w * displayScale(def)).toFixed(2)} ×{' '}
        {(def.defaultFootprint.d * displayScale(def)).toFixed(2)} m
      </span>
      {isUser ? (
        <span className="absolute right-1 top-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] uppercase tracking-wide text-amber-800">
          Uploaded
        </span>
      ) : null}
      {isUser && onDelete ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute right-1 bottom-1 hidden text-[10px] text-rose-600 group-hover:inline"
          aria-label="Remove uploaded asset"
        >
          remove
        </button>
      ) : null}
    </div>
  );
}
