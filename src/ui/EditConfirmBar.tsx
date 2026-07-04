import { useCallback, useEffect, useRef, useState } from 'react'
import { isAnyModalOpen } from '../controls/modalGuard'
import { isEditableTarget } from '../controls/useKeyboard'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

/** Transient exit animation length (ms) — matches the `.leaving`/`.rejecting`
 *  keyframes in parts.css. Skipped entirely under prefers-reduced-motion. */
const EXIT_MS = 150

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Floating tick / cross confirmation for an in-progress edit. After a furniture
 * move, rotate or placement the change is applied live but stays **pending** —
 * the user commits it with the tick or reverts it with the cross. Enter commits,
 * Escape reverts. Sits just above the canvas HUD but below modals so it never
 * hides behind a panel.
 *
 * On dismiss the bar plays a brief exit animation before the store action runs:
 * `.leaving` (slide down) on commit, `.rejecting` (shake) on cancel. Both the
 * buttons and the Enter/Escape keys route through the same wrapped handlers, so
 * the animation plays uniformly. The delay is skipped under reduced-motion.
 */
export function EditConfirmBar() {
  const pending = useStore((s) => s.pendingEdit)
  const roomEditorActive = useStore((s) => s.roomEditor.active)
  // PLAN-FURNISH: a placement made in the 2D plan editor also resolves to a
  // `pendingEdit` (same tick/cross flow as the 3D room-editor path) — the
  // "abandon on leaving the editor" effect below must not treat "never was in
  // the room editor" (i.e. `roomEditorActive` false the whole time because
  // this edit came from the plan) as "just left it".
  const floorPlanEditing = useStore((s) => s.floorPlanEditing)
  const confirm = useStore((s) => s.confirmPendingEdit)
  const cancel = useStore((s) => s.cancelPendingEdit)

  // Transient exit state — the class applied while the bar animates out, before
  // the store action resolves and the bar unmounts.
  const [exit, setExit] = useState<'leaving' | 'rejecting' | null>(null)
  const timerRef = useRef<number | null>(null)

  // A fresh pending edit clears any stale exit class (e.g. a new gesture arrives
  // right after a previous commit/cancel), so the bar re-enters cleanly.
  useEffect(() => {
    if (pending) setExit(null)
  }, [pending])

  // Clear a scheduled resolve if the bar unmounts mid-animation.
  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  // Play the exit class, then run the store action. Under reduced-motion (or if
  // an exit is already in flight) resolve immediately with no transient class.
  const dismiss = useCallback((mode: 'leaving' | 'rejecting', action: () => void) => {
    if (timerRef.current != null) return // already exiting — ignore repeats
    if (prefersReducedMotion()) {
      action()
      return
    }
    setExit(mode)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      action()
    }, EXIT_MS)
  }, [])

  // A blocked (invalid) placement can't be confirmed — the tick is disabled and
  // Enter is a no-op until the item is dragged valid or cancelled (bug #6).
  const blocked = !!pending?.blocked
  const onConfirm = useCallback(() => {
    if (blocked) return
    dismiss('leaving', confirm)
  }, [dismiss, confirm, blocked])
  const onCancel = useCallback(() => dismiss('rejecting', cancel), [dismiss, cancel])

  // Leaving BOTH editing surfaces (the room editor and the plan editor)
  // abandons any half-finished edit: keep the change (it's already applied)
  // and just clear the confirmation so the bar doesn't linger over the
  // overview. No exit animation — the editor is closing. If a dismiss timer
  // is already in flight (user just clicked ✓/✗), let IT resolve the edit —
  // calling confirm() here would race the deferred action and turn a
  // just-clicked Cancel into a silent keep.
  useEffect(() => {
    if (roomEditorActive || floorPlanEditing || !pending || timerRef.current != null) return
    // A blocked (invalid) edit can't be kept — revert it; a valid one is kept.
    if (pending.blocked) cancel()
    else confirm()
  }, [roomEditorActive, floorPlanEditing, pending, confirm, cancel])

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (isAnyModalOpen() || isEditableTarget(e)) return
      if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, onConfirm, onCancel])

  if (!pending) return null
  const label = pending.kind === 'placement' ? 'Place item?' : 'Apply change?'
  const blockedTip = "Can't apply — move it inside the room, off other furniture"
  return (
    <div
      className={`edit-confirm${exit ? ` ${exit}` : ''}${blocked ? ' blocked' : ''}`}
      role="dialog"
      aria-label={label}
    >
      <span className="edit-confirm-label">{blocked ? "Can't place here" : label}</span>
      <button
        type="button"
        className="edit-confirm-btn cancel"
        onClick={onCancel}
        aria-label="Cancel change"
        title="Cancel (Esc)"
      >
        <Icon.Close width={18} height={18} />
      </button>
      <button
        type="button"
        className="edit-confirm-btn confirm"
        onClick={onConfirm}
        disabled={blocked}
        aria-label="Confirm change"
        aria-disabled={blocked}
        title={blocked ? blockedTip : 'Confirm (Enter)'}
      >
        <Icon.Check width={18} height={18} />
      </button>
    </div>
  )
}
