import { useFeature } from '../../features/useFeature'
import { resolveFootprintDims } from '../../furniture/footprintDims'
import { itemPrice } from '../../furniture/furniturePrices'
import { isEmitter } from '../../furniture/lightEmitters'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { formatDimsShort } from '../../utils/measurement'
import { CategoryIcon } from '../catalog/CategoryIcon'
import { expectsBuiltinThumbnail, useBuiltinThumbnail } from '../catalog/thumbnails'
import { Icon } from '../toolbar/icons'
import { confirmDeleteItem, duplicateItemNearby } from './itemTransforms'
import { MinimizeButton } from './useInspectorMinimize'

/**
 * Inspector panel header: thumbnail + title, with category/dims/price collapsing
 * away while minimized, plus the light-source / lock / minimize / close icon
 * buttons. Always rendered (even minimized). The mobile bottom-sheet drag handle
 * is a separate `SheetGrab` sibling above this row, so a swipe on the header's
 * buttons/thumbnail no longer minimizes the sheet.
 */
export function InspectorHeader({
  item,
  def,
  catalog,
  minimized,
  toggle,
}: {
  item: FurnitureItem
  def: FurnitureDef
  catalog: Record<string, FurnitureDef>
  minimized: boolean
  toggle: () => void
}) {
  const priceOn = useFeature('budget')
  const itemAsLightOn = useFeature('itemAsLight')
  const units = useStore((s) => s.units)
  // Show the piece's real thumbnail (same source as the catalog card) instead of
  // a generic category glyph; fall back to the icon while a render is pending or
  // for defs that never produce one.
  const thumb = useBuiltinThumbnail(def)

  let w = def.defaultFootprint.w
  let d = def.defaultFootprint.d
  if (def.kind === 'parametric') {
    const dims = resolveFootprintDims(def, item.props, { w, d })
    w = dims.w
    d = dims.d
  }

  return (
    <div className="panel-head">
      <div>
        <div className="insp-thumb">
          {thumb ? (
            <img src={thumb} alt={def.name} />
          ) : (
            <CategoryIcon category={def.category} width={22} height={22} />
          )}
          {!thumb && expectsBuiltinThumbnail(def) ? (
            <span className="skeleton" aria-hidden />
          ) : null}
        </div>
        <div>
          <div className="panel-title">{item.label ?? def.name}</div>
          {minimized ? null : (
            <>
              <div className="panel-sub">{def.category}</div>
              <div className="dims mono" title="Width × Depth × Height">
                {formatDimsShort([w, d, def.defaultFootprint.h], units)}
              </div>
              {priceOn ? (
                <div
                  className="insp-price mono"
                  title="Estimated price (see the Budget panel for the full list)"
                >
                  ~$
                  {itemPrice(
                    def,
                    def.category,
                    typeof item.props.variant === 'string' ? item.props.variant : undefined,
                  ).toLocaleString('en-SG')}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
      <div className="insp-head-btns">
        {itemAsLightOn && !isEmitter(item.defId) && (
          <button
            type="button"
            onClick={() => {
              // `undefined` removes the key (updateItemProps clears explicitly-
              // undefined values) — a merged bag could never turn the light off.
              useStore.getState().updateItemProps(item.id, {
                lightOn: item.props.lightOn === 'yes' ? undefined : 'yes',
              })
            }}
            className={`icon-btn${item.props.lightOn === 'yes' ? ' on' : ''}`}
            aria-label={
              item.props.lightOn === 'yes' ? 'Turn off light source' : 'Make a light source'
            }
            title="Emit light at night from this item"
          >
            <Icon.Lights width={16} height={16} />
          </button>
        )}
        <button
          type="button"
          onClick={() => useStore.getState().toggleLock(item.id)}
          className={`icon-btn${item.locked ? ' on' : ''}`}
          aria-label={item.locked ? 'Unlock item' : 'Lock item in place'}
          title={item.locked ? 'Unlock — allow moving/editing' : 'Lock in place'}
        >
          {item.locked ? (
            <Icon.Lock width={16} height={16} />
          ) : (
            <Icon.Unlock width={16} height={16} />
          )}
        </button>
        {/* Duplicate sits between lock and delete so a copy is one tap away even
            from the minimized (mobile bottom-sheet) header — no need to expand
            the panel to reach the Duplicate action button. */}
        <button
          type="button"
          onClick={() => duplicateItemNearby(item, def, catalog)}
          className="icon-btn"
          aria-label="Duplicate item"
          title="Duplicate this item"
        >
          <Icon.Copy width={16} height={16} />
        </button>
        {/* Delete reachable even from the minimized (mobile bottom-sheet) header —
            confirm-gated, red for visibility (bug report #2). */}
        <button
          type="button"
          onClick={() => !item.locked && void confirmDeleteItem(item.id, def.name)}
          className="icon-btn danger"
          disabled={item.locked}
          aria-label="Delete item"
          title="Delete this item (Del)"
        >
          <Icon.Trash width={16} height={16} />
        </button>
        <MinimizeButton minimized={minimized} toggle={toggle} />
        <button
          type="button"
          onClick={() => useStore.getState().selectItem(null)}
          className="icon-btn"
          aria-label="Close inspector"
        >
          <Icon.Close width={16} height={16} />
        </button>
      </div>
    </div>
  )
}
