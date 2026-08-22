import { type ReactNode, useRef, useState } from 'react'
import { Popover } from '../../toolbar/Popover'

/**
 * A small labelled dropdown for the (desktop) floor-plan toolbar: a `.btn btn-sm`
 * trigger with a chevron, whose panel is portaled via the shared `Popover` (so it
 * escapes the toolbar's clipping and closes on Escape / outside-click / scroll).
 * Children are the existing toolbar control fragments, laid out as a tidy
 * full-width vertical stack — so the toolbar stays uncluttered without
 * duplicating button definitions.
 */
export function PlanMenu({
  label,
  active,
  children,
  width = 220,
}: {
  label: string
  active?: boolean
  children: ReactNode
  width?: number
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`btn btn-sm${open || active ? ' on' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label} ▾
      </button>
      <Popover open={open} anchorRef={ref} onClose={() => setOpen(false)}>
        {/* Clicking an action closes the menu (bubbles to the panel). */}
        <div
          role="menu"
          className="pop-panel plan-menu-panel"
          style={{ minWidth: width }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      </Popover>
    </>
  )
}
