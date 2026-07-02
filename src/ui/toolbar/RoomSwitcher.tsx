import { editableRooms } from '../../state/rooms'
import { useStore } from '../../state/store'
import { Select } from '../controls/Select'

/**
 * The per-room editor's room dropdown. Room list follows the active plan
 * (default apartment → built-in rooms minus external ledges; custom plan → its
 * own rooms).
 */
export function RoomSwitcher({ className = 'input toolbar-room-select' }: { className?: string }) {
  const roomId = useStore((s) => s.roomEditor.roomId)
  const enterRoomEditor = useStore((s) => s.enterRoomEditor)
  const plan = useStore((s) => s.floorPlan)
  const options = editableRooms(plan)
  return (
    <Select
      className={className}
      ariaLabel="Room to edit"
      value={roomId ?? ''}
      onChange={(v) => enterRoomEditor(v)}
      options={options.map((r) => ({ value: r.id, label: r.name }))}
    />
  )
}
