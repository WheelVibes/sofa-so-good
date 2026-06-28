import type { ParamField } from '../../../furniture/types'
import { Select } from '../../controls/Select'

interface EnumFieldProps {
  field: Extract<ParamField, { kind: 'enum' }>
  value: string
  onChange: (value: string) => void
}

export function EnumField({ field, value, onChange }: EnumFieldProps) {
  return (
    <label className="fld">
      <span className="lbl">{field.label}</span>
      <Select
        value={value}
        onChange={onChange}
        options={field.options.map((o) => ({ value: o.value, label: o.label }))}
        ariaLabel={field.label}
        className="input"
      />
    </label>
  )
}
