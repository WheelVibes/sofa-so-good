import {
  BEVELABLE_KINDS,
  DEFAULT_PART_METALNESS,
  DEFAULT_PART_ROUGHNESS,
} from '../../furniture/glbEdit/editSpec'
import {
  EXTRUDE_PRESET_LABEL,
  EXTRUDE_PRESETS,
  LATHE_PRESET_LABEL,
  LATHE_PRESETS,
  type ProfilePoint,
  SWEEP_PATH_LABEL,
  SWEEP_PATHS,
  SWEEP_PROFILE_LABEL,
  SWEEP_PROFILES,
  type SweepPathKind,
  type SweepProfileKind,
} from '../../furniture/glbEdit/shapeProfiles'
import { ColorPicker } from '../controls/ColorPicker'
import { Select } from '../controls/Select'
import { SliderField } from '../controls/SliderField'
import { useSurfaceMaterialOptions } from '../inspector/ParametricBody'
import { QuickFinishes } from '../inspector/QuickFinishes'
import { Icon } from '../toolbar/icons'
import { useDesigner } from './designerContext'
import { PartMaterialSection } from './PartMaterialSection'
import { ProfileEditor, type ProfileSpace } from './ProfileEditor'

const LATHE_SPACE: ProfileSpace = { minX: 0, maxX: 1, minY: 0, maxY: 1, showAxis: true }
const EXTRUDE_SPACE: ProfileSpace = { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5 }

/**
 * The GLB designer's per-part edit panel ("Edit box/cylinder/…"): size /
 * position / rotation fields, colour, the per-part **texture** picker (GE3c —
 * the app's furniture finish vocabulary, `mat:<id>` procedural + CC0 DLC
 * materials, reusing the inspector's dropdown options + `QuickFinishes`
 * swatch row), the PBR sliders and the mirror action. Pure presentational —
 * the dialog owns the spec; edits flow back through `onPatch` (one
 * `updatePart` patch) and `onMirror`.
 *
 * Inspector behaviour for combined (mesh-kind) parts (GE3c tail):
 * Per-source-part materials are frozen at combine time and stored in
 * `geometry.groups`/`geometry.materials`. The inspector hides the colour /
 * finish / PBR sliders for mesh parts — those surface-look fields are read
 * from the frozen group data, not from the ShapePart-level fields. Position
 * and rotation still work (they move/rotate the whole combined result).
 * To change finishes, re-add the source parts and combine again.
 */
