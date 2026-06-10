import { useMemo } from 'react'
import { useCatalog } from '../furniture/catalog'
import { blockedDoorItems } from '../layout/clearance'
import { findNarrowGaps, type NarrowGap } from '../layout/walkway'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

/** Clearance & fit checks: surfaces HDB door-swing blocking from the real
 *  `blockedDoorItems` check plus narrow circulation walkways from
 *  `findNarrowGaps`, with a summary and a fix-suggestion list. Clicking an issue
 *  selects + frames the offending piece(s). */
export function ClearancePanel() {
  const open = useStore((s) => s.clearancePanelOpen)
  const setOpen = useStore((s) => s.setClearancePanelOpen)
  const items = useStore((s) => s.items)
  const plan = useStore((s) => s.floorPlan)
  const catalog = useCatalog()

  // Both scans run only while the panel is open (this component stays mounted).
  const { blocked, gaps } = useMemo(() => {
    if (!open) return { blocked: [] as string[], gaps: [] as NarrowGap[] }
    return {
      blocked: blockedDoorItems(items, catalog, plan),
      gaps: findNarrowGaps(items, catalog, plan),
    }
  }, [open, items, catalog, plan])

  if (!open) return null

  const total = items.length
  const blockingCount = blocked.length
  const walkwayCount = gaps.length
  // Items in ANY issue, so the Clear count never double-discounts a piece that
  // both blocks a door and sits on a narrow walkway.
  const flagged = new Set<string>(blocked)
  for (const g of gaps) {
    flagged.add(g.a)
    if (!g.wall) flagged.add(g.b)
  }
  const clearCount = Math.max(0, total - flagged.size)
  const allClear = blockingCount === 0 && walkwayCount === 0

  const name = (id: string) => {
    const it = items.find((i) => i.id === id)
    return (it && catalog[it.defId]?.name) ?? 'Item'
  }
  const gapPartLabel = (g: NarrowGap) => (g.wall ? 'a wall' : name(g.b))

  const select = (id: string) => {
    const s = useStore.getState()
    const it = s.items.find((i) => i.id === id)
    s.selectItem(id)
    if (it) s.focusOn(it.position)
  }

  // Select both pieces of an item↔item gap (or just the item for an item↔wall
  // gap) and frame them.
  const selectGap = (g: NarrowGap) => {
    const s = useStore.getState()
    const a = s.items.find((i) => i.id === g.a)
    const b = g.wall ? undefined : s.items.find((i) => i.id === g.b)
    if (b) {
      s.setSelectedItemIds([g.a, g.b])
      if (a) s.focusOn([(a.position[0] + b.position[0]) / 2, (a.position[1] + b.position[1]) / 2])
    } else {
      s.selectItem(g.a)
      if (a) s.focusOn(a.position)
    }
  }

  return (
    <aside className="panel mini aux" id="clearancePanel" style={{ width: 340 }}>
      <div className="panel-head">
        <div>
          <div className="panel-title">Clearance checks</div>
          <div className="panel-sub">HDB 90 cm walkways</div>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close"
          onClick={() => setOpen(false)}
        >
          <Icon.Close width={16} height={16} />
        </button>
      </div>
      <hr className="hr" />
      <div className="panel-body">
        <div className="clr-summary">
          <div className="clr-stat err">
            <div className="n">{blockingCount}</div>
            <div className="l">Blocking</div>
          </div>
          <div className="clr-stat warn">
            <div className="n">{walkwayCount}</div>
            <div className="l">Walkways</div>
          </div>
          <div className="clr-stat ok">
            <div className="n">{clearCount}</div>
            <div className="l">Clear</div>
          </div>
        </div>

        {allClear ? (
          <div className="clr-allclear">
            <span className="ring">
              <Icon.Check width={22} height={22} />
            </span>
            <b style={{ fontSize: 'var(--t-sm)', color: 'var(--text)' }}>Everything fits</b>
            <span style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)', textAlign: 'center' }}>
              No item blocks a door swing, and every walkway clears the 90 cm ideal.
            </span>
          </div>
        ) : (
          <div className="clr-list">
            {blocked.map((id) => {
              const it = items.find((i) => i.id === id)
              const def = it && catalog[it.defId]
              return (
                <button type="button" key={id} className="clr-item err" onClick={() => select(id)}>
                  <div className="ci-head">
                    <span className="badge err">Blocking</span>
                    <span className="ci-title">{def?.name ?? 'Item'} blocks a door swing</span>
                  </div>
                  <div className="ci-detail">
                    This piece overlaps a door's opening arc — the door can't fully open.
                  </div>
                  <div className="ci-fix">
                    <Icon.Check width={14} height={14} />
                    Nudge it clear of the door, or lock the door open.
                  </div>
                </button>
              )
            })}
            {gaps.map((g) => (
              <button
                type="button"
                key={`${g.a}|${g.b}`}
                className="clr-item warn"
                onClick={() => selectGap(g)}
              >
                <div className="ci-head">
                  <span className="badge warn">{g.severity === 'tight' ? 'Tight' : 'Snug'}</span>
                  <span className="ci-title">
                    {name(g.a)} ↔ {gapPartLabel(g)} — {g.gap.toFixed(2)} m gap
                  </span>
                </div>
                <div className="ci-detail">
                  {g.severity === 'tight'
                    ? 'Under the 60 cm minimum — too narrow to walk through comfortably.'
                    : 'Under the 90 cm ideal — passable but a tight squeeze.'}
                </div>
                <div className="ci-fix">
                  <Icon.Check width={14} height={14} />
                  Widen the gap to at least 90 cm so people can pass with ease.
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
