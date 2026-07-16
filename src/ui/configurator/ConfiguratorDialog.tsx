import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalGuard } from '../../controls/modalGuard'
import { useFeature } from '../../features/useFeature'
import { composeProduct } from '../../furniture/configurator/compose'
import { parseConfiguredSpec } from '../../furniture/configurator/configuredPersist'
import {
  type ConfigurableProduct,
  clampConfig,
  offeredOptions,
  productLabel,
} from '../../furniture/configurator/model'
import {
  CONFIGURABLE_PRODUCTS,
  visibleConfigurableProducts,
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
  // Authored products + the user's own exported configurable products (Stage 3d).
  // Pets products follow the catalog's `petFittings` gate — the configurator is a
  // separate surface, so it must apply the same category gating itself.
  const petsOn = useFeature('petFittings')
  const userProducts = useStore((s) => s.userConfigurableProducts)
  const allProducts = useMemo<ConfigurableProduct[]>(
    () => visibleConfigurableProducts([...CONFIGURABLE_PRODUCTS, ...userProducts], petsOn),
    [userProducts, petsOn],
  )
  const resolveProduct = (id: string): ConfigurableProduct | null =>
    allProducts.find((p) => p.id === id) ?? null
  const close = () => {
    const st = useStore.getState()
    st.setConfiguratorOpen(false)
    // Consume the edit recipe on close (not in the open-effect, which React
    // StrictMode double-invokes — clearing it there made the second run reset to
    // the default product instead of the seeded one).
    st.setConfiguratorEditSpec(null)
  }

  const [productId, setProductId] = useState(CONFIGURABLE_PRODUCTS[0].id)
  const product = resolveProduct(productId) ?? CONFIGURABLE_PRODUCTS[0]
  const [selections, setSelections] = useState<Selections>(
    () => clampConfig(CONFIGURABLE_PRODUCTS[0], null).selections,
  )
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  // On open: seed from an edit recipe if one was set (SLOT-204 — re-editing a
  // placed configured product), else a fresh first product. The edit spec is
  // consumed (cleared) so a later fresh open doesn't re-seed.
  useEffect(() => {
    if (!open) return
    const editJson = useStore.getState().configuratorEditSpec
    let seeded = false
    // Parse through the shared versioned envelope (Stage 3a) — handles both the
    // new `{ kind:'configured', … }` envelope and legacy raw-JSON blobs; returns
    // null (→ fresh product) for anything malformed.
    const parsed = parseConfiguredSpec(editJson)
    if (parsed) {
      // Resolve over authored + user products via getState (keeps the effect's
      // deps `[open]` — `resolveProduct` is a per-render closure).
      const products = [...CONFIGURABLE_PRODUCTS, ...useStore.getState().userConfigurableProducts]
      const p = products.find((x) => x.id === parsed.productId) ?? null
      if (p) {
        setProductId(p.id)
        setSelections(clampConfig(p, { selections: parsed.selections }).selections)
        seeded = true
      }
    }
    if (!seeded) {
      const p = CONFIGURABLE_PRODUCTS[0]
      setProductId(p.id)
      setSelections(clampConfig(p, null).selections)
    }
    setName('')
    setBusy(false)
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
    const p = resolveProduct(id)
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
    } catch (err) {
      // A GLB slot option that fails to load rejects the bake (buildObject fails
      // loud on the bake path) — surface it instead of persisting a phantom asset.
      useStore.getState().notify.start({
        title: "Couldn't build this product",
        message: err instanceof Error ? err.message : 'A part failed to load.',
        kind: 'error',
      })
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
          {allProducts.map((p) => (
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
