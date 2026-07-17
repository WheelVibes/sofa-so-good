import { type CSSProperties, useMemo, useRef } from 'react'
import { itemFitsRoom, type RoomFreeRect } from '../../catalog/roomFit'
import { useFeature } from '../../features/useFeature'
import { isIkeaDef, isUserDef } from '../../furniture/catalog'
import { itemPrice } from '../../furniture/furniturePrices'
import { modelInfoText } from '../../furniture/modelInfo'
import type { FurnitureDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { formatDims } from '../../utils/measurement'
import { Icon } from '../toolbar/icons'
import { useIsMobile } from '../useIsMobile'
import { CatalogSourcePill } from './CatalogSourcePill'
import { CategoryIcon } from './CategoryIcon'
import { expectsBuiltinThumbnail, useBuiltinThumbnail } from './thumbnails'
import { usePlacementDrag } from './usePlacementDrag'

/** A 1×1 transparent drag image so the browser's default drag preview (a
 *  snapshot of the card, thumbnail included) doesn't follow the cursor and
 *  overlap the live 3D `PlacementGhost` (bug #4). Created lazily + cached; the
 *  data-URI GIF works across browsers without needing to be in the DOM. */
let transparentDragImage: HTMLImageElement | null = null
function emptyDragImage(): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null
  if (!transparentDragImage) {
    transparentDragImage = new Image()
    transparentDragImage.src =
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  }
  return transparentDragImage
}

/** How long a stationary press must last to count as a "pick it up" long-press. */
const LONG_PRESS_MS = 420
/** Finger travel that cancels a pending long-press (it's a scroll, not a hold). */
const LONG_PRESS_MOVE_PX = 12

interface CatalogCardProps {
  def: FurnitureDef
  onDelete?: () => void
  /** Re-download an imported ikea/shared def from R2 in place (rebuilds its GLB +
   *  thumbnail, keeps placed instances). Provided by the drawer ONLY when the def
   *  is re-downloadable (admin + `sharedLibrary` + backend + a matching manifest
   *  item); the button is absent otherwise. */
  onRefresh?: () => void
  /** True while a refresh for this def is in flight (shows a spinner + disables). */
  refreshing?: boolean
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
  /** Pet program P6 — this def is a REQUIRED fitting for a declared household
   *  pet, so it gets an "Essentials" corner badge. Off unless the pets profile
   *  surfaces it. */
  essential?: boolean
}

