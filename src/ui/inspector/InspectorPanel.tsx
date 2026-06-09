import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { canPlace, itemFootprint } from '../../collision/placement'
import { placementWalls } from '../../collision/placementWalls'
import { pointInRoom } from '../../floorplan/types'
import { arrayOffsets } from '../../furniture/arrayPlacement'
import { isIkeaDef, useCatalog } from '../../furniture/catalog'
import { planDuplicates } from '../../furniture/duplicatePlacement'
import { itemPrice } from '../../furniture/furniturePrices'
import { itemsCost } from '../../furniture/itemsCost'
import {
  alignCenter,
  alignEdge,
  distributeEvenGaps,
  obbAxisHalf,
} from '../../layout/alignDistribute'
import { isOffSquare, nearestRightAngle } from '../../layout/angle'
import { flushToWall, nearestWallEdge, rotationFacingRoom } from '../../layout/faceWall'
import { useStore } from '../../state/store'
import { formatDimsShort } from '../../utils/measurement'
import { CategoryIcon } from '../catalog/CategoryIcon'
import { Icon } from '../toolbar/icons'
import { GltfBody } from './GltfBody'
import { IkeaBody } from './IkeaBody'
import { InspectorSection } from './InspectorSection'
import { ParametricBody } from './ParametricBody'
import { SourceLine } from './SourceLine'

/**
 * Minimize state for the inspector. The user can collapse it to just its header
 * (so it stops blocking the furniture, especially on mobile), and it
 * *auto-minimizes* while a move/rotate gesture is in progress so the piece is
 * visible as it's manipulated — restoring to the user's chosen state afterwards.
 */
function useInspectorMinimize(): { minimized: boolean; toggle: () => void; manual: boolean } {
  const gesturing = useStore((s) => !!s.draggingItemId || s.rotatingGizmo)
  const [manual, setManual] = useState(false)
  return { minimized: manual || gesturing, toggle: () => setManual((v) => !v), manual }
}

/** The minimize / expand toggle shown in an inspector panel header. */
function MinimizeButton({ minimized, toggle }: { minimized: boolean; toggle: () => void }) {
  return (
    <button
      type="button"
      onClick={toggle}
      className="icon-btn"
      aria-label={minimized ? 'Expand inspector' : 'Minimize inspector'}
      title={minimized ? 'Expand' : 'Minimize'}
    >
      {minimized ? <Icon.Plus width={16} height={16} /> : <Icon.Minus width={16} height={16} />}
    </button>
  )
}

/** Panel shown when 2+ items are selected: count + align / distribute / bulk
 *  actions (the marquee/shift-click multi-selection). */
