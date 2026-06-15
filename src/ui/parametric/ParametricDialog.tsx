import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalGuard } from '../../controls/modalGuard'
import { useFeature } from '../../features/useFeature'
import { buildParametric } from '../../furniture/parametric/buildParts'
import { estimatePrice } from '../../furniture/parametric/price'
import { saveParametricAsset } from '../../furniture/parametric/saveParametric'
import {
  clampSpec,
  defaultSpec,
  PARAMETRIC_TYPE_LABEL,
  PARAMETRIC_TYPES,
  type ParametricSpec,
  type ParametricType,
  specLabel,
} from '../../furniture/parametric/spec'
import { canEditScene } from '../../state/editing'
import { firstEditableRoomId } from '../../state/rooms'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { useIsMobile } from '../useIsMobile'
import { ParametricControls } from './ParametricControls'
import { ParametricPreview } from './ParametricPreview'

/**
 * Parametric furniture generator (PF2) — pick a type (bookshelf / wardrobe /
 * sideboard / desk), set exact dimensions + options (incl. per-bay compartment
 * style: open / door / drawer), preview live, then save into the catalog as a
 * regular user item (and optionally arm placement). Each generate creates a NEW
 * catalog def; identical specs de-dupe by content hash.
 */
export function ParametricDialog() {
  const open = useStore((s) => s.parametricOpen)
  const enabled = useFeature('parametricFurniture')
  const kitchenEnabled = useFeature('kitchenCabinets')
  // Price displays are gated behind the budget/price feature (off by default).
  const priceOn = useFeature('budget')
  const isMobile = useIsMobile()
  const close = () => useStore.getState().setParametricOpen(false)

  const [spec, setSpec] = useState<ParametricSpec>(() => defaultSpec('bookshelf'))
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  // Reset to a fresh bookshelf each time the dialog opens.
  useEffect(() => {
    if (open) {
      setSpec(defaultSpec('bookshelf'))
      setName('')
      setBusy(false)
    }
  }, [open])

  // Modal-style overlay that doesn't build on `Modal` → register with the
  // guard itself so global hotkeys are suppressed while open.
  useModalGuard(open && enabled)
  // Esc closes (the guard suppresses global handlers, not this one).
  useEffect(() => {
    if (!open || !enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.getState().setParametricOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, enabled])

  // Derived part model — drives the option captions + the price estimate.
  // (The preview rebuilds it with the meshes; both go through clampSpec.)
  const model = useMemo(() => buildParametric(spec), [spec])
  const price = useMemo(() => estimatePrice(model), [model])

  if (!open || !enabled) return null

  const selectType = (type: ParametricType) => {
    if (type !== spec.type) setSpec(defaultSpec(type))
  }
  const patch = (p: Partial<ParametricSpec>) => setSpec((s) => clampSpec({ ...s, ...p }))

  const save = async (place: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await saveParametricAsset(spec, name)
      const notify = useStore.getState().notify
      if (!res.ok) {
        notify.start({ title: `Couldn't save: ${res.reason}`, kind: 'error' })
        return
      }
      notify.start({
        title: res.duplicate
          ? 'That piece is already in your catalog'
          : `Saved "${res.def.name}" to your catalog`,
        kind: res.duplicate ? 'info' : 'success',
      })
      close()
      if (place) {
        // Same flow as the ⌘K "Add furniture" commands: dive into a room if
        // we're in the view-only overview, then arm click-to-place.
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
        className="panel parametric-dialog"
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
          <div className="panel-title">Custom-size furniture</div>
          <button type="button" className="icon-btn" aria-label="Close generator" onClick={close}>
            <Icon.Close width={16} height={16} />
          </button>
        </div>
        <div className="tabs">
          {PARAMETRIC_TYPES.filter((t) => t !== 'kitchen-run' || kitchenEnabled).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => selectType(t)}
              className={`tab${spec.type === t ? ' on' : ''}`}
            >
              {PARAMETRIC_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        {/* Side-by-side on desktop; stacked (preview on top) on mobile. */}
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
            <ParametricPreview spec={spec} />
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
            <ParametricControls spec={spec} model={model} onChange={patch} />
            <div className="sec">
              <div className="sec-h">
                <span>Add to catalog</span>
              </div>
              <input
                className="input"
                value={name}
                aria-label="Item name"
                onChange={(e) => setName(e.target.value)}
                placeholder={specLabel(spec)}
                style={{ width: '100%', marginBottom: 'var(--s-2)' }}
              />
              {priceOn ? (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: 'var(--s-2)',
                      fontSize: 'var(--t-xs)',
                    }}
                  >
                    <span style={{ color: 'var(--text-3)' }}>Estimated price</span>
                    <span className="mono">~S${price}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--t-2xs)',
                      color: 'var(--text-3)',
                      marginBottom: 'var(--s-2)',
                    }}
                  >
                    A rough flat-pack material estimate — not a quote. It rides into the budget like
                    any catalog price.
                  </div>
                </>
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
