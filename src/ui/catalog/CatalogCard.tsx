import { type CSSProperties, useMemo, useRef } from 'react'
import { itemFitsRoom, type RoomFreeRect } from '../../catalog/roomFit'
import { useFeature } from '../../features/useFeature'
import { isIkeaDef, isUserDef } from '../../furniture/catalog'
import { itemPrice } from '../../furniture/furniturePrices'
import { modelInfoText } from '../../furniture/modelInfo'
import {
  catalogVariantOptions,
  initialVariantProps,
} from '../../furniture/placement/catalogVariants'
import type { FurnitureDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { formatDims } from '../../utils/measurement'
import { Icon } from '../toolbar/icons'
import { useIsMobile } from '../useIsMobile'
import { CatalogSourcePill } from './CatalogSourcePill'
import { CatalogVariantPopover } from './CatalogVariantPopover'
import { CategoryIcon } from './CategoryIcon'
import { expectsBuiltinThumbnail, useBuiltinThumbnail } from './thumbnails'
import { usePlacementDrag } from './usePlacementDrag'

/** How long a stationary press must last to count as a "pick it up" long-press. */
const LONG_PRESS_MS = 420
/** Finger travel that cancels a pending long-press (it's a scroll, not a hold). */
const LONG_PRESS_MOVE_PX = 12

interface CatalogCardProps {
  def: FurnitureDef
  onDelete?: () => void
  /** Map index in the enclosing `.card-grid.stagger-in` — drives the entrance
   *  cascade's `--i` custom property (unset falls back to the CSS nth-child
   *  rules, which cover the first 12 cards). */
  staggerIndex?: number
  /**
   * Free-space rects of the room currently being edited (CATALOG-FITS,
   * `ui/catalog/useCatalogRoomFit.ts`), or `null` when no room is being
   * edited. Drives the "fits this room" size cue — `undefined`/`null` renders
   * no cue at all (never a false "won't fit").
   */
  roomRects?: RoomFreeRect[] | null
}

export function CatalogCard({ def, onDelete, staggerIndex, roomRects }: CatalogCardProps) {
  const isUser = isUserDef(def)
  const isIkea = isIkeaDef(def)
  const onClick = usePlacementDrag(def)
  const isMobile = useIsMobile()
  // Mobile long-press = "pick this up": arm placement, hide the catalog so the
  // room is visible, and let the ghost follow the finger to be placed with the
  // tick/cross confirmation (the catalog reappears once the placement resolves).
  const press = useRef<{ x: number; y: number; timer: number; fired: boolean } | null>(null)
  const startLongPress = (e: React.TouchEvent) => {
    if (!isMobile) return
    const t = e.touches[0]
    if (!t) return
    const x = t.clientX
    const y = t.clientY
    const timer = window.setTimeout(() => {
      if (press.current) press.current.fired = true
      const s = useStore.getState()
      s.setReopenCatalogAfterPlace(true)
      s.setActiveDefId(def.id)
      s.setCursor({ x, y })
      s.setCatalogOpen(false)
      // Snap to a top-down view so the piece drops onto a clean plan — dragging it
      // around then reads as pure 2D positioning (orbit is frozen while armed).
      s.requestTopView()
    }, LONG_PRESS_MS)
    press.current = { x, y, timer, fired: false }
  }
  const moveLongPress = (e: React.TouchEvent) => {
    const p = press.current
    if (!p || p.fired) return
    const t = e.touches[0]
    if (!t) return
    if (Math.hypot(t.clientX - p.x, t.clientY - p.y) > LONG_PRESS_MOVE_PX) {
      window.clearTimeout(p.timer)
      press.current = null
    }
  }
  const endLongPress = () => {
    const p = press.current
    if (p && !p.fired) window.clearTimeout(p.timer)
    // Keep `fired` readable by the click handler that follows; clear it next tick.
    if (p?.fired) window.setTimeout(() => (press.current = null), 0)
    else press.current = null
  }
  const handleClick = (e?: React.MouseEvent) => {
    // A long-press already armed placement — swallow the trailing tap so it
    // doesn't toggle placement back off.
    if (press.current?.fired) return
    onClick(e)
  }
  const thumb = useBuiltinThumbnail(def)
  const favOn = useFeature('catalogFavourites')
  const saved = useStore((s) => s.favouriteDefIds.includes(def.id))
  const toggleFavourite = useStore((s) => s.toggleFavourite)
  const units = useStore((s) => s.units)
  const modelInfoOn = useFeature('catalogModelInfo')
  // Price displays are gated behind the budget/price feature (off by default).
  const priceOn = useFeature('budget')
  // "Fits this room" size cue (CATALOG-FITS) — badges/dims the card when the
  // item's footprint can't reasonably fit the room being edited. `roomRects`
  // is `null`/`undefined` when no room is active, which the pure predicate
  // already resolves to 'unknown' (no cue).
  const fitsOn = useFeature('catalogFits')
  const fitLevel = useMemo(
    () => (fitsOn ? itemFitsRoom(def.defaultFootprint, roomRects) : 'unknown'),
    [fitsOn, def.defaultFootprint, roomRects],
  )
  const wontFit = fitLevel === 'wont-fit'
  const tightFit = fitLevel === 'tight'
  // Sticky "stamp" placement (PARITY-STAMP-PLACE) — a pro power-tool: arm this def
  // and click-place it repeatedly without re-selecting.
  const stampOn = useFeature('stampPlace')
  const startStamp = useStore((s) => s.startStamp)
  const stampingThis = useStore((s) => s.stampMode && s.activeDefId === def.id)
  // Pick a colour/finish/variant on the card BEFORE placing (CATALOG-VARIANT) —
  // a quick-look popover, not inline swatches (mobile card clutter). Empty for a
  // def with nothing to choose (single-finish IKEA, a plain GLB, a parametric
  // def with no colour field) — no popover in that case, never a disabled one.
  const variantPickOn = useFeature('catalogVariantPick')
  const variantOptions = useMemo(
    () => (variantPickOn ? catalogVariantOptions(def) : []),
    [variantPickOn, def],
  )
  const pickVariant = (optionId: string, e?: React.MouseEvent) => {
    const s = useStore.getState()
    s.armWithVariant(def.id, initialVariantProps(def, optionId))
    s.setCursor({
      x: e?.clientX ?? window.innerWidth / 2,
      y: e?.clientY ?? window.innerHeight / 2,
    })
  }
  // Model size + creator/licence for the card tooltip (SweetHome3DJS parity).
  const modelInfo = modelInfoOn ? modelInfoText(def) : null
  return (
    // biome-ignore lint/a11y/useSemanticElements: a <button> can't host the nested fav/delete buttons (invalid HTML); role=button + key handling gives the same a11y.
    <div
      role="button"
      tabIndex={0}
      aria-label={`Place ${def.name}`}
      title={modelInfo ? `${def.name} — ${modelInfo}` : undefined}
      onClick={handleClick}
      onTouchStart={startLongPress}
      onTouchMove={moveLongPress}
      onTouchEnd={endLongPress}
      onTouchCancel={endLongPress}
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
      className={`cat-card group liftable${stampingThis ? ' stamping' : ''}${wontFit ? ' no-fit' : ''}`}
      style={staggerIndex != null ? ({ '--i': staggerIndex } as CSSProperties) : undefined}
      aria-pressed={stampingThis || undefined}
    >
      {favOn ? (
        <button
          type="button"
          className={`fav-btn${saved ? ' on' : ''}`}
          aria-label={saved ? 'Remove from favourites' : 'Add to favourites'}
          onClick={(e) => {
            e.stopPropagation()
            toggleFavourite(def.id)
          }}
        >
          <Icon.Heart width={14} height={14} />
        </button>
      ) : null}
      {stampOn ? (
        <button
          type="button"
          className={`stamp-btn${stampingThis ? ' on' : ''}`}
          aria-label={stampingThis ? `Stop stamping ${def.name}` : `Stamp ${def.name} repeatedly`}
          aria-pressed={stampingThis}
          title={
            stampingThis
              ? 'Stamping — click the floor to drop copies, Esc to stop'
              : 'Stamp: place this item repeatedly with one click each'
          }
          onClick={(e) => {
            e.stopPropagation()
            startStamp(def.id)
          }}
        >
          <Icon.Copy width={14} height={14} />
        </button>
      ) : null}
      {variantOptions.length > 0 ? (
        <CatalogVariantPopover defName={def.name} options={variantOptions} onPick={pickVariant} />
      ) : null}
      <div className={`card-thumb${isIkea ? ' photo' : ''}`}>
        {isIkea ? <CatalogSourcePill label="IKEA" /> : null}
        {thumb ? (
          <img src={thumb} alt={def.name} />
        ) : (
          <CategoryIcon category={def.category} width={40} height={40} />
        )}
        {!thumb && expectsBuiltinThumbnail(def) ? <span className="skeleton" aria-hidden /> : null}
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
      <span className={`pr mono${wontFit ? ' warn' : ''}`}>
        {formatDims(def.defaultFootprint.w, def.defaultFootprint.d, units)}
        {wontFit ? <b> · Won’t fit</b> : tightFit ? ' · Tight fit' : null}
        {priceOn ? (
          <>
            {' · '}
            <b>~${itemPrice(def, def.category).toLocaleString('en-SG')}</b>
          </>
        ) : null}
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
