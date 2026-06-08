import { isUserDef } from '../../furniture/catalog'
import { itemPrice } from '../../furniture/furniturePrices'
import type { FurnitureDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { formatDims } from '../../utils/measurement'
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
  const units = useStore((s) => s.units)
  return (
    // biome-ignore lint/a11y/useSemanticElements: a <button> can't host the nested fav/delete buttons (invalid HTML); role=button + key handling gives the same a11y.
    <div
      role="button"
      tabIndex={0}
      aria-label={`Place ${def.name}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      // Desktop drag-and-drop placement: dragging arms placement (the ghost then
      // follows the cursor onto the scene) and the drop commits. Click-to-arm
      // stays as the touch/fallback path.
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData('text/plain', def.id)
        const s = useStore.getState()
        s.setActiveDefId(def.id)
        s.setCursor({ x: e.clientX, y: e.clientY })
      }}
      onDragEnd={() => {
        // If the drop didn't land on the canvas (still armed), disarm.
        if (useStore.getState().activeDefId === def.id) useStore.getState().cancelPlacement()
      }}
      className="cat-card group"
    >
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
        {formatDims(def.defaultFootprint.w, def.defaultFootprint.d, units)}
        {' · '}
        <b>~${itemPrice(def, def.category).toLocaleString('en-SG')}</b>
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
