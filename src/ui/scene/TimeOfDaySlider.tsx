import { hoursFromDate, useEffectiveHour } from '../../scene/lighting/useEffectiveHour'
import { useStore } from '../../state/store'
import { SliderField } from '../controls/SliderField'

/** Label shown on the sun-position row when no explicit location is set — the
 *  `FALLBACK_LOCATION` (1.35N, 103.82E) `useSunPosition` actually computes with. */
const FALLBACK_LOCATION_LABEL = 'Singapore (default)'

function locationLabel(loc: { lat: number; lon: number; label?: string } | null): string {
  if (!loc) return FALLBACK_LOCATION_LABEL
  if (loc.label) return loc.label
  const lat = `${Math.abs(loc.lat).toFixed(2)}°${loc.lat >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(loc.lon).toFixed(2)}°${loc.lon >= 0 ? 'E' : 'W'}`
  return `${lat}, ${lon}`
}

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
 *
 * The slider row's own label doubles as the live clock readout — the section
 * header above already names the section ("Time of day"), so a second literal
 * "Time of day" row label plus a separate header clock span would show the
 * concept/value twice. See the `.tod .fld .lbl` note in `src/ui/CLAUDE.md`.
 */
export function TimeOfDaySlider() {
  const timeMode = useStore((s) => s.timeMode)
  const setManualHour = useStore((s) => s.setManualHour)
  const setTimeMode = useStore((s) => s.setTimeMode)
  const location = useStore((s) => s.location)
  const openLocationPrompt = useStore((s) => s.openLocationPrompt)
  const effectiveHour = useEffectiveHour()
  // The actual system clock — independent of the selected/scrubbed time.
  const systemHour = hoursFromDate(new Date())

  return (
    <div className="tod" onClick={(e) => e.stopPropagation()}>
      <div className="scene-row-head">
        <span>Time of day</span>
      </div>
      <SliderField
        label={formatClock(effectiveHour)}
        ariaLabel="Time of day"
        min={0}
        max={24}
        step={0.25}
        value={effectiveHour}
        onChange={setManualHour}
        format={formatClock}
        hideReadout
      />
      <button
        type="button"
        className={`tod-system${timeMode === 'system' ? ' on' : ''}`}
        onClick={() => setTimeMode('system')}
      >
        System time · {formatClock(systemHour)}
      </button>
      {/* GEO-PROMPT-ONDEMAND (V5): the ONE quiet, non-blocking entry point to the
          "Where are you?" dialog. It exists on both viewports (the desktop Scene
          menu and the mobile Scene sheet both mount this component) and it is not
          withheld in a showroom, so a visitor who genuinely wants to move the sun
          still can — without being asked before they have seen anything. */}
      <button
        type="button"
        className="tod-system"
        onClick={openLocationPrompt}
        title="Set the location the sun is computed for"
      >
        Sun position · {locationLabel(location)}
      </button>
    </div>
  )
}
