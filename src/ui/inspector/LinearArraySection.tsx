import { useState } from 'react'
import { canPlace } from '../../collision/placement'
import { placementWalls } from '../../collision/placementWalls'
import {
  ARRAY_MAX_COUNT,
  type ArrayAxis,
  arrayOffsets,
  gridArrayPlacements,
} from '../../furniture/arrayPlacement'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { Select } from '../controls/Select'
import { Icon } from '../toolbar/icons'

/**
 * Linear/grid array (Coohom array tooling). Places a row or `cols × rows` grid
 * of copies starting from the selected item's position, along a configurable
 * axis with independent column/row spacing. Copies that fail `canPlace` are
 * skipped (grid: skip-and-report the blocked cell; 1-D row: stop at the first
 * blocked slot so the row stays contiguous).
 *
 * Pure placement math lives in `arrayPlacement.ts`; this component owns only
 * the inspector controls + the collision-checked, single-undo-step commit
 * (mirroring `PathArraySection`/`ScatterFillSection`). Rendered as a sibling of
 * the other array sections in `InspectorPanel`, gated by `proMode`.
 */
export function LinearArraySection({
  item,
  def,
  catalog,
}: {
  item: FurnitureItem
  def: FurnitureDef
  catalog: Record<string, FurnitureDef>
}) {
  const [arrayCount, setArrayCount] = useState(3)
  const [arrayAxis, setArrayAxis] = useState<ArrayAxis>('right')
  const [arraySpacingOverride, setArraySpacingOverride] = useState<number | null>(null)
  const [arrayRows, setArrayRows] = useState(1)
  const [arrayRowSpacingOverride, setArrayRowSpacingOverride] = useState<number | null>(null)

  // The piece's plan footprint (parametric → live props; else def default).
  let w = def.defaultFootprint.w
  let d = def.defaultFootprint.d
  if (def.kind === 'parametric') {
    const map = def.footprintParams ?? {}
    const wv = item.props[map.w ?? 'width']
    const dv = item.props[map.d ?? 'depth']
    if (typeof wv === 'number') w = wv
    if (typeof dv === 'number') d = dv
  }

  // Place a grid (or row) of copies starting from the item's position.
  // Supports configurable axis, spacing, count, and rows×cols grid mode.
  // Copies that fail canPlace are skipped; the user gets a toast if any were dropped.
  const duplicateRow = () => {
    const st = useStore.getState()
    // Clamp count and rows to safe ranges
    const cols = Math.max(1, Math.min(ARRAY_MAX_COUNT + 1, Math.round(arrayCount)))
    const rows = Math.max(1, Math.min(ARRAY_MAX_COUNT + 1, Math.round(arrayRows)))
    // Default spacing is footprint dimension + gap; user can override.
    const colFootprint = arrayAxis === 'right' || arrayAxis === 'left' ? w : d
    const rowFootprint = d
    const colSpacing = arraySpacingOverride ?? colFootprint + 0.12
    const rowSpacing = arrayRowSpacingOverride ?? rowFootprint + 0.12

    const isGrid = rows > 1
    const placements = isGrid
      ? gridArrayPlacements(item, {
          cols,
          rows,
          colSpacing,
          rowSpacing,
          colAxis: arrayAxis,
          rowAxis: 'forward',
        })
      : arrayOffsets(item, cols - 1, colSpacing, arrayAxis).map((position) => ({
          position,
          col: 0,
          row: 0,
        }))

    const gid =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `grp-${Date.now()}`
    const newItems: FurnitureItem[] = []
    let others = st.items
    let dropped = 0
    for (const { position: pos } of placements) {
      const probe = {
        id: 'row-probe',
        defId: item.defId,
        position: pos,
        rotation: item.rotation,
        props: item.props,
      }
      if (
        !canPlace(probe, def, { others, defs: catalog, doors: st.doors, walls: placementWalls(st) })
      ) {
        if (isGrid) {
          // Grids: skip the blocked cell (like radial) — an interior obstruction
          // shouldn't drop the cells beyond it. Count it for the toast.
          dropped++
          continue
        }
        // 1-D linear row: stop at the first blocked slot so the row stays
        // contiguous and copies don't tunnel through a wall into empty space
        // outside the room. Everything from this slot on is dropped.
        dropped = placements.length - newItems.length
        break
      }
      const ni: FurnitureItem = {
        ...item,
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `id-${Date.now()}-${newItems.length}`,
        position: pos,
        props: { ...item.props },
        groupId: gid,
      }
      newItems.push(ni)
      others = [...others, ni]
    }

    const total = placements.length
    if (newItems.length === 0) {
      st.notify.start({
        title: "Couldn't place any copies",
        message: `All ${total} position${total !== 1 ? 's' : ''} are blocked.`,
        kind: 'info',
      })
      return
    }
    st.pushHistory()
    st.setItems(
      st.items.map((it) => (it.id === item.id ? { ...it, groupId: gid } : it)).concat(newItems),
    )
    if (dropped > 0) {
      const placed = newItems.length
      st.notify.start({
        title: `Placed ${placed} of ${total} — ${dropped} didn't fit`,
        kind: 'info',
      })
    }
  }

  return (
    <div
      className="act-array act-array--linear"
      title="Place a linear or grid array of copies"
      style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--s-2)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Linear array</span>
        <button
          type="button"
          className="act-array-go"
          onClick={duplicateRow}
          style={{ marginLeft: 'auto' }}
        >
          <Icon.Copy width={13} height={13} />
          Go
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 'var(--s-2)',
        }}
      >
        <label className="fld" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Columns
          </span>
          <input
            type="number"
            min={1}
            max={ARRAY_MAX_COUNT + 1}
            value={arrayCount}
            onChange={(e) => setArrayCount(Math.max(1, Number(e.target.value) || 1))}
            aria-label="Number of columns (total including source)"
            className="input"
            style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
          />
        </label>
        <label className="fld" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Rows
          </span>
          <input
            type="number"
            min={1}
            max={ARRAY_MAX_COUNT + 1}
            value={arrayRows}
            onChange={(e) => setArrayRows(Math.max(1, Number(e.target.value) || 1))}
            aria-label="Number of rows (total including source)"
            className="input"
            style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
          />
        </label>
        <label className="fld" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Col gap (m)
          </span>
          <input
            type="number"
            min={0.01}
            max={50}
            step={0.05}
            placeholder={`${((arrayAxis === 'right' || arrayAxis === 'left' ? w : d) + 0.12).toFixed(2)}`}
            value={arraySpacingOverride ?? ''}
            onChange={(e) => {
              const v = Number(e.target.value)
              setArraySpacingOverride(e.target.value === '' ? null : Math.max(0.01, v))
            }}
            aria-label="Column spacing centre-to-centre in metres"
            className="input"
            style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
          />
        </label>
        <label className="fld" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Row gap (m)
          </span>
          <input
            type="number"
            min={0.01}
            max={50}
            step={0.05}
            placeholder={`${(d + 0.12).toFixed(2)}`}
            value={arrayRowSpacingOverride ?? ''}
            onChange={(e) => {
              const v = Number(e.target.value)
              setArrayRowSpacingOverride(e.target.value === '' ? null : Math.max(0.01, v))
            }}
            aria-label="Row spacing centre-to-centre in metres"
            className="input"
            style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
          />
        </label>
      </div>
      <div className="fld" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
          Direction
        </span>
        <Select
          value={arrayAxis}
          onChange={(v) => setArrayAxis(v as ArrayAxis)}
          ariaLabel="Array column direction"
          className="input"
          style={{ fontSize: 'var(--t-xs)' }}
          options={[
            { value: 'right', label: 'Right (+X)' },
            { value: 'left', label: 'Left (−X)' },
            { value: 'forward', label: 'Forward (+Z)' },
            { value: 'back', label: 'Back (−Z)' },
          ]}
        />
      </div>
    </div>
  )
}
