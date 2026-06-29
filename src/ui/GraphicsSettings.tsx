import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useModalGuard } from '../controls/modalGuard'
import { EXPOSURE_MAX, EXPOSURE_MIN, TONE_MAPPING_LABEL } from '../scene/look'
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
import { Icon } from './toolbar/icons'

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
  const showFps = useStore((s) => s.showFps)
  const toggleShowFps = useStore((s) => s.toggleShowFps)
  const unitSystem = useStore((s) => s.units)
  const setUnits = useStore((s) => s.setUnits)
  const proMode = useStore((s) => s.uiMode === 'pro')

  // Modal-style overlay (doesn't build on the shared Modal primitive):
  // suppress global shortcuts while open.
  useModalGuard(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const eff = resolveQuality(tier, overrides)
  const hasOverrides = Object.keys(overrides).length > 0

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="panel"
        style={{ width: 320, maxHeight: 'min(640px, calc(100vh - 48px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          {showBack ? (
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Back">
              <Icon.ExitRoom width={16} height={16} />
            </button>
          ) : null}
          <div>
            <div className="panel-title">Graphics</div>
            <div className="panel-sub">Render & assets</div>
          </div>
          {!showBack ? (
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Close">
              <Icon.Close width={16} height={16} />
            </button>
          ) : null}
        </div>
        <hr className="hr" />
        <div className="panel-body">
          {/* Measurement units — display preference for all read-outs. Metric
              stays the editing unit; imperial reformats labels/HUDs. */}
          <div className="sec-h" style={{ marginBottom: 'var(--s-2)' }}>
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
          <p
            style={{
              fontSize: 'var(--t-2xs)',
              lineHeight: 1.45,
              color: 'var(--text-3)',
              margin: 'var(--s-2) 0 var(--s-3)',
            }}
          >
            Affects dimension read-outs (room sizes, tape, clearance). Plan-editor input fields stay
            in metres.
          </p>

          {/* Tier presets — 2×2 grid. */}
          <div className="sec-h" style={{ marginBottom: 'var(--s-2)' }}>
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
          <p
            style={{
              fontSize: 'var(--t-2xs)',
              lineHeight: 1.45,
              color: 'var(--text-3)',
              margin: 'var(--s-2) 0 var(--s-3)',
            }}
          >
            {QUALITY_DESCRIPTION[tier]}{' '}
            {userSet
              ? hasOverrides
                ? 'Custom settings (overriding the preset).'
                : 'Manual — auto fps-adjust is off.'
              : 'Auto-adjusts to hold 30+ fps. Changing anything pins it.'}
          </p>

          {/* Tone-mapping "look" (view transform) — applies on every tier,
              so it lives outside the Pro-only advanced block. */}
          <div className="sec-h" style={{ marginBottom: 'var(--s-2)' }}>
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
          <p
            style={{
              fontSize: 'var(--t-2xs)',
              lineHeight: 1.45,
              color: 'var(--text-3)',
              margin: 'var(--s-2) 0 var(--s-3)',
            }}
          >
            {TONE_MAPPING_HINT[toneMapping]}
          </p>

          {/* Exposure (brightness) — applies on every tier alongside the Look. */}
          <div className="row">
            <div
              className="rk"
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}
            >
              <div>Exposure</div>
              <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', fontWeight: 500 }}>
                Overall brightness · {exposure.toFixed(2)}×
              </div>
            </div>
            <input
              type="range"
              min={EXPOSURE_MIN}
              max={EXPOSURE_MAX}
              step={0.05}
              value={exposure}
              aria-label="Exposure"
              onChange={(e) => setExposure(Number(e.target.value))}
              className="slider"
              style={{ width: 112 }}
            />
          </div>

          {/* Advanced graphics (asset detail + per-effect overrides + FPS) —
              Pro mode only; Simple keeps just render quality + units. */}
          {proMode ? (
            <>
              {/* Asset quality. */}
              <div className="sec-h" style={{ marginBottom: 'var(--s-2)' }}>
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
              <p
                style={{
                  fontSize: 'var(--t-2xs)',
                  lineHeight: 1.45,
                  color: 'var(--text-3)',
                  margin: 'var(--s-2) 0 0',
                }}
              >
                Model + texture detail, separate from render quality. “Original” loads
                full-resolution assets even on Low.
              </p>

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
                  label="Auto-reveal walls"
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

                <Row label="Night light fixtures" hint={`${eff.maxFixtureLights} max`}>
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={1}
                    value={eff.maxFixtureLights}
                    onChange={(e) => setOverride('maxFixtureLights', Number(e.target.value))}
                    className="slider"
                    style={{ width: 112 }}
                  />
                </Row>
                <Row label="Resolution scale" hint={`${eff.dprMax.toFixed(2)}×`}>
                  <input
                    type="range"
                    min={0.75}
                    max={2}
                    step={0.25}
                    value={eff.dprMax}
                    onChange={(e) => setOverride('dprMax', Number(e.target.value))}
                    className="slider"
                    style={{ width: 112 }}
                  />
                </Row>
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
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="row">
      <div className="rk" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
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