function MultiSelectPanel() {
  const count = useStore((s) => s.selectedItemIds.length)
  const selectedItemIds = useStore((s) => s.selectedItemIds)
  const activeGroupId = useStore((s) => s.activeGroupId)
  const groupItems = useStore((s) => s.groupItems)
  const ungroup = useStore((s) => s.ungroup)
  const catalog = useCatalog()
  const { minimized, toggle } = useInspectorMinimize()
  // Combined estimated price of the current selection (mirrors the single-item
  // price line + the Budget panel's `itemPrice`).
  const totalPrice = useStore((s) =>
    itemsCost(
      s.items.filter((i) => s.selectedItemIds.includes(i.id)),
      catalog,
    ),
  )

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
        walls: placementWalls(s),
      })
    )
      s.moveItem(id, pos)
  }

  const align = (axis: 0 | 1) => {
    const s = useStore.getState()
    const sel = s.items.filter((i) => s.selectedItemIds.includes(i.id) && !i.locked)
    const target = alignCenter(sel.map((it) => ({ id: it.id, center: it.position[axis], half: 0 })))
    if (target === null) return
    s.pushHistory()
    for (const it of sel) {
      const pos: [number, number] = axis === 0 ? [target, it.position[1]] : [it.position[0], target]
      tryMove(it.id, pos)
    }
  }

  // Footprint-aware edge alignment: snap every selected piece's near (`min`) or
  // far (`max`) edge along an axis to the matching extreme of the selection.
  const edge = (axis: 0 | 1, side: 'min' | 'max') => {
    const s = useStore.getState()
    const sel = s.items.filter((i) => s.selectedItemIds.includes(i.id) && !i.locked)
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
    s.pushHistory()
    for (const it of sel) {
      const v = next.get(it.id)
      if (v === undefined || v === it.position[axis]) continue
      tryMove(it.id, axis === 0 ? [v, it.position[1]] : [it.position[0], v])
    }
  }

  // Footprint-aware even-gap distribution: spaces the edge-to-edge gaps equally
  // (not just the centres), so a row of differently-sized pieces reads tidy.
  const distribute = (axis: 0 | 1) => {
    const s = useStore.getState()
    const sel = s.items.filter((i) => s.selectedItemIds.includes(i.id) && !i.locked)
    const boxes = sel.flatMap((it) => {
      const def = catalog[it.defId]
      if (!def) return []
      const obb = itemFootprint(it, def)
      return [
        { id: it.id, center: it.position[axis], half: obbAxisHalf(obb.hx, obb.hz, obb.rot, axis) },
      ]
    })
    const next = distributeEvenGaps(boxes)
    if (next.size === 0) return
    s.pushHistory()
    for (const it of sel) {
      const v = next.get(it.id)
      if (v === undefined || v === it.position[axis]) continue
      tryMove(it.id, axis === 0 ? [v, it.position[1]] : [it.position[0], v])
    }
  }

  // Orient every selected (unlocked) piece so its back is to the nearest wall of
  // whichever room contains it — a bulk version of the single-item action.
  const faceAllIntoRoom = () => {
    const s = useStore.getState()
    const sel = s.items.filter((i) => s.selectedItemIds.includes(i.id) && !i.locked)
    if (sel.length === 0) return
    s.pushHistory()
    for (const it of sel) {
      const def = catalog[it.defId]
      const room = s.floorPlan.rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
      if (!def || !room) continue
      const rect = {
        minX: room.origin[0],
        minZ: room.origin[1],
        maxX: room.origin[0] + room.width,
        maxZ: room.origin[1] + room.depth,
      }
      const rot = rotationFacingRoom(it.position, rect)
      if (
        canPlace({ ...it, rotation: rot }, def, {
          others: s.items.filter((o) => o.id !== it.id),
          defs: catalog,
          doors: s.doors,
          walls: placementWalls(s),
        })
      )
        s.rotateItem(it.id, rot)
    }
  }

  // Rotate every selected (unlocked) piece in place by `delta` (collision-checked
  // per item, so a piece that would clip a wall/neighbour after turning is left).
  const rotateAll = (delta: number) => {
    const s = useStore.getState()
    const sel = s.items.filter((i) => s.selectedItemIds.includes(i.id) && !i.locked)
    if (sel.length === 0) return
    s.pushHistory()
    for (const it of sel) {
      const def = catalog[it.defId]
      if (!def) continue
      const rot = it.rotation + delta
      if (
        canPlace({ ...it, rotation: rot }, def, {
          others: s.items.filter((o) => o.id !== it.id),
          defs: catalog,
          doors: s.doors,
          walls: placementWalls(s),
        })
      )
        s.rotateItem(it.id, rot)
    }
  }

  // Push every selected (unlocked) piece flush against its nearest room wall and
  // turn its back to that wall — the bulk version of dragging a piece into a wall.
  // Orient + move are collision-checked together, then committed.
  const snapToWall = () => {
    const s = useStore.getState()
    const sel = s.items.filter((i) => s.selectedItemIds.includes(i.id) && !i.locked)
    if (sel.length === 0) return
    s.pushHistory()
    for (const it of sel) {
      const def = catalog[it.defId]
      const room = s.floorPlan.rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
      if (!def || !room) continue
      const rect = {
        minX: room.origin[0],
        minZ: room.origin[1],
        maxX: room.origin[0] + room.width,
        maxZ: room.origin[1] + room.depth,
      }
      const edge = nearestWallEdge(it.position, rect)
      const rot = rotationFacingRoom(it.position, rect)
      const obb = itemFootprint({ ...it, rotation: rot }, def)
      const halfX = obbAxisHalf(obb.hx, obb.hz, rot, 0)
      const halfZ = obbAxisHalf(obb.hx, obb.hz, rot, 1)
      const pos = flushToWall(it.position, rect, edge, halfX, halfZ)
      if (
        canPlace({ ...it, rotation: rot, position: pos }, def, {
          others: s.items.filter((o) => o.id !== it.id),
          defs: catalog,
          doors: s.doors,
          walls: placementWalls(s),
        })
      ) {
        s.rotateItem(it.id, rot)
        s.moveItem(it.id, pos)
      }
    }
  }

  const deleteAll = () => {
    const s = useStore.getState()
    for (const id of [...s.selectedItemIds]) s.deleteItem(id)
  }

  const duplicateAll = () => {
    const s = useStore.getState()
    const sources = s.items.filter((i) => s.selectedItemIds.includes(i.id))
    if (sources.length === 0) return
    const groupIds = new Set(sources.map((it) => it.groupId))
    const sharedGroup = groupIds.size === 1 && !groupIds.has(undefined)
    const gid =
      sharedGroup && typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : undefined
    const copies = planDuplicates(
      sources,
      { others: s.items, defs: catalog, doors: s.doors },
      (n) =>
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `id-${Date.now()}-${n}`,
      gid,
    )
    if (copies.length === 0) return
    s.pushHistory()
    s.setItems([...s.items, ...copies])
    s.setSelectedItemIds(copies.map((it) => it.id))
  }

  return (
    <aside className={`panel inspector${minimized ? ' minimized' : ''}`}>
      <div className="panel-head">
        <div>
          <div className="panel-title">{count} items selected</div>
          {minimized ? null : (
            <div className="panel-sub">
              Multi-select{totalPrice > 0 ? ` · ~$${totalPrice.toLocaleString('en-SG')} total` : ''}
            </div>
          )}
        </div>
        <div className="insp-head-btns">
          <MinimizeButton minimized={minimized} toggle={toggle} />
          <button
            type="button"
            onClick={() => useStore.getState().selectItem(null)}
            className="icon-btn"
            aria-label="Clear selection"
          >
            <Icon.Close width={16} height={16} />
          </button>
        </div>
      </div>
      {minimized ? null : (
        <>
          <hr className="hr" />
          <div className="panel-body">
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
              <div className="action-grid two" style={{ marginTop: 'var(--s-2)' }}>
                <button
                  type="button"
                  className="act"
                  onClick={() => rotateAll(-Math.PI / 2)}
                  title="Rotate each selected piece 90° anticlockwise"
                >
                  <Icon.Rotate width={16} height={16} />
                  Rotate −90°
                </button>
                <button
                  type="button"
                  className="act"
                  onClick={() => rotateAll(Math.PI / 2)}
                  title="Rotate each selected piece 90° clockwise"
                >
                  <Icon.Rotate width={16} height={16} />
                  Rotate +90°
                </button>
              </div>
              <button
                type="button"
                className="btn btn-soft btn-block"
                style={{ marginTop: 'var(--s-2)' }}
                onClick={faceAllIntoRoom}
                title="Turn each selected piece's back to its nearest wall"
              >
                <Icon.Rotate width={14} height={14} />
                Face into room
              </button>
              <button
                type="button"
                className="btn btn-soft btn-block"
                style={{ marginTop: 'var(--s-2)' }}
                onClick={snapToWall}
                title="Push each selected piece flush against its nearest wall"
              >
                <Icon.Snap width={14} height={14} />
                Snap to wall
              </button>
            </div>
            <div className="sec">
              {activeGroupId ? (
                <button
                  type="button"
                  onClick={() => ungroup(activeGroupId)}
                  className="btn btn-soft btn-block"
                >
                  <Icon.Group width={14} height={14} />
                  Ungroup
                </button>
              ) : (
                selectedItemIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => groupItems(selectedItemIds)}
                    className="btn btn-soft btn-block"
                  >
                    <Icon.Group width={14} height={14} />
                    Group
                  </button>
                )
              )}
              <button
                type="button"
                onClick={duplicateAll}
                className="btn btn-soft btn-block"
                style={{ marginTop: 'var(--s-2)' }}
                title="Duplicate every selected item (⌘/Ctrl+D)"
              >
                <Icon.Copy width={14} height={14} />
                Duplicate selection
              </button>
              <button
                type="button"
                onClick={deleteAll}
                className="btn btn-danger btn-block"
                style={{ marginTop: 'var(--s-2)' }}
              >
                <Icon.Trash width={14} height={14} />
                Delete all
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}

