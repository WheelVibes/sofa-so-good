import type { ParamField } from '../../../furniture/types'
import { ThemeColorRows } from '../../color/ThemeColorRows'

interface ColorFieldProps {
  field: Extract<ParamField, { kind: 'color' }>
  value: string
  onChange: (value: string) => void
}

export function ColorField({ field, value, onChange }: ColorFieldProps) {
  return (
    <div>
      <label className="fld">
        <span className="lbl">{field.label}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      <ThemeColorRows active={value} onPick={onChange} />
    </div>
  )
}
