import {
  FURNITURE_CATEGORIES,
  type FurnitureCategory,
  type FurnitureDef,
} from '../../furniture/types';

interface CategoryTabsProps {
  active: FurnitureCategory;
  onSelect: (category: FurnitureCategory) => void;
  byCategory: Record<FurnitureCategory, FurnitureDef[]>;
}

const LABELS: Record<FurnitureCategory, string> = {
  beds: 'Beds',
  seating: 'Seating',
  tables: 'Tables',
  storage: 'Storage',
  kitchen: 'Kitchen',
  lighting: 'Lighting',
  decor: 'Decor',
};

export function CategoryTabs({ active, onSelect, byCategory }: CategoryTabsProps) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-neutral-200 px-3 py-2">
      {FURNITURE_CATEGORIES.map((c) => {
        const count = byCategory[c]?.length ?? 0;
        if (count === 0) return null;
        const isActive = c === active;
        return (
          <button
            key={c}
            onClick={() => onSelect(c)}
            className={
              'rounded px-2 py-1 text-xs ' +
              (isActive
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200')
            }
          >
            {LABELS[c]} <span className="opacity-60">{count}</span>
          </button>
        );
      })}
    </nav>
  );
}
