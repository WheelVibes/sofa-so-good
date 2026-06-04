import { type ChangeEvent, useState } from 'react'
import { useEffectiveHour } from '../../../scene/lighting/useEffectiveHour'
import { PRESET_HOURS, type TimePreset } from '../../../state/slices/timeSlice'
import { useStore } from '../../../state/store'
import { CompassModal } from '../CompassModal'
import { MenuItem, ToolbarMenu } from '../ToolbarMenu'

const PRESETS: TimePreset[] = ['morning', 'noon', 'dusk', 'night']

/** Scene cluster: time of day (system / presets / custom) + sun direction. */
export function SceneMenu() {
  const timeMode = useStore((s) => s.timeMode)
  const manualHour = useStore((s) => s.manualHour)
  const setTimeMode = useStore((s) => s.setTimeMode)
  const setPresetTime = useStore((s) => s.setPresetTime)
  const setManualHour = useStore((s) => s.setManualHour)
  const orientationDeg = useStore((s) => s.orientationDeg)
  const effectiveHour = useEffectiveHour()
  const [compassOpen, setCompassOpen] = useState(false)

  const onCustomChange = (e: ChangeEvent<HTMLInputElement>) => {
    const [hh, mm] = e.target.value.split(':').map((n) => Number.parseInt(n, 10))
    if (Number.isFinite(hh) && Number.isFinite(mm)) setManualHour(hh + mm / 60)
  }

  return (
    <>
      <ToolbarMenu icon="Time" label="Scene" width={248}>
        <MenuItem
          icon="Time"
          label="System time"
          sub={formatClock(effectiveHour)}
          active={timeMode === 'system'}
          onClick={() => setTimeMode('system')}
        />
        {PRESETS.map((p) => (
          <MenuItem
            key={p}
            icon="Sun"
            label={p[0].toUpperCase() + p.slice(1)}
            sub={formatClock(PRESET_HOURS[p])}
            active={timeMode === 'manual' && manualHour === PRESET_HOURS[p]}
            onClick={() => setPresetTime(p)}
          />
        ))}
        {/* Custom time row — stopPropagation so editing the input doesn't close the menu. */}
        <div className="flex items-center gap-2 px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <span className="flex-1 text-[13px] text-[var(--text)]">Custom</span>
          <input
            type="time"
            value={formatTimeInput(effectiveHour)}
            onChange={onCustomChange}
            className="rounded border border-[var(--border)] bg-[var(--surface-solid)] px-1 py-0.5 text-xs"
          />
        </div>
        <div className="mt-1 border-t border-[var(--border)] pt-1">
          <MenuItem
            icon="Sun"
            label="Sun direction"
            sub={`${Math.round(orientationDeg)}° — where the sun rises`}
            onClick={() => setCompassOpen(true)}
          />
        </div>
      </ToolbarMenu>
      <CompassModal open={compassOpen} onClose={() => setCompassOpen(false)} />
    </>
  )
}

function formatClock(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const totalMinutes = Math.round(h * 60) % (24 * 60)
  const hh = Math.floor(totalMinutes / 60)
  const mm = totalMinutes % 60
  const period = hh < 12 ? 'AM' : 'PM'
  const display = hh % 12 === 0 ? 12 : hh % 12
  return `${display}:${String(mm).padStart(2, '0')} ${period}`
}

function formatTimeInput(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const totalMinutes = Math.round(h * 60) % (24 * 60)
  const hh = Math.floor(totalMinutes / 60)
  const mm = totalMinutes % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
