import type { ParamField } from '../../../furniture/types';

interface ColorFieldProps {
  field: Extract<ParamField, { kind: 'color' }>;
  value: string;
  onChange: (value: string) => void;
}

export function ColorField({ field, value, onChange }: ColorFieldProps) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-neutral-700">
      <span className="flex-1">{field.label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-10 cursor-pointer rounded border border-neutral-300"
      />
    </label>
  );
}
