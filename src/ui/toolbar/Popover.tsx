import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface PopoverProps {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
  /** Horizontal alignment of the panel relative to the trigger. */
  align?: 'left' | 'center'
}

/** Every open Popover registers its panel + anchor here so the
 *  outside-pointerdown/scroll checks can recognise DESCENDANT portals: a
 *  `Select` opened from inside a menu panel portals its option list to a
 *  SIBLING `document.body` node, so a plain `panel.contains(target)` reads an
 *  option click as "outside" and closes the parent on pointerdown — before the
 *  option's own click handler ever runs (the pick is silently dropped, TB-1).
 *  Ownership is derived from the anchor: a popover whose ANCHOR lives inside
 *  my panel (transitively) is part of my subtree. */
interface OpenPopoverEntry {
  panel: RefObject<HTMLDivElement | null>
  anchor: RefObject<HTMLElement | null>
}
const OPEN_POPOVERS = new Set<OpenPopoverEntry>()

/** True when `target` is inside `root` OR inside any open popover panel whose
 *  anchor chain leads back into `root` (arbitrary nesting depth). */
function popoverTreeContains(
  root: HTMLElement,
  target: Node,
  seen: Set<OpenPopoverEntry> = new Set(),
): boolean {
  if (root.contains(target)) return true
  for (const entry of OPEN_POPOVERS) {
    if (seen.has(entry)) continue
    const anchor = entry.anchor.current
    const panel = entry.panel.current
    if (!anchor || !panel || !root.contains(anchor)) continue
    seen.add(entry)
    if (popoverTreeContains(panel, target, seen)) return true
  }
  return false
}

/** Portaled, fixed-position panel anchored under a trigger. Escapes the
 *  toolbar island's overflow clip; closes on Escape + outside pointerdown +
 *  resize + any ancestor scroll (e.g. the horizontally scrollable toolbar
 *  island — the fixed panel would otherwise detach from its trigger). Scrolls
 *  that originate *inside* the panel (a menu's own overflow list) — or inside
 *  a DESCENDANT portal (a nested Select's option list) — don't move the
 *  trigger, so they keep the panel open. Clamps to the viewport
 *  horizontally. */
export function Popover({ open, anchorRef, onClose, children, align = 'left' }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    const panelW = panelRef.current?.offsetWidth ?? 0
    let left = align === 'center' ? r.left + r.width / 2 - panelW / 2 : r.left
    const top = r.bottom + 6
    // Clamp to viewport with an 8px margin.
    const maxLeft = window.innerWidth - panelW - 8
    if (panelW) left = Math.max(8, Math.min(left, maxLeft))
    setPos({ left, top })
    // Origin-aware entrance (UIUX-26): the panel's `pop` scale grows from the
    // trigger's horizontal centre (top edge), not its own middle.
    const originX = Math.max(0, r.left + r.width / 2 - left)
    panelRef.current?.style.setProperty('--pop-origin', `${Math.round(originX)}px 0px`)
  }, [open, anchorRef, align])

  // Register in the open-popover set for descendant-portal containment.
  useEffect(() => {
    if (!open) return
    const entry: OpenPopoverEntry = { panel: panelRef, anchor: anchorRef }
    OPEN_POPOVERS.add(entry)
    return () => {
      OPEN_POPOVERS.delete(entry)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        // Return focus to the trigger so a keyboard user isn't stranded when the
        // panel unmounts (standard menu-button pattern). Only on Escape — an
        // outside pointer-down shouldn't yank focus back to the trigger.
        anchorRef.current?.focus()
      }
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current && popoverTreeContains(panelRef.current, t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    const onReflow = () => onClose()
    // Capture-phase listener so scrolls of any scrollable ancestor (the
    // toolbar island, the page, a panel…) close the popover before it can
    // detach from its fixed-positioned anchor. Scrolling a list *inside* the
    // panel — or inside a nested portal (a Select's option list) — doesn't
    // move the anchor — ignore it.
    const onScroll = (e: Event) => {
      const t = e.target as Node | null
      if (t && panelRef.current && popoverTreeContains(panelRef.current, t)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, anchorRef, onClose])

  if (!open) return null
  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, zIndex: 60 }}
    >
      {children}
    </div>,
    document.body,
  )
}
