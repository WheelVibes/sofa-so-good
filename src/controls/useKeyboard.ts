import { useEffect } from 'react'

/**
 * True when the event target is a text input, textarea, select, or any
 * contenteditable node — i.e. somewhere keystrokes mean "type", not
 * "trigger an app shortcut".
 */
export function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  if (t.isContentEditable) return true
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Subscribes to keydown events globally. The handler is fired with the
 * raw KeyboardEvent.code (e.g. 'KeyW', 'Escape'). Listeners are removed
 * on unmount. Events targeting editable elements (search box, etc.) are
 * suppressed so typing doesn't trigger app shortcuts.
 */
export function useKeyboard(handler: (code: string, e: KeyboardEvent) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (isEditableTarget(e)) return
      handler(e.code, e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handler])
}
