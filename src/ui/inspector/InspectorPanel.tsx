import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { canPlace } from '../../collision/placement'
import { isDefaultPlan, planCollisionWalls } from '../../floorplan/planGeometry'
import { isIkeaDef, useCatalog } from '../../furniture/catalog'
import { planDuplicates } from '../../furniture/duplicatePlacement'
import { useStore } from '../../state/store'
import { formatDimsShort } from '../../utils/measurement'
import { CategoryIcon } from '../catalog/CategoryIcon'
import { Icon } from '../toolbar/icons'
import { GltfBody } from './GltfBody'
import { IkeaBody } from './IkeaBody'
import { ParametricBody } from './ParametricBody'
import { SourceLine } from './SourceLine'

/** Panel shown when 2+ items are selected: count + align / distribute / bulk
 *  actions (the marquee/shift-click multi-selection). */
function MultiSelectPanel() {
  const count = useStore((s) => s.selectedItemIds.length)
  const selectedItemIds = useStore((s) => s.selectedItemIds)
  const activeGroupId = useStore((s) => s.activeGroupId)
  const groupItems = useStore((s) => s.groupItems)
  const ungroup = useStore((s) => s.ungroup)
  const catalog = useCatalog()

  const wallsFor = (s: ReturnType<typeof useStore.getState>) =>
    isDefaultPlan(s.floorPlan) ? undefined : planCollisionWalls(s.floorPlan, s.doors)

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
        walls: wallsFor(s),
      })
    )
      s.moveItem(id, pos)
  }

  const align = (axis: 0 | 1) => {
    const s = useStore.getState()
    const sel = s.items.filter((i) => s.selectedItemIds.includes(i.id) && !i.locked)
    if (sel.length < 2) return
    const mean = sel.reduce((a, i) => a + i.position[axis], 0) / sel.length
    s.pushHistory()
    for (const it of sel) {
      const pos: [number, number] = axis === 0 ? [mean, it.position[1]] : [it.position[0], mean]
      tryMove(it.id, pos)
    }
  }

  const distribute = (axis: 0 | 1) => {
    const s = useStore.getState()
    const sel = s.items
      .filter((i) => s.selectedItemIds.includes(i.id) && !i.locked)
      .sort((a, b) => a.position[axis] - b.position[axis])
    if (sel.length < 3) return
    const lo = sel[0].position[axis]
    const hi = sel[sel.length - 1].position[axis]
    const step = (hi - lo) / (sel.length - 1)
    s.pushHistory()
    sel.forEach((it, i) => {
      if (i === 0 || i === sel.length - 1) return
      const v = lo + step * i
      tryMove(it.id, axis === 0 ? [v, it.position[1]] : [it.position[0], v])
    })
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
    <aside className="panel inspector">
      <div className="panel-head">
        <div>
          <div className="panel-title">{count} items selected</div>
          <div className="panel-sub">Multi-select</div>
        </div>
        <button
          type="button"
          onClick={() => useStore.getState().selectItem(null)}
          className="icon-btn"
          aria-label="Clear selection"
        >
          <Icon.Close width={16} height={16} />
        </button>
      </div>
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
      canPlace({ ...it, rotation: next }, def, { others: st.items, defs: catalog, doors: st.doors })
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
      canPlace({ ...it, rotation: rot }, def, { others: st.items, defs: catalog, doors: st.doors })
    ) {
      st.pushHistory()
      st.rotateItem(it.id, rot)
    }
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
          if (canPlace(probe, def, { others: st.items, defs: catalog, doors: st.doors })) {
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
    const rot = item.rotation
    const rx = Math.cos(rot)
    const rz = -Math.sin(rot) // local +X projected to world XZ
    const step = w + 0.12
    const gid =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `grp-${Date.now()}`
    const newItems: (typeof item)[] = []
    let others = st.items
    for (let i = 1; i < count; i++) {
      const pos: [number, number] = [
        item.position[0] + rx * step * i,
        item.position[1] + rz * step * i,
      ]
      const probe = {
        id: `row-${i}`,
        defId: item.defId,
        position: pos,
        rotation: rot,
        props: item.props,
      }
      if (!canPlace(probe, def, { others, defs: catalog, doors: st.doors })) break
      const ni = {
        ...item,
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `id-${Date.now()}-${i}`,
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
    <aside className="panel inspector">
      <div className="panel-head">
        <div>
          <div className="insp-thumb">
            <CategoryIcon category={def.category} width={22} height={22} />
          </div>
          <div>
            <div className="panel-title">{item.label ?? def.name}</div>
            <div className="panel-sub">{def.category}</div>
            <div className="dims mono" title="Width × Depth × Height">
              {formatDimsShort([w, d, def.defaultFootprint.h], units)}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => selectItem(null)}
          className="icon-btn"
          aria-label="Close inspector"
        >
          <Icon.Close width={16} height={16} />
        </button>
      </div>
      <hr className="hr" />
      <div className="panel-body">
        <label className="flex items-center gap-2 text-xs" style={{ marginBottom: 'var(--s-2)' }}>
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
        <div className="sec" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div className="sec-h">
            <span>Transform</span>
          </div>
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
        </div>
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
          <button
            type="button"
            onClick={() => useStore.getState().setSwapItemId(item.id)}
            className="btn btn-soft btn-block"
            style={{ marginTop: 'var(--s-2)' }}
          >
            <Icon.Copy width={14} height={14} />
            Swap with similar
          </button>
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
    </aside>
  )
}
