import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFeature } from '../features/useFeature'
import {
  EXPOSURE_MAX,
  EXPOSURE_MIN,
  SCENE_SATURATION_MAX,
  SCENE_SATURATION_MIN,
  SCENE_WARMTH_MAX,
  SCENE_WARMTH_MIN,
  TONE_MAPPING_LABEL,
} from '../scene/look'
import {
  type AssetTier,
  QUALITY_DESCRIPTION,
  QUALITY_LABEL,
  RENDER_TIERS,
  resolveQuality,
} from '../scene/quality'
import { TONE_MAPPING_SETTINGS, type ToneMappingSetting } from '../scene/toneContext'
import { useStore } from '../state/store'
import { Select } from './controls/Select'
import { SliderField } from './controls/SliderField'
import { Modal } from './Modal'

const TIERS = RENDER_TIERS
/** Segment label per setting — extends the look labels with the 'auto' option. */
const TONE_MAPPING_SETTING_LABEL: Record<ToneMappingSetting, string> = {
  auto: 'Auto',
  ...TONE_MAPPING_LABEL,
}
/** One-line description per tone-mapping setting for the Graphics panel. */
const TONE_MAPPING_HINT: Record<ToneMappingSetting, string> = {
  auto: 'Auto — Neutral while you pick finishes (true colour), filmic otherwise.',
  filmic: 'ACES Filmic — punchy contrast. The classic default.',
  agx: 'AgX — gentler highlights, more photographic. Great for daylight scenes.',
  neutral: 'Neutral — minimal shift, truest material colour. Best for product/showroom looks.',
}
/** Asset-quality options: Auto (follow render tier) + the three asset tiers
 *  ('high' surfaces as "Original" — full-resolution GLB + untouched textures). */
const ASSET_OPTIONS: { value: AssetTier | null; label: string }[] = [
  { value: null, label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'Original' },
]
const SHADOW_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 1024, label: '1024' },
  { value: 2048, label: '2048' },
  { value: 4096, label: '4096' },
]

