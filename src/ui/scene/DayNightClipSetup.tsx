/**
 * Inline "Day → night sweep" setup shown next to the record-walkthrough entry
 * in SavedViewsSection (DAY-NIGHT-CLIP). When enabled, the recorded saved-views
 * walkthrough animates the time-of-day slider from the start hour to the end
 * hour across the clip's duration, so the exported video transitions through
 * lighting conditions.
 *
 * Gated by the `dayNightClip` pro flag (the caller only mounts it when the flag
 * is on). The same component renders in the desktop View menu popover AND the
 * mobile View accordion at ≤640px — no separate mobile copy (it inherits the
 * menu-item / field-row layout). Restoring the pre-sweep time is handled by the
 * tour lifecycle (`timeSlice.begin/endTimeSweep`), not here.
 */

import { useStore } from '../../state/store'
import { SliderField } from '../controls/SliderField'
import { formatClock } from './TimeOfDaySlider'

export function DayNightClipSetup() {
  const sweepOn = useStore((s) => s.clipTimeSweep)
  const startHour = useStore((s) => s.clipSweepStartHour)
  const endHour = useStore((s) => s.clipSweepEndHour)
  const setSweep = useStore((s) => s.setClipTimeSweep)
  const setStart = useStore((s) => s.setClipSweepStartHour)
  const setEnd = useStore((s) => s.setClipSweepEndHour)

  return (
    // The desktop ToolbarMenu panel closes on any bubbled click (its whole-panel
    // onClick) — this is a multi-interaction setup control, not a one-shot menu
    // item, so keep clicks local: toggling the sweep or dragging a slider must
    // not dismiss the menu (same reason the saved-view row actions stop
    // propagation).
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-1)',
        padding: 'var(--s-1) var(--s-3) var(--s-2)',
      }}
    >
      <label
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', cursor: 'pointer' }}
        title="Animate the time of day across the recorded walkthrough video"
      >
        <input
          type="checkbox"
          checked={sweepOn}
          onChange={(e) => setSweep(e.target.checked)}
          style={{ margin: 0 }}
          aria-label="Sweep time of day across the recorded walkthrough"
        />
        <span style={{ fontSize: 'var(--t-sm)', lineHeight: 'var(--lh-tight)' }}>
          Day → night sweep
        </span>
      </label>
      {sweepOn ? (
        <>
          <SliderField
            label="From"
            ariaLabel="Sweep start time"
            value={startHour}
            min={0}
            max={24}
            step={0.5}
            format={formatClock}
            onChange={setStart}
          />
          <SliderField
            label="To"
            ariaLabel="Sweep end time"
            value={endHour}
            min={0}
            max={24}
            step={0.5}
            format={formatClock}
            onChange={setEnd}
          />
        </>
      ) : null}
    </div>
  )
}
