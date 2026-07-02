import { useStore } from '../state/store'
import { Modal } from './Modal'
import { planStyleApply, STYLE_PRESETS, type StyleDef } from './styling/styleTransfer'

/**
 * One-tap style transfer modal.
 *
 * A grid of curated interior styles; tapping "Apply" swaps every room's floor +
 * wall finish (one undo step via `applyHomeStyle`) and sets the master colour
 * palette. All finishes are builtin procedural/CC0 → no downloads, prod-safe.
 * The mapping lives in the pure, unit-tested `styling/styleTransfer.ts`.
 */
export function StyleTransferModal() {
  const open = useStore((s) => s.styleTransferOpen)
  const setOpen = useStore((s) => s.setStyleTransferOpen)

  const apply = (style: StyleDef) => {
    const plan = planStyleApply(style.id)
    if (!plan) return
    const s = useStore.getState()
    s.applyHomeStyle(plan.floorFinishId, plan.wallFinishId, plan.palette)
    s.notify.start({
      title: `Applied “${style.name}”`,
      message: 'Floors, walls & palette updated.',
      kind: 'success',
      // The whole-home swap is a single undo step (applyHomeStyle) — offer it
      // inline so a mistaken style is one tap to revert.
      autoDismissMs: 8000,
      actionLabel: 'Undo',
      onAction: () => useStore.getState().undo(),
    })
    setOpen(false)
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Style transfer"
      sub="One tap restyles every room's floors, walls & palette"
      width="var(--modal-lg)"
      panelId="style-transfer"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 'var(--s-3)',
        }}
      >
        {STYLE_PRESETS.map((style) => (
          <div
            key={style.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: 'var(--s-3)',
              borderRadius: 'var(--r-2)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{style.name}</div>
            <div
              className="panel-sub"
              style={{
                textTransform: 'none',
                letterSpacing: 0,
                fontSize: 'var(--t-xs)',
                lineHeight: 1.35,
                minHeight: 34,
              }}
            >
              {style.description}
            </div>
            {/* Palette swatch row */}
            <div style={{ display: 'flex', gap: 4 }} aria-hidden>
              {style.palette.map((hex, i) => (
                <span
                  key={`${style.id}-${i}`}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 5,
                    background: hex,
                    border: '1px solid var(--border)',
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="btn btn-accent btn-sm"
              style={{ marginTop: 4 }}
              onClick={() => apply(style)}
            >
              Apply
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
