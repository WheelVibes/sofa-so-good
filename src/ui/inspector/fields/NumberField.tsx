import type { ParamField } from '../../../furniture/types'

interface NumberFieldProps {
  field: Extract<ParamField, { kind: 'number' }>
  value: number
  onChange: (value: number) => void
}

export function NumberField({ field, value, onChange }: NumberFieldProps) {
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
      <span className="val">
        {value.toFixed(2)}
        {field.unit ? ` ${field.unit}` : ''}
      </span>
    </label>
  )
}
