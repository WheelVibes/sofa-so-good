import { type ChangeEvent, useState } from 'react'
import { useFeature } from '../../../features/useFeature'
import {
  applyLightingScene,
  isLightingSceneActive,
  LIGHTING_SCENES,
} from '../../../scene/lighting/lightingScenes'
import { useEffectiveHour } from '../../../scene/lighting/useEffectiveHour'
import { BACKDROPS } from '../../../scene/SceneBackdrop'
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
  const lightsMode = useStore((s) => s.lightsMode)
  const backdrop = useStore((s) => s.backdrop)
  const setBackdrop = useStore((s) => s.setBackdrop)
  const proMode = useStore((s) => s.uiMode === 'pro')
  const fLightingMoods = useFeature('lightingMoods')
  const fBackdrops = useFeature('backdrops')
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
        {/* Scrub slider — drag to sweep the day and watch the light change live. */}
        <div className="px-2 pb-1.5" onClick={(e) => e.stopPropagation()}>
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
        {fLightingMoods && (
          <div className="mt-1 border-t border-[var(--border)] pt-1">
            <div className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
              Lighting moods
            </div>
            {LIGHTING_SCENES.map((sc) => (
              <MenuItem
                key={sc.id}
                icon="Lights"
                label={sc.label}
                sub={`${formatClock(sc.hour)} · lights ${sc.lights}`}
                active={isLightingSceneActive(sc, { timeMode, manualHour, lightsMode })}
                onClick={() => applyLightingScene(sc)}
              />
            ))}
          </div>
        )}
        {fBackdrops && (
          <div className="mt-1 border-t border-[var(--border)] pt-1">
            <div className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
              Backdrop
            </div>
            {BACKDROPS.map((b) => (
              <MenuItem
                key={b.id}
                icon="Cube"
                label={b.label}
                sub={b.sub}
                active={backdrop === b.id}
                onClick={() => setBackdrop(b.id)}
              />
            ))}
          </div>
        )}
        {proMode ? (
          <div className="mt-1 border-t border-[var(--border)] pt-1">
            <MenuItem
              icon="Sun"
              label="Sun direction"
              sub={`${Math.round(orientationDeg)}° — where the sun rises`}
              onClick={() => setCompassOpen(true)}
            />
          </div>
        ) : null}
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
