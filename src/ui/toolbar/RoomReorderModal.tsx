import { useState } from 'react'
import { editableRooms } from '../../state/rooms'
import { useStore } from '../../state/store'
import { Modal } from '../Modal'
import { Icon } from './icons'

/** Move item at `i` by `delta` (±1) within a copy of `ids`, clamped. */
function move(ids: string[], i: number, delta: number): string[] {
  const j = i + delta
  if (j < 0 || j >= ids.length) return ids
  const next = [...ids]
  const [item] = next.splice(i, 1)
  next.splice(j, 0, item)
  return next
}

/**
 * Reorder the per-room editor's room list (behind the `roomReorder` pro flag).
 * The list defaults to alphabetical; here the user pins a manual order with
 * up/down controls, or resets back to A–Z. The order persists per-device
 * (editorPrefs → `roomOrder`).
 */
export function RoomReorderModal({ onClose }: { onClose: () => void }) {
  const plan = useStore((s) => s.floorPlan)
  const setRoomOrder = useStore((s) => s.setRoomOrder)
  // Seed the working list from the current (alphabetical-or-custom) display order.
  const [ids, setIds] = useState<string[]>(() => editableRooms(plan).map((r) => r.id))
  const nameOf = (id: string) => editableRooms(plan).find((r) => r.id === id)?.name ?? id

  const apply = (next: string[]) => {
    setIds(next)
    setRoomOrder(next)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reorder rooms"
      sub="Room list"
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
      <ul className="room-reorder">
        {ids.map((id, i) => (
          <li key={id} className="room-reorder-row">
            <span className="room-reorder-idx mono">{i + 1}</span>
            <span className="room-reorder-name">{nameOf(id)}</span>
            <span className="room-reorder-acts">
              <button
                type="button"
                className="icon-btn"
                aria-label={`Move ${nameOf(id)} up`}
                disabled={i === 0}
                onClick={() => apply(move(ids, i, -1))}
              >
                <Icon.Chevron width={16} height={16} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Move ${nameOf(id)} down`}
                disabled={i === ids.length - 1}
                onClick={() => apply(move(ids, i, 1))}
              >
                <Icon.Chevron width={16} height={16} />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
