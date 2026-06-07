import { useShallow } from 'zustand/react/shallow'
import { pointInRoom } from '../../floorplan/types'
import { editableRooms } from '../../state/rooms'
import { useStore } from '../../state/store'

/**
 * The per-room editor's room dropdown, with a furniture count per room so you
 * can see furnishing progress (and spot empty rooms) at a glance while working
 * room-by-room. Subscribes to `items` *locally* so the parent toolbar doesn't
 * re-render on every edit (it's a tiny `<select>`). Room list follows the active
 * plan (default apartment → built-in rooms minus external ledges; custom plan →
 * its own rooms); counts use the polygon/extension-aware `pointInRoom`.
 */
export function RoomSwitcher({ className = 'input toolbar-room-select' }: { className?: string }) {
  const roomId = useStore((s) => s.roomEditor.roomId)
  const enterRoomEditor = useStore((s) => s.enterRoomEditor)
  const plan = useStore((s) => s.floorPlan)
  const items = useStore(useShallow((s) => s.items))
  const options = editableRooms(plan)
  const countFor = (id: string) => {
    const pr = plan.rooms.find((r) => r.id === id)
    return pr ? items.filter((it) => pointInRoom(pr, it.position[0], it.position[1])).length : 0
  }
  return (
    <select
      className={className}
      aria-label="Room to edit"
      value={roomId ?? ''}
      onChange={(e) => enterRoomEditor(e.target.value)}
    >
      {options.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name} ({countFor(r.id)})
        </option>
      ))}
    </select>
  )
}
