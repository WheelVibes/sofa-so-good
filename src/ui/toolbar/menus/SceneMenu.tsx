import { type ChangeEvent, useState } from 'react'
import { useFeature } from '../../../features/useFeature'
import {
  applyLightingScene,
  isLightingSceneActive,
  LIGHTING_SCENES,
} from '../../../scene/lighting/lightingScenes'
import { useEffectiveHour } from '../../../scene/lighting/useEffectiveHour'
import type { BackdropKind } from '../../../scene/SceneBackdrop'
import { BACKDROPS } from '../../../scene/SceneBackdrop'
import { PRESET_HOURS, type TimePreset } from '../../../state/slices/timeSlice'
import type { LightsMode } from '../../../state/slices/uiSlice'
import { useStore } from '../../../state/store'
import { CompassModal } from '../CompassModal'
import { ToolbarMenu } from '../ToolbarMenu'

const PRESETS: TimePreset[] = ['morning', 'noon', 'dusk', 'night']
const PRESET_ICON: Record<TimePreset, string> = {
  morning: '🌅',
  noon: '☀️',
  dusk: '🌇',
  night: '🌙',
}
const LIGHTS_MODES: { key: LightsMode; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'on', label: 'On' },
  { key: 'off', label: 'Off' },
]

/** Scene cluster: time of day (slider + preset checkpoints), lighting (mood +
 *  fixture mode), backdrop, and sun direction. */
export function SceneMenu() {
  const timeMode = useStore((s) => s.timeMode)
  const manualHour = useStore((s) => s.manualHour)
  const setTimeMode = useStore((s) => s.setTimeMode)
  const setPresetTime = useStore((s) => s.setPresetTime)
  const setManualHour = useStore((s) => s.setManualHour)
  const orientationDeg = useStore((s) => s.orientationDeg)
  const lightsMode = useStore((s) => s.lightsMode)
  const setLightsMode = useStore((s) => s.setLightsMode)
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

  const isPresetActive = (p: TimePreset) =>
    timeMode === 'manual' && Math.abs(manualHour - PRESET_HOURS[p]) < 1e-3

  return (
    <>
      <ToolbarMenu icon="Time" label="Scene" width={264}>
        {/* ---- Time of day ---- */}
        <div className="scene-row-head">
          <span>Time of day</span>
          <span className="scene-clock mono">{formatClock(effectiveHour)}</span>
        </div>
        {/* Scrub slider with preset checkpoints marked along the track. */}
        <div className="scene-slider" onClick={(e) => e.stopPropagation()}>
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
          <div className="scene-ticks" aria-hidden>
            {PRESETS.map((p) => (
              <span
                key={p}
                className="scene-tick"
                style={{ left: `${(PRESET_HOURS[p] / 24) * 100}%` }}
              />
            ))}
          </div>
        </div>
        {/* Preset checkpoint chips. */}
        <div className="scene-presets" onClick={(e) => e.stopPropagation()}>
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`scene-chip${isPresetActive(p) ? ' on' : ''}`}
              onClick={() => setPresetTime(p)}
              title={formatClock(PRESET_HOURS[p])}
            >
              <span className="scene-chip-i" aria-hidden>
                {PRESET_ICON[p]}
              </span>
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        {/* System time + precise custom time. */}
        <div className="scene-time-row" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`scene-chip sm${timeMode === 'system' ? ' on' : ''}`}
            onClick={() => setTimeMode('system')}
          >
            System
          </button>
          <input
            type="time"
            value={formatTimeInput(effectiveHour)}
            onChange={onCustomChange}
            aria-label="Custom time"
            className="scene-time-input"
          />
        </div>

        {/* ---- Lighting ---- */}
        <div className="scene-sep" />
        <div className="scene-row-head">
          <span>Lighting</span>
        </div>
        <div className="scene-seg" onClick={(e) => e.stopPropagation()}>
          {LIGHTS_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={lightsMode === m.key ? 'on' : ''}
              onClick={() => setLightsMode(m.key)}
              title={`Light fixtures: ${m.label}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {fLightingMoods && (
          <div className="scene-presets moods" onClick={(e) => e.stopPropagation()}>
            {LIGHTING_SCENES.map((sc) => (
              <button
                key={sc.id}
                type="button"
                className={`scene-chip${
                  isLightingSceneActive(sc, { timeMode, manualHour, lightsMode }) ? ' on' : ''
                }`}
                onClick={() => applyLightingScene(sc)}
                title={`${formatClock(sc.hour)} · lights ${sc.lights}`}
              >
                {sc.label}
              </button>
            ))}
          </div>
        )}

        {/* ---- Backdrop ---- */}
        {fBackdrops && (
          <>
            <div className="scene-sep" />
            <label className="scene-field" onClick={(e) => e.stopPropagation()}>
              <span>Backdrop</span>
              <select
                className="input scene-select"
                value={backdrop}
                aria-label="Backdrop"
                onChange={(e) => setBackdrop(e.target.value as BackdropKind)}
              >
                {BACKDROPS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label} — {b.sub}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {/* ---- Sun direction (Pro) ---- */}
        {proMode ? (
          <>
            <div className="scene-sep" />
            <button type="button" className="menu-item" onClick={() => setCompassOpen(true)}>
              <span className="mi-text">
                <span className="mi-main">Sun direction</span>
                <span className="mi-sub">{Math.round(orientationDeg)}° — where the sun rises</span>
              </span>
            </button>
          </>
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
