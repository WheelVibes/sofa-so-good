import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { buildMergedCatalog } from '../furniture/catalog'
import type { FurnitureDef, FurnitureType } from '../furniture/types'
import { blockedDoorItems } from '../layout/clearance'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

/** Clearance & fit checks: surfaces HDB door-swing blocking from the real
 *  `blockedDoorItems` check, with a summary and a fix-suggestion list. Clicking
 *  an issue selects + frames the offending piece. */
export function ClearancePanel() {
  const open = useStore((s) => s.clearancePanelOpen)
  const setOpen = useStore((s) => s.setClearancePanelOpen)
  const items = useStore((s) => s.items)
  const plan = useStore((s) => s.floorPlan)
  // Catalog inputs (not the merged catalog) so the O(catalog) merge + the
  // O(items·doors) door-swing check run only while the panel is open — this
  // component stays mounted, so otherwise every furniture drag would pay for
  // both even with the panel closed.
  const catalogInputs = useStore(
    useShallow((s) => ({
      userFurniture: s.userFurniture,
      resolvedRemoteFurniture: s.resolvedRemoteFurniture,
      packFurniture: s.packFurniture,
    })),
  )

  const { blocked, catalog } = useMemo(() => {
    if (!open)
      return { blocked: [] as string[], catalog: {} as Record<FurnitureType, FurnitureDef> }
    const merged = buildMergedCatalog(catalogInputs)
    return { blocked: blockedDoorItems(items, merged, plan), catalog: merged }
  }, [open, items, plan, catalogInputs])

  if (!open) return null

  const total = items.length
  const blockingCount = blocked.length
  const clearCount = Math.max(0, total - blockingCount)

  const select = (id: string) => {
    const s = useStore.getState()
    const it = s.items.find((i) => i.id === id)
    s.selectItem(id)
    if (it) s.focusOn(it.position)
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
          <div className="clr-stat ok">
            <div className="n">{clearCount}</div>
            <div className="l">Clear</div>
          </div>
        </div>

        {blockingCount === 0 ? (
          <div className="clr-allclear">
            <span className="ring">
              <Icon.Check width={22} height={22} />
            </span>
            <b style={{ fontSize: 'var(--t-sm)', color: 'var(--text)' }}>All doors swing clear</b>
            <span style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)', textAlign: 'center' }}>
              No placed item blocks a door swing. Walkways look good.
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
          </div>
        )}
      </div>
    </aside>
  )
}
