import { useEffect, useRef } from 'react'
import { trapTabKey } from '../../controls/focusTrap'
import { useModalGuard } from '../../controls/modalGuard'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  /** Visual weight of the confirm action — `danger` tints it red. */
  tone?: 'danger' | 'normal'
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A small modal confirmation popup (soft surface-token gradient so it themes in
 * light + dark across all themes). Renders on top of whatever opened it (the
 * caller controls z-order by placement). Esc cancels, Enter confirms, and focus
 * lands on the cancel button so the safe choice is the default.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'normal',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Modal-style overlay: suppress global shortcuts while open.
  useModalGuard(open)

  useEffect(() => {
    if (!open) return
    // Restore focus to whatever had it (the action that opened this nested
    // confirm — e.g. a row inside the parent upload dialog) once this dialog
    // closes, mirroring the shared `Modal` primitive's focus-restore contract.
    const prev = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
      } else if (e.key === 'Tab') {
        // Focus trap: this dialog stacks on top of another open dialog, so Tab
        // must cycle within it rather than escaping to the surface behind.
        const panel = panelRef.current
        if (panel && trapTabKey(panel, e)) e.preventDefault()
      }
    }
    // Capture so this nested dialog's Esc wins over the parent modal's handler.
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [open, onCancel, onConfirm])

  if (!open) return null

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      className="modal-overlay rounded-lg p-4"
      style={{ zIndex: 10 }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-xs rounded-xl px-5 py-4 text-center"
        style={{
          background:
            'radial-gradient(120% 120% at 50% 30%, var(--surface-solid) 0%, var(--surface-2) 55%, var(--surface-3) 100%)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-pop)',
        }}
      >
        <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>
          {title}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
          {message}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="btn btn-sm">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`btn btn-sm ${tone === 'danger' ? 'btn-danger' : 'btn-accent'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
