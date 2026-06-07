import { planRoomArea, pointInRoom } from '../floorplan/types'
import { useStore } from '../state/store'
import { formatRoomSize } from '../utils/measurement'
import { useIsMobile } from './useIsMobile'

/**
 * A small top-centre caption shown while the per-room editor is active, naming
 * the isolated room, its size, and how many pieces are in it (e.g. "Main
 * Bedroom · 2.85 × 3.40 m · 9.7 m² · 4 items"). Reads the room from the active
 * plan, so it works for the built-in apartment and custom plans alike. Pure DOM
 * overlay; hidden outside the room editor.
 */
export function RoomEditorCaption() {
  const active = useStore((s) => s.roomEditor.active)
  const roomId = useStore((s) => s.roomEditor.roomId)
  const rooms = useStore((s) => s.floorPlan.rooms)
  const items = useStore((s) => s.items)
  const units = useStore((s) => s.units)
  // On mobile the room NAME is already in the collapsed top bar's dropdown, so
  // the caption drops it there and shows only the size (avoids redundancy).
  const isMobile = useIsMobile()
  if (!active || !roomId) return null
  const room = rooms.find((r) => r.id === roomId)
  if (!room) return null
  const count = items.filter((it) => pointInRoom(room, it.position[0], it.position[1])).length
  return (
    <div
      className="room-editor-caption pointer-events-none absolute z-20"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 64px)',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '5px 12px',
        borderRadius: 'var(--r-pill, 999px)',
        background: 'var(--surface-solid)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-2, 0 2px 8px rgba(0,0,0,0.18))',
        fontSize: 'var(--t-xs)',
        whiteSpace: 'nowrap',
        maxWidth: 'calc(100vw - 24px)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      aria-hidden="true"
    >
      {!isMobile && <span style={{ fontWeight: 700, color: 'var(--text)' }}>{room.name}</span>}
      <span style={{ color: isMobile ? 'var(--text-2)' : 'var(--text-3)' }}>
        {!isMobile && '  ·  '}
        {formatRoomSize(room.width, room.depth, planRoomArea(room), units)}
        {`  ·  ${count} ${count === 1 ? 'item' : 'items'}`}
      </span>
    </div>
  )
}
