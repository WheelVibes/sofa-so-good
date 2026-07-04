import { mountHeightPresetsInRange } from '../../furniture/mountHeightPresets'
import { useStore } from '../../state/store'
import { formatLength } from '../../utils/measurement'

/**
 * One-tap standard mount-height chips shown under a mounted item's `mountHeight`
 * slider — gallery 1.45 m, TV seated-eye 1.1 m, pendant-over-table 1.5 m, etc.
 * Designer conventions so users don't dial heights by hand. Pure presentational;
 * the parent owns the value + commit (mirrors QuickFinishes). Presets are clamped
 * to the field's range so none land off the slider.
 */
export function MountHeightPresets({
  defId,
  value,
  min,
  max,
  onPick,
}: {
  defId: string
  value: number
  min: number
  max: number
  onPick: (height: number) => void
}) {
  const units = useStore((s) => s.units)
  const presets = mountHeightPresetsInRange(defId, min, max)
  if (presets.length === 0) return null
  return (
    <div className="quick-finish">
      <span className="quick-finish-h">Standard heights</span>
      {/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> needs a
          <legend> and adds default browser border/padding, changing the look
          of this compact chip row — role="group" + aria-label is the
          non-visual equivalent. */}
      <div className="quick-finish-row" role="group" aria-label="Standard heights">
        {presets.map((p) => {
          // Within a few mm counts as "on" — float slider values won't be exact.
          const isActive = Math.abs(value - p.height) < 0.005
          return (
            <button
              key={p.label}
              type="button"
              className={`chip${isActive ? ' on' : ''}`}
              title={`Set mount height to ${formatLength(p.height, units)}`}
              aria-pressed={isActive}
              onClick={() => onPick(p.height)}
            >
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
