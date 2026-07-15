import type { PartGradient, ShapePart } from '../../furniture/glbEdit/editSpec'
import {
  applyFinishPreset,
  FINISH_PRESETS,
  matchingFinishPresetId,
} from '../../furniture/glbEdit/finishPresets'
import { ColorPicker } from '../controls/ColorPicker'
import { Disclosure } from '../controls/Disclosure'
import { Segmented } from '../controls/Segmented'
import { SliderField } from '../controls/SliderField'

/**
 * GLB designer Stage 2 — the material finish controls for a (non-combined) part:
 * a one-tap **Finish presets** swatch gallery (curated physics bundles), a
 * progressive-disclosure **Custom finish** panel with the raw
 * sheen/clearcoat/transmission/anisotropy sliders, and a **Gradient** two-tone
 * panel. Presets are applied first (research: presets before raw sliders); the
 * advanced sliders and gradient sit behind `Disclosure`s so the common path stays
 * simple. Pure presentational — edits flow back through `onPatch` (one
 * `updatePart` patch), the same contract as the rest of `PartInspector`.
 */
export function PartMaterialSection({
  part,
  onPatch,
}: {
  part: ShapePart
  onPatch: (patch: Partial<ShapePart>) => void
}) {
  const activePreset = matchingFinishPresetId(part)
  const hasFinish = !!part.finish
  const gradient = part.gradient

  return (
    <>
      {/* Finish presets — one tap sets the physics, keeps the part's colour. A
          textured finish overrides the physical layer, so applying a preset
          clears it (handled by applyFinishPreset). */}
      <div style={{ marginTop: 'var(--s-3)' }}>
        <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
          Finish presets
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> adds default
            browser border/padding that would break this compact swatch grid;
            role="group" + aria-label is the non-visual equivalent. */}
        <div className="fin-presets" role="group" aria-label="Finish presets">
          {FINISH_PRESETS.map((p) => {
            const on = activePreset === p.id
            return (
              <button
                key={p.id}
                type="button"
                className={`fin-preset${on ? ' on' : ''}`}
                aria-pressed={on}
                title={`Apply ${p.label} finish`}
                onClick={() => onPatch(applyFinishPreset(p.id))}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Advanced raw physical sliders (progressive disclosure). Hidden while a
          textured finish is set — its own maps define the surface response. */}
      {!hasFinish ? (
        <div style={{ marginTop: 'var(--s-2)' }}>
          <Disclosure summary="Custom finish" defaultOpen={!activePreset && hasAnyPhysical(part)}>
            <SliderField
              label="Sheen"
              ariaLabel="Sheen"
              value={part.sheen ?? 0}
              min={0}
              max={1}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => onPatch({ sheen: v || undefined })}
            />
            {(part.sheen ?? 0) > 0 ? (
              <>
                <SliderField
                  label="Sheen roughness"
                  ariaLabel="Sheen roughness"
                  value={part.sheenRoughness ?? 0.3}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => v.toFixed(2)}
                  onChange={(v) => onPatch({ sheenRoughness: v })}
                />
                <div className="fld">
                  <span>Sheen colour</span>
                  <ColorPicker
                    value={part.sheenColor ?? '#ffffff'}
                    ariaLabel="Sheen colour"
                    paletteRoomId={null}
                    onChange={(hex) => onPatch({ sheenColor: hex })}
                  />
                </div>
              </>
            ) : null}
            <SliderField
              label="Clearcoat"
              ariaLabel="Clearcoat"
              value={part.clearcoat ?? 0}
              min={0}
              max={1}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => onPatch({ clearcoat: v || undefined })}
            />
            {(part.clearcoat ?? 0) > 0 ? (
              <SliderField
                label="Clearcoat roughness"
                ariaLabel="Clearcoat roughness"
                value={part.clearcoatRoughness ?? 0.1}
                min={0}
                max={1}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => onPatch({ clearcoatRoughness: v })}
              />
            ) : null}
            <SliderField
              label="Transmission (glass)"
              ariaLabel="Transmission"
              value={part.transmission ?? 0}
              min={0}
              max={1}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => onPatch({ transmission: v || undefined })}
            />
            {(part.transmission ?? 0) > 0 ? (
              <>
                <SliderField
                  label="Index of refraction"
                  ariaLabel="Index of refraction"
                  value={part.ior ?? 1.5}
                  min={1}
                  max={2.333}
                  step={0.01}
                  format={(v) => v.toFixed(2)}
                  onChange={(v) => onPatch({ ior: v })}
                />
                <SliderField
                  label="Thickness (m)"
                  ariaLabel="Glass thickness"
                  value={part.thickness ?? 0.3}
                  min={0}
                  max={2}
                  step={0.05}
                  format={(v) => `${v.toFixed(2)} m`}
                  onChange={(v) => onPatch({ thickness: v })}
                />
                <div
                  style={{
                    fontSize: 'var(--t-2xs)',
                    color: 'var(--text-3)',
                    marginTop: 'var(--s-1)',
                  }}
                >
                  Glass see-through renders on the High/Maximum quality tiers (a real GPU) — it
                  always exports correctly.
                </div>
              </>
            ) : null}
            <SliderField
              label="Anisotropy (brushed)"
              ariaLabel="Anisotropy"
              value={part.anisotropy ?? 0}
              min={0}
              max={1}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => onPatch({ anisotropy: v || undefined })}
            />
            {(part.anisotropy ?? 0) > 0 ? (
              <SliderField
                label="Brush angle"
                ariaLabel="Anisotropy rotation"
                value={part.anisotropyRotation ?? 0}
                min={0}
                max={Math.PI}
                step={0.05}
                format={(v) => `${((v * 180) / Math.PI).toFixed(0)}°`}
                onChange={(v) => onPatch({ anisotropyRotation: v || undefined })}
              />
            ) : null}
          </Disclosure>
        </div>
      ) : null}

      {/* Two-tone gradient (baked as vertex colours). Only for solid-colour parts
          — a texture map multiplied by the gradient reads muddy, so it's disabled
          while a finish is set. */}
      <div style={{ marginTop: 'var(--s-2)' }}>
        <Disclosure summary="Gradient" defaultOpen={!!gradient}>
          {hasFinish ? (
            <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
              Clear the texture to use a two-tone gradient (a gradient tints the flat colour, not a
              texture).
            </div>
          ) : gradient ? (
            <>
              <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
                Axis
              </div>
              <Segmented
                ariaLabel="Gradient axis"
                value={gradient.axis}
                onChange={(v) =>
                  onPatch({ gradient: { ...gradient, axis: v as PartGradient['axis'] } })
                }
                options={[
                  { value: 'x', label: 'X' },
                  { value: 'y', label: 'Y' },
                  { value: 'z', label: 'Z' },
                ]}
              />
              <div className="fld" style={{ marginTop: 'var(--s-2)' }}>
                <span>From</span>
                <ColorPicker
                  value={gradient.from}
                  ariaLabel="Gradient start colour"
                  paletteRoomId={null}
                  onChange={(hex) => onPatch({ gradient: { ...gradient, from: hex } })}
                />
              </div>
              <div className="fld">
                <span>To</span>
                <ColorPicker
                  value={gradient.to}
                  ariaLabel="Gradient end colour"
                  paletteRoomId={null}
                  onChange={(hex) => onPatch({ gradient: { ...gradient, to: hex } })}
                />
              </div>
              <button
                type="button"
                className="btn btn-soft btn-block"
                style={{ marginTop: 'var(--s-2)' }}
                onClick={() => onPatch({ gradient: undefined })}
              >
                Remove gradient
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-soft btn-block"
              onClick={() => onPatch({ gradient: { axis: 'y', from: part.color, to: '#ffffff' } })}
            >
              Add two-tone gradient
            </button>
          )}
        </Disclosure>
      </div>
    </>
  )
}

/** True when the part carries any physical finishing field (used to auto-open the
 *  Custom finish disclosure for a hand-tuned look that matches no preset). */
function hasAnyPhysical(part: ShapePart): boolean {
  return (
    (part.sheen ?? 0) > 0 ||
    (part.clearcoat ?? 0) > 0 ||
    (part.transmission ?? 0) > 0 ||
    (part.anisotropy ?? 0) > 0
  )
}
