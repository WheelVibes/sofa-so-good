import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import { Button } from './controls/Button'
import { Modal } from './Modal'

/**
 * Themed, focus-trapped replacement for the blocking `window.confirm`. Driven by
 * the prompt slice (`confirmAction` opens it, returning a Promise<boolean>);
 * mounted once in App. Focus lands on Cancel so the safe choice is the default;
 * Enter confirms.
 */
export function ConfirmModal() {
  const req = useStore((s) => s.confirmRequest)
  const resolveConfirm = useStore((s) => s.resolveConfirm)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!req) return
    const id = requestAnimationFrame(() => cancelRef.current?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        resolveConfirm(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('keydown', onKey)
    }
  }, [req, resolveConfirm])

  if (!req) return null

  return (
    <Modal
      open
      onClose={() => resolveConfirm(false)}
      title={req.title}
      panelId="confirmModal"
      footer={
        <div className="panel-foot">
          <Button ref={cancelRef} variant="soft" onClick={() => resolveConfirm(false)}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            variant={req.danger ? 'danger' : 'accent'}
            onClick={() => resolveConfirm(true)}
          >
            {req.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
        {req.message}
      </p>
    </Modal>
  )
}
