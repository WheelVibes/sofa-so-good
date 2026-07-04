import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { FOCUSABLE_SELECTOR, trapTabKey } from '../controls/focusTrap'
import { useModalGuard } from '../controls/modalGuard'
import { AuxPanelHead } from './AuxPanelHead'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** Small uppercase eyebrow under/above the title. */
  sub?: string
  /** Panel width in px, or a CSS width token string (e.g. `var(--modal-md)`).
   *  Defaults to the design's 360. */
  width?: number | string
  /** id applied to the panel (drives a few per-modal width overrides in CSS). */
  panelId?: string
  children: ReactNode
  /** Optional footer rendered below the scrollable body. */
  footer?: ReactNode
  /** When true, show a back-arrow button (mobile return-to-menu flow) instead of a close X. */
  showBack?: boolean
}

/** Centered, blurred-backdrop modal matching the design's
 *  `.modal-overlay > .panel`. Closes on Escape + backdrop click. Portaled to
 *  body so it sits above every panel. */
export function Modal({
  open,
  onClose,
  title,
  sub,
  width,
  panelId,
  children,
  footer,
  showBack,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // While open, register in the global open-modal counter so app-wide
  // shortcuts (useKeyboard + the direct App.tsx handlers) no-op. Escape
  // still closes — this component owns its own Escape listener below.
  useModalGuard(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      // Focus trap: keep Tab / Shift+Tab cycling within the dialog so keyboard
      // users can't tab into the (inert) background behind the modal.
      if (e.key === 'Tab') {
        const panel = panelRef.current
        if (!panel) return
        if (panel.querySelectorAll(FOCUSABLE_SELECTOR).length === 0) {
          e.preventDefault()
          panel.focus()
          return
        }
        if (trapTabKey(panel, e)) e.preventDefault()
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
        // Numeric widths are clamped so they can't overflow a narrow (mobile)
        // viewport; string widths are tokens (e.g. var(--modal-md)) that
        // already self-clamp, so they're applied directly.
        style={
          width != null
            ? typeof width === 'string'
              ? { width }
              : { width, maxWidth: 'calc(100vw - 24px)' }
            : undefined
        }
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <AuxPanelHead title={title} sub={sub} onClose={onClose} showBack={showBack} />
        <hr className="hr" />
        <div className="panel-body">{children}</div>
        {footer}
      </div>
    </div>,
    document.body,
  )
}
