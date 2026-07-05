import { pointInRoom } from '../floorplan/types'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

/**
 * A gentle empty-state nudge shown in the per-room editor when the room has no
 * furniture yet (a fresh custom-plan room, or after "Clear room") — inviting the
 * user to open the catalog. Hidden once the catalog is open, in walk mode, and
 * outside the editor. Pure DOM overlay; only the button is interactive so it
 * never blocks orbiting.
 */
export function EmptyRoomHint() {
  const active = useStore((s) => s.roomEditor.active)
  const roomId = useStore((s) => s.roomEditor.roomId)
  const rooms = useStore((s) => s.floorPlan.rooms)
  const items = useStore((s) => s.items)
  const cameraMode = useStore((s) => s.cameraMode)
  const catalogOpen = useStore((s) => s.catalogOpen)
  const setCatalogOpen = useStore((s) => s.setCatalogOpen)
  const setLeftMode = useStore((s) => s.setLeftMode)
  // Closeable: once dismissed it stays hidden (per-device), like other hints —
  // so a user who just wants to see the empty room isn't stuck with it.
  const dismissed = useStore((s) => s.dismissedCallouts.includes('empty-room-hint'))
  const dismissCallout = useStore((s) => s.dismissCallout)

  if (!active || !roomId || cameraMode !== 'orbit' || catalogOpen || dismissed) return null
  const room = rooms.find((r) => r.id === roomId)
  if (!room) return null
  const empty = !items.some((it) => pointInRoom(room, it.position[0], it.position[1]))
  if (!empty) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
      aria-hidden="false"
    >
      <div
        className="panel"
        style={{
          pointerEvents: 'auto',
          position: 'relative',
          textAlign: 'center',
          padding: '20px 24px',
          maxWidth: 320,
          borderRadius: 'var(--r-3, 12px)',
          boxShadow: 'var(--shadow-panel)',
        }}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label="Dismiss"
          title="Dismiss"
          onClick={() => dismissCallout('empty-room-hint')}
          style={{ position: 'absolute', top: 8, right: 8 }}
        >
          <Icon.Close width={16} height={16} />
        </button>
        <span style={{ color: 'var(--text-3)', display: 'inline-flex' }}>
          <Icon.Catalog width={26} height={26} />
        </span>
        <div
          style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--text)', marginTop: 8 }}
        >
          This room is empty
        </div>
        <p
          style={{
            fontSize: 'var(--t-sm)',
            lineHeight: 1.5,
            color: 'var(--text-2)',
            margin: '6px 0 14px',
          }}
        >
          Add furniture from the catalog to start designing this space.
        </p>
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => {
            setLeftMode('catalog')
            setCatalogOpen(true)
          }}
        >
          <Icon.Catalog width={14} height={14} />
          Open catalog
        </button>
      </div>
    </div>
  )
}
