import { useState } from 'react'
import { canPlace } from '../../collision/placement'
import { placementWalls } from '../../collision/placementWalls'
import {
  PATH_ARRAY_MAX_COUNT,
  type PathPoint,
  pathArrayPlacements,
} from '../../furniture/pathArray'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'

/**
 * Duplicate-along-path array (PARITY-DUP-PATH, Coohom array tooling). Places N copies
 * of the selected item along a drawn plan polyline by arc-length sampling, each
 * optionally yawed to face along the path tangent.
 *
 * The path source is any **plan polyline** the user has drawn in the 2D plan editor
 * (the existing PARITY-POLYLINE annotation primitive). Pure placement math lives in
 * `furniture/pathArray.ts`; this component owns only the inspector controls + the
 * collision-checked, single-undo-step commit (mirroring the linear/radial sections).
 *
 * Rendered as a sibling of the linear/radial array sections in `InspectorPanel`, gated
 * by `proMode && pathArrayOn` so editing the panel layout stays isolated from the
 * other array tooling.
 */
export function PathArraySection({
  item,
  def,
  catalog,
}: {
  item: FurnitureItem
  def: FurnitureDef
  catalog: Record<string, FurnitureDef>
}) {
  // All defined plan polylines (ordered, ≥2 points). Subscribed so the dropdown
  // tracks newly-drawn paths without a manual refresh.
  const polylines = useStore((s) => s.floorPlan.polylines ?? [])
  const [selectedPolyId, setSelectedPolyId] = useState<string>('')
  const [count, setCount] = useState(5)
  const [align, setAlign] = useState(true)

  const hasPaths = polylines.length > 0
  // Resolve the chosen polyline (default to the first available).
  const poly = polylines.find((p) => p.id === selectedPolyId) ?? polylines[0]

  const apply = () => {
    if (!poly) return
    const st = useStore.getState()
    const points = poly.points as PathPoint[]
    const n = Math.max(1, Math.min(PATH_ARRAY_MAX_COUNT, Math.round(count)))
    const placements = pathArrayPlacements(points, {
      mode: 'count',
      count: n,
      closed: poly.closed,
      align,
      baseRotation: item.rotation,
    })
    if (placements.length === 0) return

    const gid =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `grp-${Date.now()}`
    const newItems: FurnitureItem[] = []
    let others = st.items
    let dropped = 0
    const walls = placementWalls(st, item.levelId)
    for (const { position: pos, rotation: rot } of placements) {
      const probe = {
        id: 'path-probe',
        defId: item.defId,
        position: pos,
        rotation: rot,
        props: item.props,
      }
      // Skip blocked slots (like the radial ring): a single obstruction along the
      // path shouldn't drop every copy beyond it.
      if (!canPlace(probe, def, { others, defs: catalog, doors: st.doors, walls })) {
        dropped++
        continue
      }
      const ni: FurnitureItem = {
        ...item,
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `id-${Date.now()}-${newItems.length}`,
        position: pos,
        rotation: rot,
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
        message: `All ${total} position${total !== 1 ? 's' : ''} along the path are blocked.`,
        kind: 'info',
      })
      return
    }
    // One undo step: push once, then replace items with source (re-grouped) + copies.
    st.pushHistory()
    st.setItems(
      st.items.map((it) => (it.id === item.id ? { ...it, groupId: gid } : it)).concat(newItems),
    )
    if (dropped > 0) {
      st.notify.start({
        title: `Placed ${newItems.length} of ${total} along the path — ${dropped} didn't fit`,
        kind: 'info',
      })
    }
  }

  return (
    <div
      className="act-array act-array--path"
      title="Place copies along a drawn plan polyline (e.g. chairs along an L-shaped counter)"
      style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--s-2)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Path array</span>
        <button
          type="button"
          className="act-array-go"
          onClick={apply}
          disabled={!hasPaths}
          style={{ marginLeft: 'auto' }}
        >
          <Icon.Copy width={13} height={13} />
          Go
        </button>
      </div>
      {hasPaths ? (
        <>
          <label className="fld" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
              Path
            </span>
            <select
              value={poly?.id ?? ''}
              onChange={(e) => setSelectedPolyId(e.target.value)}
              aria-label="Polyline to array along"
              className="input"
              style={{ fontSize: 'var(--t-xs)' }}
            >
              {polylines.map((p, i) => (
                <option key={p.id} value={p.id}>
                  {`Polyline ${i + 1}${p.closed ? ' (closed)' : ''} — ${p.points.length} pts`}
                </option>
              ))}
            </select>
          </label>
          <label className="fld" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
              Count
            </span>
            <input
              type="number"
              min={1}
              max={PATH_ARRAY_MAX_COUNT}
              value={count}
              onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
              aria-label="Number of copies along the path"
              className="input"
              style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={align}
              onChange={(e) => setAlign(e.target.checked)}
              aria-label="Face along path — rotate each copy to follow the path tangent"
            />
            <span style={{ fontSize: 'var(--t-xs)', color: 'var(--text-2)' }}>Face along path</span>
          </label>
        </>
      ) : (
        <span style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)' }}>
          Draw a polyline in the plan editor to array along it.
        </span>
      )}
    </div>
  )
}