export function CatalogCard({
  def,
  onDelete,
  onRefresh,
  refreshing,
  staggerIndex,
  roomRects,
  essential,
}: CatalogCardProps) {
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
      // PLAN-FURNISH Phase 2 — inside the 2D plan editor the card arms the
      // PLAN placement grammar instead: arm + auto-close the sheet so the plan
      // is visible (cancel is the path back to the catalog), then either drag
      // this same touch onto the plan (FloorPlanEditor's window-level
      // long-press effect drives the ghost and commits on lift) or lift and
      // tap the plan (tap-to-place). No `placeConfirm`/`cursor` — those drive
      // the 3D canvas ghost, which is inert behind the plan overlay.
      if (s.floorPlanEditing) {
        s.setReopenCatalogAfterPlace(true)
        s.setActiveDefId(def.id)
        s.setCatalogOpen(false)
        return
      }
      // Explicit-confirm placement (bugs #2/#5): arm the ghost at the finger,
      // close the catalog, and show the "Place item?" pill. The ghost then
      // follows the finger and stays freely draggable — a lift never commits or
      // aborts — until the user taps ✓/✗. We do NOT snap the camera (requestTopView
      // was removed): a camera move mid-drag read as "the canvas moving on me".
      s.setReopenCatalogAfterPlace(true)
      s.setActiveDefId(def.id)
      s.setPlaceConfirm(true)
      s.setCursor({ x, y })
      s.setCatalogOpen(false)
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
    if (isMobile) {
      const s = useStore.getState()
      // Tapping the same armed card again toggles the placement off (both the
      // 3D placeConfirm flow and the plan tap-to-place flow).
      if (s.activeDefId === def.id && (s.placeConfirm || s.floorPlanEditing)) {
        s.cancelPlacement()
        return
      }
      // PLAN-FURNISH Phase 2 — inside the 2D plan editor a tap arms the PLAN
      // tap-to-place grammar: arm + auto-close the sheet so the plan is
      // visible, then a tap on the plan SVG commits at that spot (the same
      // `onDown` branch desktop click-to-place uses; the pendingEdit ✓/✗ bar
      // follows). Cancel is the path back to the catalog
      // (`reopenCatalogAfterPlace`). No `placeConfirm`/`cursor` — those drive
      // the 3D canvas ghost, which is inert behind the plan overlay.
      if (s.floorPlanEditing) {
        s.setReopenCatalogAfterPlace(true)
        s.setActiveDefId(def.id)
        s.setCatalogOpen(false)
        return
      }
      // Bug #5: a plain tap closes the catalog and drops the ghost hovering at
      // the canvas centre with the "Place item?" pill, freely draggable until
      // ✓/✗ (same explicit-confirm flow as the long-press, just centred).
      s.setReopenCatalogAfterPlace(true)
      s.setActiveDefId(def.id)
      s.setPlaceConfirm(true)
      s.setCursor({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      s.setCatalogOpen(false)
      return
    }
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
      // stays as the touch/fallback path. NON-mobile only: a `draggable` element
      // on iOS hijacks the touch-drag and blocks the catalog list from scrolling
      // (the gesture escapes to the page instead) — mobile places via tap/long-
      // press, so it never needs native drag.
      draggable={!isMobile}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData('text/plain', def.id)
        // Suppress the native card-snapshot drag preview so only the live 3D
        // ghost tracks the cursor (bug #4). Guarded — jsdom/older browsers.
        const img = emptyDragImage()
        if (img) e.dataTransfer.setDragImage(img, 0, 0)
        const s = useStore.getState()
        s.setActiveDefId(def.id)
        s.setCursor({ x: e.clientX, y: e.clientY })
      }}
      onDragEnd={() => {
        // If the drop didn't land on the canvas (still armed), disarm.
        if (useStore.getState().activeDefId === def.id) useStore.getState().cancelPlacement()
      }}
      className={`cat-card group liftable${wontFit ? ' no-fit' : ''}`}
      style={staggerIndex != null ? ({ '--i': staggerIndex } as CSSProperties) : undefined}
    >
      {/* Corner action stack (top-right): ♥ favourite, then ↻ refresh, then ×
          remove — all sharing the favourite size so they never overlap. Scoped
          to `.card-acts` so the global `.coll-x`/`.coll-refresh` sizing used by
          finish tiles / collections stays untouched. */}
      {favOn || onRefresh || ((isUser || isIkea) && onDelete) ? (
        <div className="card-acts">
          {favOn ? (
            <button
              type="button"
              className={`fav-btn${saved ? ' on' : ''}`}
              aria-label={saved ? 'Remove from favourites' : 'Add to favourites'}
              aria-pressed={saved}
              onClick={(e) => {
                e.stopPropagation()
                toggleFavourite(def.id)
              }}
            >
              {saved ? (
                <Icon.HeartFilled width={14} height={14} />
              ) : (
                <Icon.Heart width={14} height={14} />
              )}
            </button>
          ) : null}
          {onRefresh ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRefresh()
              }}
              className="coll-refresh"
              aria-label="Re-download asset from library"
              aria-busy={refreshing || undefined}
              disabled={refreshing}
            >
              <Icon.Refresh width={14} height={14} />
            </button>
          ) : null}
          {(isUser || isIkea) && onDelete ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="coll-x"
              aria-label={isIkea ? 'Remove downloaded asset' : 'Remove uploaded asset'}
            >
              <Icon.Close width={14} height={14} />
            </button>
          ) : null}
        </div>
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
      ) : essential ? (
        <span className="badge ok" style={{ position: 'absolute', top: 6, left: 6 }}>
          Essential
        </span>
      ) : null}
    </div>
  )
}
