import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { findItemOverlaps, findWallClips, type OverlapPair } from '../collision/placement'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { isDefaultPlan, planCollisionWalls } from '../floorplan/planGeometry'
import { buildMergedCatalog } from '../furniture/catalog'
import type { FurnitureDef, FurnitureType } from '../furniture/types'
import { blockedDoorItems } from '../layout/clearance'
import { findNarrowGaps, type NarrowGap } from '../layout/walkway'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

/** Clearance & fit checks: surfaces HDB door-swing blocking (`blockedDoorItems`),
 *  furniture-vs-furniture overlaps (`findItemOverlaps`), and pieces embedded in a
 *  wall (`findWallClips`), with a summary and a fix-suggestion list. Clicking an
 *  issue selects + frames the offending piece(s). */
export function ClearancePanel() {
  const open = useStore((s) => s.clearancePanelOpen)
  const setOpen = useStore((s) => s.setClearancePanelOpen)
  const items = useStore((s) => s.items)
  const plan = useStore((s) => s.floorPlan)
  const doors = useStore((s) => s.doors)
  // Catalog inputs (not the merged catalog) so the O(catalog) merge + the
  // door-swing / overlap / wall-clip scans run only while the panel is open —
  // this component stays mounted, so otherwise every furniture drag would pay
  // for them even with the panel closed.
  const catalogInputs = useStore(
    useShallow((s) => ({
      userFurniture: s.userFurniture,
      resolvedRemoteFurniture: s.resolvedRemoteFurniture,
      packFurniture: s.packFurniture,
    })),
  )

  const { blocked, overlaps, wallClips, narrowGaps, catalog } = useMemo(() => {
    if (!open)
      return {
        blocked: [] as string[],
        overlaps: [] as OverlapPair[],
        wallClips: [] as string[],
        narrowGaps: [] as NarrowGap[],
        catalog: {} as Record<FurnitureType, FurnitureDef>,
      }
    const merged = buildMergedCatalog(catalogInputs)
    // Whole-plan collision walls (not the room-editor subset) so the check has
    // the same scope as the panel — default flat builds the fixed walls.
    const walls = isDefaultPlan(plan) ? buildCollisionWalls(doors) : planCollisionWalls(plan, doors)
    return {
      blocked: blockedDoorItems(items, merged, plan),
      overlaps: findItemOverlaps(items, merged),
      wallClips: findWallClips(items, merged, walls),
      narrowGaps: findNarrowGaps(items, merged, plan),
      catalog: merged,
    }
  }, [open, items, plan, doors, catalogInputs])

  if (!open) return null

  const total = items.length
  const blockingCount = blocked.length
  const overlapCount = overlaps.length
  const wallClipCount = wallClips.length
  const narrowCount = narrowGaps.length
  // Items involved in ANY issue — so the "Clear" count never double-discounts a
  // piece that both blocks a door and overlaps a neighbour (or sits in a wall).
  const flagged = new Set<string>([...blocked, ...wallClips])
  for (const o of overlaps) {
    flagged.add(o.a)
    flagged.add(o.b)
  }
  const clearCount = Math.max(0, total - flagged.size)
  const allClear =
    blockingCount === 0 && overlapCount === 0 && wallClipCount === 0 && narrowCount === 0

  // Human label for a narrow-gap participant (a second item, or a wall).
  const gapPartner = (b: string) => (b.startsWith('wall:') ? 'a wall' : name(b))
  const selectGap = (g: NarrowGap) => {
    const s = useStore.getState()
    if (g.wall) {
      select(g.a)
      return
    }
    const a = s.items.find((i) => i.id === g.a)
    const b = s.items.find((i) => i.id === g.b)
    s.setSelectedItemIds([g.a, g.b])
    if (a && b)
      s.focusOn([(a.position[0] + b.position[0]) / 2, (a.position[1] + b.position[1]) / 2])
    else if (a) s.focusOn(a.position)
  }

  const name = (id: string) => catalog[items.find((i) => i.id === id)?.defId ?? '']?.name ?? 'Item'

  const select = (id: string) => {
    const s = useStore.getState()
    const it = s.items.find((i) => i.id === id)
    s.selectItem(id)
    if (it) s.focusOn(it.position)
  }

  // Select both overlapping pieces and frame their midpoint.
  const selectPair = (pair: OverlapPair) => {
    const s = useStore.getState()
    const a = s.items.find((i) => i.id === pair.a)
    const b = s.items.find((i) => i.id === pair.b)
    s.setSelectedItemIds([pair.a, pair.b])
    if (a && b)
      s.focusOn([(a.position[0] + b.position[0]) / 2, (a.position[1] + b.position[1]) / 2])
    else if (a) s.focusOn(a.position)
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
            <div className="n">{overlapCount}</div>
            <div className="l">Overlapping</div>
          </div>
          <div className="clr-stat err">
            <div className="n">{wallClipCount}</div>
            <div className="l">In wall</div>
          </div>
          <div className="clr-stat warn">
            <div className="n">{narrowCount}</div>
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
              No item blocks a door swing or overlaps another. Walkways look good.
            </span>
          </div>
        ) : (
          <div className="clr-list">
            {blocked.map((id) => (
              <button type="button" key={id} className="clr-item err" onClick={() => select(id)}>
                <div className="ci-head">
                  <span className="badge err">Blocking</span>
                  <span className="ci-title">{name(id)} blocks a door swing</span>
                </div>
                <div className="ci-detail">
                  This piece overlaps a door's opening arc — the door can't fully open.
                </div>
                <div className="ci-fix">
                  <Icon.Check width={14} height={14} />
                  Nudge it clear of the door, or lock the door open.
                </div>
              </button>
            ))}
            {overlaps.map((o) => (
              <button
                type="button"
                key={`${o.a}|${o.b}`}
                className="clr-item warn"
                onClick={() => selectPair(o)}
              >
                <div className="ci-head">
                  <span className="badge warn">Overlap</span>
                  <span className="ci-title">
                    {name(o.a)} overlaps {name(o.b)}
                  </span>
                </div>
                <div className="ci-detail">
                  These two pieces occupy the same floor space — they'd clip through each other.
                </div>
                <div className="ci-fix">
                  <Icon.Check width={14} height={14} />
                  Move one aside, or stack it on a surface if that's intended.
                </div>
              </button>
            ))}
            {wallClips.map((id) => (
              <button type="button" key={id} className="clr-item err" onClick={() => select(id)}>
                <div className="ci-head">
                  <span className="badge err">In wall</span>
                  <span className="ci-title">{name(id)} is inside a wall</span>
                </div>
                <div className="ci-detail">
                  This piece pokes through a wall — likely left behind after the floor plan changed.
                </div>
                <div className="ci-fix">
                  <Icon.Check width={14} height={14} />
                  Drag it back into the room, clear of the wall.
                </div>
              </button>
            ))}
            {narrowGaps.map((g) => (
              <button
                type="button"
                key={`${g.a}|${g.b}`}
                className="clr-item warn"
                onClick={() => selectGap(g)}
              >
                <div className="ci-head">
                  <span className="badge warn">{g.severity === 'tight' ? 'Tight' : 'Narrow'}</span>
                  <span className="ci-title">
                    {name(g.a)} ↔ {gapPartner(g.b)} · {(g.gap * 100).toFixed(0)} cm
                  </span>
                </div>
                <div className="ci-detail">
                  {g.severity === 'tight'
                    ? 'Below the 60 cm minimum walkway — tight to squeeze through.'
                    : 'Under the ideal 90 cm walkway — a touch tight to pass comfortably.'}
                </div>
                <div className="ci-fix">
                  <Icon.Check width={14} height={14} />
                  Widen the gap to ≥ 90 cm for a comfortable path.
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
