import { type ReactNode, useRef, useState } from 'react'
import { Popover } from './Popover'

const DELAY_MS = 400

/** Wraps a trigger; shows a portaled dark tooltip (label + optional shortcut
 *  chip) after a hover delay. Hidden on leave / pointer-down. */
export function Tooltip({
  label,
  shortcut,
  children,
}: {
  label: string
  shortcut: string
  children: ReactNode
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [open, setOpen] = useState(false)

  const enter = () => {
    timer.current = setTimeout(() => setOpen(true), DELAY_MS)
  }
  const leave = () => {
    clearTimeout(timer.current)
    setOpen(false)
  }

  return (
    <span
      ref={ref}
      onPointerEnter={enter}
      onPointerLeave={leave}
      onPointerDown={leave}
      className="inline-flex"
    >
      {children}
      <Popover open={open} anchorRef={ref} onClose={() => setOpen(false)} align="center">
        <div className="tip-box">
          {label}
          {shortcut ? (
            <span data-testid="tooltip-chip" className="sk">
              {shortcut}
            </span>
          ) : null}
        </div>
      </Popover>
    </span>
  )
}
