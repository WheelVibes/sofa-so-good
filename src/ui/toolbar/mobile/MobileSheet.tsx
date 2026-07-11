import { type ReactNode, useEffect, useRef } from 'react'
import { FOCUSABLE_SELECTOR, trapTabKey } from '../../../controls/focusTrap'
import { useModalGuard } from '../../../controls/modalGuard'
import { useRovingTabs } from '../../controls/useRovingTabs'
import { BrandMark } from '../../Logo'
import { Icon, type IconName } from '../icons'

/** Min upward travel (px) for a grab-pill swipe to dismiss the menu sheet
 *  (TB-3) — matches the inspector's `SWIPE_PX` threshold feel. */
const SHEET_SWIPE_PX = 36

export type SheetRailItem = { id: string; icon: IconName; title: string }

/**
 * The mobile menu-sheet SHELL (TB-6-tail): overlay + top-anchored sheet with a
 * grab pill (swipe up dismisses), brand + title head, and the icon-only
 * master rail / detail body. Owns the sheet's a11y contract — modal-guard
 * hotkey suppression, Escape-to-close, Tab focus-trap, focus moved in on open
 * and restored on close (shared `controls/focusTrap.ts` helpers, mirroring
 * `Modal`). Extracted from `MobileToolbar` so the 2D plan editor's mobile menu
 * uses the SAME paradigm instead of its old bespoke centered modal — one sheet
 * idiom across every mode (the 2026-07-10 toolbar UX audit's grounding).
 * Callers own the rail list + active-section state and render `parts.tsx`
 * `<Section>` blocks as children.
 */
export function MobileSheet({
  open,
  onClose,
  title,
  railItems,
  activeId,
  onSelectSection,
  footer,
  children,
}: {
  open: boolean
  onClose: () => void
  /** Head title, next to the brand mark (e.g. "Sofa So Good", "Plan tools"). */
  title: string
  railItems: SheetRailItem[]
  activeId: string
  onSelectSection: (id: string) => void
  /** Optional persistent footer under the panes (e.g. sign-in / account). */
  footer?: ReactNode
  children: ReactNode
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  // Touch-start Y of a grab-pill swipe (TB-3: swipe up on the pill closes).
  const sheetSwipeY = useRef<number | null>(null)

  // WAI-ARIA tabs pattern for the section rail (TB-9): one Tab stop (the
  // active section's tab), Arrow/Home/End rove focus AND select.
  const rail = useRovingTabs({
    count: railItems.length,
    activeIndex: railItems.findIndex((r) => r.id === activeId),
    onActivate: (i) => {
      const r = railItems[i]
      if (r) onSelectSection(r.id)
    },
  })

  // Suppress app-wide hotkeys while the sheet is open + close it on Escape, so
  // the sheet matches every other overlay (A11Y).
  useModalGuard(open)
  // Latest-ref for onClose so the focus effect below keys on `open` ONLY: a
  // caller passing an inline `onClose` closure must not re-run the effect on
  // every re-render — its cleanup restores focus to the previously-focused
  // element and re-focuses the first control, which stole focus mid-session
  // (e.g. from the rail's roving tabindex, TB-9).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      // Tab focus-trap (TB-9): the sheet overlays the whole app, so Tab must
      // cycle within it — same shared helper Modal and ToolbarMenu use.
      if (e.key === 'Tab' && sheetRef.current && trapTabKey(sheetRef.current, e)) {
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    // Move focus into the sheet on open (mirrors Modal), so Tab starts inside;
    // restore it to the opener (usually the hamburger) on close.
    const prev = document.activeElement as HTMLElement | null
    const first = sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    first?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="m-menu-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="m-sheet" ref={sheetRef}>
        {/* The grab pill promises a sheet gesture (TB-3) — honour it: a swipe
            UP on the pill dismisses the top-anchored sheet (mirrors
            useSwipeToCollapse's touch pattern; the sheet hangs from the top
            bar, so "toward the bar" is the dismiss motion). */}
        <div
          className="m-sheet-grab"
          onTouchStart={(e) => {
            sheetSwipeY.current = e.touches[0]?.clientY ?? null
          }}
          onTouchEnd={(e) => {
            const y0 = sheetSwipeY.current
            sheetSwipeY.current = null
            if (y0 == null) return
            if ((e.changedTouches[0]?.clientY ?? y0) - y0 < -SHEET_SWIPE_PX) onClose()
          }}
        />
        <div className="m-sheet-head">
          <div className="m-sheet-brand">
            <span className="brand-dot" title={title}>
              <BrandMark size={20} />
            </span>
            <span className="panel-title">{title}</span>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon.Close width={16} height={16} />
          </button>
        </div>
        <div className="m-sheet-panes">
          {/* Icon-only master rail: pick a section; its items show in the
              detail pane on the right. */}
          <div
            className="m-rail"
            role="tablist"
            aria-label="Menu sections"
            aria-orientation="vertical"
            ref={rail.listRef}
            onKeyDown={rail.onKeyDown}
          >
            {railItems.map((r, i) => {
              const Glyph = Icon[r.icon]
              const on = activeId === r.id
              return (
                <button
                  type="button"
                  key={r.id}
                  className={`m-rail-btn${on ? ' on' : ''}`}
                  data-tour-section={r.id}
                  role="tab"
                  aria-selected={on}
                  aria-current={on ? 'true' : undefined}
                  aria-label={r.title}
                  tabIndex={rail.tabIndexFor(i)}
                  onClick={() => onSelectSection(r.id)}
                >
                  <Glyph className="icn" width={22} height={22} />
                </button>
              )
            })}
          </div>
          <div className="m-detail">{children}</div>
        </div>
        {footer ? <div className="m-sheet-foot">{footer}</div> : null}
      </div>
    </div>
  )
}
