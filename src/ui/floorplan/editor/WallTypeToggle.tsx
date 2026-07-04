/**
 * External/internal thickness segmented control for newly-drawn walls (only
 * meaningful while the Wall tool is active — the caller decides whether to
 * render it). Extracted from `FloorPlanEditor` (REFAC-2).
 */
export function WallTypeToggle({
  wallType,
  onChange,
}: {
  wallType: 'internal' | 'external'
  onChange: (t: 'internal' | 'external') => void
}) {
  return (
    <div className="seg">
      {(['external', 'internal'] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          title="Thickness of newly-drawn walls"
          className={`capitalize${wallType === t ? ' on' : ''}`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
