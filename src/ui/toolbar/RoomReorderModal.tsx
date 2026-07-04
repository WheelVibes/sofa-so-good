import { useRef, useState } from 'react'
import { editableRooms } from '../../state/rooms'
import { useStore } from '../../state/store'
import { Modal } from '../Modal'
import { Icon } from './icons'

/**
 * Reorder the per-room editor's room list (behind the `roomReorder` pro flag).
 * The list defaults to alphabetical; here the user pins a manual order by
 * **dragging a row by its hamburger handle** (pointer-based, so it works with
 * both mouse and touch — bug report #10, replacing the old up/down buttons), or
 * resets back to A–Z. The order persists per-device (editorPrefs → `roomOrder`).
 */
export function RoomReorderModal({ onClose }: { onClose: () => void }) {
  const plan = useStore((s) => s.floorPlan)
  const setRoomOrder = useStore((s) => s.setRoomOrder)
  // Seed the working list from the current (alphabetical-or-custom) display order.
  const [ids, setIds] = useState<string[]>(() => editableRooms(plan).map((r) => r.id))
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const nameOf = (id: string) => editableRooms(plan).find((r) => r.id === id)?.name ?? id

  const listRef = useRef<HTMLUListElement>(null)
  const dragId = useRef<string | null>(null)
  const activePointer = useRef<number | null>(null)

  // Which row index the pointer's Y sits over (midpoint split), for live reorder.
  const rowIndexAtY = (clientY: number): number => {
    const rows = Array.from(listRef.current?.querySelectorAll('.room-reorder-row') ?? [])
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k].getBoundingClientRect()
      if (clientY < r.top + r.height / 2) return k
    }
    return Math.max(0, rows.length - 1)
  }

  const onHandleDown = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault()
    dragId.current = id
    activePointer.current = e.pointerId
    setDraggingId(id)
    try {
      ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    } catch {}
  }

  const onHandleMove = (e: React.PointerEvent) => {
    if (dragId.current == null || e.pointerId !== activePointer.current) return
    const from = ids.indexOf(dragId.current)
    const to = rowIndexAtY(e.clientY)
    if (from >= 0 && to >= 0 && to !== from) {
      const next = [...ids]
      const [it] = next.splice(from, 1)
      next.splice(to, 0, it)
      setIds(next)
    }
  }

  const onHandleUp = (e: React.PointerEvent) => {
    if (e.pointerId !== activePointer.current) return
    if (dragId.current != null) setRoomOrder(ids) // persist the final manual order
    dragId.current = null
    activePointer.current = null
    setDraggingId(null)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reorder rooms"
      sub="Drag a room by its handle to reorder"
      width="var(--modal-sm)"
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 'var(--s-2)',
            padding: 'var(--s-3) var(--s-4)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={() => {
              // Reset to alphabetical: clear the override + reseed the list.
              setRoomOrder([])
              setIds(editableRooms(plan, []).map((r) => r.id))
            }}
          >
            Reset to A–Z
          </button>
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <ul className="room-reorder" ref={listRef}>
        {ids.map((id, i) => (
          <li key={id} className={`room-reorder-row${draggingId === id ? ' dragging' : ''}`}>
            <button
              type="button"
              className="room-reorder-handle"
              aria-label={`Drag to reorder ${nameOf(id)}`}
              title="Drag to reorder"
              onPointerDown={onHandleDown(id)}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
            >
              <Icon.Drag width={16} height={16} />
            </button>
            <span className="room-reorder-idx mono">{i + 1}</span>
            <span className="room-reorder-name">{nameOf(id)}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
