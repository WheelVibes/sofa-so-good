import type { ReactNode } from 'react'
import { type DocKey, openToolDocs } from './docsUrl'
import { Icon } from './toolbar/icons'

/**
 * Shared header for panels/modals (Budget, Clearance, Design score,
 * Accessibility, Daylight, Drawings, Comments, History, Versions, Sheet
 * callouts, Graphics settings, the generic `Modal`…). Renders the standard
 * `panel-head` (title + sub + Close) and, when a `docs` key is supplied, a
 * contextual "?" that deep-links to that panel's section of the user guide
 * (DOCS-DEEPLINK). Mirrors the shared `EmptyState` pattern so every panel head
 * stays consistent and gains help for free.
 *
 * `showBack` swaps the trailing close-X for a leading back-arrow (mobile
 * "return to menu" flow) and renders title+sub inline on one line instead of
 * stacked — see `.panel-head-back`/`.panel-head-title-inline` in
 * `components.css` for why the plain `space-between` layout doesn't work once
 * the back arrow becomes the first child.
 */
export function AuxPanelHead({
  title,
  sub,
  docs,
  onClose,
  closeLabel = 'Close',
  showBack,
}: {
  title: string
  sub?: ReactNode
  docs?: DocKey
  onClose: () => void
  closeLabel?: string
  showBack?: boolean
}) {
  return (
    <div className={`panel-head${showBack ? ' panel-head-back' : ''}`}>
      {showBack ? (
        <button type="button" className="icon-btn" aria-label="Back" onClick={onClose}>
          <Icon.ExitRoom width={16} height={16} />
        </button>
      ) : null}
      <div className={`panel-head-title${showBack ? ' panel-head-title-inline' : ''}`}>
        <div className="panel-title" title={title}>
          {title}
        </div>
        {sub != null ? <div className="panel-sub">{sub}</div> : null}
      </div>
      {!showBack ? (
        <div className="panel-head-actions">
          {docs ? (
            <button
              type="button"
              className="icon-btn"
              aria-label={`Open the user guide: ${title}`}
              title="Open the user guide for this panel"
              onClick={() => openToolDocs(docs)}
            >
              <Icon.Help width={16} height={16} />
            </button>
          ) : null}
          <button type="button" className="icon-btn" aria-label={closeLabel} onClick={onClose}>
            <Icon.Close width={16} height={16} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
