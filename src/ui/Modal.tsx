import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './toolbar/icons'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** Small uppercase eyebrow under/above the title. */
  sub?: string
  /** Panel width in px (defaults to the design's 360). */
  width?: number
  /** id applied to the panel (drives a few per-modal width overrides in CSS). */
  panelId?: string
  children: ReactNode
  /** Optional footer rendered below the scrollable body. */
  footer?: ReactNode
}

/** Centered, blurred-backdrop modal matching the design's
 *  `.modal-overlay > .panel`. Closes on Escape + backdrop click. Portaled to
 *  body so it sits above every panel. */
export function Modal({ open, onClose, title, sub, width, panelId, children, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Accessibility: move focus into the dialog on open and restore it to the
  // previously-focused element on close, so keyboard/screen-reader users aren't
  // stranded behind the modal.
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => prev?.focus?.()
  }, [open])

  if (!open) return null
  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="panel"
        id={panelId}
        style={width ? { width } : undefined}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="panel-head">
          <div>
            <div className="panel-title">{title}</div>
            {sub ? <div className="panel-sub">{sub}</div> : null}
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon.Close width={16} height={16} />
          </button>
        </div>
        <hr className="hr" />
        <div className="panel-body">{children}</div>
        {footer}
      </div>
    </div>,
    document.body,
  )
}