/** A small numeric field that shows the live value but lets the user type a
 *  precise one; commits on blur / Enter (collision-checked by the caller). */
function PosField({
  label,
  value,
  step,
  onCommit,
  integer,
  unit,
}: {
  label: string
  value: number
  step: number
  onCommit: (v: number) => void
  integer?: boolean
  unit?: string
}) {
  const fmt = (v: number) => (integer ? Math.round(v).toString() : v.toFixed(2))
  const [text, setText] = useState(fmt(value))
  // Re-sync when the underlying value changes (drag, rotate key, etc.) and
  // the field isn't being edited.
  const [editing, setEditing] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: fmt is a render-stable formatter
  useEffect(() => {
    if (!editing) setText(fmt(value))
  }, [value, editing])
  const commit = () => {
    setEditing(false)
    const v = Number(text)
    if (!Number.isNaN(v)) onCommit(v)
  }
  return (
    <label className="num">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={text}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="mono"
      />
      {unit ? <span className="unit">{unit}</span> : null}
    </label>
  )
}

/** Right-side panel shown when an item is selected. Maps the selected
 *  def kind to either ParametricBody or GltfBody, plus a small header
 *  for category + position + delete. */
export function InspectorPanel() {
  const multiCount = useStore((s) => s.selectedItemIds.length)
  const item = useStore(useShallow((s) => s.items.find((i) => i.id === s.selectedItemId) ?? null))
  // How many *other* placed items share this def — gates the "apply finish to
  // all of this type" action (also in the right-click menu, surfaced here for
  // touch where right-click is a long-press).
  const sameTypeCount = useStore((s) =>
    item ? s.items.filter((i) => i.defId === item.defId).length : 0,
  )
  const proMode = useStore((s) => s.uiMode === 'pro')
  const catalog = useCatalog()
  const deleteItem = useStore((s) => s.deleteItem)
  const selectItem = useStore((s) => s.selectItem)
  const flipItem = useStore((s) => s.flipItem)
  const toggleLock = useStore((s) => s.toggleLock)
  const pushHistory = useStore((s) => s.pushHistory)
  const activeGroupId = useStore((s) => s.activeGroupId)
  const addToGroup = useStore((s) => s.addToGroup)
  const units = useStore((s) => s.units)
  const renameItem = useStore((s) => s.renameItem)
  const { minimized, toggle } = useInspectorMinimize()
  const [arrayCount, setArrayCount] = useState(3)
  const flip = (axis: 'x' | 'z') => {
    pushHistory()
    flipItem(item!.id, axis)
  }

  // All hooks above run unconditionally; branch only after them.
  if (multiCount > 1) return <MultiSelectPanel />
  if (!item) return null
  const def = catalog[item.defId]
  if (!def) return null

  const rotate90 = () => {
    const st = useStore.getState()
    const it = st.items.find((i) => i.id === item.id)
    if (!it) return
    const next = it.rotation + Math.PI / 2
    if (
      canPlace({ ...it, rotation: next }, def, {
        others: st.items,
        defs: catalog,
        doors: st.doors,
        walls: placementWalls(st),
      })
    ) {
      st.pushHistory()
      st.rotateItem(it.id, next)
    }
  }

  const tryMove = (x: number, z: number) => {
    const st = useStore.getState()
    const it = st.items.find((i) => i.id === item.id)
    if (!it || Number.isNaN(x) || Number.isNaN(z)) return
    if (
      canPlace({ ...it, position: [x, z] }, def, {
        others: st.items,
        defs: catalog,
        doors: st.doors,
        walls: placementWalls(st),
      })
    ) {
      st.pushHistory()
      st.moveItem(it.id, [x, z])
    }
  }
  const trySetRot = (deg: number) => {
    const st = useStore.getState()
    const it = st.items.find((i) => i.id === item.id)
    if (!it || Number.isNaN(deg)) return
    const rot = (deg * Math.PI) / 180
    if (
      canPlace({ ...it, rotation: rot }, def, {
        others: st.items,
        defs: catalog,
        doors: st.doors,
        walls: placementWalls(st),
      })
    ) {
      st.pushHistory()
      st.rotateItem(it.id, rot)
    }
  }

  // Orient the item so its back is to the nearest wall (front faces the room) —
  // one-click correct orientation for beds/sofas/desks. Collision-checked via trySetRot.
  const faceIntoRoom = () => {
    const st = useStore.getState()
    const it = st.items.find((i) => i.id === item.id)
    if (!it) return
    const room = st.floorPlan.rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
    if (!room) return
    const rect = {
      minX: room.origin[0],
      minZ: room.origin[1],
      maxX: room.origin[0] + room.width,
      maxZ: room.origin[1] + room.depth,
    }
    trySetRot((rotationFacingRoom(it.position, rect) * 180) / Math.PI)
  }
  // Move the item to the centre of the room it's in (collision-checked) — handy
  // for centring a rug, coffee table or pendant.
  const centreInRoom = () => {
    const st = useStore.getState()
    const it = st.items.find((i) => i.id === item.id)
    if (!it) return
    const room = st.floorPlan.rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
    if (!room) return
    tryMove(room.origin[0] + room.width / 2, room.origin[1] + room.depth / 2)
  }

  const duplicate = () => {
    const st = useStore.getState()
    const STEP = 0.3
    for (let ring = 1; ring <= 8; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dz = -ring; dz <= ring; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue
          const pos: [number, number] = [item.position[0] + dx * STEP, item.position[1] + dz * STEP]
          const probe = {
            id: 'dup-probe',
            defId: item.defId,
            position: pos,
            rotation: item.rotation,
            props: item.props,
          }
          if (
            canPlace(probe, def, {
              others: st.items,
              defs: catalog,
              doors: st.doors,
              walls: placementWalls(st),
            })
          ) {
            st.addItem({
              defId: item.defId,
              position: pos,
              rotation: item.rotation,
              props: { ...item.props },
            })
            return
          }
        }
      }
    }
  }

  let w = def.defaultFootprint.w
  let d = def.defaultFootprint.d
  if (def.kind === 'parametric') {
    const map = def.footprintParams ?? {}
    const wv = item.props[map.w ?? 'width']
    const dv = item.props[map.d ?? 'depth']
    if (typeof wv === 'number') w = wv
    if (typeof dv === 'number') d = dv
  }
  // Place a row of copies to the item's right (local +X), spaced by its width,
  // each collision-checked. Stops at the first blocked slot. The original + all
  // copies share one groupId, committed in a single undo step.
  const duplicateRow = () => {
    const st = useStore.getState()
    const count = Math.max(2, Math.min(10, Math.round(arrayCount)))
    // Evenly-spaced copy positions to the item's right (tested `arrayOffsets`).
    const positions = arrayOffsets(item, count - 1, w + 0.12, 'right')
    const gid =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `grp-${Date.now()}`
    const newItems: (typeof item)[] = []
    let others = st.items
    for (const pos of positions) {
      const probe = {
        id: 'row-probe',
        defId: item.defId,
        position: pos,
        rotation: item.rotation,
        props: item.props,
      }
      // Stop at the first blocked slot so the row stays contiguous.
      if (
        !canPlace(probe, def, { others, defs: catalog, doors: st.doors, walls: placementWalls(st) })
      )
        break
      const ni = {
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
    if (newItems.length === 0) return
    st.pushHistory()
    st.setItems(
      st.items.map((it) => (it.id === item.id ? { ...it, groupId: gid } : it)).concat(newItems),
    )
  }

  return (
    <aside className={`panel inspector${minimized ? ' minimized' : ''}`}>
      <div className="panel-head">
        <div>
          <div className="insp-thumb">
            <CategoryIcon category={def.category} width={22} height={22} />
          </div>
          <div>
            <div className="panel-title">{item.label ?? def.name}</div>
            {minimized ? null : (
              <>
                <div className="panel-sub">{def.category}</div>
                <div className="dims mono" title="Width × Depth × Height">
                  {formatDimsShort([w, d, def.defaultFootprint.h], units)}
                </div>
                <div
                  className="insp-price mono"
                  title="Estimated price (see the Budget panel for the full list)"
                >
                  ~$
                  {itemPrice(
                    def,
                    def.category,
                    typeof item.props.variant === 'string' ? item.props.variant : undefined,
                  ).toLocaleString('en-SG')}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="insp-head-btns">
          <button
            type="button"
            onClick={() => useStore.getState().toggleLock(item.id)}
            className={`icon-btn${item.locked ? ' on' : ''}`}
            aria-label={item.locked ? 'Unlock item' : 'Lock item in place'}
            title={item.locked ? 'Unlock — allow moving/editing' : 'Lock in place'}
          >
            {item.locked ? (
              <Icon.Lock width={16} height={16} />
            ) : (
              <Icon.Unlock width={16} height={16} />
            )}
          </button>
          <MinimizeButton minimized={minimized} toggle={toggle} />
          <button
            type="button"
            onClick={() => selectItem(null)}
            className="icon-btn"
            aria-label="Close inspector"
          >
            <Icon.Close width={16} height={16} />
          </button>
        </div>
      </div>
      {minimized ? null : (
        <>
          <hr className="hr" />
          <div className="panel-body">
            <label
              className="flex items-center gap-2 text-xs"
              style={{ marginBottom: 'var(--s-2)' }}
            >
              <span className="label" style={{ whiteSpace: 'nowrap' }}>
                Name
              </span>
              <input
                type="text"
                value={item.label ?? ''}
                placeholder={def.name}
                aria-label="Custom item name"
                onChange={(e) => renameItem(item.id, e.target.value)}
                className="input"
                style={{ flex: 1, minWidth: 0 }}
              />
            </label>
            {proMode ? (
              <InspectorSection
                title="Transform"
                defaultOpen
                style={{ borderTop: 'none', paddingTop: 0 }}
              >
                <div className="transform-grid">
                  <PosField
                    label="X"
                    unit="m"
                    value={item.position[0]}
                    step={0.05}
                    onCommit={(v) => tryMove(v, item.position[1])}
                  />
                  <PosField
                    label="Z"
                    unit="m"
                    value={item.position[1]}
                    step={0.05}
                    onCommit={(v) => tryMove(item.position[0], v)}
                  />
                  <PosField
                    label="Rotation"
                    unit="°"
                    value={(item.rotation * 180) / Math.PI}
                    step={15}
                    onCommit={trySetRot}
                    integer
                  />
                </div>
              </InspectorSection>
            ) : null}
            {def.kind === 'parametric' ? (
              <ParametricBody item={item} def={def} />
            ) : isIkeaDef(def) ? (
              <IkeaBody item={item} def={def} />
            ) : (
              <GltfBody item={item} def={def} />
            )}
            {def.kind === 'gltf' && (def.source === 'builtin' || def.source === 'ikea') && (
              <SourceLine
                attribution={def.attribution}
                license={def.license}
                sourceUrl={def.sourceUrl}
              />
            )}
            <div className="sec">
              <div className="action-grid">
                <button type="button" className="act" onClick={rotate90} disabled={item.locked}>
                  <Icon.Rotate width={16} height={16} />
                  Rotate
                </button>
                <button
                  type="button"
                  className={`act${item.flipX ? ' on' : ''}`}
                  onClick={() => flip('x')}
                  disabled={item.locked}
                >
                  <Icon.FlipH width={16} height={16} />
                  Flip H
                </button>
                <button
                  type="button"
                  className={`act${item.flipZ ? ' on' : ''}`}
                  onClick={() => flip('z')}
                  disabled={item.locked}
                >
                  <Icon.FlipV width={16} height={16} />
                  Flip V
                </button>
                <button type="button" className="act" onClick={duplicate}>
                  <Icon.Copy width={16} height={16} />
                  Duplicate
                </button>
                <button
                  type="button"
                  className={`act${item.locked ? ' on' : ''}`}
                  onClick={() => toggleLock(item.id)}
                >
                  {item.locked ? (
                    <Icon.Lock width={16} height={16} />
                  ) : (
                    <Icon.Unlock width={16} height={16} />
                  )}
                  {item.locked ? 'Locked' : 'Lock'}
                </button>
                <button
                  type="button"
                  className="act danger"
                  onClick={() => !item.locked && deleteItem(item.id)}
                  disabled={item.locked}
                >
                  <Icon.Trash width={16} height={16} />
                  Delete
                </button>
              </div>
              {proMode ? (
                <div className="act-array" title="Place a row of copies to the right of this item">
                  <span>Duplicate a row of</span>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={arrayCount}
                    onChange={(e) => setArrayCount(Number(e.target.value) || 2)}
                    aria-label="Number of copies in the row"
                  />
                  <button type="button" className="act-array-go" onClick={duplicateRow}>
                    <Icon.Copy width={13} height={13} />
                    Go
                  </button>
                </div>
              ) : null}
              {isOffSquare(item.rotation) ? (
                <button
                  type="button"
                  onClick={() => trySetRot((nearestRightAngle(item.rotation) * 180) / Math.PI)}
                  className="btn btn-soft btn-block"
                  style={{ marginTop: 'var(--s-2)' }}
                  title="Snap this item's rotation to the nearest 90°"
                >
                  <Icon.Rotate width={14} height={14} />
                  Straighten
                </button>
              ) : null}
              <div className="action-grid two" style={{ marginTop: 'var(--s-2)' }}>
                <button
                  type="button"
                  onClick={faceIntoRoom}
                  className="act"
                  title="Turn this piece's back to the nearest wall (face into the room)"
                >
                  <Icon.Rotate width={14} height={14} />
                  Face room
                </button>
                <button
                  type="button"
                  onClick={centreInRoom}
                  className="act"
                  title="Move this piece to the centre of its room"
                >
                  <Icon.AlignX width={14} height={14} />
                  Centre
                </button>
              </div>
              <button
                type="button"
                onClick={() => useStore.getState().setSwapItemId(item.id)}
                className="btn btn-soft btn-block"
                style={{ marginTop: 'var(--s-2)' }}
              >
                <Icon.Copy width={14} height={14} />
                Swap with similar
              </button>
              {sameTypeCount > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    const n = useStore.getState().applyStyleToAll(item.id)
                    if (n > 0)
                      useStore.getState().notify.start({
                        title: `Applied this finish to ${n} more`,
                        kind: 'success',
                      })
                  }}
                  className="btn btn-soft btn-block"
                  style={{ marginTop: 'var(--s-2)' }}
                  title="Copy this item's finish, colour & material to every other item of the same type"
                >
                  <Icon.Palette width={14} height={14} />
                  Apply finish to all ({sameTypeCount - 1})
                </button>
              ) : null}
              {sameTypeCount > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    const s = useStore.getState()
                    s.setSelectedItemIds(
                      s.items.filter((i) => i.defId === item.defId).map((i) => i.id),
                    )
                  }}
                  className="btn btn-soft btn-block"
                  style={{ marginTop: 'var(--s-2)' }}
                  title="Select every item of this type to move, rotate or delete them together"
                >
                  <Icon.Cube width={14} height={14} />
                  Select all of type ({sameTypeCount})
                </button>
              ) : null}
              {activeGroupId && item.groupId !== activeGroupId && (
                <button
                  type="button"
                  onClick={() => addToGroup(item.id, activeGroupId)}
                  className="btn btn-soft btn-block"
                  style={{ marginTop: 'var(--s-2)' }}
                >
                  <Icon.Group width={14} height={14} />
                  Add to group
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
