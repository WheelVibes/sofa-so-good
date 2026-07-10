import { useState } from 'react'
import { formatWallFade, WALL_REVEAL_STRENGTH_STEP } from '../../../apartment/walls/wallRevealMath'
import { useFeature } from '../../../features/useFeature'
import { HDRI_PRESETS } from '../../../scene/lighting/hdriCatalog'
import { applyRenderPreset, RENDER_PRESETS } from '../../../scene/renderPresets'
import type { BackdropKind } from '../../../scene/SceneBackdrop'
import { BACKDROPS } from '../../../scene/SceneBackdrop'
import { PRESET_HOURS } from '../../../state/slices/timeSlice'
import type { LightsMode } from '../../../state/slices/uiSlice'
import { useStore } from '../../../state/store'
import { Select } from '../../controls/Select'
import { SliderField } from '../../controls/SliderField'
import { BackdropUpload } from '../../scene/BackdropUpload'
import { TimeOfDaySlider } from '../../scene/TimeOfDaySlider'
import { CompassModal } from '../CompassModal'
import { ToolbarMenu } from '../ToolbarMenu'

const LIGHTS_MODES: { key: LightsMode; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'on', label: 'On' },
  { key: 'off', label: 'Off' },
]

const WALL_REVEAL_SCOPES: { key: 'exterior' | 'all'; label: string }[] = [
  { key: 'exterior', label: 'Exterior only' },
  { key: 'all', label: 'Exterior + interior' },
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
  const hasCustomBackdrop = useStore((s) => !!s.customBackdropUrl)
  const showCeilingFixtures = useStore((s) => s.showCeilingFixtures)
  const setShowCeilingFixtures = useStore((s) => s.setShowCeilingFixtures)
  const wallRevealStrength = useStore((s) => s.wallRevealStrength)
  const setWallRevealStrength = useStore((s) => s.setWallRevealStrength)
  const wallRevealScope = useStore((s) => s.wallRevealScope)
  const setWallRevealScope = useStore((s) => s.setWallRevealScope)
  const proMode = useStore((s) => s.uiMode === 'pro')
  const fBackdrops = useFeature('backdrops')
  const fProceduralSky = useFeature('proceduralSky')
  const fHdri = useFeature('hdriEnvironment')
  const hdriId = useStore((s) => s.hdriId)
  const setHdri = useStore((s) => s.setHdri)
  const fRenderPresets = useFeature('renderPresets')
  const fMotion = useFeature('furnitureMotion')
  const motionEnabled = useStore((s) => s.motionEnabled)
  const toggleMotion = useStore((s) => s.toggleMotion)
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
            title="Show or hide ceiling-mounted lights and fans"
          >
            {showCeilingFixtures ? 'Visible' : 'Hidden'}
          </button>
        </label>

        {/* ---- Furniture motion (fan blades) — bug #15 ---- */}
        {fMotion && (
          <>
            <div className="scene-sep" />
            <label className="scene-field" onClick={(e) => e.stopPropagation()}>
              <span>Motion</span>
              <button
                type="button"
                className={`seg-btn${motionEnabled ? ' on' : ''}`}
                onClick={() => toggleMotion()}
                title="Animate moving furniture like ceiling-fan blades"
              >
                {motionEnabled ? 'On' : 'Paused'}
              </button>
            </label>
          </>
        )}

        {/* ---- Render presets (F4): one-tap sun + tone + exposure modes ---- */}
        {fRenderPresets && (
          <>
            <div className="scene-sep" />
            <label className="scene-field" onClick={(e) => e.stopPropagation()}>
              <span>Render preset</span>
              <Select
                className="input scene-select"
                value={activePresetId}
                ariaLabel="Render preset"
                onChange={(v) => {
                  const p = RENDER_PRESETS.find((x) => x.id === v)
                  if (p) applyRenderPreset(useStore.getState(), p)
                }}
                options={[
                  { value: 'none', label: 'None' },
                  ...RENDER_PRESETS.map((p) => ({ value: p.id, label: p.label })),
                ]}
              />
            </label>
          </>
        )}

        {/* ---- Backdrop ---- */}
        {fBackdrops && (
          <>
            <div className="scene-sep" />
            <label className="scene-field" onClick={(e) => e.stopPropagation()}>
              <span>Window view (walk mode)</span>
              <Select
                className="input scene-select"
                value={backdrop}
                ariaLabel="Backdrop"
                onChange={(v) => setBackdrop(v as BackdropKind)}
                options={BACKDROPS.filter(
                  (b) =>
                    (b.id !== 'custom' || hasCustomBackdrop) && (b.id !== 'sky' || fProceduralSky),
                ).map((b) => ({ value: b.id, label: `${b.label} — ${b.sub}` }))}
              />
            </label>
            <BackdropUpload />
          </>
        )}

        {/* ---- HDRI environment lighting (F3/R-HDRI · PHOTO-HDRI) ---- */}
        {fHdri && (
          <>
            <div className="scene-sep" />
            <label className="scene-field" onClick={(e) => e.stopPropagation()}>
              <span>Environment lighting</span>
              <Select
                className="input scene-select"
                value={hdriId ?? ''}
                ariaLabel="HDRI environment"
                onChange={(v) => setHdri(v === '' ? null : v)}
                options={[
                  { value: '', label: 'Procedural (default)' },
                  ...HDRI_PRESETS.map((h) => ({ value: h.id, label: `${h.name} — ${h.hint}` })),
                ]}
              />
            </label>
          </>
        )}

        {/* ---- Wall visibility ---- */}
        <div className="scene-sep" />
        <label className="scene-field" onClick={(e) => e.stopPropagation()}>
          <SliderField
            label="Wall fade"
            ariaLabel="Wall fade strength"
            min={0}
            max={1}
            step={WALL_REVEAL_STRENGTH_STEP}
            value={wallRevealStrength}
            format={formatWallFade}
            onChange={setWallRevealStrength}
          />
        </label>
        {/* Scope: which walls the fade applies to. Irrelevant at strength 0
            (no fade), so it's only shown while the fade is on. */}
        {wallRevealStrength > 0 && (
          <label className="scene-field" onClick={(e) => e.stopPropagation()}>
            <span>Reveal walls</span>
            <Select
              className="input scene-select"
              value={wallRevealScope}
              ariaLabel="Wall reveal scope"
              onChange={(v) => setWallRevealScope(v as 'exterior' | 'all')}
              options={WALL_REVEAL_SCOPES.map((s) => ({ value: s.key, label: s.label }))}
            />
          </label>
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
