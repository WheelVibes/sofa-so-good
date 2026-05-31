import type { ParamField } from '../../../furniture/types'

interface IntegerFieldProps {
  field: Extract<ParamField, { kind: 'integer' }>
  value: number
  onChange: (value: number) => void
}

export function IntegerField({ field, value, onChange }: IntegerFieldProps) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-neutral-700">
      <span className="flex-1">{field.label}</span>
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
        className="w-16 rounded border border-neutral-300 px-2 py-0.5 text-right font-mono"
      />
    </label>
  )
}
