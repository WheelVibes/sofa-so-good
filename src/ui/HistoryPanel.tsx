import { useMemo } from 'react'
import { buildMergedCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'
import { AuxPanelHead } from './AuxPanelHead'
import { EmptyState } from './EmptyState'
import { buildHistoryTimeline } from './historyTimeline'
import { Icon } from './toolbar/icons'

/**
 * Undo/redo history panel: a labelled timeline of every undoable step with the
 * live state marked. Clicking any row jumps straight to that state (multi-step
 * undo/redo in one move via `jumpHistory`), so you can scrub the design's
 * history without hammering Ctrl+Z. Labels are derived from the snapshot diffs
 * (`historyTimeline.ts`), so no label has to be threaded through every edit.
 */
export function HistoryPanel() {
  const open = useStore((s) => s.historyOpen)
  const setOpen = useStore((s) => s.setHistoryOpen)
  const past = useStore((s) => s.past)
  const future = useStore((s) => s.future)
  // Live state pieces that make up the "current" snapshot.
  const items = useStore((s) => s.items)
  const doors = useStore((s) => s.doors)
  const finishes = useStore((s) => s.finishes)
  const floorPlan = useStore((s) => s.floorPlan)
  const comments = useStore((s) => s.comments)
  const drawingCallouts = useStore((s) => s.drawingCallouts)
  const quoteTemplate = useStore((s) => s.quoteTemplate)
  const priceRules = useStore((s) => s.priceRules)

  // Built only while the panel is open: this component stays mounted, so without
  // the `open` guard the timeline + catalog merge would run on *every* furniture
  // edit even with the panel closed (the deps include `items`).
  const { entries, currentIndex } = useMemo(() => {
    if (!open) return { entries: [], currentIndex: 0 }
    const catalog = buildMergedCatalog(useStore.getState())
    return buildHistoryTimeline(
      past,
      { items, doors, finishes, floorPlan, comments, drawingCallouts, quoteTemplate, priceRules },
      future,
      catalog,
    )
  }, [
    open,
    past,
    future,
    items,
    doors,
    finishes,
    floorPlan,
    comments,
    drawingCallouts,
    quoteTemplate,
    priceRules,
  ])

  if (!open) return null

  const jump = (index: number) => useStore.getState().jumpHistory(index)
  const canUndo = currentIndex > 0
  const canRedo = currentIndex < entries.length - 1
  const stepCount = entries.length - 1 // transitions, not states

  return (
    <aside className="panel mini aux" id="historyPanel" style={{ width: 300 }}>
      <AuxPanelHead
        title="History"
        sub={stepCount === 0 ? 'No edits yet' : `${stepCount} step${stepCount === 1 ? '' : 's'}`}
        docs="history"
        onClose={() => setOpen(false)}
      />
      <hr className="hr" />
      <div className="panel-body">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            className="btn btn-soft btn-sm"
            style={{ flex: 1 }}
            disabled={!canUndo}
            onClick={() => useStore.getState().undo()}
          >
            <Icon.Undo width={14} height={14} />
            Undo
          </button>
          <button
            type="button"
            className="btn btn-soft btn-sm"
            style={{ flex: 1 }}
            disabled={!canRedo}
            onClick={() => useStore.getState().redo()}
          >
            <Icon.Redo width={14} height={14} />
            Redo
          </button>
        </div>

        {stepCount === 0 ? (
          <EmptyState
            icon={Icon.Versions}
            title="No edits yet"
            description="Move, add or finish something — every change lands here so you can scrub back through your design's history."
          />
        ) : (
          /* Newest first so the most recent edit is on top. */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[...entries].reverse().map((e) => (
              <button
                key={e.index}
                type="button"
                onClick={() => jump(e.index)}
                title={e.isCurrent ? 'Current state' : 'Jump to this step'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 9px',
                  borderRadius: 'var(--r-2, 8px)',
                  border: '1px solid',
                  borderColor: e.isCurrent ? 'var(--accent)' : 'transparent',
                  background: e.isCurrent ? 'var(--accent-soft, var(--surface-2))' : 'transparent',
                  color: e.isCurrent ? 'var(--text)' : 'var(--text-2)',
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: 'var(--t-sm)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    flex: '0 0 auto',
                    background: e.isCurrent ? 'var(--accent)' : 'var(--border-2)',
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {e.label}
                </span>
                {e.isCurrent ? <span className="badge ok">Now</span> : null}
              </button>
            ))}
          </div>
        )}

        {stepCount > 0 ? (
          <button
            type="button"
            className="btn ghost btn-sm btn-block"
            style={{ marginTop: 10 }}
            onClick={() => useStore.getState().clearHistory()}
          >
            <Icon.Trash width={13} height={13} />
            Clear history
          </button>
        ) : null}
      </div>
    </aside>
  )
}
