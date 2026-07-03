import { useState } from 'react'
import { useFeature } from '../../features/useFeature'
import { editableRooms } from '../../state/rooms'
import { useStore } from '../../state/store'
import { Select } from '../controls/Select'
import { Icon } from './icons'
import { RoomReorderModal } from './RoomReorderModal'

/**
 * The per-room editor's room dropdown. Room list follows the active plan
 * (default apartment → built-in rooms minus external ledges; custom plan → its
 * own rooms), ordered alphabetically by default. With the `roomReorder` pro
 * flag on, a button opens the reorder dialog to pin a manual order.
 */
export function RoomSwitcher({ className = 'input toolbar-room-select' }: { className?: string }) {
  const roomId = useStore((s) => s.roomEditor.roomId)
  const enterRoomEditor = useStore((s) => s.enterRoomEditor)
  const plan = useStore((s) => s.floorPlan)
  // Subscribe to roomOrder so the dropdown re-renders when the manual order changes.
  const roomOrder = useStore((s) => s.roomOrder)
  const reorderOn = useFeature('roomReorder')
  const [reorderOpen, setReorderOpen] = useState(false)
  const options = editableRooms(plan, roomOrder)
  return (
    <>
      <Select
        className={className}
        ariaLabel="Room to edit"
        value={roomId ?? ''}
        onChange={(v) => enterRoomEditor(v)}
        options={options.map((r) => ({ value: r.id, label: r.name }))}
      />
      {reorderOn ? (
        <button
          type="button"
          className="tool-btn"
          aria-label="Reorder rooms"
          title="Reorder rooms"
          onClick={() => setReorderOpen(true)}
        >
          <Icon.Sort width={18} height={18} />
        </button>
      ) : null}
      {reorderOpen ? <RoomReorderModal onClose={() => setReorderOpen(false)} /> : null}
    </>
  )
}
