import type { ReactNode } from 'react'
import { Icon, type IconName } from '../icons'

export const LIGHTS_LABEL: Record<'auto' | 'on' | 'off', string> = {
  auto: 'Auto',
  on: 'On',
  off: 'Off',
}

/** A tappable row inside an accordion section: icon + label (+ sub) + On badge.
 *  `tourId` tags the row with `data-tour` so the product tour can spotlight it. */
export function Item({
  icon,
  label,
  sub,
  on,
  disabled,
  tourId,
  onClick,
}: {
  icon: IconName
  label: string
  sub?: string
  on?: boolean
  disabled?: boolean
  tourId?: string
  onClick: () => void
}) {
  const Glyph = Icon[icon]
  return (
    <button
      type="button"
      className="m-item"
      data-tour={tourId}
      disabled={disabled}
      onClick={onClick}
    >
      <Glyph className="icn" width={18} height={18} />
      <span className="m-item-tx">
        <span className="m-item-l">{label}</span>
        {sub ? <span className="m-item-s">{sub}</span> : null}
      </span>
      {on ? <span className="m-on">On</span> : null}
    </button>
  )
}

/** One section of the mobile menu, rendered in the detail pane. The icon-only
 *  left rail picks the active section (master-detail); the body shows here under
 *  a sticky title only when its section is selected. `icon` is consumed by the
 *  rail, not here. */
export function Section({
  id,
  title,
  activeId,
  children,
}: {
  id: string
  title: string
  icon: IconName
  activeId: string
  children: ReactNode
}) {
  if (activeId !== id) return null
  return (
    <div className="m-detail-sec">
      <div className="m-detail-h">{title}</div>
      {children}
    </div>
  )
}

/** Mobile toolbar: a slim bar with just the brand (top-left) + hamburger
 *  (top-right). The hamburger opens a bottom-anchored sheet — brand + title at
 *  the top, then collapsible accordion sections covering every desktop toolbar
 *  action (incl. appearance, graphics, file), so the two are at feature parity. */
