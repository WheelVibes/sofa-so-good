import type { ParamField } from '../../../furniture/types'
import { ColorPicker } from '../../controls/ColorPicker'

interface ColorFieldProps {
  field: Extract<ParamField, { kind: 'color' }>
  value: string
  onChange: (value: string) => void
}

export function ColorField({ field, value, onChange }: ColorFieldProps) {
  return (
    <label className="fld">
      <span className="lbl">{field.label}</span>
      <ColorPicker value={value} onChange={onChange} ariaLabel={field.label} />
    </label>
  )
}