export function GraphicsSettings({
  open,
  onClose,
  showBack,
}: {
  open: boolean
  onClose: () => void
  showBack?: boolean
}) {
  const tier = useStore((s) => s.qualityTier)
  const overrides = useStore(useShallow((s) => s.qualityOverrides))
  const userSet = useStore((s) => s.qualityUserSet)
  const assetTier = useStore((s) => s.assetTier)
  const setTier = useStore((s) => s.setQualityTier)
  const setOverride = useStore((s) => s.setQualityOverride)
  const resetOverrides = useStore((s) => s.resetQualityOverrides)
  const setAssetTier = useStore((s) => s.setAssetTier)
  const toneMapping = useStore((s) => s.toneMapping)
  const setToneMapping = useStore((s) => s.setToneMapping)
  const exposure = useStore((s) => s.exposure)
  const setExposure = useStore((s) => s.setExposure)
  const fColorGrade = useFeature('colorGrade')
  const sceneWarmth = useStore((s) => s.sceneWarmth)
  const setSceneWarmth = useStore((s) => s.setSceneWarmth)
  const sceneSaturation = useStore((s) => s.sceneSaturation)
  const setSceneSaturation = useStore((s) => s.setSceneSaturation)
  const showFps = useStore((s) => s.showFps)
  const toggleShowFps = useStore((s) => s.toggleShowFps)
  const unitSystem = useStore((s) => s.units)
  const setUnits = useStore((s) => s.setUnits)
  const proMode = useStore((s) => s.uiMode === 'pro')

  const eff = resolveQuality(tier, overrides)
  const hasOverrides = Object.keys(overrides).length > 0

  // Shared Modal shell (UIUX-15): modal guard, Escape, backdrop click and the
  // focus trap all come from the primitive; #graphicsSettings keeps its taller
  // max-height via a per-modal CSS override (components.css).
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Graphics"
      sub="Render & assets"
      showBack={showBack}
      width="var(--modal-xs)"
      panelId="graphicsSettings"
    >
      {/* Measurement units — display preference for all read-outs. Metric
              stays the editing unit; imperial reformats labels/HUDs. Each block
              below is a `.sec` so its sticky `.sec-h` releases when the section
              scrolls past (a bare `.sec-h` would stay pinned and stack under
              the next one), and the first `.sec`'s top padding gives the body
              its breathing room under the panel head. */}
      <div className="sec">
        <div className="sec-h">
          <span>Measurement units</span>
        </div>
        <div className="seg accent" style={{ display: 'flex', width: '100%' }}>
          {(['metric', 'imperial'] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnits(u)}
              className={`capitalize${unitSystem === u ? ' on' : ''}`}
              style={{ flex: 1 }}
            >
              {u === 'metric' ? 'Metric (m)' : 'Imperial (ft)'}
            </button>
          ))}
        </div>
        <p className="sec-desc">
          Affects dimension read-outs (room sizes, tape, clearance). Plan-editor input fields stay
          in metres.
        </p>
      </div>

      {/* Tier presets — 2×2 grid. */}
      <div className="sec">
        <div className="sec-h">
          <span>Quality preset</span>
        </div>
        <div className="action-grid two">
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={`act${tier === t && !hasOverrides ? ' on' : ''}`}
            >
              {QUALITY_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="sec-desc">
          {QUALITY_DESCRIPTION[tier]}{' '}
          {userSet
            ? hasOverrides
              ? 'Custom settings (overriding the preset).'
              : 'Manual — auto fps-adjust is off.'
            : 'Auto-adjusts to hold 30+ fps. Changing anything pins it.'}
        </p>
      </div>

      {/* Tone-mapping "look" (view transform) — applies on every tier,
              so it lives outside the Pro-only advanced block. */}
      <div className="sec">
        <div className="sec-h">
          <span>Look (tone mapping)</span>
        </div>
        <div className="seg accent" style={{ display: 'flex', width: '100%' }}>
          {TONE_MAPPING_SETTINGS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setToneMapping(m)}
              className={toneMapping === m ? 'on' : ''}
              style={{ flex: 1 }}
            >
              {TONE_MAPPING_SETTING_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="sec-desc">{TONE_MAPPING_HINT[toneMapping]}</p>

        {/* Exposure (brightness) — applies on every tier alongside the Look.
                Uses the shared SliderField (label + slider + readout, TB-10). */}
        <SliderField
          label="Exposure"
          ariaLabel="Exposure"
          min={EXPOSURE_MIN}
          max={EXPOSURE_MAX}
          step={0.05}
          value={exposure}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={setExposure}
        />
        {/* Scene colour grade (COLOR-GRADE): Warmth biases the scene's white
                balance on every tier (cooler ← 0 → warmer); Saturation rides the
                High/Maximum post stack — together the "get the greyer, cooler
                look back" dials. Lives beside Exposure on every tier/mode
                (simple-tier flag) — NOT in the Pro-only advanced block. */}
        {fColorGrade ? (
          <>
            <SliderField
              label="Warmth"
              ariaLabel="Scene warmth (white balance)"
              min={SCENE_WARMTH_MIN}
              max={SCENE_WARMTH_MAX}
              step={0.05}
              value={sceneWarmth}
              format={(v) => (v === 0 ? 'Neutral' : v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))}
              onChange={setSceneWarmth}
            />
            <SliderField
              label="Saturation"
              ariaLabel="Scene saturation"
              min={SCENE_SATURATION_MIN}
              max={SCENE_SATURATION_MAX}
              step={0.05}
              value={sceneSaturation}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={setSceneSaturation}
            />
            <p className="sec-desc">
              Warmth shifts the whole scene cooler or warmer; Saturation applies on High / Maximum
              quality.
            </p>
          </>
        ) : null}
      </div>

      {/* Advanced graphics (asset detail + per-effect overrides + FPS) —
              Pro mode only; Simple keeps just render quality + units. */}
      {proMode ? (
        <>
          {/* Asset quality. */}
          <div className="sec">
            <div className="sec-h">
              <span>Asset quality</span>
            </div>
            <div className="seg accent" style={{ display: 'flex', width: '100%' }}>
              {ASSET_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setAssetTier(o.value)}
                  className={assetTier === o.value ? 'on' : ''}
                  style={{ flex: 1 }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="sec-desc">
              Model + texture detail, separate from render quality. “Original” loads full-resolution
              assets even on Low.
            </p>
          </div>

          <div className="sec">
            <Row label="Sun shadows" hint="Resolution; off is fastest">
              <Select
                value={String(eff.shadowMapSize)}
                onChange={(v) => setOverride('shadowMapSize', Number(v))}
                className="input"
                style={{ width: 'auto' }}
                options={SHADOW_OPTIONS.map((o) => ({
                  value: String(o.value),
                  label: o.label,
                }))}
              />
            </Row>

            <Toggle
              label="Reflections (IBL)"
              hint="Image-based lighting probe"
              checked={eff.ibl}
              onChange={(v) => setOverride('ibl', v)}
            />
            <Toggle
              label="Bloom, AO + antialiasing"
              hint="GPU post-processing (loaded on demand)"
              checked={eff.postprocessing}
              onChange={(v) => setOverride('postprocessing', v)}
            />
            <Toggle
              label="Wall fade"
              hint="Fade near walls when orbiting"
              checked={eff.wallReveal}
              onChange={(v) => setOverride('wallReveal', v)}
            />
            <Toggle
              label="Contact shadows"
              hint="Soft grounding under furniture"
              checked={eff.contactShadows}
              onChange={(v) => setOverride('contactShadows', v)}
            />
            <Toggle
              label="FPS counter"
              hint="Live frame-rate overlay"
              checked={showFps}
              onChange={toggleShowFps}
            />

            <SliderField
              label="Night light fixtures"
              min={0}
              max={12}
              step={1}
              value={eff.maxFixtureLights}
              format={(v) => `${v} max`}
              onChange={(v) => setOverride('maxFixtureLights', v)}
            />
            <SliderField
              label="Resolution scale"
              min={0.75}
              max={2}
              step={0.25}
              value={eff.dprMax}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={(v) => setOverride('dprMax', v)}
            />
          </div>

          {hasOverrides && (
            <button
              type="button"
              onClick={resetOverrides}
              className="btn btn-soft btn-block"
              style={{ marginTop: 'var(--s-4)' }}
            >
              Reset to {QUALITY_LABEL[tier]} preset
            </button>
          )}
        </>
      ) : null}
    </Modal>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="row">
      <div
        className="rk"
        style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--s-0)' }}
      >
        <div>{label}</div>
        {hint && (
          <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', fontWeight: 500 }}>
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Row label={label} hint={hint}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`switch${checked ? ' on' : ''}`}
      />
    </Row>
  )
}
