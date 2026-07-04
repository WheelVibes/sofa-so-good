import { useEffect, useSyncExternalStore } from 'react'

/**
 * Open-modal registry: while ANY modal dialog is open, global app shortcuts
 * must no-op (typing into a mis-focused modal must never trigger scene
 * hotkeys like the `P` 2D-plan toggle behind it).
 *
 * Mechanism: a module-level counter. Every modal registers on open and
 * releases on close/unmount; global keydown handlers early-return while
 * `isAnyModalOpen()` is true.
 *
 * Exceptions (by design):
 * - **Escape** keeps working — each modal owns its own Escape-to-close
 *   listener, and the suppression only applies to the *global* handlers.
 * - **Cmd/Ctrl+Z is suppressed** while a modal is open, like most desktop
 *   apps: silently undoing scene state hidden behind a dialog is confusing,
 *   and text fields inside the modal keep the browser's native undo.
 * - **⌘K is suppressed** too — the command palette shouldn't stack on top of
 *   a dialog. The palette itself is *not* a Modal (it's its own `.cmdk`
 *   overlay with a focused input), so its internal keyboard handling —
 *   arrows / Enter / Escape — is unaffected by this guard.
 */
let openModalCount = 0
const listeners = new Set<() => void>()
function emit() {
  for (const fn of listeners) fn()
}

/** Register one open modal. Returns a release fn (safe to call once). */
export function registerOpenModal(): () => void {
  openModalCount++
  emit()
  let released = false
  return () => {
    if (released) return
    released = true
    openModalCount = Math.max(0, openModalCount - 1)
    emit()
  }
}

/** True while any modal dialog is open — global shortcut handlers must no-op. */
export function isAnyModalOpen(): boolean {
  return openModalCount > 0
}

/** Reactive subscription to the "any modal open" flag (for components that must
 *  re-render on change — e.g. freezing the orbit camera while a modal covers the
 *  canvas, bug #6). Non-React callers keep using `isAnyModalOpen()`. */
export function useAnyModalOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => openModalCount > 0,
    () => false,
  )
}

/** Test-only: reset the counter so one test's leak can't fail the next. */
export function resetModalGuardForTests(): void {
  openModalCount = 0
  emit()
}

/**
 * Register this component as an open modal while `open` is true. Use in any
 * modal-style overlay that does NOT build on the shared `Modal` primitive
 * (which already calls this) — e.g. GraphicsSettings, CompassModal, the
 * upload dialogs.
 */
export function useModalGuard(open: boolean): void {
  useEffect(() => {
    if (!open) return
    return registerOpenModal()
  }, [open])
}
