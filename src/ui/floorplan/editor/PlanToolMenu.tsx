import { useRef, useState } from 'react'
import { Popover } from '../../toolbar/Popover'
import type { Tool } from './planConstants'

/**
 * Mobile drawing-tool picker: a trigger button showing the *current* tool, which
 * opens a tidy grid of labelled tool chips below it (the active tool highlighted).
 * Replaces a native `<select>` — every tool is visible at once with a big touch
 * target, and the current selection is obvious, matching how mobile floor-plan
 * apps surface their tools. Built on the shared `Popover` so it escapes the
 * toolbar clip and closes on Escape / outside-tap / scroll.
 */
export function PlanToolMenu({
  tools,
  tool,
  label,
  onPick,
}: {
  tools: Tool[]
  tool: Tool
  label: (t: Tool) => string
  onPick: (t: Tool) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  // 'scale' is a transient reference-trace mode, not a palette tool — show it as
  // Select on the trigger (mirrors the old <select> behaviour).
  const current = tool === 'scale' ? 'select' : tool
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`btn btn-sm${open ? ' btn-accent' : ''}`}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Drawing tool"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{label(current)}</span>
        <span aria-hidden style={{ opacity: 0.7 }}>
          ▾
        </span>
      </button>
      <Popover open={open} anchorRef={ref} onClose={() => setOpen(false)}>
        <div role="menu" className="pop-panel" style={{ width: 264 }}>
          <div className="action-grid">
            {tools.map((t) => (
              <button
                key={t}
                type="button"
                className={`act${t === current ? ' on' : ''}`}
                aria-current={t === current}
                onClick={() => {
                  onPick(t)
                  setOpen(false)
                }}
              >
                {label(t)}
              </button>
            ))}
          </div>
        </div>
      </Popover>
    </>
  )
}
