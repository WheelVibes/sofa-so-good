export interface SliderFieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  /** Format the readout (default: String(value)); e.g. (v) => `${v}°`. */
  format?: (v: number) => string
  disabled?: boolean
  id?: string
  /** Overrides the input's aria-label (defaults to `label`) — for call sites where the visible
   *  label is terser than the accessible name should be (e.g. "Field of view" vs "Field of view
   *  (degrees)"). */
  ariaLabel?: string
  /** Suppresses the inline `.val` readout — for call sites that render their own readout
   *  elsewhere (e.g. a section-header clock) and would otherwise show the value twice. */
  hideReadout?: boolean
}

/**
 * A labelled `.slider` range input with a live numeric readout, over the
 * shared `.fld` field-row layout. Pairs a plain `<input type="range">` (no
 * hand-rolled label + value span per call site) so every slider gets the
 * same tabular-nums readout treatment. Raw `.slider` markup stays valid for
 * call sites not yet migrated (YAGNI — see `src/ui/CLAUDE.md`).
 */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  disabled,
  id,
  ariaLabel,
  hideReadout,
}: SliderFieldProps) {
  const readout = format ? format(value) : String(value)
  return (
    <div className="fld">
      <span className="lbl">{label}</span>
      <input
        id={id}
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {!hideReadout && <span className="val">{readout}</span>}
    </div>
  )
}
