import { useState } from 'react'
import { useFeature } from '../../../features/useFeature'
import { applyRenderPreset, RENDER_PRESETS } from '../../../scene/renderPresets'
import type { BackdropKind } from '../../../scene/SceneBackdrop'
import { visibleBackdrops } from '../../../scene/SceneBackdrop'
import { PRESET_HOURS } from '../../../state/slices/timeSlice'
import type { LightsMode } from '../../../state/slices/uiSlice'
import { useStore } from '../../../state/store'
import { TimeOfDaySlider } from '../../scene/TimeOfDaySlider'
import { CompassModal } from '../CompassModal'
import { ToolbarMenu } from '../ToolbarMenu'

const LIGHTS_MODES: { key: LightsMode; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'on', label: 'On' },
  { key: 'off', label: 'Off' },
]

const WALL_REVEAL_MODES: { key: 'auto-hide' | 'translucent' | 'opaque'; label: string }[] = [
  { key: 'translucent', label: 'Translucent' },
  { key: 'auto-hide', label: 'Auto hide' },
  { key: 'opaque', label: 'Opaque' },
]

/** Detect the active render preset by matching current scene state values. */
function useActivePresetId(): string {
  const timeMode = useStore((s) => s.timeMode)
  const manualHour = useStore((s) => s.manualHour)
  const lightsMode = useStore((s) => s.lightsMode)
  const toneMapping = useStore((s) => s.toneMapping)
  const exposure = useStore((s) => s.exposure)
  if (timeMode !== 'manual') return 'none'
  for (const p of RENDER_PRESETS) {
    if (
      Math.abs(manualHour - PRESET_HOURS[p.time]) < 0.01 &&
      lightsMode === p.lights &&
      toneMapping === p.toneMapping &&
      Math.abs(exposure - p.exposure) < 0.01
    ) {
      return p.id
    }
  }
  return 'none'
}

/** Scene cluster: time of day (slider + snap checkpoints), lights (off/on/auto —
 *  independent of the time of day), backdrop, and sun direction. */
export function SceneMenu() {
  const orientationDeg = useStore((s) => s.orientationDeg)
  const lightsMode = useStore((s) => s.lightsMode)
  const setLightsMode = useStore((s) => s.setLightsMode)
  const backdrop = useStore((s) => s.backdrop)
  const setBackdrop = useStore((s) => s.setBackdrop)
  const showCeilingFixtures = useStore((s) => s.showCeilingFixtures)
  const setShowCeilingFixtures = useStore((s) => s.setShowCeilingFixtures)
  const wallRevealMode = useStore((s) => s.wallRevealMode)
  const setWallRevealMode = useStore((s) => s.setWallRevealMode)
  const proMode = useStore((s) => s.uiMode === 'pro')
  const fBackdrops = useFeature('backdrops')
  const flags = useStore((s) => s.featureFlags)
  const fRenderPresets = useFeature('renderPresets')
  const [compassOpen, setCompassOpen] = useState(false)
  const activePresetId = useActivePresetId()

  return (
    <>
      <ToolbarMenu icon="Time" label="Scene" width={264}>
        {/* ---- Time of day ---- */}
        <TimeOfDaySlider />

        {/* ---- Lights (independent of the sun / time of day) ---- */}
        <div className="scene-sep" />
        <div className="scene-row-head">
          <span>Lights</span>
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

        {/* ---- Ceiling fixtures ---- */}
        <div className="scene-sep" />
        <label className="scene-field" onClick={(e) => e.stopPropagation()}>
          <span>Ceiling fixtures</span>
          <button
            type="button"
            className={`seg-btn${showCeilingFixtures ? ' on' : ''}`}
            onClick={() => setShowCeilingFixtures(!showCeilingFixtures)}
            style={{ fontSize: 'var(--t-xs)', padding: '3px 10px' }}
          >
            {showCeilingFixtures ? 'Visible' : 'Hidden'}
          </button>
        </label>

        {/* ---- Render presets (F4): one-tap sun + tone + exposure modes ---- */}
        {fRenderPresets && (
          <>
            <div className="scene-sep" />
            <label className="scene-field" onClick={(e) => e.stopPropagation()}>
              <span>Render preset</span>
              <select
                className="input scene-select"
                value={activePresetId}
                aria-label="Render preset"
                onChange={(e) => {
                  const p = RENDER_PRESETS.find((x) => x.id === e.target.value)
                  if (p) applyRenderPreset(useStore.getState(), p)
                }}
              >
                <option value="none">None</option>
                {RENDER_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </>
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
                {visibleBackdrops((f) => flags[f]).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label} — {b.sub}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {/* ---- Wall visibility ---- */}
        <div className="scene-sep" />
        <label className="scene-field" onClick={(e) => e.stopPropagation()}>
          <span>Wall reveal</span>
          <select
            className="input scene-select"
            value={wallRevealMode}
            aria-label="Wall reveal mode"
            onChange={(e) =>
              setWallRevealMode(e.target.value as 'auto-hide' | 'translucent' | 'opaque')
            }
          >
            {WALL_REVEAL_MODES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

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
