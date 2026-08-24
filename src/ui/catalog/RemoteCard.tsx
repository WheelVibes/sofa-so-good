import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useAssetSize, useResolveStatus, useThumbnail } from '../../catalog/remote/hooks'
import type { RemoteEntry } from '../../catalog/remote/types'
import { useFeature } from '../../features/useFeature'
import type { FurnitureCategory } from '../../furniture/types'
import { useStore } from '../../state/store'
import { formatBytes } from '../../utils/measurement'
import { Icon } from '../toolbar/icons'
import { CategoryIcon } from './CategoryIcon'

interface Props {
  entry: RemoteEntry
  /** Called with the resolved def id (`provider:slug:resolution`) once the
   *  asset is downloaded — the drawer arms placement / switches to the grid. */
  onResolved: (id: string) => void
  /** Map index in the enclosing `.card-grid.stagger-in` — drives the entrance
   *  cascade's `--i` custom property (unset falls back to the CSS nth-child
   *  rules, which cover the first 12 cards). */
  staggerIndex?: number
}

/** A browsable CC0 model card, styled identically to {@link CatalogCard}.
 *  Clicking downloads the model (if needed) then hands the resolved id back so
 *  the drawer can arm placement. Carries the same heart favourite button. */
export function RemoteCard({ entry, onResolved, staggerIndex }: Props) {
  const [visible, setVisible] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const thumb = useThumbnail(entry, visible)
  const resolution = useStore((s) => s.preferredResolution)
  const resolve = useStore((s) => s.resolveRemoteAsset)
  const key = `${entry.provider}:${entry.slug}:${resolution}`
  const favId = `${entry.provider}:${entry.slug}`
  const status = useResolveStatus(key)
  const size = useAssetSize(entry, resolution, visible)
  const favOn = useFeature('catalogFavourites')
  const saved = useStore((s) => s.favouriteDefIds.includes(favId))
  const toggleFavourite = useStore((s) => s.toggleFavourite)
  // Furniture remote entries always carry a FurnitureCategory.
  const category = entry.category as FurnitureCategory

  useEffect(() => {
    const el = cardRef.current
    if (!el || visible) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [visible])

  const onClick = async () => {
    if (status === 'fetching') return
    if (status !== 'ready') {
      try {
        await resolve(entry, resolution)
      } catch {
        // The slice already sets status to 'error' (the card shows "Retry"), so
        // swallow here — otherwise the rejected resolve surfaces as an unhandled
        // promise rejection (console error / dev overlay) and onResolved would
        // wrongly fire (BUG-005).
        return
      }
    }
    onResolved(key)
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a <button> can't host the nested fav button (invalid HTML); role=button + key handling gives the same a11y.
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-label={`Add ${entry.name}`}
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
          aria-pressed={saved}
          onClick={(e) => {
            e.stopPropagation()
            toggleFavourite(favId)
          }}
        >
          {saved ? (
            <Icon.HeartFilled width={14} height={14} />
          ) : (
            <Icon.Heart width={14} height={14} />
          )}
        </button>
      ) : null}
      <div className="card-thumb">
        {thumb.url ? (
          <img src={thumb.url} alt={entry.name} />
        ) : (
          <CategoryIcon category={category} width={40} height={40} />
        )}
        {/* Only a thumbnail that is still in flight gets a skeleton. One that
            FAILED gets a retry chip instead — a swallowed error rendering as a
            permanent shimmer is indistinguishable from a slow network. */}
        {visible && !thumb.url && !thumb.failed && status !== 'error' ? (
          <span className="skeleton" aria-hidden />
        ) : null}
        {status === 'fetching' ? (
          <span className="thumb-status">Downloading…</span>
        ) : status === 'error' ? (
          <span className="thumb-status err">Retry</span>
        ) : thumb.failed ? (
          <button
            type="button"
            className="thumb-status err"
            aria-label={`Retry loading the ${entry.name} preview`}
            onClick={(e) => {
              e.stopPropagation()
              thumb.retry()
            }}
          >
            Retry preview
          </button>
        ) : null}
      </div>
      <div className="nm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <CategoryIcon category={category} width={14} height={14} style={{ flex: 'none' }} />
        <span
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={entry.name}
        >
          {entry.name}
        </span>
      </div>
      <span
        // Flag a heavy download (≥30 MB at the chosen resolution) so users
        // don't blindly pull a large asset — reuses the shared `.warn` token
        // treatment (see `.badge.warn` / `.lyr-flag.warn`), never a literal hex.
        className={`pr${status !== 'ready' && size != null && size >= 30 * 1024 * 1024 ? ' warn' : ''}`}
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={
          size != null
            ? `~${formatBytes(size)} at ${resolution.toUpperCase()} · ${entry.attribution}`
            : entry.attribution
        }
      >
        {status === 'ready'
          ? 'Downloaded · place'
          : size != null
            ? `CC0 · ${formatBytes(size)} · tap`
            : 'CC0 · tap to add'}
      </span>
      <span className="badge neutral" style={{ position: 'absolute', top: 6, left: 6 }}>
        CC0
      </span>
    </div>
  )
}
