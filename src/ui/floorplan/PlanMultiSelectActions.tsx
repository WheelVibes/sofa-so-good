import { canPlace, itemFootprint } from '../../collision/placement'
import { placementWalls } from '../../collision/placementWalls'
import { useCatalog } from '../../furniture/catalog'
import {
  alignCenter,
  alignEdge,
  distributeEvenGaps,
  obbAxisHalf,
} from '../../layout/alignDistribute'
import { mirrorSelectionX } from '../../layout/selectionActions'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'

/**
 * Align / distribute / mirror actions for a multi-furniture plan selection
 * (PARITY-PLAN-ALIGN). Surfaced by `PlanInspector` when a marquee selects 2+
 * furniture items on the 2D plan (`selectedItemIds.length > 1`, no wall primary).
 *
 * This is pure WIRING of the SAME render-agnostic ops the 3D `MultiSelectPanel`
 * uses — `layout/alignDistribute.ts` (align/distribute maths) and
 * `layout/selectionActions.ts` `mirrorSelectionX` (all-or-nothing reflection).
 * Plan positions ARE world XZ, so no coordinate change is needed; each action is
 * one undo step and `canPlace`-checked per item (locked items are skipped to
 * match every other bulk path). Align/distribute/mirror are ungated core ops in
 * 3D (they ride only on `canEditScene`, no feature flag), so the plan surface is
 * kept consistent and rides only on the `floorPlanEditor` flag the editor already
 * gates on — available in BOTH Simple and Pro.
 */
export function PlanMultiSelectActions({ levelId }: { levelId?: string }) {
  const count = useStore((s) => s.selectedItemIds.length)
  const catalog = useCatalog()

  // Collision-checked single move (one of many inside a pushed history step).
  const tryMove = (id: string, pos: [number, number]) => {
    const s = useStore.getState()
    const it = s.items.find((i) => i.id === id)
    const def = it && catalog[it.defId]
    if (!it || !def) return
    if (
      canPlace({ ...it, position: pos }, def, {
        others: s.items.filter((o) => o.id !== id),
        defs: catalog,
        doors: s.doors,
        walls: placementWalls(s, it.levelId ?? levelId),
      })
    )
      s.moveItem(id, pos)
  }

  const unlockedSel = () => {
    const s = useStore.getState()
    return s.items.filter((i) => s.selectedItemIds.includes(i.id) && !i.locked)
  }

  // Align centres to the mean centre along one axis (0 = X, 1 = Z).
  const align = (axis: 0 | 1) => {
    const sel = unlockedSel()
    const target = alignCenter(sel.map((it) => ({ id: it.id, center: it.position[axis], half: 0 })))
    if (target === null) return
    useStore.getState().pushHistory()
    for (const it of sel) {
      const pos: [number, number] = axis === 0 ? [target, it.position[1]] : [it.position[0], target]
      tryMove(it.id, pos)
    }
  }

  // Footprint-aware edge alignment (OBB → projected half), `min` near / `max` far.
  const edge = (axis: 0 | 1, side: 'min' | 'max') => {
    const sel = unlockedSel()
    const boxes = sel.flatMap((it) => {
      const def = catalog[it.defId]
      if (!def) return []
      const obb = itemFootprint(it, def)
      return [
        { id: it.id, center: it.position[axis], half: obbAxisHalf(obb.hx, obb.hz, obb.rot, axis) },
      ]
    })
    const next = alignEdge(boxes, side)
    if (next.size === 0) return
    useStore.getState().pushHistory()
    for (const it of sel) {
      const v = next.get(it.id)
      if (v === undefined || v === it.position[axis]) continue
      tryMove(it.id, axis === 0 ? [v, it.position[1]] : [it.position[0], v])
    }
  }

  // Even edge-to-edge gap distribution (n<3 is a no-op via `distributeEvenGaps`).
  const distribute = (axis: 0 | 1) => {
    const sel = unlockedSel()
    const boxes = sel.flatMap((it) => {
      const def = catalog[it.defId]
      if (!def) return []
      const obb = itemFootprint(it, def)
      return [
        { id: it.id, center: it.position[axis], half: obbAxisHalf(obb.hx, obb.hz, obb.rot, axis) },
      ]
    })
    const { positions, clamped } = distributeEvenGaps(boxes)
    if (positions.size === 0) return
    const s = useStore.getState()
    s.pushHistory()
    for (const it of sel) {
      const v = positions.get(it.id)
      if (v === undefined || v === it.position[axis]) continue
      tryMove(it.id, axis === 0 ? [v, it.position[1]] : [it.position[0], v])
    }
    if (clamped) {
      s.notify.start({
        title: 'Items touch — selection is too wide to fit with gaps',
        kind: 'info',
      })
    }
  }

  // Mirror the whole selection left↔right across its own centre (all-or-nothing,
  // collision-checked) — shared with the 3D panel + command palette.
  const mirror = () => mirrorSelectionX(catalog)

  return (
    <div className="space-y-2">
      <div className="sec-h">
        <span>{count} items selected</span>
      </div>

      <div className="sec" style={{ borderTop: 'none', paddingTop: 0 }}>
        <div className="sec-h">
          <span>Align centres</span>
        </div>
        <div className="action-grid two">
          <button type="button" className="act" onClick={() => align(0)}>
            <Icon.AlignX width={16} height={16} />
            Align X
          </button>
          <button type="button" className="act" onClick={() => align(1)}>
            <Icon.AlignZ width={16} height={16} />
            Align Z
          </button>
        </div>
      </div>

      <div className="sec">
        <div className="sec-h">
          <span>Align edges</span>
        </div>
        <div className="action-grid two">
          <button type="button" className="act" onClick={() => edge(0, 'min')}>
            <Icon.AlignX width={16} height={16} />
            Left
          </button>
          <button type="button" className="act" onClick={() => edge(0, 'max')}>
            <Icon.AlignX width={16} height={16} />
            Right
          </button>
          <button type="button" className="act" onClick={() => edge(1, 'min')}>
            <Icon.AlignZ width={16} height={16} />
            Top
          </button>
          <button type="button" className="act" onClick={() => edge(1, 'max')}>
            <Icon.AlignZ width={16} height={16} />
            Bottom
          </button>
        </div>
      </div>

      <div className="sec">
        <div className="sec-h">
          <span>Distribute evenly</span>
        </div>
        <div className="action-grid two">
          <button type="button" className="act" onClick={() => distribute(0)}>
            <Icon.Distribute width={16} height={16} />
            Across X
          </button>
          <button type="button" className="act" onClick={() => distribute(1)}>
            <Icon.Distribute width={16} height={16} />
            Across Z
          </button>
        </div>
        <button
          type="button"
          className="act"
          style={{ marginTop: 'var(--s-2)', width: '100%' }}
          onClick={mirror}
          title="Mirror the selection left↔right across its centre"
        >
          <Icon.FlipH width={16} height={16} />
          Mirror
        </button>
      </div>

      <button
        type="button"
        className="btn btn-soft btn-block"
        onClick={() => useStore.getState().selectItem(null)}
      >
        Clear selection
      </button>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
        Marquee-drag on empty canvas to select multiple pieces. Locked items are left in place.
      </p>
    </div>
  )
}
