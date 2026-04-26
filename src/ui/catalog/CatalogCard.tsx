import type { FurnitureDef } from '../../furniture/types';
import { isUserDef } from '../../furniture/catalog';
import { usePlacementDrag } from './usePlacementDrag';

interface CatalogCardProps {
  def: FurnitureDef;
  onDelete?: () => void;
}

export function CatalogCard({ def, onDelete }: CatalogCardProps) {
  const isUser = isUserDef(def);
  const onPointerDown = usePlacementDrag(def);
  return (
    <div
      onPointerDown={onPointerDown}
      className="group relative flex cursor-grab flex-col items-start rounded border border-neutral-200 bg-white px-3 py-2 text-left text-xs hover:border-blue-400 hover:bg-blue-50 active:cursor-grabbing"
    >
      <span className="font-medium text-neutral-800">{def.name}</span>
      <span className="text-[10px] text-neutral-500">
        {def.defaultFootprint.w.toFixed(2)} × {def.defaultFootprint.d.toFixed(2)} m
      </span>
      {isUser ? (
        <span className="absolute right-1 top-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] uppercase tracking-wide text-amber-800">
          Uploaded
        </span>
      ) : null}
      {isUser && onDelete ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
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
