import type { CSSProperties } from 'react'
import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import { assetUrl } from '../../features/api/client'
import { useFeature } from '../../features/useFeature'
import { mapCategory } from '../../furniture/ikea/translate'
import type { FurnitureCategory } from '../../furniture/types'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { CatalogSourcePill } from './CatalogSourcePill'
import { CategoryIcon } from './CategoryIcon'

interface Props {
  item: SharedLibraryItem
  /** Called with the imported def id (`ikea-<groupKey>`) once the group is added. */
  onResolved: (id: string) => void
  /** Map index in the enclosing `.card-grid.stagger-in` — drives the entrance
   *  cascade's `--i` custom property (unset falls back to the CSS nth-child
   *  rules, which cover the first 12 cards). */
  staggerIndex?: number
}

/** A browsable card for one R2 shared-library product, styled like {@link CatalogCard}.
 *  Clicking imports the group (if needed) then hands the resolved def id back so the
 *  drawer can arm placement. The thumbnail loads lazily through the auth-gated proxy. */
export function SharedCard({ item, onResolved, staggerIndex }: Props) {
  const category = mapCategory(item.category).category as FurnitureCategory
  const favId = `ikea-${item.groupKey}`
  const state = useStore((s) => s.sharedLibrary.resolving[item.group])
  const addSharedGroup = useStore((s) => s.addSharedGroup)
  const favOn = useFeature('catalogFavourites')
  const saved = useStore((s) => s.favouriteDefIds.includes(favId))
  const toggleFavourite = useStore((s) => s.toggleFavourite)
  const thumb = item.thumbnail ? assetUrl(`ikea/${item.group}/${item.thumbnail}`) : null

  const onClick = async () => {
    if (state === 'adding') return
    const id = await addSharedGroup(item.group)
    if (id) onResolved(id)
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a <button> can't host the nested fav button (invalid HTML); role=button + key handling gives the same a11y.
    <div
      role="button"
      tabIndex={0}
      aria-label={`Add ${item.name}`}
      onClick={() => void onClick()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          void onClick()
        }
      }}
      className="cat-card group liftable"
      style={staggerIndex != null ? ({ '--i': staggerIndex } as CSSProperties) : undefined}
    >
      {favOn ? (
        <button
          type="button"
          className={`fav-btn${saved ? ' on' : ''}`}
          aria-label={saved ? 'Remove from favourites' : 'Add to favourites'}
          onClick={(e) => {
            e.stopPropagation()
            toggleFavourite(favId)
          }}
        >
          <Icon.Heart width={14} height={14} />
        </button>
      ) : null}
      <div className="card-thumb photo">
        <CatalogSourcePill label="IKEA" />
        {thumb ? (
          <img src={thumb} alt={item.name} loading="lazy" />
        ) : (
          <CategoryIcon category={category} width={40} height={40} />
        )}
        {state === 'adding' ? (
          <span className="thumb-status">Adding…</span>
        ) : state === 'error' ? (
          <span className="thumb-status err">Retry</span>
        ) : null}
      </div>
      <div className="nm" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
        <CategoryIcon category={category} width={14} height={14} style={{ flex: 'none' }} />
        <span
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={item.name}
        >
          {item.name}
        </span>
      </div>
      <span
        className="pr"
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={item.type}
      >
        {item.variants > 1 ? `${item.variants} finishes · tap` : 'tap to add'}
      </span>
    </div>
  )
}
