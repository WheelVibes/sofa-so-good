import {
  FURNITURE_CATEGORIES,
  type FurnitureCategory,
  type FurnitureDef,
} from '../../furniture/types'
import { CategoryIcon } from './CategoryIcon'

interface CategoryTabsProps {
  active: FurnitureCategory
  onSelect: (category: FurnitureCategory) => void
  byCategory: Record<FurnitureCategory, FurnitureDef[]>
}

const LABELS: Record<FurnitureCategory, string> = {
  beds: 'Beds',
  seating: 'Seating',
  tables: 'Tables',
  storage: 'Storage',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  appliances: 'Appliances',
  lighting: 'Lighting',
  decor: 'Decor',
  textiles: 'Textiles',
  outdoor: 'Outdoor',
  electronics: 'Electronics',
  kids: 'Baby & Kids',
  laundry: 'Laundry',
  others: 'Others',
}

export function CategoryTabs({ active, onSelect, byCategory }: CategoryTabsProps) {
  return (
    <nav className="cat-rail">
      {FURNITURE_CATEGORIES.map((c) => {
        const count = byCategory[c]?.length ?? 0
        if (count === 0) return null
        const isActive = c === active
        return (
          <button
            key={c}
            type="button"
            onClick={() => onSelect(c)}
            className={`chip${isActive ? ' on' : ''}`}
          >
            <CategoryIcon category={c} className="icn" width={14} height={14} />
            {LABELS[c]}
          </button>
        )
      })}
    </nav>
  )
}
