import { FURNITURE_CATEGORIES, type FurnitureCategory } from '../../furniture/types'
import { Icon } from '../toolbar/icons'
import { CategoryIcon } from './CategoryIcon'

/** The favourites + recent pseudo-categories sort before every real category. */
export type CatalogCategory = FurnitureCategory | 'favourites' | 'recent'

interface CategoryTabsProps {
  active: CatalogCategory
  onSelect: (category: CatalogCategory) => void
  /** Card count per real category (drives which chips render). */
  counts: Record<FurnitureCategory, number>
  /** Number of favourited assets — shown on the star chip. */
  favCount: number
  /** Number of recently-placed assets — shown on the clock chip. */
  recentCount: number
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

export function CategoryTabs({
  active,
  onSelect,
  counts,
  favCount,
  recentCount,
}: CategoryTabsProps) {
  return (
    <nav className="cat-rail">
      <button
        type="button"
        onClick={() => onSelect('favourites')}
        className={`chip${active === 'favourites' ? ' on' : ''}`}
        aria-label="Favourites"
        title="Favourites"
      >
        <Icon.Star className="icn" width={14} height={14} />
        {favCount > 0 ? favCount : null}
      </button>
      {recentCount > 0 ? (
        <button
          type="button"
          onClick={() => onSelect('recent')}
          className={`chip${active === 'recent' ? ' on' : ''}`}
          aria-label="Recently used"
          title="Recently used"
        >
          <Icon.Time className="icn" width={14} height={14} />
          Recent
        </button>
      ) : null}
      {FURNITURE_CATEGORIES.map((c) => {
        const count = counts[c] ?? 0
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
