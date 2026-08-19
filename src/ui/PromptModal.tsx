import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { Modal } from './Modal'

/**
 * Themed, focus-trapped replacement for the blocking `window.prompt`. Driven by
 * the prompt slice (`promptText` opens it, returning a Promise); mounted once in
 * App. Submitting resolves with the trimmed value (blank → null, like cancel).
 */
export function PromptModal() {
  const req = useStore((s) => s.textPrompt)
  const resolvePrompt = useStore((s) => s.resolvePrompt)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Seed the field from the request's default each time a new prompt opens, and
  // focus + select so the user can type or overwrite immediately.
  useEffect(() => {
    if (!req) return
    setText(req.defaultValue ?? '')
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [req])

  if (!req) return null

  const submit = () => resolvePrompt(text.trim() || null)

  return (
    <Modal open onClose={() => resolvePrompt(null)} title={req.title} panelId="promptModal">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex flex-col gap-3"
      >
        {req.label ? <span className="label">{req.label}</span> : null}
        <input
          ref={inputRef}
          type={req.numeric ? 'number' : 'text'}
          inputMode={req.numeric ? 'decimal' : undefined}
          // step="any": a bare number input defaults to step=1, so a decimal
          // answer (e.g. "3.05" metres for scale calibration, "12.5" seconds
          // for a clip length) fails native stepMismatch validation and the
          // form's submit silently no-ops (same bug class as ScalePlanModal).
          step={req.numeric ? 'any' : undefined}
          value={text}
          placeholder={req.placeholder}
          onChange={(e) => setText(e.target.value)}
          className="input"
          aria-label={req.label ?? req.title}
        />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-soft" onClick={() => resolvePrompt(null)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-accent">
            {req.submitLabel ?? 'OK'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
