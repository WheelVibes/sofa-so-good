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
  width = 'w-60',
}: {
  icon: IconName
  label: string
  children: ReactNode
  active?: boolean
  width?: string
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
        className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm ${
          open || active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-200/80'
        }`}
      >
        <Cmp />
        <span>{label}</span>
        <Icon.Chevron width={12} height={12} className="opacity-60" />
      </button>
      <Popover open={open} anchorRef={ref} onClose={() => setOpen(false)}>
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={`${width} rounded-xl border border-neutral-200 bg-white p-1.5 shadow-2xl`}
        >
          {children}
        </div>
      </Popover>
    </>
  )
}

/** A single row inside a ToolbarMenu: icon + label + optional description. */
export function MenuItem({
  icon,
  label,
  sub,
  active,
  onClick,
}: {
  icon: IconName
  label: string
  sub?: string
  active?: boolean
  onClick: () => void
}) {
  const Cmp = Icon[icon]
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-neutral-100 ${
        active ? 'bg-neutral-100' : ''
      }`}
    >
      <span className="text-neutral-600">
        <Cmp width={16} height={16} />
      </span>
      <span className="flex-1">
        <span className="block text-[13px] text-neutral-800">{label}</span>
        {sub ? <span className="block text-[10px] text-neutral-400">{sub}</span> : null}
      </span>
    </button>
  )
}
