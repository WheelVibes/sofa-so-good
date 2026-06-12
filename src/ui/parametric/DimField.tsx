import { useEffect, useState } from 'react'
import type { DimRange } from '../../furniture/parametric/spec'

/** Round metres → whole centimetres for display. */
const toCm = (m: number) => Math.round(m * 100)

/**
 * One dimension control: a slider + numeric input pair in centimetres,
 * clamped to the type's envelope. The numeric input keeps a local string
 * while typing (so partial/cleared input never crashes or snaps mid-keystroke)
 * and commits the clamped value on change/blur.
 */
export function DimField({
  label,
  value,
  range,
  onChange,
}: {
  label: string
  /** Current value in metres. */
  value: number
  range: DimRange
  onChange: (metres: number) => void
}) {
  const [text, setText] = useState(String(toCm(value)))
  // Re-sync the text when the committed value changes from outside
  // (slider drag, type-tab switch, clamping).
  useEffect(() => {
    setText(String(toCm(value)))
  }, [value])

  const commit = (raw: string) => {
    if (raw.trim() === '') return // cleared — keep the last committed value
    const cm = Number(raw) // (`Number('')` would be 0, hence the guard above)
    if (!Number.isFinite(cm)) return // partial input ("-", "1e") — keep typing
    const m = Math.min(range.max, Math.max(range.min, cm / 100))
    onChange(m)
  }

  return (
    <div className="fld" style={{ display: 'block', marginBottom: 'var(--s-2)' }}>
      <div
        className="label"
        style={{
          fontSize: 'var(--t-2xs)',
          color: 'var(--text-3)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>{label}</span>
        <span>
          {toCm(range.min)}–{toCm(range.max)} cm
        </span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
        <input
          type="range"
          className="slider"
          aria-label={`${label} slider`}
          min={toCm(range.min)}
          max={toCm(range.max)}
          step={1}
          value={toCm(value)}
          onChange={(e) => commit(e.target.value)}
          style={{ flex: 1 }}
        />
        <input
          type="number"
          className="input mono"
          aria-label={`${label} (cm)`}
          min={toCm(range.min)}
          max={toCm(range.max)}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            commit(e.target.value)
          }}
          onBlur={() => setText(String(toCm(value)))}
          style={{ width: 64, height: 28, padding: '0 6px' }}
        />
      </div>
    </div>
  )
}
