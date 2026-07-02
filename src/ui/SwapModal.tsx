import { useMemo } from 'react'
import { useFeature } from '../features/useFeature'
import { useCatalog } from '../furniture/catalog'
import { itemPrice } from '../furniture/furniturePrices'
import { similarItems } from '../furniture/similarItems'
import type { FurnitureDef } from '../furniture/types'
import { useStore } from '../state/store'
import { formatDimsShort, type UnitSystem } from '../utils/measurement'
import { CategoryIcon } from './catalog/CategoryIcon'
import { EmptyState } from './EmptyState'
import { Modal } from './Modal'
import { Icon } from './toolbar/icons'

/** Footprint-fit verdict comparing an alternative to the piece it replaces. */
function fitBadge(
  cur: FurnitureDef,
  alt: FurnitureDef,
  units: UnitSystem,
): { label: string; cls: string } {
  const dw = alt.defaultFootprint.w - cur.defaultFootprint.w
  const dd = alt.defaultFootprint.d - cur.defaultFootprint.d
  if (Math.abs(dw) < 0.03 && Math.abs(dd) < 0.03) return { label: 'Exact fit', cls: 'ok' }
  if (dw <= 0.05 && dd <= 0.05) return { label: 'Fits', cls: 'ok' }
  const overM = Math.max(dw, dd)
  const over =
    units === 'imperial' ? `${Math.round(overM / 0.0254)}″` : `${Math.round(overM * 100)} cm`
  return { label: `+${over}`, cls: 'warn' }
}

/**
 * Replace-with-similar picker (PARITY-REPLACE). Swap a placed item for a
 * same-category catalog alternative, keeping its position, rotation and level.
 * Candidates are ranked nearest-footprint-first by the pure `similarItems` core
 * and each is tagged with a footprint-fit badge. The commit goes through the
 * `replaceItemDef` store action (one undo step; resets def-specific props).
 *
 * Shared single mount (App), so it works identically in the desktop and mobile
 * inspectors. Flag-gated by `replaceSimilar` (pro tier → hidden in Simple mode).
 */
export function SwapModal() {
  const on = useFeature('replaceSimilar')
  // Price displays are gated behind the budget/price feature (off by default).
  const priceOn = useFeature('budget')
  const swapItemId = useStore((s) => s.swapItemId)
  const setSwapItemId = useStore((s) => s.setSwapItemId)
  const item = useStore((s) => s.items.find((i) => i.id === s.swapItemId) ?? null)
  const catalog = useCatalog()
  const units = useStore((s) => s.units)

  const def = item ? catalog[item.defId] : null

  const alternatives = useMemo(
    () =>
      def
        ? similarItems(def.id, catalog)
            .map((id) => catalog[id])
            .filter((d): d is FurnitureDef => !!d)
        : [],
    [catalog, def],
  )

  // Gate after all hooks so hook order stays stable.
  if (!on || !swapItemId || !item || !def) return null

  const replace = (altId: string) => {
    useStore.getState().replaceItemDef(item.id, altId)
    setSwapItemId(null)
  }

  return (
    <Modal
      open
      onClose={() => setSwapItemId(null)}
      title="Replace with similar"
      sub={`${def.category} · keeps position`}
      width="var(--modal-md)"
      panelId="swapPanel"
    >
      <div className="swap-cur">
        <div className="insp-thumb">
          <CategoryIcon category={def.category} width={22} height={22} />
        </div>
        <div className="sc-meta">
          <div className="nm">{def.name}</div>
          <div className="dims mono">
            {formatDimsShort(
              [def.defaultFootprint.w, def.defaultFootprint.d, def.defaultFootprint.h],
              units,
            )}
          </div>
        </div>
        <span className="badge neutral">Replacing</span>
      </div>

      {alternatives.length === 0 ? (
        <EmptyState
          icon={Icon.Catalog}
          title="No alternatives"
          description={`There are no other ${def.category} pieces in the catalog to swap with.`}
        />
      ) : (
        <div className="swap-grid">
          {alternatives.map((alt) => {
            const fit = fitBadge(def, alt, units)
            const price = priceOn ? itemPrice(alt, alt.category) : null
            return (
              <button
                type="button"
                key={alt.id}
                className="swap-card"
                onClick={() => replace(alt.id)}
              >
                <div className="card-thumb">
                  <CategoryIcon category={alt.category} width={26} height={26} />
                </div>
                <span className="nm">{alt.name}</span>
                <div className="meta">
                  {price !== null ? <b>${price.toLocaleString('en-SG')}</b> : null}
                  <span className={`fittag badge ${fit.cls}`}>{fit.label}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
