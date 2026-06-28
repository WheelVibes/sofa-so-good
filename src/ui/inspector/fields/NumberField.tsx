import type { ParamField } from '../../../furniture/types'

interface NumberFieldProps {
  field: Extract<ParamField, { kind: 'number' }>
  value: number
  onChange: (value: number) => void
}

export function NumberField({ field, value, onChange }: NumberFieldProps) {
  // Commit a typed value, clamped to the field's range — so an exact dimension
  // can be entered, not only dragged. `key` reseeds the uncontrolled input when
  // the slider (or another control) changes the value.
  const commit = (raw: number) => {
    if (!Number.isFinite(raw)) return
    onChange(Math.min(field.max, Math.max(field.min, raw)))
  }
  return (
    <label className="fld">
      <span className="lbl">{field.label}</span>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider"
      />
      <span className="val val-edit">
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step}
          key={value.toFixed(4)}
          defaultValue={value.toFixed(2)}
          onBlur={(e) => commit(Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          aria-label={field.label}
        />
        {field.unit ? <em>{field.unit}</em> : null}
      </span>
    </label>
  )
}
