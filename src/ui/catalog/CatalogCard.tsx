import type { FurnitureDef } from '../../furniture/types';
import { isUserDef } from '../../furniture/catalog';
import { usePlacementDrag } from './usePlacementDrag';
import { CategoryIcon } from './CategoryIcon';
import { formatBytes } from '../../utils/bytes';

interface CatalogCardProps {
  def: FurnitureDef;
  onDelete?: () => void;
}

export function CatalogCard({ def, onDelete }: CatalogCardProps) {
  const isUser = isUserDef(def);
  const onClick = usePlacementDrag(def);
  const size =
    def.kind === 'gltf' && def.source === 'builtin' ? def.sizeBytes : undefined;
  return (
    <div
      onClick={onClick}
      className="group relative flex cursor-pointer flex-col items-start rounded border border-neutral-200 bg-white px-3 py-2 text-left text-xs hover:border-blue-400 hover:bg-blue-50"
    >
      <div className="flex items-center gap-1.5">
        <CategoryIcon
          category={def.category}
          className="h-4 w-4 shrink-0 text-neutral-500 group-hover:text-blue-600"
        />
        <span className="font-medium text-neutral-800">{def.name}</span>
      </div>
      <span className="text-[10px] text-neutral-500">
        {def.defaultFootprint.w.toFixed(2)} × {def.defaultFootprint.d.toFixed(2)} m
      </span>
      {size ? (
        <span className="text-[10px] text-neutral-400">{formatBytes(size)}</span>
      ) : null}
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
