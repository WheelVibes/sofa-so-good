import { useMemo, useState } from 'react'
import { buildMergedCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'
import { AuxPanelHead } from './AuxPanelHead'
import { Button } from './controls/Button'
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
  const [filter, setFilter] = useState('')
  const open = useStore((s) => s.historyOpen)
  const setOpen = useStore((s) => s.setHistoryOpen)
  const past = useStore((s) => s.past)
  const future = useStore((s) => s.future)
  // Live state pieces that make up the "current" snapshot.
  const items = useStore((s) => s.items)
  const doors = useStore((s) => s.doors)
  const finishes = useStore((s) => s.finishes)
  const floorPlan = useStore((s) => s.floorPlan)
  const baselinePlan = useStore((s) => s.baselinePlan)
  const comments = useStore((s) => s.comments)
  const drawingCallouts = useStore((s) => s.drawingCallouts)
  const quoteTemplate = useStore((s) => s.quoteTemplate)
  const drawingSetTemplate = useStore((s) => s.drawingSetTemplate)
  const priceRules = useStore((s) => s.priceRules)
  const masterPalette = useStore((s) => s.masterPalette)
  const roomPalettes = useStore((s) => s.roomPalettes)

  // Built only while the panel is open: this component stays mounted, so without
  // the `open` guard the timeline + catalog merge would run on *every* furniture
  // edit even with the panel closed (the deps include `items`).
  const { entries, currentIndex } = useMemo(() => {
    if (!open) return { entries: [], currentIndex: 0 }
    const catalog = buildMergedCatalog(useStore.getState())
    return buildHistoryTimeline(
      past,
      {
        items,
        doors,
        finishes,
        floorPlan,
        baselinePlan,
        comments,
        drawingCallouts,
        quoteTemplate,
        drawingSetTemplate,
        priceRules,
        masterPalette,
        roomPalettes,
      },
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
    baselinePlan,
    comments,
    drawingCallouts,
    quoteTemplate,
    drawingSetTemplate,
    priceRules,
    masterPalette,
    roomPalettes,
  ])

  if (!open) return null

  const jump = (index: number) => useStore.getState().jumpHistory(index)
  const canUndo = currentIndex > 0
  const canRedo = currentIndex < entries.length - 1
  const stepCount = entries.length - 1 // transitions, not states
  const q = filter.trim().toLowerCase()
  const shown = [...entries].reverse().filter((e) => e.label.toLowerCase().includes(q))

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
          <Button
            variant="soft"
            size="sm"
            style={{ flex: 1 }}
            disabled={!canUndo}
            title={canUndo ? undefined : 'Nothing to undo'}
            onClick={() => useStore.getState().undo()}
            icon={<Icon.Undo width={14} height={14} />}
          >
            Undo
          </Button>
          <Button
            variant="soft"
            size="sm"
            style={{ flex: 1 }}
            disabled={!canRedo}
            title={canRedo ? undefined : 'Nothing to redo'}
            onClick={() => useStore.getState().redo()}
            icon={<Icon.Redo width={14} height={14} />}
          >
            Redo
          </Button>
        </div>

        {stepCount === 0 ? (
          <EmptyState
            icon={Icon.Versions}
            title="No edits yet"
            description="Move, add or finish something — every change lands here so you can scrub back through your design's history."
          />
        ) : (
          <>
            <div className="cat-search" style={{ marginBottom: 'var(--s-2)' }}>
              <div className="field">
                <Icon.Search width={16} height={16} className="icn" />
                <input
                  type="search"
                  className="input"
                  aria-label="Filter history steps"
                  placeholder={`Filter ${stepCount} steps…`}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            </div>
            {q && shown.length === 0 ? (
              <EmptyState
                icon={Icon.Versions}
                title="No matching steps"
                description={`Nothing matches "${filter.trim()}".`}
                cta={{ label: 'Clear filter', onClick: () => setFilter('') }}
              />
            ) : (
              /* Newest first so the most recent edit is on top. */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {shown.map((e) => (
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
                      background: e.isCurrent
                        ? 'var(--accent-soft, var(--surface-2))'
                        : 'transparent',
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
          </>
        )}

        {stepCount > 0 ? (
          <Button
            className="ghost"
            size="sm"
            block
            style={{ marginTop: 10 }}
            onClick={() => useStore.getState().clearHistory()}
            icon={<Icon.Trash width={13} height={13} />}
          >
            Clear history
          </Button>
        ) : null}
      </div>
    </aside>
  )
}
