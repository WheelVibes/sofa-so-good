import { type ReactNode, useEffect, useRef, useState } from 'react'
import { FOCUSABLE_SELECTOR, trapTabKey } from '../../controls/focusTrap'
import type { FeatureFlag } from '../../features/featureFlags'
import { type DocKey, openToolDocs } from '../docsUrl'
import { useNewBadge } from '../newBadges'
import { Icon, type IconName } from './icons'
import { KbdChip } from './KbdChip'
import { Popover } from './Popover'

/** A labelled dropdown trigger (icon + text + chevron) whose panel is portaled
 *  via Popover. Children are MenuItems (or richer custom content); choosing an
 *  item closes the menu (click bubbles to the panel's onClick). */
export function ToolbarMenu({
  icon,
  label,
  children,
  active,
  width = 240,
}: {
  icon: IconName
  label: string
  children: ReactNode
  active?: boolean
  width?: number
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const Cmp = Icon[icon]

  // A11Y: the panel is portaled elsewhere in the DOM (Popover renders it via
  // createPortal to document.body), so it sits OUTSIDE the trigger's tab
  // order — without this, a keyboard user who opens the menu with Enter/Space
  // has no way to Tab into its rows at all. Move focus onto the first
  // focusable row as soon as the panel mounts, mirroring the same pattern
  // `Modal` already uses for its dialog. Escape already returns focus to the
  // trigger (Popover's own handler) regardless of where focus lands inside.
  useEffect(() => {
    if (!open) return
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    first?.focus()
  }, [open])

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (panel && trapTabKey(panel, e)) e.preventDefault()
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={`tool-btn${open || active ? ' active' : ''}`}
      >
        <Cmp />
        <span className="cap">{label}</span>
        <Icon.Chevron width={12} height={12} className="chev" />
      </button>
      <Popover open={open} anchorRef={ref} onClose={() => setOpen(false)}>
        <div
          ref={panelRef}
          role="menu"
          onClick={() => setOpen(false)}
          onKeyDown={onPanelKeyDown}
          // The panel animates in as a whole via `.pop-panel`'s own `pop`
          // keyframe. It deliberately does NOT use the per-row `.stagger-in`
          // cascade: a ToolbarMenu renders an arbitrary, variable number of
          // rows as direct children, and the `--i` nth-child fallback only
          // covers the first 12 (see src/ui/CLAUDE.md). Menus with >12 rows
          // (File/Tools in Pro) gave every row past the 12th a `--i` of 0 →
          // zero delay → those rows popped in instantly at the bottom while
          // rows 6–12 were still mid-cascade, leaving a transient vertical
          // VOID between the top and bottom clusters (TOOLBAR-MENU-VOID). The
          // primitive can't set `--i` inline (children come from each menu),
          // so it forgoes the row stagger entirely.
          className="pop-panel"
          style={{ width, maxHeight: '72vh', overflowY: 'auto' }}
        >
          {children}
        </div>
      </Popover>
    </>
  )
}

/** THE section-header idiom for menus (TB-9): an uppercase group label on the
 *  `.menu-label` token class (sticky inside a scrollable `.pop-panel`, see
 *  `app.css`), or its mobile-sheet density twin `.m-sec-h` when `sheet` is set
 *  (consumed via the mobile `SubHeader` wrapper in `mobile/parts.tsx`). Every
 *  desktop menu / mobile section header renders through this — never hand-roll
 *  another uppercase header div. (`SceneMenu`'s `.scene-row-head` is NOT a
 *  section label — it's a header ROW that can carry a live trailing control,
 *  e.g. the System-time button — and stays its own primitive.) */
export function MenuLabel({ children, sheet }: { children: ReactNode; sheet?: boolean }) {
  return <div className={sheet ? 'm-sec-h' : 'menu-label'}>{children}</div>
}

/** A single row inside a ToolbarMenu: icon + label + optional description.
 *  `ariaLabel` overrides the accessible name (used so the product tour can
 *  spotlight a specific menu item, e.g. "Edit a room"). */
export function MenuItem({
  icon,
  label,
  sub,
  active,
  ariaLabel,
  docs,
  kbd,
  newFlag,
  onClick,
}: {
  icon: IconName
  label: string
  sub?: string
  active?: boolean
  ariaLabel?: string
  /** When set, a contextual "?" opens this item's user-guide section
   *  (DOCS-DEEPLINK). It's a sibling control (not nested in the row button) and
   *  stops propagation so it neither runs the item nor closes the menu. */
  docs?: DocKey
  /** Shortcut combo label (from `shortcuts.ts`), rendered as a right-aligned
   *  `.mi-kbd` chip (P24) — never hardcode the key text inline in `label`. */
  kbd?: string
  /** When this row fronts a recently-shipped feature (`src/ui/newBadges.ts`),
   *  pass its `FeatureFlag` to show a pulsing `.new-dot` until first use (P27).
   *  Resolved via `useNewBadge`, which is a no-op (`show: false`) for any flag
   *  with no `NEW_BADGES` entry — safe to pass unconditionally. */
  newFlag?: FeatureFlag
  onClick: () => void
}) {
  const Cmp = Icon[icon]
  // `useNewBadge` always needs a flag argument to keep hook calls unconditional
  // across renders; a row with no `newFlag` resolves against a flag that has no
  // `NEW_BADGES` entry, so `show` is always false — a harmless sentinel.
  const { show: showNewBadge, markSeen } = useNewBadge(newFlag ?? 'newBadges')
  const row = (
    <button
      type="button"
      role="menuitem"
      aria-label={ariaLabel}
      onClick={() => {
        if (newFlag) markSeen()
        onClick()
      }}
      className={`menu-item${active ? ' active' : ''}`}
    >
      <Cmp width={16} height={16} className="icn" />
      <span className="mi-text">
        <span className="mi-main">{label}</span>
        {sub ? <span className="mi-sub">{sub}</span> : null}
      </span>
      {kbd ? <KbdChip>{kbd}</KbdChip> : null}
      {newFlag && showNewBadge ? <span className="new-dot" aria-hidden /> : null}
    </button>
  )
  if (!docs) return row
  return (
    <div className="menu-item-wrap">
      {row}
      <button
        type="button"
        className="mi-help"
        aria-label={`Open the user guide: ${label}`}
        title="Open the user guide"
        onClick={(e) => {
          e.stopPropagation()
          openToolDocs(docs)
        }}
      >
        <Icon.Help width={14} height={14} />
      </button>
    </div>
  )
}
