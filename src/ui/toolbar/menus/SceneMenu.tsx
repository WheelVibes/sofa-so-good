import { useState } from 'react'
import { useFeature } from '../../../features/useFeature'
import { applyRenderPreset, RENDER_PRESETS } from '../../../scene/renderPresets'
import type { BackdropKind } from '../../../scene/SceneBackdrop'
import { BACKDROPS } from '../../../scene/SceneBackdrop'
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

/** Scene cluster: time of day (slider + snap checkpoints), lights (off/on/auto —
 *  independent of the time of day), backdrop, and sun direction. */
export function SceneMenu() {
  const orientationDeg = useStore((s) => s.orientationDeg)
  const lightsMode = useStore((s) => s.lightsMode)
  const setLightsMode = useStore((s) => s.setLightsMode)
  const backdrop = useStore((s) => s.backdrop)
  const setBackdrop = useStore((s) => s.setBackdrop)
  const proMode = useStore((s) => s.uiMode === 'pro')
  const fBackdrops = useFeature('backdrops')
  const fRenderPresets = useFeature('renderPresets')
  const [compassOpen, setCompassOpen] = useState(false)

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

        {/* ---- Render presets (F4): one-tap sun + tone + exposure modes ---- */}
        {fRenderPresets && (
          <>
            <div className="scene-sep" />
            <div className="scene-row-head">
              <span>Render presets</span>
            </div>
            <div className="scene-presets moods" onClick={(e) => e.stopPropagation()}>
              {RENDER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="scene-chip"
                  onClick={() => applyRenderPreset(useStore.getState(), p)}
                  title={p.sub}
                >
                  {p.label}
                </button>
              ))}
            </div>
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
