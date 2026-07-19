import type { FurnitureDef } from '../../furniture/types'
import { CategoryIcon } from './CategoryIcon'
import { useBuiltinThumbnail } from './thumbnails'
import { useCatalogPlacement } from './useCatalogPlacement'

/** How many recently-placed items the quick-add strip surfaces (the fuller
 *  "Recent" tab shows the whole `recentSlice` list). */
export const RECENT_STRIP_MAX = 8

interface RecentStripProps {
  /** Recently-placed local defs, newest first (already resolved + de-duped +
   *  unresolvable-filtered by `useUnifiedCatalog`). Rendered up to
   *  {@link RECENT_STRIP_MAX}; the caller hides the strip when this is empty. */
  defs: FurnitureDef[]
}

/** One compact tap-to-place chip in the Recent strip. Reuses the shared catalog
 *  placement grammar so a tap arms/places exactly like a full catalog card. */
function RecentChip({ def }: { def: FurnitureDef }) {
  const { handleClick, arm, touch } = useCatalogPlacement(def)
  const thumb = useBuiltinThumbnail(def)
  return (
    <button
      type="button"
      className="cat-recent-card liftable"
      aria-label={`Place ${def.name}`}
      title={`Place ${def.name}`}
      onClick={handleClick}
      {...touch}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          arm()
        }
      }}
    >
      <span className="cat-recent-thumb">
        {thumb ? (
          <img src={thumb} alt="" />
        ) : (
          <CategoryIcon category={def.category} width={22} height={22} />
        )}
      </span>
      <span className="cat-recent-name">{def.name}</span>
    </button>
  )
}

/**
 * Recently-placed quick-add strip (CATALOG-RECENTS, `catalogRecents` flag). A
 * thin horizontal row atop the catalog grid of the last few defs the user
 * placed — the automatic, item-level "the thing I just used" complement to the
 * deliberate Favourites star. Tap a chip to re-arm placement via the exact same
 * catalog-card place path. The caller gates it (flag + non-empty + browse mode).
 */
export function RecentStrip({ defs }: RecentStripProps) {
  const shown = defs.slice(0, RECENT_STRIP_MAX)
  if (shown.length === 0) return null
  return (
    <div className="cat-recent-strip">
      <div className="cat-recent-strip-head">Recent</div>
      <div className="cat-recent-strip-row">
        {shown.map((def) => (
          <RecentChip key={def.id} def={def} />
        ))}
      </div>
    </div>
  )
}
