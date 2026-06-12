import { hoursFromDate, useEffectiveHour } from '../../scene/lighting/useEffectiveHour'
import { useStore } from '../../state/store'

export function formatClock(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const totalMinutes = Math.round(h * 60) % (24 * 60)
  const hh = Math.floor(totalMinutes / 60)
  const mm = totalMinutes % 60
  const period = hh < 12 ? 'AM' : 'PM'
  const display = hh % 12 === 0 ? 12 : hh % 12
  return `${display}:${String(mm).padStart(2, '0')} ${period}`
}

/**
 * Time-of-day control shared by the desktop Scene menu and the mobile sheet: a
 * free-scrub slider over the 24-hour day plus a "System time" toggle. The sun
 * (and so the light level) follows the real position for the user's location +
 * today's date at the selected hour, so dusk/sunset land at the place's real
 * time. The System label always shows the actual wall-clock time, never the
 * currently-selected manual time.
 */
export function TimeOfDaySlider() {
  const timeMode = useStore((s) => s.timeMode)
  const setManualHour = useStore((s) => s.setManualHour)
  const setTimeMode = useStore((s) => s.setTimeMode)
  const effectiveHour = useEffectiveHour()
  // The actual system clock — independent of the selected/scrubbed time.
  const systemHour = hoursFromDate(new Date())

  return (
    <div className="tod" onClick={(e) => e.stopPropagation()}>
      <div className="scene-row-head">
        <span>Time of day</span>
        <span className="scene-clock mono">{formatClock(effectiveHour)}</span>
      </div>
      <div className="scene-slider">
        <input
          type="range"
          min={0}
          max={24}
          step={0.25}
          value={effectiveHour}
          aria-label="Time of day"
          onChange={(e) => setManualHour(Number(e.target.value))}
          className="slider"
          style={{ width: '100%' }}
        />
      </div>
      <button
        type="button"
        className={`tod-system${timeMode === 'system' ? ' on' : ''}`}
        onClick={() => setTimeMode('system')}
      >
        System time · {formatClock(systemHour)}
      </button>
    </div>
  )
}
