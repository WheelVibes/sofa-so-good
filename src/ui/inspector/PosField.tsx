import { useEffect, useState } from 'react'

/** A small numeric field that shows the live value but lets the user type a
 *  precise one; commits on blur / Enter (collision-checked by the caller). */
export function PosField({
  label,
  value,
  step,
  onCommit,
  integer,
  unit,
}: {
  label: string
  value: number
  step: number
  onCommit: (v: number) => void
  integer?: boolean
  unit?: string
}) {
  const fmt = (v: number) => (integer ? Math.round(v).toString() : v.toFixed(2))
  const [text, setText] = useState(fmt(value))
  // Re-sync when the underlying value changes (drag, rotate key, etc.) and
  // the field isn't being edited.
  const [editing, setEditing] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: fmt is a render-stable formatter
  useEffect(() => {
    if (!editing) setText(fmt(value))
  }, [value, editing])
  const commit = () => {
    setEditing(false)
    const v = Number(text)
    if (!Number.isNaN(v)) onCommit(v)
  }
  return (
    <label className="num">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={text}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="mono"
      />
      {unit ? <span className="unit">{unit}</span> : null}
    </label>
  )
}
