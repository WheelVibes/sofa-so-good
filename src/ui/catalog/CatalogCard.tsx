import { type CSSProperties, useMemo } from 'react'
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
import { useCatalogPlacement } from './useCatalogPlacement'

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
  /**
   * CATALOG-COMPARE — while the catalog's "Compare" toggle is armed, a card
   * click selects-for-compare instead of placing (a checkmark overlay badge
   * shows the state — NOT a new per-card button, per the no-card-buttons
   * rule). `undefined`/`false` is the normal click-to-place behaviour.
   */
  compareMode?: boolean
  /** Whether this card is currently in the compare selection (only meaningful
   *  when `compareMode` is on). */
  compareSelected?: boolean
  /** Toggle this def into/out of the compare selection. Only called when
   *  `compareMode` is on. */
  onToggleCompare?: () => void
}

export function CatalogCard({
  def,
  onDelete,
  onRefresh,
  refreshing,
  staggerIndex,
  roomRects,
  essential,
  compareMode,
  compareSelected,
  onToggleCompare,
}: CatalogCardProps) {
  const isUser = isUserDef(def)
  const isIkea = isIkeaDef(def)
  const isMobile = useIsMobile()
  // Shared catalog placement grammar (desktop click-to-arm / native drag,
  // mobile explicit-confirm + 2D-plan tap-to-place). Extracted so the "Recent"
  // quick-add strip reuses the exact same place path (`useCatalogPlacement`).
  const { handleClick, arm: onClick, touch } = useCatalogPlacement(def)
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
      aria-label={
        compareMode
          ? `${compareSelected ? 'Remove' : 'Add'} ${def.name} to compare`
          : `Place ${def.name}`
      }
      aria-pressed={compareMode ? !!compareSelected : undefined}
      title={modelInfo ? `${def.name} — ${modelInfo}` : undefined}
      // CATALOG-COMPARE: while compare mode is armed, a click/tap/Enter selects
      // this card for the comparison tray instead of placing it — the card
      // itself stays the single click target (no new per-card button), a
      // checkmark overlay below is the only visual addition.
      onClick={compareMode ? onToggleCompare : handleClick}
      {...(compareMode ? {} : touch)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (compareMode) onToggleCompare?.()
          else onClick()
        }
      }}
      // Desktop drag-and-drop placement: dragging arms placement (the ghost then
      // follows the cursor onto the scene) and the drop commits. Click-to-arm
      // stays as the touch/fallback path. NON-mobile only: a `draggable` element
      // on iOS hijacks the touch-drag and blocks the catalog list from scrolling
      // (the gesture escapes to the page instead) — mobile places via tap/long-
      // press, so it never needs native drag. Compare mode never drags — a
      // click there selects for comparison, not placement.
      draggable={!isMobile && !compareMode}
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
      className={`cat-card group liftable${wontFit ? ' no-fit' : ''}${compareMode ? ' compare-armed' : ''}${compareSelected ? ' compare-selected' : ''}`}
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
      <div className="nm" style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <CategoryIcon category={def.category} width={14} height={14} style={{ flex: 'none' }} />
        {/* Wraps to a second line rather than ellipsing: at a 94px tile the
            single-line rule cut "L-shaped sectional" and "Bay-window daybed" in
            every theme (Chrome audit 2026-08). `title` stays as the fallback for
            anything long enough to overrun even two lines. */}
        <span className="cat-card-name" title={def.name}>
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
      {compareMode ? (
        // Selection cue, not a control — the card itself is the click target
        // (see the no-card-buttons rule note on the outer onClick above).
        <span className={`cmp-badge${compareSelected ? ' on' : ''}`} aria-hidden="true">
          {compareSelected ? <Icon.Check width={13} height={13} /> : null}
        </span>
      ) : isUser ? (
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
