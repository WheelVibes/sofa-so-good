import { useMemo } from 'react'
import { useCatalog, useCatalogByCategory } from '../furniture/catalog'
import { itemPrice } from '../furniture/furniturePrices'
import type { FurnitureDef } from '../furniture/types'
import { useStore } from '../state/store'
import { CategoryIcon } from './catalog/CategoryIcon'
import { Modal } from './Modal'

const cm = (m: number) => Math.round(m * 100)

/** Footprint-fit verdict comparing an alternative to the piece it replaces. */
function fitBadge(cur: FurnitureDef, alt: FurnitureDef): { label: string; cls: string } {
  const dw = alt.defaultFootprint.w - cur.defaultFootprint.w
  const dd = alt.defaultFootprint.d - cur.defaultFootprint.d
  if (Math.abs(dw) < 0.03 && Math.abs(dd) < 0.03) return { label: 'Exact fit', cls: 'ok' }
  if (dw <= 0.05 && dd <= 0.05) return { label: 'Fits', cls: 'ok' }
  const over = Math.round(Math.max(dw, dd) * 100)
  return { label: `+${over} cm`, cls: 'warn' }
}

/** Swap a placed item for a same-category alternative, keeping its position and
 *  rotation. Each candidate is tagged with a footprint-fit badge. */
export function SwapModal() {
  const swapItemId = useStore((s) => s.swapItemId)
  const setSwapItemId = useStore((s) => s.setSwapItemId)
  const item = useStore((s) => s.items.find((i) => i.id === s.swapItemId) ?? null)
  const catalog = useCatalog()
  const byCategory = useCatalogByCategory()

  const def = item ? catalog[item.defId] : null

  const alternatives = useMemo(() => {
    if (!def) return []
    return (byCategory[def.category] ?? []).filter((d) => d.id !== def.id)
  }, [byCategory, def])

  if (!swapItemId || !item || !def) return null

  const swap = (altId: string) => {
    const s = useStore.getState()
    s.pushHistory()
    s.setItems(s.items.map((i) => (i.id === item.id ? { ...i, defId: altId, props: {} } : i)))
    setSwapItemId(null)
  }

  return (
    <Modal
      open
      onClose={() => setSwapItemId(null)}
      title="Swap with similar"
      sub={`${def.category} · keeps position`}
      width={560}
      panelId="swapPanel"
    >
      <div className="swap-cur">
        <div className="insp-thumb">
          <CategoryIcon category={def.category} width={22} height={22} />
        </div>
        <div className="sc-meta">
          <div className="nm">{def.name}</div>
          <div className="dims mono">
            {cm(def.defaultFootprint.w)} × {cm(def.defaultFootprint.d)} ×{' '}
            {cm(def.defaultFootprint.h)} cm
          </div>
        </div>
        <span className="badge neutral">Replacing</span>
      </div>

      {alternatives.length === 0 ? (
        <p className="empty-mini">
          <span>No other {def.category} pieces in the catalog to swap to.</span>
        </p>
      ) : (
        <div className="swap-grid">
          {alternatives.map((alt) => {
            const fit = fitBadge(def, alt)
            const price = itemPrice(alt, alt.category)
            return (
              <button type="button" key={alt.id} className="swap-card" onClick={() => swap(alt.id)}>
                <div className="card-thumb">
                  <CategoryIcon category={alt.category} width={26} height={26} />
                </div>
                <span className="nm">{alt.name}</span>
                <div className="meta">
                  <b>${price.toLocaleString('en-SG')}</b>
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
