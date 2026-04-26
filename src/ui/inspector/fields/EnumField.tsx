import type { ParamField } from '../../../furniture/types';

interface EnumFieldProps {
  field: Extract<ParamField, { kind: 'enum' }>;
  value: string;
  onChange: (value: string) => void;
}

export function EnumField({ field, value, onChange }: EnumFieldProps) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-neutral-700">
      <span className="flex-1">{field.label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs"
      >
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
