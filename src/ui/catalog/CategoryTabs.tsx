import { useRef } from 'react'
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
  /** Whether the catalogFavourites feature flag is on; hides the star chip when off. */
  favEnabled?: boolean
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
  favEnabled = true,
}: CategoryTabsProps) {
  const railRef = useRef<HTMLElement>(null)
  // Desktop: a vertical mouse wheel can't scroll a horizontal-overflow row, so
  // the category rail reads as "stuck" / scrolls the page instead. Translate a
  // dominant vertical wheel delta into horizontal scroll so the wheel browses
  // categories left↔right. Trackpads (which already emit horizontal deltaX) and
  // touch are untouched.
  const onWheel = (e: React.WheelEvent<HTMLElement>) => {
    const el = railRef.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    el.scrollLeft += e.deltaY
    e.preventDefault()
  }
  return (
    <nav className="cat-rail" ref={railRef} onWheel={onWheel}>
      {favEnabled ? (
        <button
          type="button"
          onClick={() => onSelect('favourites')}
          className={`chip${active === 'favourites' ? ' on' : ''}`}
          aria-label={`Favourites (${favCount})`}
          title="Favourites"
        >
          <Icon.Star className="icn" width={14} height={14} />
          {favCount > 0 ? <span className="chip-count">{favCount}</span> : null}
        </button>
      ) : null}
      {recentCount > 0 ? (
        <button
          type="button"
          onClick={() => onSelect('recent')}
          className={`chip${active === 'recent' ? ' on' : ''}`}
          aria-label={`Recently used (${recentCount})`}
          title="Recently used"
        >
          <Icon.Time className="icn" width={14} height={14} />
          Recent
          <span className="chip-count">{recentCount}</span>
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
            <span className="chip-count">{count}</span>
          </button>
        )
      })}
    </nav>
  )
}
