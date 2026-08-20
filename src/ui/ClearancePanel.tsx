import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  buildFloorLoadingReport,
  type FloorLoadingReport,
  SLAB_LOAD_LIMIT,
} from '../analysis/floorLoading'
import { findWallClipsByLevel } from '../collision/levelWallClips'
import { findItemOverlaps, type OverlapPair } from '../collision/placement'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { useFeature } from '../features/useFeature'
import { isDefaultPlan, planCollisionWalls } from '../floorplan/planGeometry'
import { buildMergedCatalog } from '../furniture/catalog'
import type { FurnitureDef, FurnitureType } from '../furniture/types'
import { blockedDoorItems } from '../layout/clearance'
import { findNarrowGaps, type NarrowGap } from '../layout/walkway'
import { useStore } from '../state/store'
import { formatLength } from '../utils/measurement'
import { AuxPanelHead } from './AuxPanelHead'
import { Icon } from './toolbar/icons'

/** Clearance & fit checks: surfaces HDB door-swing blocking (`blockedDoorItems`),
 *  furniture-vs-furniture overlaps (`findItemOverlaps`), and pieces embedded in a
 *  wall (`findWallClipsByLevel` — each item vs its own storey's walls), with a
 *  summary and a fix-suggestion list. Clicking an
 *  issue selects + frames the offending piece(s). */
export function ClearancePanel() {
  const open = useStore((s) => s.clearancePanelOpen)
  const setOpen = useStore((s) => s.setClearancePanelOpen)
  const fGapFix = useFeature('gapSuggest')
  const fFloorLoad = useFeature('floorLoading')
  const items = useStore((s) => s.items)
  const plan = useStore((s) => s.floorPlan)
  const doors = useStore((s) => s.doors)
  const units = useStore((s) => s.units)
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

  const { blocked, overlaps, wallClips, narrowGaps, catalog, floorLoad } = useMemo(() => {
    if (!open)
      return {
        blocked: [] as string[],
        overlaps: [] as OverlapPair[],
        wallClips: [] as string[],
        narrowGaps: [] as NarrowGap[],
        catalog: {} as Record<FurnitureType, FurnitureDef>,
        floorLoad: null as FloorLoadingReport | null,
      }
    const merged = buildMergedCatalog(catalogInputs)
    // Whole-plan collision walls (not the room-editor subset) so the check has
    // the same scope as the panel — default flat builds the fixed walls.
    const walls = isDefaultPlan(plan) ? buildCollisionWalls(doors) : planCollisionWalls(plan, doors)
    return {
      blocked: blockedDoorItems(items, merged, plan),
      overlaps: findItemOverlaps(items, merged),
      // Per-storey (F13/ML3): `walls` is the ground set; upper-level items test
      // against their own storey's walls.
      wallClips: findWallClipsByLevel(items, merged, plan, doors, walls),
      narrowGaps: findNarrowGaps(items, merged, plan),
      catalog: merged,
      floorLoad: fFloorLoad ? buildFloorLoadingReport(items, merged) : null,
    }
  }, [open, items, plan, doors, catalogInputs, fFloorLoad])

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
    <aside className="panel mini aux aux-360" id="clearancePanel">
      <AuxPanelHead
        title="Clearance checks"
        sub="HDB 90 cm walkways"
        docs="clearanceChecks"
        onClose={() => setOpen(false)}
      />
      <hr className="hr" />
      <div className="panel-body">
        <div className="clr-summary">
          <div className="clr-stat err">
            <div className="n">{blockingCount}</div>
            <div className="l">Blocking</div>
          </div>
          <div className="clr-stat warn">
            <div className="n">{overlapCount}</div>
            <div className="l">Overlaps</div>
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
              <div key={`${g.a}|${g.b}`} className="clr-item warn" style={{ display: 'block' }}>
                <button
                  type="button"
                  className="clr-item-row"
                  style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
                  onClick={() => selectGap(g)}
                >
                  <div className="ci-head">
                    <span className="badge warn">
                      {g.severity === 'tight' ? 'Tight' : 'Narrow'}
                    </span>
                    <span className="ci-title">
                      {name(g.a)} ↔ {gapPartner(g.b)} · {formatLength(g.gap, units)}
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
                {/* GAP-SUGGEST: one-click nudge that splits the minimal widen across
                    both pieces (pro `gapSuggest` flag). Not shown for wall gaps. */}
                {fGapFix && !g.wall ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ marginTop: 6 }}
                    onClick={() => useStore.getState().nudgeGapApart(g.a, g.b, g.gap)}
                  >
                    Nudge apart
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {floorLoad?.hasConcern ? (
          <>
            <hr className="hr" />
            <div className="sec-h">Floor loading</div>
            <div
              style={{
                color: 'var(--text-3)',
                fontSize: 'var(--t-2xs)',
                marginBottom: 'var(--s-2)',
              }}
            >
              HDB slabs are rated ~{SLAB_LOAD_LIMIT} kg/m² imposed load (estimates — confirm with a
              PE / contractor).
            </div>
            <div className="clr-list">
              {floorLoad.exceeding.map((it) => (
                <button
                  type="button"
                  key={it.itemId}
                  className="clr-item warn"
                  onClick={() => select(it.itemId)}
                >
                  <div className="ci-head">
                    <span className="badge warn">Heavy</span>
                    <span className="ci-title">{it.name} may overload the slab</span>
                  </div>
                  <div className="ci-detail">
                    ≈ {it.estWeightKg} kg over {it.footprintM2} m² ≈ {it.densityKgM2} kg/m² — above
                    the ~{SLAB_LOAD_LIMIT} kg/m² guideline.
                  </div>
                  <div className="ci-fix">
                    <Icon.Check width={14} height={14} />
                    Spread the load over a wider base, or check with a PE before installing.
                  </div>
                </button>
              ))}
              {floorLoad.platforms.map((p) => (
                <button
                  type="button"
                  key={p.itemId}
                  className="clr-item warn"
                  onClick={() => select(p.itemId)}
                >
                  <div className="ci-head">
                    <span className="badge warn">Platform</span>
                    <span className="ci-title">
                      {p.name} raised {p.raiseMm} mm
                    </span>
                  </div>
                  <div className="ci-detail">
                    A concrete raise over 50 mm implies structural loading that needs an HDB permit.
                  </div>
                  <div className="ci-fix">
                    <Icon.Check width={14} height={14} />
                    Build platforms in lightweight timber-joist, not solid concrete screed.
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </aside>
  )
}
