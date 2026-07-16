import type { ReactNode } from 'react'
import { Icon } from '../toolbar/icons'

/**
 * The shared "armed" card scaffolding for the GLB designer's Templates +
 * Components panels — an accent-bordered surface-2 card with a Cube icon +
 * title header, a dismiss icon-button, an optional hint line, the armed body
 * (sliders), and an optional footer (action buttons). Extracted so the two
 * panels don't each hand-roll the identical shell. Purely presentational.
 */
export function ArmedCard({
  title,
  closeLabel,
  closeTitle,
  hint,
  marginTop,
  onClose,
  children,
  footer,
}: {
  title: ReactNode
  closeLabel: string
  closeTitle?: string
  hint?: ReactNode
  /** Optional top margin (Components nudges the card off the category grid). */
  marginTop?: string
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
}) {
  return (
    <div
      style={{
        ...(marginTop ? { marginTop } : {}),
        padding: 'var(--s-2)',
        border: '1px solid var(--accent)',
        borderRadius: 'var(--r-2)',
        background: 'var(--surface-2)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-2)',
          marginBottom: 'var(--s-2)',
        }}
      >
        <Icon.Cube width={14} height={14} />
        <span style={{ fontWeight: 600, fontSize: 'var(--t-sm)' }}>{title}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label={closeLabel}
          title={closeTitle ?? 'Cancel'}
          style={{ marginLeft: 'auto' }}
          onClick={onClose}
        >
          <Icon.Close width={13} height={13} />
        </button>
      </div>
      {hint ? (
        <div
          style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginBottom: 'var(--s-2)' }}
        >
          {hint}
        </div>
      ) : null}
      {children}
      {footer}
    </div>
  )
}
