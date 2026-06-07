import { type ReactNode, useRef, useState } from 'react'
import { Icon, type IconName } from './icons'
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
  const [open, setOpen] = useState(false)
  const Cmp = Icon[icon]
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
        <div role="menu" onClick={() => setOpen(false)} className="pop-panel" style={{ width }}>
          {children}
        </div>
      </Popover>
    </>
  )
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
  onClick,
}: {
  icon: IconName
  label: string
  sub?: string
  active?: boolean
  ariaLabel?: string
  onClick: () => void
}) {
  const Cmp = Icon[icon]
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={ariaLabel}
      onClick={onClick}
      className={`menu-item${active ? ' active' : ''}`}
    >
      <Cmp width={16} height={16} className="icn" />
      <span className="mi-text">
        <span className="mi-main">{label}</span>
        {sub ? <span className="mi-sub">{sub}</span> : null}
      </span>
    </button>
  )
}
