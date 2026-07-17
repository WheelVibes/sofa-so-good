import { formatWallFade, WALL_REVEAL_STRENGTH_STEP } from '../../../apartment/walls/wallRevealMath'
import { useFeature } from '../../../features/useFeature'
import { HDRI_PRESETS } from '../../../scene/lighting/hdriCatalog'
import { applyRenderPreset, RENDER_PRESETS } from '../../../scene/renderPresets'
import { BACKDROPS, type BackdropKind } from '../../../scene/SceneBackdrop'
import { PRESET_HOURS } from '../../../state/slices/timeSlice'
import type { LightsMode } from '../../../state/slices/uiSlice'
import { useStore } from '../../../state/store'
import { Segmented } from '../../controls/Segmented'
import { Select } from '../../controls/Select'
import { SliderField } from '../../controls/SliderField'
import { PetProfileControl } from '../../PetProfileControl'
import { BackdropUpload } from '../../scene/BackdropUpload'
import { TimeOfDaySlider } from '../../scene/TimeOfDaySlider'
import { Item, LIGHTS_LABEL, Section } from './parts'

/** Scene — time of day, lights, render preset, sun, wall reveal, backdrops, HDRI. */
export function SceneSection({
  activeId,
  act,
  onOpenCompass,
}: {
  activeId: string
  act: (fn: () => void, opts?: { keep?: boolean }) => () => void
  onOpenCompass: () => void
}) {
  const s = useStore
  const lightsMode = useStore((st) => st.lightsMode)
  const showCeilingFixtures = useStore((st) => st.showCeilingFixtures)
  const wallRevealStrength = useStore((st) => st.wallRevealStrength)
  const wallRevealScope = useStore((st) => st.wallRevealScope)
  const timeMode = useStore((st) => st.timeMode)
  const manualHour = useStore((st) => st.manualHour)
  const toneMapping = useStore((st) => st.toneMapping)
  const exposure = useStore((st) => st.exposure)
  const backdrop = useStore((st) => st.backdrop)
  const hasCustomBackdrop = useStore((st) => !!st.customBackdropUrl)
  const hdriId = useStore((st) => st.hdriId)

  const fRenderPresets = useFeature('renderPresets')
  const fBackdrops = useFeature('backdrops')
  const fProceduralSky = useFeature('proceduralSky')
  const fHdri = useFeature('hdriEnvironment')
  const fPetProfile = useFeature('petProfile')
  const fMotion = useFeature('furnitureMotion')
  const motionEnabled = useStore((st) => st.motionEnabled)

  // Detect which render preset (if any) matches current state for the dropdown.
  const activePresetId = (() => {
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
  })()

  return (
    <Section id="scene" title="Scene" icon="Time" activeId={activeId}>
      {/* Time of day: slider + snap-to icon checkpoints (shared with
          desktop). The System toggle inside shows the real clock. */}
      <TimeOfDaySlider />
      {/* Lights — segmented, not a tap-to-cycle row (TB-8): all 3 states are
          visible and one tap away. */}
      <label className="scene-field" onClick={(e) => e.stopPropagation()}>
        <span>Lights — independent of the time of day</span>
        <Segmented
          ariaLabel="Lights"
          value={lightsMode}
          onChange={(v) => s.getState().setLightsMode(v as LightsMode)}
          options={(['auto', 'on', 'off'] as const).map((m) => ({
            value: m,
            label: LIGHTS_LABEL[m],
          }))}
        />
      </label>
      <Item
        icon="Lights"
        label={`Ceiling fixtures: ${showCeilingFixtures ? 'Visible' : 'Hidden'}`}
        sub="3D geometry; illumination stays on"
        on={showCeilingFixtures}
        onClick={act(() => s.getState().setShowCeilingFixtures(!showCeilingFixtures), {
          keep: true,
        })}
      />
      {fMotion && (
        <Item
          icon="Time"
          label={`Motion: ${motionEnabled ? 'On' : 'Paused'}`}
          sub="Animate fan blades and other moving furniture"
          on={motionEnabled}
          onClick={act(() => s.getState().toggleMotion(), { keep: true })}
        />
      )}
      {fRenderPresets && (
        <label className="scene-field" onClick={(e) => e.stopPropagation()}>
          <span>Render preset</span>
          <Select
            className="input scene-select"
            value={activePresetId}
            ariaLabel="Render preset"
            onChange={(v) => {
              const p = RENDER_PRESETS.find((x) => x.id === v)
              if (p) applyRenderPreset(s.getState(), p)
            }}
            options={[
              { value: 'none', label: 'None' },
              ...RENDER_PRESETS.map((p) => ({ value: p.id, label: p.label })),
            ]}
          />
        </label>
      )}
      <Item icon="Sun" label="Sun direction" onClick={act(() => onOpenCompass(), { keep: true })} />
      <label className="scene-field" onClick={(e) => e.stopPropagation()}>
        <SliderField
          label="Wall fade"
          ariaLabel="Wall fade strength"
          min={0}
          max={1}
          step={WALL_REVEAL_STRENGTH_STEP}
          value={wallRevealStrength}
          format={formatWallFade}
          onChange={(v) => s.getState().setWallRevealStrength(v)}
        />
      </label>
      {wallRevealStrength > 0 && (
        <label className="scene-field" onClick={(e) => e.stopPropagation()}>
          <span>Reveal walls</span>
          <Select
            className="input scene-select"
            value={wallRevealScope}
            ariaLabel="Wall reveal scope"
            onChange={(v) => s.getState().setWallRevealScope(v as 'exterior' | 'all')}
            options={[
              { value: 'exterior', label: 'Exterior only' },
              { value: 'all', label: 'Exterior + interior' },
            ]}
          />
        </label>
      )}
      {fBackdrops ? (
        <>
          <label className="scene-field" onClick={(e) => e.stopPropagation()}>
            <span>Window view (walk mode)</span>
            <Select
              className="input scene-select"
              value={backdrop}
              ariaLabel="Backdrop"
              onChange={(v) => s.getState().setBackdrop(v as BackdropKind)}
              options={BACKDROPS.filter(
                (b) =>
                  (b.id !== 'custom' || hasCustomBackdrop) && (b.id !== 'sky' || fProceduralSky),
              ).map((b) => ({ value: b.id, label: `${b.label} — ${b.sub}` }))}
            />
          </label>
          <BackdropUpload />
        </>
      ) : null}
      {fHdri ? (
        <label className="scene-field" onClick={(e) => e.stopPropagation()}>
          <span>Environment lighting</span>
          <Select
            className="input scene-select"
            value={hdriId ?? ''}
            ariaLabel="HDRI environment"
            onChange={(v) => s.getState().setHdri(v === '' ? null : v)}
            options={[
              { value: '', label: 'Procedural (default)' },
              ...HDRI_PRESETS.map((h) => ({ value: h.id, label: h.name })),
            ]}
          />
        </label>
      ) : null}
      {fPetProfile ? (
        <label className="scene-field" onClick={(e) => e.stopPropagation()}>
          <span>Do you have pets?</span>
          <PetProfileControl />
        </label>
      ) : null}
    </Section>
  )
}
