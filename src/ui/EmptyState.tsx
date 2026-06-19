import type { ReactNode, SVGProps } from 'react'

/** An entry from the shared `Icon` set (`toolbar/icons.tsx`). */
type IconComponent = (p: SVGProps<SVGSVGElement>) => ReactNode

export interface EmptyStateProps {
  /** Icon component from the shared `Icon` set, e.g. `Icon.Heart`. */
  icon: IconComponent
  /** Short, friendly headline (e.g. "No saved items"). */
  title: string
  /** Optional one-line description of how to populate the panel. */
  description?: string
  /** Optional call-to-action wired to a real, existing handler. */
  cta?: { label: string; onClick: () => void }
  /** Extra class names appended to the root (e.g. layout overrides). */
  className?: string
}

/**
 * Shared empty-state pattern (PC-EMPTY-STATES): a centred icon + title +
 * optional description + optional CTA, used by every list/collection panel
 * (favourites, comments, saved views, versions, history, layers, …) so empty
 * panels read consistently and friendly across light/dark/all themes and on
 * mobile bottom-sheets.
 *
 * Styled purely with the existing `.empty-mini` token vocabulary
 * (`src/styles/features.css`) — no hardcoded colour. Only wire a `cta` to a
 * real handler that exists in the panel; never invent an action.
 */
export function EmptyState({ icon: IconCmp, title, description, cta, className }: EmptyStateProps) {
  return (
    <div className={`empty-mini${className ? ` ${className}` : ''}`}>
      <span className="em-ic" aria-hidden="true">
        <IconCmp width={20} height={20} />
      </span>
      <b>{title}</b>
      {description ? <span>{description}</span> : null}
      {cta ? (
        <button
          type="button"
          className="btn btn-soft btn-sm"
          style={{ marginTop: 'var(--s-2)' }}
          onClick={cta.onClick}
        >
          {cta.label}
        </button>
      ) : null}
    </div>
  )
}
