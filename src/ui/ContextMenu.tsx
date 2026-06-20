import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { canPlace } from '../collision/placement'
import { useFeature } from '../features/useFeature'
import { type PlanRoom, pointInRoom } from '../floorplan/types'
import { useCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'
import { Icon, type IconName } from './toolbar/icons'

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

/** Right-click context menu for a placed item: quick actions without opening
 *  the inspector. Mirrors the design's `.ctx-menu`. */
export function ContextMenu() {
  const menu = useStore((s) => s.contextMenu)
  const close = useStore((s) => s.closeContextMenu)
  const catalog = useCatalog()
  const replaceSimilarOn = useFeature('replaceSimilar')
  const groupsOn = useFeature('furnitureGroups')

  useEffect(() => {
    if (!menu) return
    const onDown = () => close()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    // Close on any pointer-down outside (the menu stops propagation itself) and
    // on scroll/resize.
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [menu, close])

  if (!menu) return null
  const s = useStore.getState()
  const item = s.items.find((i) => i.id === menu.itemId)
  if (!item) return null
  const def = catalog[item.defId]
  if (!def) return null
  const locked = !!item.locked
  const sameTypeCount = s.items.filter((i) => i.defId === item.defId).length

  const rotate90 = () => {
    const st = useStore.getState()
    const it = st.items.find((i) => i.id === item.id)
    if (!it || it.locked) return
    const next = it.rotation + Math.PI / 2
    if (
      canPlace({ ...it, rotation: next }, def, { others: st.items, defs: catalog, doors: st.doors })
    ) {
      st.pushHistory()
      st.rotateItem(it.id, next)
    }
  }

  const flip = () => {
    const st = useStore.getState()
    const it = st.items.find((i) => i.id === item.id)
    if (!it || it.locked) return
    // Mirror the F shortcut: flip left↔right. Footprint is unchanged, so no
    // collision check is needed.
    st.pushHistory()
    st.flipItem(it.id, 'x')
  }

  // Snap a freely-rotated piece (e.g. after a Shift-drag on the rotate gizmo)
  // back to the nearest right angle — i.e. square to the walls.
  const QUARTER = Math.PI / 2
  const turns = item.rotation / QUARTER
  const askew = Math.abs(turns - Math.round(turns)) > 0.01
  const straighten = () => {
    const st = useStore.getState()
    const it = st.items.find((i) => i.id === item.id)
    if (!it || it.locked) return
    const next = Math.round(it.rotation / QUARTER) * QUARTER
    if (
      canPlace({ ...it, rotation: next }, def, { others: st.items, defs: catalog, doors: st.doors })
    ) {
      st.pushHistory()
      st.rotateItem(it.id, next)
    }
  }

  // Centre the piece in its room (handy for rugs, ceiling lights, dining
  // tables). Uses the active plan's rooms; declines (notify) if the centre is
  // blocked or the item isn't inside any room.
  const inRoom = useStore
    .getState()
    .floorPlan.rooms.some((r) => pointInRoom(r, item.position[0], item.position[1]))
  const centerInRoom = () => {
    const st = useStore.getState()
    const it = st.items.find((i) => i.id === item.id)
    if (!it || it.locked) return
    const room = st.floorPlan.rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
    if (!room) return
    const c = roomCentre(room)
    const ok = canPlace({ ...it, position: c }, def, {
      others: st.items.filter((o) => o.id !== it.id),
      defs: catalog,
      doors: st.doors,
    })
    if (ok) {
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

  const run = (fn: () => void) => () => {
    fn()
    close()
  }

  const Row = ({
    icon,
    label,
    sk,
    danger,
    disabled,
    onClick,
  }: {
    icon: IconName
    label: string
    sk?: string
    danger?: boolean
    disabled?: boolean
    onClick: () => void
  }) => {
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
        {sk ? <kbd className="sk">{sk}</kbd> : null}
      </button>
    )
  }

  // Clamp to viewport.
  const left = Math.min(menu.x, window.innerWidth - 210)
  const top = Math.min(menu.y, window.innerHeight - 320)

  return createPortal(
    <div className="ctx-menu" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="ctx-head">
        <Icon.Cube className="icn" width={16} height={16} />
        <b>{def.name}</b>
      </div>
      {replaceSimilarOn ? (
        <Row
          icon="Copy"
          label="Replace with similar…"
          onClick={() => useStore.getState().setSwapItemId(item.id)}
        />
      ) : null}
      <Row icon="Rotate" label="Rotate 90°" sk="R" disabled={locked} onClick={rotate90} />
      {askew ? (
        <Row icon="Rotate" label="Straighten" disabled={locked} onClick={straighten} />
      ) : null}
      {inRoom ? (
        <Row icon="Tidy" label="Centre in room" disabled={locked} onClick={centerInRoom} />
      ) : null}
      <Row icon="FlipH" label="Flip" sk="F" disabled={locked} onClick={flip} />
      <Row icon="Copy" label="Duplicate" sk="⌘D" onClick={duplicate} />
      {sameTypeCount > 1 ? (
        <Row
          icon="Layers"
          label={`Select all of this type (${sameTypeCount})`}
          onClick={() => {
            const st = useStore.getState()
            const ids = st.items.filter((i) => i.defId === item.defId).map((i) => i.id)
            st.setSelectedItemIds(ids)
          }}
        />
      ) : null}
      <Row
        icon="EyeOff"
        label="Hide"
        onClick={() => {
          const st = useStore.getState()
          // Hide the whole selection when this item is part of it, else just it.
          const ids = st.selectedItemIds.includes(item.id) ? st.selectedItemIds : [item.id]
          st.setItemsHidden(ids, true)
        }}
      />
      <Row
        icon="EyeOff"
        label="Isolate (hide others)"
        onClick={() => {
          const st = useStore.getState()
          const keep = st.selectedItemIds.includes(item.id) ? st.selectedItemIds : [item.id]
          st.isolateItems(keep)
        }}
      />
      {s.hiddenItemIds.length > 0 ? (
        <Row
          icon="Eye"
          label={`Show all (${s.hiddenItemIds.length} hidden)`}
          onClick={() => useStore.getState().showAllItems()}
        />
      ) : null}
      {sameTypeCount > 1 ? (
        <Row
          icon="Palette"
          label="Apply style to all of this type"
          onClick={() => {
            const n = useStore.getState().applyStyleToAll(item.id)
            if (n > 0) {
              useStore.getState().notify.start({
                title: `Applied this style to ${n} more`,
                kind: 'success',
              })
            }
          }}
        />
      ) : null}
      <div className="ctx-sep" />
      {groupsOn && item.groupId ? (
        <Row
          icon="Group"
          label="Ungroup"
          onClick={() => useStore.getState().ungroup(item.groupId as string)}
        />
      ) : groupsOn && s.selectedItemIds.length > 1 ? (
        <Row
          icon="Group"
          label="Group"
          onClick={() => {
            const st = useStore.getState()
            st.groupItems(st.selectedItemIds)
          }}
        />
      ) : null}
      <Row
        icon={locked ? 'Lock' : 'Unlock'}
        label={locked ? 'Unlock' : 'Lock'}
        onClick={() => useStore.getState().toggleLock(item.id)}
      />
      <div className="ctx-sep" />
      <Row
        icon="Trash"
        label="Delete"
        sk="Del"
        danger
        disabled={locked}
        onClick={() => useStore.getState().deleteItem(item.id)}
      />
    </div>,
    document.body,
  )
}
