import { type RefObject, useEffect } from 'react'
import { FOCUSABLE_SELECTOR, trapTabKey } from './focusTrap'

/**
 * Focus management for a custom `.modal-overlay` dialog that does NOT build on
 * the shared `Modal` primitive (which already does all of this itself):
 * on open, remember what had focus and move it into the panel (first focusable
 * stop, else the panel itself); trap Tab within the panel while open; restore
 * focus to the opener on close/unmount. Pair it with `useModalGuard(open)` —
 * this hook deliberately leaves Escape/outside-click to the consumer (they
 * differ per dialog). See A11Y-MODAL-MENU in `src/ui/CLAUDE.md`.
 */
export function useDialogFocus(open: boolean, panelRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      if (first) first.focus()
      else {
        panel.tabIndex = -1
        panel.focus()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      const p = panelRef.current
      if (p && trapTabKey(p, e)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [open, panelRef])
}
