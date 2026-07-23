import type { ReactNode } from 'react'
import type { FeatureFlag } from '../../../features/featureFlags'
import { type DocKey, openToolDocs } from '../../docsUrl'
import { useNewBadge } from '../../newBadges'
import { Icon, type IconName } from '../icons'
import { MenuLabel } from '../ToolbarMenu'

/** A tappable row inside an accordion section: icon + label (+ sub) + On badge.
 *  `tourId` tags the row with `data-tour` so the product tour can spotlight it. */
export function Item({
  icon,
  label,
  sub,
  on,
  disabled,
  tourId,
  docs,
  newFlag,
  onClick,
}: {
  icon: IconName
  label: string
  sub?: string
  on?: boolean
  disabled?: boolean
  tourId?: string
  /** When set, a "?" opens this item's user-guide section (DOCS-DEEPLINK). On
   *  mobile (no hover) it's always shown; a sibling control so it doesn't fire
   *  the row or close the sheet. */
  docs?: DocKey
  /** When this row fronts a recently-shipped feature (`src/ui/newBadges.ts`),
   *  pass its `FeatureFlag` to show a pulsing `.new-dot` until first use (P27)
   *  — the mobile-sheet mirror of `MenuItem`'s `newFlag` (desktop). Resolved
   *  via `useNewBadge`, a no-op (`show: false`) for any flag with no
   *  `NEW_BADGES` entry — safe to pass unconditionally. */
  newFlag?: FeatureFlag
  onClick: () => void
}) {
  const Glyph = Icon[icon]
  // `useNewBadge` always needs a flag argument to keep hook calls unconditional
  // across renders — see `MenuItem`'s identical pattern.
  const { show: showNewBadge, markSeen } = useNewBadge(newFlag ?? 'newBadges')
  const row = (
    <button
      type="button"
      className="m-item"
      data-tour={tourId}
      disabled={disabled}
      onClick={() => {
        if (newFlag) markSeen()
        onClick()
      }}
    >
      <Glyph className="icn" width={18} height={18} />
      <span className="m-item-tx">
        <span className="m-item-l">{label}</span>
        {sub ? <span className="m-item-s">{sub}</span> : null}
      </span>
      {on ? <span className="m-on">On</span> : null}
      {newFlag && showNewBadge ? <span className="new-dot" aria-hidden /> : null}
    </button>
  )
  if (!docs) return row
  return (
    <div className="m-item-wrap">
      {row}
      <button
        type="button"
        className="m-item-help"
        aria-label={`Open the user guide: ${label}`}
        title="Open the user guide"
        onClick={(e) => {
          e.stopPropagation()
          openToolDocs(docs)
        }}
      >
        <Icon.Help width={18} height={18} />
      </button>
    </div>
  )
}

/** A sub-header that groups rows within a mobile accordion section (e.g. the
 *  Analyse / Review / Export groups inside Tools) — the mobile-sheet face of
 *  the ONE shared section-header primitive (`MenuLabel`, TB-9). */
export function SubHeader({ children }: { children: ReactNode }) {
  return <MenuLabel sheet>{children}</MenuLabel>
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
