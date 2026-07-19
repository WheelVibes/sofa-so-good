import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { canPlace } from '../collision/placement'
import { useFeature } from '../features/useFeature'
import { levelById } from '../floorplan/levels'
import { defaultOpeningName, defaultWallName } from '../floorplan/planElementName'
import { type PlanRoom, pointInRoom } from '../floorplan/types'
import { useCatalog } from '../furniture/catalog'
import type { ContextTarget } from '../state/slices/featuresSlice'
import { useStore } from '../state/store'
import { Icon, type IconName } from './toolbar/icons'
import { useIsMobile } from './useIsMobile'

/** Centre point of a plan room — polygon centroid when free-form, else the
 *  (main) rectangle centre. */
function roomCentre(r: PlanRoom): [number, number] {
  if (r.polygon && r.polygon.length > 0) {
    const n = r.polygon.length
    const sx = r.polygon.reduce((a, p) => a + p[0], 0) / n
    const sz = r.polygon.reduce((a, p) => a + p[1], 0) / n
    return [sx, sz]
  }
  return [r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2]
}

interface RowSpec {
  icon: IconName
  label: string
  sk?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

/**
 * Dynamic right-click context menu. Overrides the browser menu everywhere it is
 * wired (the 3D per-room editor's furniture + the 2D plan's walls / rooms /
 * openings / dimensions / annotations / empty canvas) and rebuilds its action
 * list from the right-clicked `target` + the current selection, so the relevant
 * operations (group, lock, layer order, flip, duplicate, delete, …) show on
 * every screen. Gated by the `contextMenu` feature flag.
 */
export function ContextMenu() {
  const menu = useStore((s) => s.contextMenu)
  const close = useStore((s) => s.closeContextMenu)
  const catalog = useCatalog()
  // Touch devices have no keyboard, so the shortcut chips (R / F / ⌘D / Del)
  // are noise there — the menu row itself is the affordance (MOBILE-CTX-KBD).
  const isMobile = useIsMobile()
  const menuOn = useFeature('contextMenu')
  const replaceSimilarOn = useFeature('replaceSimilar')
  const groupsOn = useFeature('furnitureGroups')
  const layerOrderOn = useFeature('layerOrder')
  const isolateOn = useFeature('isolateSelection')

  useEffect(() => {
    if (!menu) return
    const onDown = () => close()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [menu, close])

  if (!menuOn || !menu) return null

  const target: ContextTarget =
    menu.target ?? (menu.itemId ? { kind: 'item', id: menu.itemId } : { kind: 'canvas' })
  const levelId = menu.levelId

  const built = buildMenu(target, levelId, {
    catalog,
    replaceSimilarOn,
    groupsOn,
    layerOrderOn,
    isolateOn,
  })
  if (!built) return null
  const { heading, headingIcon, rows } = built
  if (rows.length === 0) return null
  const HeadIcon = Icon[headingIcon]

  const run = (fn: () => void) => () => {
    fn()
    close()
  }

  const Row = ({ icon, label, sk, danger, disabled, onClick }: RowSpec) => {
    const Glyph = Icon[icon]
    return (
      <button
        type="button"
        className={`ctx-item${danger ? ' danger' : ''}`}
        disabled={disabled}
        onClick={run(onClick)}
        style={disabled ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
      >
        <Glyph className="icn" width={16} height={16} />
        {label}
        {sk && !isMobile ? <kbd className="sk">{sk}</kbd> : null}
      </button>
    )
  }

  // Clamp to viewport (rough height estimate per row).
  const left = Math.min(menu.x, window.innerWidth - 220)
  const top = Math.min(menu.y, window.innerHeight - (rows.length * 34 + 60))

  return createPortal(
    <div className="ctx-menu" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="ctx-head">
        <HeadIcon className="icn" width={16} height={16} />
        <b>{heading}</b>
      </div>
      {rows.map((r, i) =>
        r === 'sep' ? <div key={`sep-${i}`} className="ctx-sep" /> : <Row key={r.label} {...r} />,
      )}
    </div>,
    document.body,
  )
}

interface MenuCtx {
  catalog: ReturnType<typeof useCatalog>
  replaceSimilarOn: boolean
  groupsOn: boolean
  layerOrderOn: boolean
  isolateOn: boolean
}

type MenuRow = RowSpec | 'sep'

/** Build the heading + action rows for a target. Returns null when the target is
 *  stale (e.g. the item/element was deleted). */
function buildMenu(
  target: ContextTarget,
  levelId: string | undefined,
  ctx: MenuCtx,
): { heading: string; headingIcon: IconName; rows: MenuRow[] } | null {
  switch (target.kind) {
    case 'item':
      return buildItemMenu(target.id, ctx)
    case 'wall':
      return buildWallMenu(target.id, levelId)
    case 'room':
      return buildRoomMenu(target.id, levelId)
    case 'opening':
      return buildOpeningMenu(target.id, levelId)
    case 'dim':
      return buildSimplePlanMenu('Dimension', 'Measure', () =>
        useStore.getState().removeDimension(target.id),
      )
    case 'note':
      return buildSimplePlanMenu('Note', 'Edit', () => useStore.getState().removeNote(target.id))
    case 'polyline':
      return buildSimplePlanMenu('Polyline', 'Edit', () =>
        useStore.getState().removePolyline(target.id),
      )
    case 'mep':
      return buildSimplePlanMenu(
        target.family === 'electrical' ? 'Electrical point' : 'Plumbing point',
        'Lights',
        () =>
          target.family === 'electrical'
            ? useStore.getState().removeElectricalPoint(target.id)
            : useStore.getState().removePlumbingPoint(target.id),
      )
    case 'canvas':
      return buildCanvasMenu()
  }
}

function buildItemMenu(
  itemId: string,
  ctx: MenuCtx,
): { heading: string; headingIcon: IconName; rows: MenuRow[] } | null {
  const s = useStore.getState()
  const item = s.items.find((i) => i.id === itemId)
  if (!item) return null
  const def = ctx.catalog[item.defId]
  if (!def) return null
  const locked = !!item.locked
  const sel = s.selectedItemIds.includes(item.id) ? s.selectedItemIds : [item.id]
  const multi = sel.length > 1
  const sameTypeCount = s.items.filter((i) => i.defId === item.defId).length

  const rotate90 = () => {
    const st = useStore.getState()
    const it = st.items.find((i) => i.id === item.id)
    if (!it || it.locked) return
    const next = it.rotation + Math.PI / 2
    if (
      canPlace({ ...it, rotation: next }, def, {
        others: st.items,
        defs: ctx.catalog,
        doors: st.doors,
      })
    ) {
      st.pushHistory()
      st.rotateItem(it.id, next)
    }
  }
  const flip = () => {
    const st = useStore.getState()
    st.pushHistory()
    // Flip the whole selection so a grouped/multi flip moves together.
    for (const id of sel) {
      const it = st.items.find((i) => i.id === id)
      if (it && !it.locked) st.flipItem(id, 'x')
    }
  }
  const QUARTER = Math.PI / 2
  const turns = item.rotation / QUARTER
  const askew = Math.abs(turns - Math.round(turns)) > 0.01
  const straighten = () => {
    const st = useStore.getState()
    const it = st.items.find((i) => i.id === item.id)
    if (!it || it.locked) return
    const next = Math.round(it.rotation / QUARTER) * QUARTER
    if (
      canPlace({ ...it, rotation: next }, def, {
        others: st.items,
        defs: ctx.catalog,
        doors: st.doors,
      })
    ) {
      st.pushHistory()
      st.rotateItem(it.id, next)
    }
  }
  const inRoom = s.floorPlan.rooms.some((r) => pointInRoom(r, item.position[0], item.position[1]))
  const centerInRoom = () => {
    const st = useStore.getState()
    const it = st.items.find((i) => i.id === item.id)
    if (!it || it.locked) return
    const room = st.floorPlan.rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
    if (!room) return
    const c = roomCentre(room)
    if (
      canPlace({ ...it, position: c }, def, {
        others: st.items.filter((o) => o.id !== it.id),
        defs: ctx.catalog,
        doors: st.doors,
      })
    ) {
      st.pushHistory()
      st.moveItem(it.id, c)
    } else {
      st.notify.start({ title: "Room centre is occupied — can't centre here", kind: 'info' })
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
            id: 'ctx-dup',
            defId: item.defId,
            position: pos,
            rotation: item.rotation,
            props: item.props,
          }
          if (canPlace(probe, def, { others: st.items, defs: ctx.catalog, doors: st.doors })) {
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

  const rows: MenuRow[] = []
  if (ctx.replaceSimilarOn && !multi)
    rows.push({
      icon: 'Copy',
      label: 'Replace with similar…',
      onClick: () => useStore.getState().setSwapItemId(item.id),
    })
  rows.push({ icon: 'Rotate', label: 'Rotate 90°', sk: 'R', disabled: locked, onClick: rotate90 })
  if (askew)
    rows.push({ icon: 'Rotate', label: 'Straighten', disabled: locked, onClick: straighten })
  if (inRoom && !multi)
    rows.push({ icon: 'Tidy', label: 'Centre in room', disabled: locked, onClick: centerInRoom })
  rows.push({
    icon: 'FlipH',
    label: multi ? 'Flip selection' : 'Flip',
    sk: 'F',
    disabled: locked,
    onClick: flip,
  })
  rows.push({ icon: 'Copy', label: 'Duplicate', sk: '⌘D', onClick: duplicate })

  // Layer order (z-order) — Canva-style bring forward / send to back.
  if (ctx.layerOrderOn) {
    rows.push('sep')
    rows.push({
      icon: 'Layers',
      label: 'Bring to front',
      onClick: () => useStore.getState().reorderItems(sel, 'front'),
    })
    rows.push({
      icon: 'Layers',
      label: 'Bring forward',
      onClick: () => useStore.getState().reorderItems(sel, 'forward'),
    })
    rows.push({
      icon: 'Layers',
      label: 'Send backward',
      onClick: () => useStore.getState().reorderItems(sel, 'backward'),
    })
    rows.push({
      icon: 'Layers',
      label: 'Send to back',
      onClick: () => useStore.getState().reorderItems(sel, 'back'),
    })
  }

  if (sameTypeCount > 1)
    rows.push({
      icon: 'Layers',
      label: `Select all of this type (${sameTypeCount})`,
      onClick: () => {
        const st = useStore.getState()
        st.setSelectedItemIds(st.items.filter((i) => i.defId === item.defId).map((i) => i.id))
      },
    })

  rows.push('sep')
  rows.push({
    icon: 'EyeOff',
    label: multi ? 'Hide selection' : 'Hide',
    onClick: () => useStore.getState().setItemsHidden(sel, true),
  })
  if (s.hiddenItemIds.length > 0)
    rows.push({
      icon: 'Eye',
      label: `Show all (${s.hiddenItemIds.length} hidden)`,
      onClick: () => useStore.getState().showAllItems(),
    })

  // Isolate/solo (FEAT-C): dim everything except this item (or the current
  // multi-selection). A right-click on a not-yet-selected item selects it
  // first so isolate always frames the item the menu was opened on.
  if (ctx.isolateOn)
    rows.push({
      icon: 'Focus',
      label: s.isolateActive ? 'Exit isolate' : multi ? 'Isolate selection' : 'Isolate',
      onClick: () => {
        const st = useStore.getState()
        if (!st.selectedItemIds.includes(item.id)) st.selectItemGrouped(item.id, {})
        useStore.getState().toggleIsolateSelection()
      },
    })

  // Group / ungroup.
  if (ctx.groupsOn) {
    rows.push('sep')
    if (item.groupId)
      rows.push({
        icon: 'Group',
        label: 'Ungroup',
        onClick: () => useStore.getState().ungroup(item.groupId as string),
      })
    else if (multi)
      rows.push({
        icon: 'Group',
        label: 'Group',
        onClick: () => useStore.getState().groupItems(sel),
      })
  }
  rows.push({
    icon: locked ? 'Lock' : 'Unlock',
    label: locked ? (multi ? 'Unlock selection' : 'Unlock') : multi ? 'Lock selection' : 'Lock',
    onClick: () => {
      const st = useStore.getState()
      if (multi) st.setItemsLocked(sel, !locked)
      else st.toggleLock(item.id)
    },
  })

  rows.push('sep')
  rows.push({
    icon: 'Trash',
    label: multi ? `Delete ${sel.length} items` : 'Delete',
    sk: 'Del',
    danger: true,
    disabled: locked,
    onClick: () => {
      const st = useStore.getState()
      const lockedIds = new Set(st.items.filter((i) => i.locked).map((i) => i.id))
      st.pushHistory()
      for (const id of [...sel]) if (!lockedIds.has(id)) st.deleteItem(id)
    },
  })

  return { heading: multi ? `${sel.length} items` : def.name, headingIcon: 'Cube', rows }
}

function buildWallMenu(
  id: string,
  levelId: string | undefined,
): { heading: string; headingIcon: IconName; rows: MenuRow[] } | null {
  const s = useStore.getState()
  const level = levelById(s.floorPlan, levelId)
  const wall = level.walls.find((w) => w.id === id)
  if (!wall) return null
  const locked = !!wall.locked
  const sel = new Set<string>([id, ...s.selectedWallIds])
  const multi = sel.size > 1
  const rows: MenuRow[] = [
    {
      icon: 'Rotate',
      label: 'Reverse direction',
      disabled: locked,
      onClick: () => useStore.getState().reverseWall(id, levelId),
    },
    {
      icon: 'Distribute',
      label: 'Split in half',
      disabled: locked,
      onClick: () => useStore.getState().splitWall(id, 0.5, levelId),
    },
    {
      icon: 'Group',
      label: 'Join collinear',
      disabled: locked,
      onClick: () => useStore.getState().joinWall(id, levelId),
    },
    {
      icon: 'Copy',
      label: 'Duplicate',
      onClick: () => useStore.getState().duplicateWall(id, levelId),
    },
    'sep',
    {
      icon: locked ? 'Lock' : 'Unlock',
      label: locked ? 'Unlock' : multi ? 'Lock selection' : 'Lock',
      onClick: () => useStore.getState().setWallsLocked([...sel], !locked, levelId),
    },
    'sep',
    {
      icon: 'Trash',
      label: multi ? `Delete ${sel.size} walls` : 'Delete',
      sk: 'Del',
      danger: true,
      disabled: locked,
      onClick: () => useStore.getState().removeWalls([...sel], levelId),
    },
  ]
  return { heading: multi ? `${sel.size} walls` : defaultWallName(wall), headingIcon: 'Cube', rows }
}

function buildRoomMenu(
  id: string,
  levelId: string | undefined,
): { heading: string; headingIcon: IconName; rows: MenuRow[] } | null {
  const s = useStore.getState()
  const room = s.floorPlan.rooms.find((r) => r.id === id) ?? null
  // Rooms may live on an upper storey; fall back to a name lookup across levels.
  const name = room?.name ?? 'Room'
  const rows: MenuRow[] = [
    {
      icon: 'Copy',
      label: 'Duplicate room',
      onClick: () => useStore.getState().duplicateRoom(id, levelId),
    },
    'sep',
    {
      icon: 'Trash',
      label: 'Delete room',
      sk: 'Del',
      danger: true,
      onClick: () => useStore.getState().removeRoom(id, levelId),
    },
  ]
  return { heading: name, headingIcon: 'Cube', rows }
}

function buildOpeningMenu(
  id: string,
  levelId: string | undefined,
): { heading: string; headingIcon: IconName; rows: MenuRow[] } | null {
  const s = useStore.getState()
  const level = levelById(s.floorPlan, levelId)
  const opening = level.openings.find((o) => o.id === id)
  if (!opening) return null
  const rows: MenuRow[] = [
    {
      icon: 'Copy',
      label: 'Duplicate',
      onClick: () => useStore.getState().duplicateOpening(id, levelId),
    },
    'sep',
    {
      icon: 'Trash',
      label: `Delete ${opening.kind}`,
      sk: 'Del',
      danger: true,
      onClick: () => useStore.getState().removeOpening(id, levelId),
    },
  ]
  return { heading: defaultOpeningName(opening), headingIcon: 'Cube', rows }
}

function buildSimplePlanMenu(
  label: string,
  icon: IconName,
  onDelete: () => void,
): { heading: string; headingIcon: IconName; rows: MenuRow[] } {
  return {
    heading: label,
    headingIcon: icon,
    rows: [
      {
        icon: 'Trash',
        label: `Delete ${label.toLowerCase()}`,
        sk: 'Del',
        danger: true,
        onClick: onDelete,
      },
    ],
  }
}

function buildCanvasMenu(): { heading: string; headingIcon: IconName; rows: MenuRow[] } | null {
  // Empty-canvas right-click currently has no menu actions (the browser default
  // is still suppressed by the editor). Selection-based actions live above.
  return null
}
