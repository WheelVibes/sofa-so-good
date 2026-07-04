/**
 * Shared focus-trap primitives for modal-style overlays (the `Modal` dialog,
 * the `ToolbarMenu` dropdown panel, `upload/ConfirmDialog`, …). Each consumer
 * owns its own open/close + Escape/outside-click wiring (they differ: a
 * window-level listener for a portaled dialog vs. a local `onKeyDown` on a
 * menu panel) — this module only centralises the one literal both need, so a
 * future addition (e.g. `[contenteditable]`) is a one-line change instead of
 * an N-way find/replace across every trap.
 */

/** CSS selector matching every element a Tab-trap should treat as a stop. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Given an open container and a `Tab` keydown, move focus to wrap within the
 * container (Shift+Tab off the first focusable → last; Tab off the last →
 * first) instead of letting focus escape to the page behind. No-ops (and
 * returns false) for any other key, an empty container, or a Tab that isn't
 * at an edge — the caller should `preventDefault()` only when this returns
 * true.
 */
export function trapTabKey(
  container: HTMLElement,
  e: Pick<KeyboardEvent, 'key' | 'shiftKey'>,
): boolean {
  if (e.key !== 'Tab') return false
  const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  if (focusable.length === 0) return false
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  if (e.shiftKey && (active === first || active === container)) {
    last.focus()
    return true
  }
  if (!e.shiftKey && active === last) {
    first.focus()
    return true
  }
  return false
}
