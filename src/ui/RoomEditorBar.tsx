import { useStore } from '../state/store';
import { ROOMS } from '../apartment/constants';

/** Top-left pill shown while the per-room editor is active: room name + exit. */
export function RoomEditorBar() {
  const active = useStore((s) => s.roomEditor.active);
  const roomId = useStore((s) => s.roomEditor.roomId);
  const exitRoomEditor = useStore((s) => s.exitRoomEditor);
  if (!active || !roomId) return null;
  const name = ROOMS[roomId]?.name ?? 'Room';
  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: 12,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        background: 'rgba(20,20,22,0.82)',
        color: '#fff',
        font: '500 13px system-ui, sans-serif',
        backdropFilter: 'blur(6px)',
      }}
    >
      <button
        type="button"
        onClick={exitRoomEditor}
        style={{
          border: 'none',
          background: 'transparent',
          color: '#fff',
          cursor: 'pointer',
          font: 'inherit',
          padding: 0,
        }}
        aria-label="Exit room editor"
      >
        ← Exit room
      </button>
      <span style={{ opacity: 0.5 }}>·</span>
      <span>{name}</span>
    </div>
  );
}
