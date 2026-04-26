import type { ParamField } from '../../../furniture/types';

interface NumberFieldProps {
  field: Extract<ParamField, { kind: 'number' }>;
  value: number;
  onChange: (value: number) => void;
}

export function NumberField({ field, value, onChange }: NumberFieldProps) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-neutral-700">
      <span className="flex-1">{field.label}</span>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-blue-500"
      />
      <span className="w-12 text-right font-mono">
        {value.toFixed(2)}
        {field.unit ? ` ${field.unit}` : ''}
      </span>
    </label>
  );
}
