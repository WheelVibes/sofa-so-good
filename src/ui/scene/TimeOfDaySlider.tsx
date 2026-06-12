import { hoursFromDate, useEffectiveHour } from '../../scene/lighting/useEffectiveHour'
import { PRESET_HOURS, type TimePreset } from '../../state/slices/timeSlice'
import { useStore } from '../../state/store'

/** Time-of-day checkpoints shown as snap icons along the slider track. Clicking
 *  one jumps to that time; the slider still scrubs freely between them. Labels
 *  follow the user's wording ("Sunset" for the 18:00 dusk preset). */
const CHECKPOINTS: { preset: TimePreset; icon: string; label: string }[] = [
  { preset: 'night', icon: '🌙', label: 'Night' },
  { preset: 'morning', icon: '🌅', label: 'Morning' },
  { preset: 'noon', icon: '☀️', label: 'Noon' },
  { preset: 'dusk', icon: '🌇', label: 'Sunset' },
]

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
 * Time-of-day control shared by the desktop Scene menu and the mobile sheet:
 * a free-scrub slider with snap-to icon checkpoints (morning / noon / sunset /
 * night) and a "System time" toggle. The System label always shows the real
 * wall-clock time, never the currently-selected manual time.
 */
export function TimeOfDaySlider() {
  const timeMode = useStore((s) => s.timeMode)
  const manualHour = useStore((s) => s.manualHour)
  const setManualHour = useStore((s) => s.setManualHour)
  const setPresetTime = useStore((s) => s.setPresetTime)
  const setTimeMode = useStore((s) => s.setTimeMode)
  const effectiveHour = useEffectiveHour()
  // The actual system clock — independent of the selected/scrubbed time.
  const systemHour = hoursFromDate(new Date())

  const atPreset = (p: TimePreset) =>
    timeMode === 'manual' && Math.abs(manualHour - PRESET_HOURS[p]) < 1e-3

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
      <div className="tod-marks">
        {CHECKPOINTS.map((c) => (
          <button
            key={c.preset}
            type="button"
            className={`tod-mark${atPreset(c.preset) ? ' on' : ''}`}
            style={{ left: `${(PRESET_HOURS[c.preset] / 24) * 100}%` }}
            onClick={() => setPresetTime(c.preset)}
            title={`${c.label} · ${formatClock(PRESET_HOURS[c.preset])}`}
            aria-label={`${c.label} (${formatClock(PRESET_HOURS[c.preset])})`}
          >
            <span aria-hidden>{c.icon}</span>
          </button>
        ))}
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
