import { useEffect, useRef } from 'react'

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
 * A small modal confirmation popup styled to match the loading overlay (soft
 * warm gradient, warm-neutral type). Renders on top of whatever opened it (the
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

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
      }
    }
    // Capture so this nested dialog's Esc wins over the parent modal's handler.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onCancel, onConfirm])

  if (!open) return null

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      className="absolute inset-0 z-10 flex items-center justify-center rounded-lg p-4"
      style={{ background: 'rgba(58, 49, 39, 0.28)' }}
    >
      <div
        className="w-full max-w-xs rounded-xl px-5 py-4 text-center shadow-xl"
        style={{
          background:
            'radial-gradient(120% 120% at 50% 30%, #fdfbf7 0%, #f6efe4 55%, #efe4d2 100%)',
        }}
      >
        <h3 className="text-sm font-bold" style={{ color: '#3a3127' }}>
          {title}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: '#8a7d68' }}>
          {message}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm ring-1 ring-black/10"
            style={{ background: '#fffdf9', color: '#3a3127' }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-white shadow-sm"
            style={{ background: tone === 'danger' ? '#c0463b' : '#3a3127' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
