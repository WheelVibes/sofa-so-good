import { canPlace, itemFootprint } from '../../collision/placement'
import { placementWalls } from '../../collision/placementWalls'
import { useFeature } from '../../features/useFeature'
import { currentRecolorValue } from '../../furniture/appearanceProps'
import { useCatalog } from '../../furniture/catalog'
import { planDuplicates } from '../../furniture/duplicatePlacement'
import { itemsCost } from '../../furniture/itemsCost'
import {
  alignCenter,
  alignEdge,
  distributeEvenGaps,
  obbAxisHalf,
} from '../../layout/alignDistribute'
import {
  arrangeSelectionAsRun,
  faceSelectionIntoRoom,
  mirrorSelectionAxis,
  mirrorSelectionX,
  snapSelectionToWall,
} from '../../layout/selectionActions'
import { useStore } from '../../state/store'
import { ColorPicker } from '../controls/ColorPicker'
import { Icon } from '../toolbar/icons'
import { IsolateControl } from './ItemPhysicalControls'
import { MinimizeButton, useInspectorMinimize } from './useInspectorMinimize'

/** Panel shown when 2+ items are selected: count + align / distribute / bulk
 *  actions (the marquee/shift-click multi-selection). */
export function MultiSelectPanel() {
  const count = useStore((s) => s.selectedItemIds.length)
  const selectedItemIds = useStore((s) => s.selectedItemIds)
  const activeGroupId = useStore((s) => s.activeGroupId)
  const groupItems = useStore((s) => s.groupItems)
  const ungroup = useStore((s) => s.ungroup)
  const catalog = useCatalog()
  const copyAppearanceOn = useFeature('copyAppearance')
  const bulkAppearanceOn = useFeature('bulkAppearance')
  const groupsOn = useFeature('furnitureGroups')
  const isolateOn = useFeature('isolateSelection')
  const mirrorAxisOn = useFeature('mirrorSelection')
  // The recolour value shared by every selected (unlocked) item, or '' when
  // they differ / carry none — drives the bulk ColorPicker's displayed swatch.
  // Uses `currentRecolorValue` (not a raw `props.tint` read) so a parametric
  // item's `color` field is reflected here too, not just GLB `tint`.
  const sharedTint = useStore((s) => {
    const sel = s.items.filter((i) => s.selectedItemIds.includes(i.id) && !i.locked)
    if (sel.length === 0) return ''
    const values = sel.map((it) => {
      const def = catalog[it.defId]
      return def ? currentRecolorValue(it, def) : ''
    })
    const first = values[0]
    return values.every((v) => v === first) ? first : ''
  })
  // Whether ANY selected item carries a recolour worth clearing — so "Clear
  // tint" is offered even when the selection's values differ (sharedTint is
  // '' but a reset still helps).
  const anyTinted = useStore((s) =>
    s.items.some((i) => {
      if (!s.selectedItemIds.includes(i.id) || i.locked) return false
      const def = catalog[i.defId]
      return def ? currentRecolorValue(i, def) !== '' : false
    }),
  )
  // Price displays are gated behind the budget/price feature (off by default).
  const priceOn = useFeature('budget')
  const appearanceClipboard = useStore((s) => s.appearanceClipboard)
  const { minimized, toggle } = useInspectorMinimize(selectedItemIds.join(','))
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

  // Bulk recolour: `recolorItems` targets whichever prop key(s) each selected
  // (unlocked) item's OWN def understands — GLB/IKEA `tint`, parametric every
  // `color`-kind paramSchema field — in one undo step. An empty hex clears the
  // recolour instead (gltf → drop the tint override; parametric → reset each
  // color field to its designed default).
  const setTintAll = (hex: string) => {
    const s = useStore.getState()
    const ids = s.items
      .filter((i) => s.selectedItemIds.includes(i.id) && !i.locked)
      .map((i) => i.id)
    s.recolorItems(ids, hex === '' ? null : hex)
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
  // When items are too large to fit without overlap, gaps are clamped to 0
  // (flush/touching) and a non-blocking hint is shown.
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
    const { positions, clamped } = distributeEvenGaps(boxes)
    if (positions.size === 0) return
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

  // Orient every selected (unlocked) piece so its back is to the nearest wall of
  // whichever room contains it — a bulk version of the single-item action.
  const faceAllIntoRoom = () => faceSelectionIntoRoom(catalog)

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

  // Wall-aware bulk actions (shared with the command palette via selectionActions).
  const snapToWall = () => snapSelectionToWall(catalog)
  const arrangeAsRun = () => arrangeSelectionAsRun(catalog)
  const mirror = () => mirrorSelectionX(catalog)
  // Mirror across the room's Z axis (front↔back) — the axis-choice companion to
  // the always-on X mirror above, gated behind `mirrorSelection` (FEAT-2).
  const mirrorZ = () => mirrorSelectionAxis(catalog, 'z')

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
              Multi-select
              {priceOn && totalPrice > 0 ? ` · ~$${totalPrice.toLocaleString('en-SG')} total` : ''}
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
                <button
                  type="button"
                  className="act"
                  onClick={mirror}
                  title="Mirror the selection left↔right across its centre"
                >
                  <Icon.FlipH width={16} height={16} />
                  {mirrorAxisOn ? 'Mirror X' : 'Mirror'}
                </button>
                {mirrorAxisOn ? (
                  <button
                    type="button"
                    className="act"
                    onClick={mirrorZ}
                    title="Mirror the selection front↔back across its centre"
                  >
                    <Icon.FlipV width={16} height={16} />
                    Mirror Z
                  </button>
                ) : null}
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
              <button
                type="button"
                className="btn btn-soft btn-block"
                style={{ marginTop: 'var(--s-2)' }}
                onClick={arrangeAsRun}
                title="Line the selection up as one run, butted edge-to-edge along the nearest wall"
              >
                <Icon.Tidy width={14} height={14} />
                Arrange as run
              </button>
            </div>
            {bulkAppearanceOn ? (
              <div className="sec">
                <div className="label">Appearance</div>
                <div
                  className="row ms-appearance"
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}
                >
                  <span className="flex-1">Tint all</span>
                  <ColorPicker
                    value={sharedTint || '#ffffff'}
                    onChange={setTintAll}
                    ariaLabel="Tint every selected item"
                    title="Recolour every selected item"
                    className={sharedTint ? 'on' : ''}
                  />
                  {anyTinted ? (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setTintAll('')}
                      title="Clear the tint from every selected item"
                      aria-label="Clear tint"
                    >
                      <Icon.Reset width={14} height={14} />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="sec">
              {groupsOn &&
                (activeGroupId ? (
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
                ))}
              {copyAppearanceOn && appearanceClipboard ? (
                <button
                  type="button"
                  onClick={() => {
                    const s = useStore.getState()
                    const n = s.pasteAppearanceTo(s.selectedItemIds)
                    s.notify.start({
                      title: n > 0 ? `Pasted appearance to ${n}` : 'Nothing to change',
                      kind: n > 0 ? 'success' : 'info',
                    })
                  }}
                  className="btn btn-soft btn-block"
                  style={{ marginTop: 'var(--s-2)' }}
                  title={`Apply the copied “${appearanceClipboard.name}” look to every selected item`}
                >
                  <Icon.Palette width={14} height={14} />
                  Paste appearance
                </button>
              ) : null}
              {isolateOn ? <IsolateControl /> : null}
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
