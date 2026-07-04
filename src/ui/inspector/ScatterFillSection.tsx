import { useState } from 'react'
import { placementWalls } from '../../collision/placementWalls'
import { allPlanRooms, GROUND_LEVEL_ID, levelOfRoom } from '../../floorplan/levels'
import { pointInRoom, roomPolygon } from '../../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import { scatterInRoom } from '../../layout/scatterInRoom'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'

/**
 * Scatter-fill a room (PARITY-SCATTER-ROOM, Coohom/Planner5D bulk-placement parity).
 * Evenly fills the room the selected item sits in with N collision-avoiding copies
 * of that item, laid out on a packed grid (deterministic, seeded).
 *
 * Pure placement math lives in `layout/scatterInRoom.ts`; this component owns only
 * the inspector controls + the single-undo-step commit (mirroring the
 * radial/path array sections). Rendered as a sibling in `InspectorPanel`, gated by
 * `proMode && scatterFillOn`.
 */
export function ScatterFillSection({
  item,
  def,
  catalog,
}: {
  item: FurnitureItem
  def: FurnitureDef
  catalog: Record<string, FurnitureDef>
}) {
  const [count, setCount] = useState(8)
  const [clearance, setClearance] = useState(0.1)
  // Subscribe so the room lookup tracks plan/level edits.
  const floorPlan = useStore((s) => s.floorPlan)
  const levelId = item.levelId ?? GROUND_LEVEL_ID
  // The room the selected item is standing in (on its storey).
  const room = allPlanRooms(floorPlan)
    .filter((r) => (levelOfRoom(floorPlan, r.id)?.id ?? GROUND_LEVEL_ID) === levelId)
    .find((r) => pointInRoom(r, item.position[0], item.position[1]))
  const hasRoom = !!room

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

  const apply = () => {
    if (!room) return
    const st = useStore.getState()
    const n = Math.max(1, Math.min(500, Math.round(count)))
    const result = scatterInRoom(roomPolygon(room), { w, d, h: def.defaultFootprint.h }, n, {
      existing: st.items,
      defs: catalog,
      doors: st.doors,
      walls: placementWalls(st, item.levelId),
      clearance: Math.max(0, clearance),
      rotation: item.rotation,
      levelId: item.levelId,
      defId: item.defId,
      // A stable seed keeps the fill deterministic for a given item position.
      seed: Math.abs(Math.round(item.position[0] * 1000 + item.position[1] * 7919)) || 1,
    })
    if (result.placed === 0) {
      st.notify.start({
        title: "Couldn't fit any copies",
        message: 'The room has no free floor for this item — try a smaller clearance.',
        kind: 'info',
      })
      return
    }

    const gid =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `grp-${Date.now()}`
    const newItems: FurnitureItem[] = result.placements.map((p, i) => ({
      ...item,
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `id-${Date.now()}-${i}`,
      position: p.position,
      rotation: p.rotation,
      props: { ...item.props },
      groupId: gid,
    }))

    // One undo step: push once, then replace items with source (re-grouped) + copies.
    st.pushHistory()
    st.setItems(
      st.items.map((it) => (it.id === item.id ? { ...it, groupId: gid } : it)).concat(newItems),
    )
    if (result.placed < result.requested) {
      st.notify.start({
        title: `Filled with ${result.placed} of ${result.requested} — the rest didn't fit`,
        kind: 'info',
      })
    }
  }

  return (
    <div
      className="act-array act-array--scatter"
      title="Evenly fill this room's free floor with N collision-safe copies of the selected item"
      style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--s-2)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Fill room</span>
        <button
          type="button"
          className="act-array-go"
          onClick={apply}
          disabled={!hasRoom}
          style={{ marginLeft: 'auto' }}
        >
          <Icon.Copy width={13} height={13} />
          Go
        </button>
      </div>
      {hasRoom ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 'var(--s-2)',
          }}
        >
          <label className="fld" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
              Count
            </span>
            <input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
              aria-label="Number of copies to fill the room with"
              className="input"
              style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
            />
          </label>
          <label className="fld" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
              Spacing (m)
            </span>
            <input
              type="number"
              min={0}
              max={5}
              step={0.05}
              value={clearance}
              onChange={(e) => setClearance(Math.max(0, Number(e.target.value) || 0))}
              aria-label="Spacing between copies in metres"
              className="input"
              style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
            />
          </label>
        </div>
      ) : (
        <span style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)' }}>
          Place this item inside a room to fill it.
        </span>
      )}
    </div>
  )
}
