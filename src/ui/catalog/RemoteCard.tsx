import { useEffect, useRef, useState } from 'react'
import { useAssetSize, useResolveStatus, useThumbnail } from '../../catalog/remote/hooks'
import type { RemoteEntry } from '../../catalog/remote/types'
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
}

/** A browsable CC0 model card, styled identically to {@link CatalogCard}.
 *  Clicking downloads the model (if needed) then hands the resolved id back so
 *  the drawer can arm placement. Carries the same heart favourite button. */
export function RemoteCard({ entry, onResolved }: Props) {
  const [visible, setVisible] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const thumb = useThumbnail(entry, visible)
  const resolution = useStore((s) => s.preferredResolution)
  const resolve = useStore((s) => s.resolveRemoteAsset)
  const key = `${entry.provider}:${entry.slug}:${resolution}`
  const favId = `${entry.provider}:${entry.slug}`
  const status = useResolveStatus(key)
  const size = useAssetSize(entry, resolution, visible)
  const saved = useStore((s) => s.collections.includes(favId))
  const toggleCollection = useStore((s) => s.toggleCollection)
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
    if (status !== 'ready') await resolve(entry, resolution)
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
      className="cat-card group"
    >
      <button
        type="button"
        className={`fav-btn${saved ? ' on' : ''}`}
        aria-label={saved ? 'Remove from favourites' : 'Add to favourites'}
        onClick={(e) => {
          e.stopPropagation()
          toggleCollection(favId)
        }}
      >
        <Icon.Heart width={14} height={14} />
      </button>
      <div className="card-thumb">
        {thumb ? (
          <img src={thumb} alt={entry.name} />
        ) : (
          <CategoryIcon category={category} width={40} height={40} />
        )}
        {status === 'fetching' ? (
          <span className="thumb-status">Downloading…</span>
        ) : status === 'error' ? (
          <span className="thumb-status err">Retry</span>
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
        className="pr"
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          // Flag a heavy download (≥30 MB at the chosen resolution) so users
          // don't blindly pull a large asset.
          color:
            status !== 'ready' && size != null && size >= 30 * 1024 * 1024 ? '#b8860b' : undefined,
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
