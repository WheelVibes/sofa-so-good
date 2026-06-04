import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { canPlace } from '../collision/placement'
import { useCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'
import { Icon, type IconName } from './toolbar/icons'

/** Right-click context menu for a placed item: quick actions without opening
 *  the inspector. Mirrors the design's `.ctx-menu`. */
export function ContextMenu() {
  const menu = useStore((s) => s.contextMenu)
  const close = useStore((s) => s.closeContextMenu)
  const catalog = useCatalog()

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
      <Row
        icon="Copy"
        label="Swap with similar…"
        onClick={() => useStore.getState().setSwapItemId(item.id)}
      />
      <Row icon="Rotate" label="Rotate 90°" sk="R" disabled={locked} onClick={rotate90} />
      <Row icon="FlipH" label="Flip" sk="F" disabled={locked} onClick={flip} />
      <Row icon="Copy" label="Duplicate" sk="⌘D" onClick={duplicate} />
      <div className="ctx-sep" />
      {item.groupId ? (
        <Row
          icon="Group"
          label="Ungroup"
          onClick={() => useStore.getState().ungroup(item.groupId as string)}
        />
      ) : s.selectedItemIds.length > 1 ? (
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