export function PartInspector() {
  const {
    sel: part,
    patchSelectedPart: onPatch,
    mirror: onMirror,
    snapStep,
    renamePartName: onRenamePart,
  } = useDesigner()
  const surfaceMaterials = useSurfaceMaterialOptions()
  // Only rendered when a part is selected (the dialog mounts it unconditionally,
  // so self-gate AFTER the hooks above keep a stable call order).
  if (!part) return null
  const finish = part.finish ?? ''
  // Bevel applies to box + wedge (default sharp) and extrude (default on).
  const bevelable =
    BEVELABLE_KINDS.includes(part.kind as (typeof BEVELABLE_KINDS)[number]) ||
    part.kind === 'extrude'
  // Cap the corner radius at half the smallest dimension so it can't invert.
  const maxBevel = Math.max(0.02, Math.min(...part.size) / 2)
  // Cushion "plump" (Stage 5) — a soft top-bulge on box/capsule kinds.
  const plumpable = part.kind === 'box' || part.kind === 'capsule'
  // Combined (mesh) parts have per-source materials frozen in the geometry —
  // colour/finish/PBR sliders are hidden (no face-picker; re-combine to change).
  const isCombined = part.kind === 'mesh' && !!part.geometry?.materials?.length
  // With a texture set, its own maps define roughness/metalness — hide those
  // sliders (they'd do nothing); glow + opacity still apply on top.
  const sliders = isCombined
    ? []
    : (
        [
          { prop: 'roughness', value: part.roughness ?? DEFAULT_PART_ROUGHNESS, min: 0, max: 1 },
          { prop: 'metalness', value: part.metalness ?? DEFAULT_PART_METALNESS, min: 0, max: 1 },
          { prop: 'emissiveIntensity', value: part.emissiveIntensity ?? 0, min: 0, max: 3 },
          { prop: 'opacity', value: part.opacity ?? 1, min: 0.1, max: 1 },
        ] as const
      ).filter((s) => !finish || (s.prop !== 'roughness' && s.prop !== 'metalness'))

  return (
    <div className="sec">
      <div className="sec-h">
        <span>Edit {part.kind}</span>
      </div>
      {/* Part name (Stage 4) — blank falls back to the default `kind N` label. */}
      <div style={{ marginBottom: 'var(--s-2)' }}>
        <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
          Name
        </div>
        <input
          type="text"
          className="input"
          value={part.name ?? ''}
          placeholder={part.kind}
          aria-label="Shape name"
          onChange={(e) => onRenamePart(part.id, e.target.value)}
          style={{ width: '100%' }}
        />
      </div>
      {/* Solid / Hole role (CSG v2). A hole renders as a translucent ghost and
          is carved out of the solids inside a Subtract combine. Not shown for a
          baked mesh part (its faces are already fused). */}
      {part.kind !== 'mesh' ? (
        <div style={{ marginBottom: 'var(--s-2)' }}>
          <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Type
          </div>
          <div className="seg" role="radiogroup" aria-label="Solid or hole">
            <button
              type="button"
              className={part.role === 'hole' ? '' : 'on'}
              aria-pressed={part.role !== 'hole'}
              onClick={() => onPatch({ role: undefined })}
            >
              Solid
            </button>
            <button
              type="button"
              className={part.role === 'hole' ? 'on' : ''}
              aria-pressed={part.role === 'hole'}
              title="Carve this shape out of overlapping solids in a Subtract combine"
              onClick={() => onPatch({ role: 'hole' })}
            >
              Hole
            </button>
          </div>
          {part.role === 'hole' ? (
            <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 4 }}>
              Holes only cut inside a Subtract combine. Until then it stays a solid.
            </div>
          ) : null}
        </div>
      ) : null}
      {/* A combined (mesh) part's triangles are baked — size is fixed;
          position/rotation still move the whole result. */}
      {part.kind === 'mesh' ? (
        <div
          style={{
            fontSize: 'var(--t-2xs)',
            color: 'var(--text-3)',
            marginBottom: 'var(--s-2)',
          }}
        >
          Combined shape: move and rotate it freely (gizmo or fields). Its size is baked by the
          combine, so there's no Scale gizmo or size fields.
          {isCombined
            ? ' Each source part keeps its own finish — re-add the parts and combine again to change them.'
            : null}
        </div>
      ) : null}
      {(
        (part.kind === 'mesh' ? ['position'] : ['size', 'position']) as ('size' | 'position')[]
      ).map((field) => (
        <div key={field} style={{ marginBottom: 'var(--s-2)' }}>
          <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            {field === 'size' ? 'Size (m)' : 'Position (m)'}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2].map((axis) => (
              <input
                key={axis}
                type="number"
                className="input"
                step={snapStep}
                min={field === 'size' ? 0.02 : -3}
                value={part[field][axis]}
                aria-label={`${part.kind} ${field} ${'XYZ'[axis]}`}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  onPatch({
                    [field]: part[field].map((o, k) => (k === axis ? v : o)) as [
                      number,
                      number,
                      number,
                    ],
                  })
                }}
                style={{ width: '33%' }}
              />
            ))}
          </div>
        </div>
      ))}
      <div style={{ marginBottom: 'var(--s-2)' }}>
        <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
          Rotation (°)
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2].map((axis) => (
            <input
              key={axis}
              type="number"
              className="input"
              step={15}
              min={-180}
              max={180}
              value={(part.rotation ?? [0, 0, 0])[axis]}
              aria-label={`${part.kind} rotation ${'XYZ'[axis]}`}
              onChange={(e) => {
                const v = Number(e.target.value)
                onPatch({
                  rotation: (part.rotation ?? [0, 0, 0]).map((o, k) => (k === axis ? v : o)) as [
                    number,
                    number,
                    number,
                  ],
                })
              }}
              style={{ width: '33%' }}
            />
          ))}
        </div>
      </div>
      {/* Corner radius / bevel — box + wedge (default 0 = sharp) and extrude
          (default on). Max is half the smallest dimension so it never inverts. */}
      {bevelable ? (
        <SliderField
          label="Corner radius (m)"
          value={part.bevel ?? (part.kind === 'extrude' ? 0.02 : 0)}
          min={0}
          max={maxBevel}
          step={0.005}
          format={(v) => `${v.toFixed(3)} m`}
          onChange={(v) => onPatch({ bevel: v })}
        />
      ) : null}

      {/* Cushion plump (Stage 5) — a soft sine-falloff bulge so upholstery reads
          stuffed. Box + capsule only; 0 = flat (byte-identical). */}
      {plumpable ? (
        <SliderField
          label="Plump (cushion)"
          ariaLabel={`${part.kind} plump`}
          value={part.plump ?? 0}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => onPatch({ plump: v || undefined })}
        />
      ) : null}

      {/* Lathe/extrude profile point editor + preset seeding. */}
      {part.kind === 'lathe' ? (
        <>
          <SliderField
            label="Sides"
            value={part.segments ?? 32}
            min={3}
            max={96}
            step={1}
            format={(v) => String(v)}
            onChange={(v) => onPatch({ segments: Math.round(v) })}
          />
          <ProfileEditor
            points={(part.profile ?? LATHE_PRESETS['turned-leg']) as ProfilePoint[]}
            space={LATHE_SPACE}
            presets={LATHE_PRESETS}
            presetLabels={LATHE_PRESET_LABEL}
            onChange={(pts) => onPatch({ profile: pts })}
          />
        </>
      ) : null}
      {part.kind === 'extrude' ? (
        <ProfileEditor
          points={(part.outline ?? EXTRUDE_PRESETS['rounded-rect']) as ProfilePoint[]}
          space={EXTRUDE_SPACE}
          presets={EXTRUDE_PRESETS}
          presetLabels={EXTRUDE_PRESET_LABEL}
          onChange={(pts) => onPatch({ outline: pts })}
        />
      ) : null}

      {/* Sweep: preset cross-section × path (no free point editing — Stage 1a). */}
      {part.kind === 'sweep' ? (
        <div style={{ marginTop: 'var(--s-2)', display: 'grid', gap: 'var(--s-2)' }}>
          <div>
            <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
              Profile
            </div>
            <Select
              className="input"
              ariaLabel="Sweep profile"
              value={part.sweepProfile ?? 'circle'}
              onChange={(v) => onPatch({ sweepProfile: v as SweepProfileKind })}
              style={{ width: '100%' }}
              options={SWEEP_PROFILES.map((k) => ({ value: k, label: SWEEP_PROFILE_LABEL[k] }))}
            />
          </div>
          <div>
            <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
              Path
            </div>
            <Select
              className="input"
              ariaLabel="Sweep path"
              value={part.sweepPath ?? 'ring'}
              onChange={(v) => onPatch({ sweepPath: v as SweepPathKind })}
              style={{ width: '100%' }}
              options={SWEEP_PATHS.map((k) => ({ value: k, label: SWEEP_PATH_LABEL[k] }))}
            />
          </div>
        </div>
      ) : null}

      {/* Colour and texture controls are hidden for combined (mesh) parts whose
          materials are frozen at combine time (GE3c tail). Re-add source parts
          and combine again to change finishes. */}
      {!isCombined ? (
        <>
          <div className="fld">
            <span>Colour</span>
            <ColorPicker
              value={part.color}
              ariaLabel="Shape colour"
              paletteRoomId={null}
              onChange={(hex) => onPatch({ color: hex })}
            />
          </div>
          <div style={{ marginTop: 'var(--s-2)' }}>
            <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
              Texture
            </div>
            <Select
              className="input"
              ariaLabel="Shape texture"
              value={finish}
              onChange={(v) => onPatch({ finish: v || undefined })}
              style={{ width: '100%' }}
              options={[
                { value: '', label: 'None — solid colour' },
                ...surfaceMaterials.map((o) => ({ value: o.value, label: o.label })),
              ]}
            />
            {/* Same curated one-tap swatches the furniture inspector shows; tapping
                the active swatch clears back to the solid colour. */}
            <QuickFinishes
              value={finish}
              onPick={(v) => onPatch({ finish: v === finish ? undefined : v })}
            />
            {finish ? (
              <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 4 }}>
                The texture sets the surface look (roughness and metalness come from it); the colour
                shows until its images are ready.
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      {/* Stage 2 — finish preset gallery first (research: one-tap presets before
          raw sliders), then the basic PBR sliders, with the advanced physical
          sliders + two-tone gradient tucked behind PartMaterialSection's own
          disclosures. Combined (mesh) parts read their frozen per-source
          materials, so they get no material section (same as colour/finish). */}
      {!isCombined ? <PartMaterialSection part={part} onPatch={onPatch} /> : null}
      {sliders.map(({ prop, value, min, max }) => (
        <div key={prop} style={{ marginTop: 'var(--s-2)' }}>
          <SliderField
            label={prop === 'emissiveIntensity' ? 'Glow' : prop[0].toUpperCase() + prop.slice(1)}
            ariaLabel={`${part.kind} ${prop}`}
            value={value}
            min={min}
            max={max}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => onPatch({ [prop]: v })}
          />
        </div>
      ))}
      <button
        type="button"
        className="btn btn-soft btn-block"
        style={{ marginTop: 'var(--s-3)' }}
        onClick={onMirror}
      >
        <Icon.Copy width={14} height={14} />
        Mirror across centre
      </button>
    </div>
  )
}
