import type { CSSProperties, ReactNode } from 'react'

export interface DisclosureProps {
  summary: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  className?: string
  /** Inline styles for the `<details>` element (e.g. a nested indent/margin). */
  style?: CSSProperties
}

/**
 * Thin wrapper over the `.compose` `<details>` idiom (FinishPicker's
 * "Apartment colour palette…" and MaterialComposer's "Compose your own…"
 * sections) so call sites don't hand-pair `<details className="compose">` +
 * `<summary className="compose-summary">`. Uncontrolled — the browser owns
 * open/closed state via the native `<details>` element; `defaultOpen` only
 * seeds the initial `open` attribute.
 *
 * NOT a replacement for the Layers panel's group-collapse: that state is
 * store-persisted (`layersCollapsed`) and force-expands while a filter is
 * active — a different contract than a self-managed `<details>`.
 */
export function Disclosure({ summary, defaultOpen, children, className, style }: DisclosureProps) {
  return (
    <details
      className={`compose${className ? ` ${className}` : ''}`}
      open={defaultOpen}
      style={style}
    >
      <summary className="compose-summary">{summary}</summary>
      {children}
    </details>
  )
}
