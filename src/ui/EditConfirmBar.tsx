import { useEffect } from 'react'
import { isAnyModalOpen } from '../controls/modalGuard'
import { isEditableTarget } from '../controls/useKeyboard'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

/**
 * Floating tick / cross confirmation for an in-progress edit. After a furniture
 * move, rotate or placement the change is applied live but stays **pending** —
 * the user commits it with the tick or reverts it with the cross. Enter commits,
 * Escape reverts. Sits just above the canvas HUD but below modals so it never
 * hides behind a panel.
 */
export function EditConfirmBar() {
  const pending = useStore((s) => s.pendingEdit)
  const roomEditorActive = useStore((s) => s.roomEditor.active)
  const confirm = useStore((s) => s.confirmPendingEdit)
  const cancel = useStore((s) => s.cancelPendingEdit)

  // Leaving the room editor abandons any half-finished edit: keep the change
  // (it's already applied) and just clear the confirmation so the bar doesn't
  // linger over the overview.
  useEffect(() => {
    if (!roomEditorActive && pending) confirm()
  }, [roomEditorActive, pending, confirm])

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (isAnyModalOpen() || isEditableTarget(e)) return
      if (e.key === 'Enter') {
        e.preventDefault()
        confirm()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, confirm, cancel])

  if (!pending) return null
  const label = pending.kind === 'placement' ? 'Place item?' : 'Apply change?'
  return (
    <div className="edit-confirm" role="dialog" aria-label={label}>
      <span className="edit-confirm-label">{label}</span>
      <button
        type="button"
        className="edit-confirm-btn cancel"
        onClick={cancel}
        aria-label="Cancel change"
        title="Cancel (Esc)"
      >
        <Icon.Close width={18} height={18} />
      </button>
      <button
        type="button"
        className="edit-confirm-btn confirm"
        onClick={confirm}
        aria-label="Confirm change"
        title="Confirm (Enter)"
      >
        <Icon.Check width={18} height={18} />
      </button>
    </div>
  )
}
