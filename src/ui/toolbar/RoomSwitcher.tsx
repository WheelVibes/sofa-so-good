import { useRef, useState } from 'react'
import { useFeature } from '../../features/useFeature'
import { editableRooms } from '../../state/rooms'
import { useStore } from '../../state/store'
import { Select } from '../controls/Select'
import { Icon } from './icons'

/**
 * The per-room editor's room dropdown. Room list follows the active plan
 * (default apartment → built-in rooms minus external ledges; custom plan → its
 * own rooms), ordered alphabetically by default. With the `roomReorder` flag on,
 * each entry carries a drag handle on its right edge: dragging it by pointer
 * (mouse or touch) reorders the list in place and pins a manual order — no
 * separate reorder dialog. The order persists per-device (editorPrefs →
 * `roomOrder`); `[]` restores A–Z.
 */
export function RoomSwitcher({ className = 'input toolbar-room-select' }: { className?: string }) {
  const roomId = useStore((s) => s.roomEditor.roomId)
  const enterRoomEditor = useStore((s) => s.enterRoomEditor)
  const plan = useStore((s) => s.floorPlan)
  // Subscribe to roomOrder so the dropdown re-renders when the manual order changes.
  const roomOrder = useStore((s) => s.roomOrder)
  const setRoomOrder = useStore((s) => s.setRoomOrder)
  const reorderOn = useFeature('roomReorder')
  const options = editableRooms(plan, roomOrder)

  const dragId = useRef<string | null>(null)
  const activePointer = useRef<number | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // Current room ids in display order, read fresh from the store so a drag never
  // works off a stale closure.
  const currentIds = () => editableRooms(plan, useStore.getState().roomOrder).map((r) => r.id)

  // Which option-row index the pointer's Y sits over (midpoint split), for live
  // reorder. Scoped to the open listbox the handle lives in.
  const rowIndexAtY = (listEl: Element, clientY: number): number => {
    const rows = Array.from(listEl.querySelectorAll('.select-option-row'))
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k].getBoundingClientRect()
      if (clientY < r.top + r.height / 2) return k
    }
    return Math.max(0, rows.length - 1)
  }

  const onHandleDown = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragId.current = id
    activePointer.current = e.pointerId
    setDraggingId(id)
    try {
      ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    } catch {}
  }

  const onHandleMove = (e: React.PointerEvent) => {
    if (dragId.current == null || e.pointerId !== activePointer.current) return
    const listEl = (e.currentTarget as Element).closest('[role="listbox"]')
    if (!listEl) return
    const ids = currentIds()
    const from = ids.indexOf(dragId.current)
    const to = rowIndexAtY(listEl, e.clientY)
    if (from >= 0 && to >= 0 && to !== from) {
      const next = [...ids]
      const [it] = next.splice(from, 1)
      next.splice(to, 0, it)
      setRoomOrder(next) // live: options recompute → rows reorder reactively
    }
  }

  const onHandleUp = (e: React.PointerEvent) => {
    if (e.pointerId !== activePointer.current) return
    dragId.current = null
    activePointer.current = null
    setDraggingId(null)
  }

  return (
    <Select
      className={className}
      ariaLabel="Room to edit"
      value={roomId ?? ''}
      onChange={(v) => enterRoomEditor(v)}
      options={options.map((r) => ({ value: r.id, label: r.name }))}
      optionTrailing={
        reorderOn
          ? (o) => (
              <button
                type="button"
                className={`room-reorder-handle${draggingId === o.value ? ' dragging' : ''}`}
                aria-label={`Drag to reorder ${o.label}`}
                title="Drag to reorder"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={onHandleDown(o.value)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
              >
                <Icon.Drag width={16} height={16} />
              </button>
            )
          : undefined
      }
    />
  )
}
