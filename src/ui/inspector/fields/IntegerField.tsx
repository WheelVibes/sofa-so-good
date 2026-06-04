import type { ParamField } from '../../../furniture/types'

interface IntegerFieldProps {
  field: Extract<ParamField, { kind: 'integer' }>
  value: number
  onChange: (value: number) => void
}

export function IntegerField({ field, value, onChange }: IntegerFieldProps) {
  return (
    <label className="fld">
      <span className="lbl">{field.label}</span>
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={1}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(Math.round(n))
        }}
        className="input fld-input mono"
      />
    </label>
  )
}
