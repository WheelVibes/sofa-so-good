import { isUserDef } from '../../furniture/catalog'
import type { FurnitureDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { CategoryIcon } from './CategoryIcon'
import { useBuiltinThumbnail } from './thumbnails'
import { usePlacementDrag } from './usePlacementDrag'

interface CatalogCardProps {
  def: FurnitureDef
  onDelete?: () => void
}

export function CatalogCard({ def, onDelete }: CatalogCardProps) {
  const isUser = isUserDef(def)
  const onClick = usePlacementDrag(def)
  const thumb = useBuiltinThumbnail(def)
  const saved = useStore((s) => s.collections.includes(def.id))
  const toggleCollection = useStore((s) => s.toggleCollection)
  return (
    <div onClick={onClick} className="cat-card group">
      <button
        type="button"
        className={`fav-btn${saved ? ' on' : ''}`}
        aria-label={saved ? 'Remove from saved' : 'Save to collection'}
        onClick={(e) => {
          e.stopPropagation()
          toggleCollection(def.id)
        }}
      >
        <Icon.Heart width={14} height={14} />
      </button>
      <div className="card-thumb">
        {thumb ? (
          <img src={thumb} alt={def.name} />
        ) : (
          <CategoryIcon category={def.category} width={40} height={40} />
        )}
      </div>
      <div className="nm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <CategoryIcon category={def.category} width={14} height={14} style={{ flex: 'none' }} />
        <span
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={def.name}
        >
          {def.name}
        </span>
      </div>
      <span className="pr mono">
        {def.defaultFootprint.w.toFixed(2)} × {def.defaultFootprint.d.toFixed(2)} m
      </span>
      {isUser ? (
        <span className="badge neutral" style={{ position: 'absolute', top: 6, left: 6 }}>
          Uploaded
        </span>
      ) : null}
      {isUser && onDelete ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="coll-x"
          aria-label="Remove uploaded asset"
        >
          <Icon.Close width={12} height={12} />
        </button>
      ) : null}
    </div>
  )
}
