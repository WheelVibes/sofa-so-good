import type { ReactNode } from 'react'
import { type DocKey, openToolDocs } from './docsUrl'
import { Icon } from './toolbar/icons'

/**
 * Shared header for the floating aux panels (Budget, Clearance, Design score,
 * Accessibility, Daylight, Drawings, Comments, History, Versions, Sheet
 * callouts…). Renders the standard `panel-head` (title + sub + Close) and, when a
 * `docs` key is supplied, a contextual "?" that deep-links to that panel's section
 * of the user guide (DOCS-DEEPLINK). Mirrors the shared `EmptyState` pattern so
 * every panel head stays consistent and gains help for free.
 */
export function AuxPanelHead({
  title,
  sub,
  docs,
  onClose,
  closeLabel = 'Close',
}: {
  title: string
  sub?: ReactNode
  docs?: DocKey
  onClose: () => void
  closeLabel?: string
}) {
  return (
    <div className="panel-head">
      <div>
        <div className="panel-title">{title}</div>
        {sub != null ? <div className="panel-sub">{sub}</div> : null}
      </div>
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
    </div>
  )
}
