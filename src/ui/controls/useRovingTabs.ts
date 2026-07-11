import { useRef } from 'react'

/**
 * WAI-ARIA tabs keyboard pattern (TB-9) — roving tabindex for a `role="tablist"`:
 * the tablist is ONE Tab stop (only the active tab has `tabIndex={0}`), and
 * Arrow keys / Home / End move focus AND select (automatic activation, matching
 * the `Segmented` radiogroup's roving behaviour). Works for both orientations —
 * Right/Down step forward, Left/Up step back, with wrap-around.
 *
 * Wire-up: put `ref={listRef}` + `onKeyDown` on the `role="tablist"` element,
 * and `tabIndex={tabIndexFor(i)}` on each `role="tab"` button (tabs must be the
 * only `[role="tab"]` descendants, in render order). Consumers: the mobile
 * toolbar's section rail (`MobileToolbar`) and the FinishPicker surface tabs.
 */
export function useRovingTabs({
  count,
  activeIndex,
  onActivate,
}: {
  /** Number of tabs currently rendered. */
  count: number
  /** Index of the selected tab (-1 tolerated: first tab becomes the stop). */
  activeIndex: number
  /** Select the tab at this index (the hook focuses it after selection). */
  onActivate: (index: number) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  const commit = (i: number) => {
    if (i < 0 || i >= count) return
    onActivate(i)
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[i]?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (count === 0) return
    const cur = activeIndex >= 0 ? activeIndex : 0
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      commit((cur + 1) % count)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      commit((cur - 1 + count) % count)
    } else if (e.key === 'Home') {
      e.preventDefault()
      commit(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      commit(count - 1)
    }
  }

  const tabIndexFor = (i: number): 0 | -1 =>
    i === activeIndex || (activeIndex < 0 && i === 0) ? 0 : -1

  return { listRef, onKeyDown, tabIndexFor }
}
