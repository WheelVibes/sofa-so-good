import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { canPlace } from '../../collision/placement'
import { placementWalls } from '../../collision/placementWalls'
import { useFeature } from '../../features/useFeature'
import { pointInRoom } from '../../floorplan/types'
import {
  ARRAY_MAX_COUNT,
  type ArrayAxis,
  arrayOffsets,
  gridArrayPlacements,
} from '../../furniture/arrayPlacement'
import { isIkeaDef, useCatalog } from '../../furniture/catalog'
import { itemPrice } from '../../furniture/furniturePrices'
import { isEmitter, isItemEmitter, resolveEmitterSpec } from '../../furniture/lightEmitters'
import { radialArrayPlacements } from '../../furniture/radialArray'
import { isOffSquare, nearestRightAngle } from '../../layout/angle'
import { rotationFacingRoom } from '../../layout/faceWall'
import { useStore } from '../../state/store'
import { formatDimsShort } from '../../utils/measurement'
import { CategoryIcon } from '../catalog/CategoryIcon'
import { ThemeColorRows } from '../color/ThemeColorRows'
import { Icon } from '../toolbar/icons'
import { GltfBody } from './GltfBody'
import { IesProfilePicker } from './IesProfilePicker'
import { IkeaBody } from './IkeaBody'
import { InspectorSection } from './InspectorSection'
import { MultiSelectPanel } from './MultiSelectPanel'
import { ParametricBody } from './ParametricBody'
import { PathArraySection } from './PathArraySection'
import { PosField } from './PosField'
import { ScatterFillSection } from './ScatterFillSection'
import { SourceLine } from './SourceLine'
import { TiltControls } from './TiltControls'
import { MinimizeButton, useInspectorMinimize } from './useInspectorMinimize'

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
  // Replace-with-similar (PARITY-REPLACE): swap to a nearest-size sibling.
  const replaceSimilarOn = useFeature('replaceSimilar')
  const itemAsLightOn = useFeature('itemAsLight')
  // Multi-axis tilt (SweetHome3DJS parity): pitch/roll an item off vertical.
  const tiltOn = useFeature('tiltFurniture')
  const radialArrayOn = useFeature('radialArray')
  // Duplicate-along-path array (PARITY-DUP-PATH): place copies along a drawn polyline.
  const pathArrayOn = useFeature('pathArray')
  // Scatter-fill a room with N collision-safe copies (PARITY-SCATTER-ROOM).
  const scatterFillOn = useFeature('scatterFill')
  const tiltItem = useStore((s) => s.tiltItem)
  // Per-item elevation (SweetHome3DJS parity) — grouped with mount-height control.
  const elevationOn = useFeature('mountHeights')
  const setItemElevation = useStore((s) => s.setItemElevation)
  const inspectorCeiling = useStore((s) => s.floorPlan.ceilingHeight)
  // Per-item opacity (ghost) + hide in 3D.
  const itemOpacityOn = useFeature('itemOpacity')
  const toggleItemHidden = useStore((s) => s.toggleItemHidden)
  const itemHidden = useStore((s) => (item ? s.hiddenItemIds.includes(item.id) : false))
  // Copy/paste appearance (look-only transfer) + recolour-by-category.
  const copyAppearanceOn = useFeature('copyAppearance')
  // Price displays are gated behind the budget/price feature (off by default).
  const priceOn = useFeature('budget')
  const appearanceClipboard = useStore((s) => s.appearanceClipboard)
  const sameCategoryCount = useStore((s) => {
    if (!item) return 0
    const cat = catalog[item.defId]?.category
    if (!cat) return 0
    return s.items.filter((i) => catalog[i.defId]?.category === cat).length
  })
  const deleteItem = useStore((s) => s.deleteItem)
  const selectItem = useStore((s) => s.selectItem)
  const flipItem = useStore((s) => s.flipItem)
  const toggleLock = useStore((s) => s.toggleLock)
  const pushHistory = useStore((s) => s.pushHistory)
  const activeGroupId = useStore((s) => s.activeGroupId)
  const addToGroup = useStore((s) => s.addToGroup)
  const units = useStore((s) => s.units)
  const renameItem = useStore((s) => s.renameItem)
  const { minimized, toggle } = useInspectorMinimize(item?.id)
  const [arrayCount, setArrayCount] = useState(3)
  const [arrayAxis, setArrayAxis] = useState<ArrayAxis>('right')
  const [arraySpacingOverride, setArraySpacingOverride] = useState<number | null>(null)
  const [arrayRows, setArrayRows] = useState(1)
  const [arrayRowSpacingOverride, setArrayRowSpacingOverride] = useState<number | null>(null)
  const [radialCount, setRadialCount] = useState(6)
  const [radialRadius, setRadialRadius] = useState(1.0)
  const [radialStartAngle, setRadialStartAngle] = useState(0)
  const [radialSweep, setRadialSweep] = useState(360)
  const [radialFaceCenter, setRadialFaceCenter] = useState(true)
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

  // Place N copies around a circle (radial/polar array). Each is collision-checked;
  // copies that don't fit are skipped (not contiguous like linear, since a blocked slot
  // shouldn't break the full ring). Original + all copies share a groupId; committed
  // in a single undo step via setItems.
  const duplicateRadial = () => {
    const st = useStore.getState()
    const count = Math.max(2, Math.min(36, Math.round(radialCount)))
    const r = Math.max(0.01, radialRadius)
    const sweep = Math.max(0, Math.min(360, radialSweep))
    if (sweep === 0) return
    const placements = radialArrayPlacements({
      center: item.position,
      radius: r,
      count,
      startAngle: (radialStartAngle * Math.PI) / 180,
      sweep: (sweep * Math.PI) / 180,
      faceCenter: radialFaceCenter,
      baseRotation: item.rotation,
    })
    const gid =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `grp-${Date.now()}`
    const newItems: (typeof item)[] = []
    let others = st.items
    for (const { position: pos, rotation: rot } of placements) {
      const probe = {
        id: 'radial-probe',
        defId: item.defId,
        position: pos,
        rotation: rot,
        props: item.props,
      }
      // Skip blocked slots (unlike linear array, we don't stop at first blocked —
      // a ring should fill as many valid positions as possible).
      if (
        !canPlace(probe, def, { others, defs: catalog, doors: st.doors, walls: placementWalls(st) })
      )
        continue
      const ni = {
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
    if (newItems.length === 0) return
    st.pushHistory()
    st.setItems(
      st.items.map((it) => (it.id === item.id ? { ...it, groupId: gid } : it)).concat(newItems),
    )
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
    const newItems: (typeof item)[] = []
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
                {priceOn ? (
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
                ) : null}
              </>
            )}
          </div>
        </div>
        <div className="insp-head-btns">
          {itemAsLightOn && !isEmitter(item.defId) && (
            <button
              type="button"
              onClick={() => {
                const next = { ...item.props }
                if (item.props.lightOn === 'yes') delete next.lightOn
                else next.lightOn = 'yes'
                useStore.getState().updateItemProps(item.id, next)
              }}
              className={`icon-btn${item.props.lightOn === 'yes' ? ' on' : ''}`}
              aria-label={
                item.props.lightOn === 'yes' ? 'Turn off light source' : 'Make a light source'
              }
              title="Emit light at night from this item"
            >
              <Icon.Lights width={16} height={16} />
            </button>
          )}
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
                    step={1}
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
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-2)' }}
                  >
                    <label
                      className="fld"
                      style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                    >
                      <span
                        className="label"
                        style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}
                      >
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
                    <label
                      className="fld"
                      style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                    >
                      <span
                        className="label"
                        style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}
                      >
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
                    <label
                      className="fld"
                      style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                    >
                      <span
                        className="label"
                        style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}
                      >
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
                    <label
                      className="fld"
                      style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                    >
                      <span
                        className="label"
                        style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}
                      >
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
                          setArrayRowSpacingOverride(
                            e.target.value === '' ? null : Math.max(0.01, v),
                          )
                        }}
                        aria-label="Row spacing centre-to-centre in metres"
                        className="input"
                        style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
                      />
                    </label>
                  </div>
                  <label
                    className="fld"
                    style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                  >
                    <span
                      className="label"
                      style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}
                    >
                      Direction
                    </span>
                    <select
                      value={arrayAxis}
                      onChange={(e) => setArrayAxis(e.target.value as ArrayAxis)}
                      aria-label="Array column direction"
                      className="input"
                      style={{ fontSize: 'var(--t-xs)' }}
                    >
                      <option value="right">Right (+X)</option>
                      <option value="left">Left (−X)</option>
                      <option value="forward">Forward (+Z)</option>
                      <option value="back">Back (−Z)</option>
                    </select>
                  </label>
                </div>
              ) : null}
              {proMode && radialArrayOn ? (
                <div
                  className="act-array act-array--radial"
                  title="Place copies evenly around a circle (e.g. chairs around a round table)"
                  style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--s-2)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>Radial array</span>
                    <button
                      type="button"
                      className="act-array-go"
                      onClick={duplicateRadial}
                      style={{ marginLeft: 'auto' }}
                    >
                      <Icon.Copy width={13} height={13} />
                      Go
                    </button>
                  </div>
                  <div
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-2)' }}
                  >
                    <label
                      className="fld"
                      style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                    >
                      <span
                        className="label"
                        style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}
                      >
                        Count
                      </span>
                      <input
                        type="number"
                        min={2}
                        max={36}
                        value={radialCount}
                        onChange={(e) => setRadialCount(Number(e.target.value) || 2)}
                        aria-label="Number of copies in the radial array"
                        className="input"
                        style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
                      />
                    </label>
                    <label
                      className="fld"
                      style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                    >
                      <span
                        className="label"
                        style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}
                      >
                        Radius (m)
                      </span>
                      <input
                        type="number"
                        min={0.05}
                        max={20}
                        step={0.05}
                        value={radialRadius}
                        onChange={(e) => setRadialRadius(Number(e.target.value) || 0.5)}
                        aria-label="Ring radius in metres"
                        className="input"
                        style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
                      />
                    </label>
                    <label
                      className="fld"
                      style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                    >
                      <span
                        className="label"
                        style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}
                      >
                        Start angle (°)
                      </span>
                      <input
                        type="number"
                        min={-360}
                        max={360}
                        step={15}
                        value={radialStartAngle}
                        onChange={(e) => setRadialStartAngle(Number(e.target.value))}
                        aria-label="Starting angle in degrees"
                        className="input"
                        style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
                      />
                    </label>
                    <label
                      className="fld"
                      style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                    >
                      <span
                        className="label"
                        style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}
                      >
                        Sweep (°)
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={360}
                        step={15}
                        value={radialSweep}
                        onChange={(e) => setRadialSweep(Number(e.target.value) || 360)}
                        aria-label="Total angular sweep in degrees"
                        className="input"
                        style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
                      />
                    </label>
                  </div>
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={radialFaceCenter}
                      onChange={(e) => setRadialFaceCenter(e.target.checked)}
                      aria-label="Face center — rotate each copy to face the ring centre"
                    />
                    <span style={{ fontSize: 'var(--t-xs)', color: 'var(--text-2)' }}>
                      Face centre
                    </span>
                  </label>
                </div>
              ) : null}
              {proMode && pathArrayOn ? (
                <PathArraySection item={item} def={def} catalog={catalog} />
              ) : null}
              {proMode && scatterFillOn ? (
                <ScatterFillSection item={item} def={def} catalog={catalog} />
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
              {tiltOn &&
              !item.locked &&
              !(def.kind === 'parametric' && def.primitive === 'Staircase') ? (
                <TiltControls
                  pitch={item.pitch ?? 0}
                  roll={item.roll ?? 0}
                  onPitch={(rad) => tiltItem(item.id, { pitch: rad })}
                  onRoll={(rad) => tiltItem(item.id, { roll: rad })}
                  onReset={() => tiltItem(item.id, { pitch: 0, roll: 0 })}
                />
              ) : null}
              {elevationOn && !item.locked ? (
                <div className="fld" style={{ display: 'block', marginTop: 'var(--s-2)' }}>
                  <div
                    className="label"
                    style={{
                      fontSize: 'var(--t-2xs)',
                      color: 'var(--text-3)',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>Elevation (off floor)</span>
                    <input
                      type="number"
                      min={0}
                      max={Math.max(0.1, inspectorCeiling)}
                      step={0.05}
                      key={(item.elevation ?? 0).toFixed(2)}
                      defaultValue={(item.elevation ?? 0).toFixed(2)}
                      onBlur={(e) => {
                        const v = Number(e.target.value)
                        if (Number.isFinite(v))
                          setItemElevation(
                            item.id,
                            Math.min(Math.max(0.1, inspectorCeiling), Math.max(0, v)),
                          )
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      }}
                      aria-label="Elevation above floor (m)"
                      style={{
                        width: '58px',
                        textAlign: 'right',
                        background: 'var(--surface)',
                        border: '1px solid var(--border-2)',
                        borderRadius: 'var(--r-1)',
                        padding: '1px 4px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--t-2xs)',
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    className="slider"
                    aria-label="Elevation above floor"
                    min={0}
                    max={Math.max(0.1, inspectorCeiling)}
                    step={0.05}
                    value={item.elevation ?? 0}
                    onChange={(e) => setItemElevation(item.id, Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>
              ) : null}
              {itemOpacityOn ? (
                <div className="fld" style={{ display: 'block', marginTop: 'var(--s-2)' }}>
                  <div
                    className="label"
                    style={{
                      fontSize: 'var(--t-2xs)',
                      color: 'var(--text-3)',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>Opacity</span>
                    <span>
                      {Math.round(
                        (item.props['opacity'] != null ? Number(item.props['opacity']) : 1) * 100,
                      )}
                      %
                    </span>
                  </div>
                  <input
                    type="range"
                    className="slider"
                    aria-label="Item opacity"
                    min={0.15}
                    max={1}
                    step={0.05}
                    value={item.props['opacity'] != null ? Number(item.props['opacity']) : 1}
                    onChange={(e) =>
                      useStore
                        .getState()
                        .updateItemProps(item.id, { opacity: Number(e.target.value) })
                    }
                    style={{ width: '100%' }}
                  />
                  <label
                    className="flex items-center gap-2 text-xs"
                    style={{ marginTop: 'var(--s-1)' }}
                  >
                    <input
                      type="checkbox"
                      checked={itemHidden}
                      onChange={() => toggleItemHidden(item.id)}
                    />
                    <span>Hide in 3D view</span>
                  </label>
                </div>
              ) : null}
              {itemAsLightOn && isItemEmitter(item.defId, item.props)
                ? (() => {
                    const spec = resolveEmitterSpec(item.defId, item.props)
                    const color =
                      typeof item.props.lightColor === 'string'
                        ? item.props.lightColor
                        : (spec?.color ?? '#ffe2b0')
                    const intensity =
                      typeof item.props.lightIntensity === 'number'
                        ? item.props.lightIntensity
                        : (spec?.intensity ?? 5)
                    return (
                      <div className="space-y-1" style={{ marginTop: 'var(--s-2)' }}>
                        <div
                          className="label"
                          style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}
                        >
                          Light
                        </div>
                        <label className="flex items-center justify-between gap-2 text-xs">
                          <span>Colour</span>
                          <input
                            type="color"
                            aria-label="Light colour"
                            value={color}
                            onChange={(e) =>
                              useStore
                                .getState()
                                .updateItemProps(item.id, { lightColor: e.target.value })
                            }
                          />
                        </label>
                        <ThemeColorRows
                          active={color}
                          onPick={(hex) =>
                            useStore.getState().updateItemProps(item.id, { lightColor: hex })
                          }
                        />
                        <label className="flex items-center justify-between gap-2 text-xs">
                          <span>Brightness</span>
                          <input
                            type="range"
                            aria-label="Light brightness"
                            min={1}
                            max={12}
                            step={0.5}
                            value={intensity}
                            onChange={(e) =>
                              useStore.getState().updateItemProps(item.id, {
                                lightIntensity: Number(e.target.value),
                              })
                            }
                            style={{ flex: 1 }}
                          />
                          <span className="w-8 text-right font-mono">{intensity.toFixed(0)}</span>
                        </label>
                        <IesProfilePicker
                          itemId={item.id}
                          value={
                            typeof item.props.iesProfile === 'string' ? item.props.iesProfile : ''
                          }
                        />
                      </div>
                    )
                  })()
                : null}
              {replaceSimilarOn ? (
                <button
                  type="button"
                  onClick={() => useStore.getState().setSwapItemId(item.id)}
                  className="btn btn-soft btn-block"
                  style={{ marginTop: 'var(--s-2)' }}
                  title="Swap this piece for a nearest-size catalog alternative, keeping its place"
                >
                  <Icon.Copy width={14} height={14} />
                  Replace with similar…
                </button>
              ) : null}
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
              {copyAppearanceOn ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (useStore.getState().copyAppearance(item.id))
                        useStore.getState().notify.start({
                          title: 'Appearance copied',
                          message: 'Select another item and Paste appearance.',
                          kind: 'success',
                        })
                    }}
                    className="btn btn-soft btn-block"
                    style={{ marginTop: 'var(--s-2)' }}
                    title="Copy this item's finish, colour & material (not its size) to reuse on others"
                  >
                    <Icon.Copy width={14} height={14} />
                    Copy appearance
                  </button>
                  {appearanceClipboard ? (
                    <button
                      type="button"
                      onClick={() => {
                        const s = useStore.getState()
                        const ids = s.selectedItemIds.length > 0 ? s.selectedItemIds : [item.id]
                        const n = s.pasteAppearanceTo(ids)
                        s.notify.start({
                          title: n > 0 ? `Pasted appearance to ${n}` : 'Nothing to change',
                          kind: n > 0 ? 'success' : 'info',
                        })
                      }}
                      className="btn btn-soft btn-block"
                      style={{ marginTop: 'var(--s-2)' }}
                      title={`Apply the copied “${appearanceClipboard.name}” look to the selection`}
                    >
                      <Icon.Palette width={14} height={14} />
                      Paste appearance
                    </button>
                  ) : null}
                  {sameCategoryCount > 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const n = useStore.getState().applyAppearanceToCategory(item.id)
                        if (n > 0)
                          useStore.getState().notify.start({
                            title: `Recoloured ${n} in this category`,
                            kind: 'success',
                          })
                      }}
                      className="btn btn-soft btn-block"
                      style={{ marginTop: 'var(--s-2)' }}
                      title="Apply this item's finish/colour to every item in the same category"
                    >
                      <Icon.Palette width={14} height={14} />
                      Recolour category ({sameCategoryCount - 1})
                    </button>
                  ) : null}
                </>
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
