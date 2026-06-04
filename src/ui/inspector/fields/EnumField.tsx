import type { ParamField } from '../../../furniture/types'

interface EnumFieldProps {
  field: Extract<ParamField, { kind: 'enum' }>
  value: string
  onChange: (value: string) => void
}

export function EnumField({ field, value, onChange }: EnumFieldProps) {
  return (
    <label className="fld">
      <span className="lbl">{field.label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
