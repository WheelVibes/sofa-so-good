import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalGuard } from '../../controls/modalGuard'
import { useFeature } from '../../features/useFeature'
import { composeProduct } from '../../furniture/configurator/compose'
import { clampConfig, offeredOptions, productLabel } from '../../furniture/configurator/model'
import {
  CONFIGURABLE_PRODUCTS,
  getConfigurableProduct,
} from '../../furniture/configurator/products'
import { saveConfiguredAsset } from '../../furniture/configurator/saveConfigured'
import { canEditScene } from '../../state/editing'
import { firstEditableRoomId } from '../../state/rooms'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { useIsMobile } from '../useIsMobile'
import { ConfiguratorPreview } from './ConfiguratorPreview'

type Selections = Record<string, string | null>

/**
 * Slot-based product configurator dialog (SLOT-105). Pick a product (mattress
 * on frame / modular sofa), choose one option per slot, preview live with a
 * running price, then bake into the catalog as a regular user item (and
 * optionally arm placement). A structural clone of `ParametricDialog`.
 */
export function ConfiguratorDialog() {
  const open = useStore((s) => s.configuratorOpen)
  const enabled = useFeature('productConfigurator')
  const priceOn = useFeature('budget')
  const isMobile = useIsMobile()
  const close = () => useStore.getState().setConfiguratorOpen(false)

  const [productId, setProductId] = useState(CONFIGURABLE_PRODUCTS[0].id)
  const product = getConfigurableProduct(productId) ?? CONFIGURABLE_PRODUCTS[0]
  const [selections, setSelections] = useState<Selections>(
    () => clampConfig(CONFIGURABLE_PRODUCTS[0], null).selections,
  )
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  // Reset to the first product, default selections, each time the dialog opens.
  useEffect(() => {
    if (open) {
      const p = CONFIGURABLE_PRODUCTS[0]
      setProductId(p.id)
      setSelections(clampConfig(p, null).selections)
      setName('')
      setBusy(false)
    }
  }, [open])

  useModalGuard(open && enabled)
  useEffect(() => {
    if (!open || !enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.getState().setConfiguratorOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, enabled])

  // Always clamp so the spec is valid (constraints resolved); preview + price
  // read from the same composition the bake uses.
  const spec = useMemo(
    () => clampConfig(product, { productId: product.id, selections }),
    [product, selections],
  )
  const composed = useMemo(() => composeProduct(product, spec), [product, spec])

  if (!open || !enabled) return null

  const selectProduct = (id: string) => {
    if (id === productId) return
    const p = getConfigurableProduct(id)
    if (!p) return
    setProductId(id)
    setSelections(clampConfig(p, null).selections)
  }
  const pick = (slotId: string, optionId: string | null) => {
    setSelections(
      (s) => clampConfig(product, { selections: { ...s, [slotId]: optionId } }).selections,
    )
  }

  const save = async (place: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await saveConfiguredAsset(product, spec, name)
      const notify = useStore.getState().notify
      if (!res.ok) {
        notify.start({ title: `Couldn't save: ${res.reason}`, kind: 'error' })
        return
      }
      notify.start({
        title: res.duplicate
          ? 'That product is already in your catalog'
          : `Saved "${res.def.name}" to your catalog`,
        kind: res.duplicate ? 'info' : 'success',
      })
      close()
      if (place) {
        const st = useStore.getState()
        if (!canEditScene(st)) {
          const id = firstEditableRoomId(st.floorPlan)
          if (id) st.enterRoomEditor(id)
        }
        useStore.getState().setCatalogOpen(false)
        useStore.getState().setActiveDefId(res.def.id)
      }
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={close}>
      <div
        className="panel configurator-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: isMobile ? '100vw' : 'min(880px, 94vw)',
          height: isMobile ? '100dvh' : 'min(620px, 92vh)',
          maxWidth: 'none',
          maxHeight: 'none',
          borderRadius: isMobile ? 0 : undefined,
        }}
      >
        <div className="panel-head">
          <div className="panel-title">Configure a product</div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close configurator"
            onClick={close}
          >
            <Icon.Close width={16} height={16} />
          </button>
        </div>
        <div className="tabs">
          {CONFIGURABLE_PRODUCTS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectProduct(p.id)}
              className={`tab${product.id === p.id ? ' on' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 'var(--s-3)',
            flex: 1,
            minHeight: 0,
          }}
        >
          <div
            style={{
              flex: isMobile ? '0 0 34vh' : '1 1 55%',
              minWidth: 0,
              minHeight: 0,
              borderRadius: 'var(--r-2)',
              overflow: 'hidden',
              background: 'var(--scene-b)',
            }}
          >
            <ConfiguratorPreview product={product} spec={spec} />
          </div>
          <div
            className="panel-body"
            style={{
              flex: isMobile ? '1 1 auto' : '1 1 45%',
              minWidth: 0,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {product.slots.map((slot) => {
              const current = spec.selections[slot.id] ?? null
              return (
                <div className="sec" key={slot.id}>
                  <div className="sec-h">
                    <span>{slot.label}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-1)' }}>
                    {slot.optional ? (
                      <button
                        type="button"
                        className={`btn btn-sm${current === null ? ' btn-accent' : ' btn-soft'}`}
                        onClick={() => pick(slot.id, null)}
                      >
                        None
                      </button>
                    ) : null}
                    {offeredOptions(slot).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`btn btn-sm${current === o.id ? ' btn-accent' : ' btn-soft'}`}
                        onClick={() => pick(slot.id, o.id)}
                        title={priceOn ? `+S$${o.price}` : undefined}
                      >
                        {o.label}
                        {priceOn ? ` · S$${o.price}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            <div className="sec">
              <div className="sec-h">
                <span>Add to catalog</span>
              </div>
              <input
                className="input"
                value={name}
                aria-label="Item name"
                onChange={(e) => setName(e.target.value)}
                placeholder={productLabel(product, spec)}
                style={{ width: '100%', marginBottom: 'var(--s-2)' }}
              />
              {priceOn ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 'var(--s-2)',
                    fontSize: 'var(--t-xs)',
                  }}
                >
                  <span style={{ color: 'var(--text-3)' }}>Configured price</span>
                  <span className="mono">S${composed.price}</span>
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                <button
                  type="button"
                  className="btn btn-accent"
                  style={{ flex: 1 }}
                  disabled={busy}
                  onClick={() => save(true)}
                >
                  {busy ? 'Saving…' : 'Add to room'}
                </button>
                <button
                  type="button"
                  className="btn btn-soft"
                  style={{ flex: 1 }}
                  disabled={busy}
                  onClick={() => save(false)}
                >
                  Save to catalog
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
