import { useMemo } from 'react'
import { useCatalog } from '../furniture/catalog'
import { itemsCost } from '../furniture/itemsCost'
import { useStore } from '../state/store'

/**
 * A small always-on budget pill, shown only once the user has set a budget
 * target (Budget panel) and is in an orbit view. Keeps spend-vs-target in view
 * while arranging — a commercial "stay on budget" aid — without opening the
 * Budget panel. Green when under, red when over. Hidden in walk mode (the walk
 * HUD owns the bottom-centre) and when no target is set.
 */
export function BudgetHud() {
  const target = useStore((s) => s.budgetTarget)
  const cameraMode = useStore((s) => s.cameraMode)
  // The 2D floor-plan editor is a full-screen mode (still on the orbit camera)
  // that hides the rest of the chrome — don't float the pill over it.
  const floorPlanEditing = useStore((s) => s.floorPlanEditing)
  const items = useStore((s) => s.items)
  const catalog = useCatalog()

  const spent = useMemo(() => itemsCost(items, catalog), [items, catalog])

  if (target == null || cameraMode !== 'orbit' || floorPlanEditing) return null
  const over = spent > target
  const pct = Math.min(100, Math.round((spent / target) * 100))
  const fmt = (n: number) => `$${n.toLocaleString('en-SG')}`

  return (
    <button
      type="button"
      className={`budget-hud${over ? ' over' : ''}`}
      title="Estimated spend vs your budget target — open the Shopping list"
      onClick={() => {
        if (!useStore.getState().budgetOpen) useStore.getState().toggleBudget()
      }}
    >
      <div className="budget-hud-row">
        <span className="budget-hud-spent mono">{fmt(spent)}</span>
        <span className="budget-hud-target mono">/ {fmt(target)}</span>
        <span className="budget-hud-delta">
          {over ? `+${fmt(spent - target)}` : `${fmt(target - spent)} left`}
        </span>
      </div>
      <div className="budget-hud-bar">
        <div className="budget-hud-fill" style={{ width: `${pct}%` }} />
      </div>
    </button>
  )
}
