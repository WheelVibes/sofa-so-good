import {
  DEFAULT_PART_METALNESS,
  DEFAULT_PART_ROUGHNESS,
  type ShapePart,
} from '../../furniture/glbEdit/editSpec'
import { useSurfaceMaterialOptions } from '../inspector/ParametricBody'
import { QuickFinishes } from '../inspector/QuickFinishes'
import { Icon } from '../toolbar/icons'

/**
 * The GLB designer's per-part edit panel ("Edit box/cylinder/…"): size /
 * position / rotation fields, colour, the per-part **texture** picker (GE3c —
 * the app's furniture finish vocabulary, `mat:<id>` procedural + CC0 DLC
 * materials, reusing the inspector's dropdown options + `QuickFinishes`
 * swatch row), the PBR sliders and the mirror action. Pure presentational —
 * the dialog owns the spec; edits flow back through `onPatch` (one
 * `updatePart` patch) and `onMirror`.
 */
export function PartInspector({
  part,
  onPatch,
  onMirror,
}: {
  part: ShapePart
  onPatch: (patch: Partial<ShapePart>) => void
  onMirror: () => void
}) {
  const surfaceMaterials = useSurfaceMaterialOptions()
  const finish = part.finish ?? ''
  // With a texture set, its own maps define roughness/metalness — hide those
  // sliders (they'd do nothing); glow + opacity still apply on top.
  const sliders = (
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
                step={0.05}
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
      <label className="fld">
        <span>Colour</span>
        <input
          type="color"
          value={part.color}
          aria-label="Shape colour"
          onChange={(e) => onPatch({ color: e.target.value })}
        />
      </label>
      <div style={{ marginTop: 'var(--s-2)' }}>
        <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
          Texture
        </div>
        <select
          className="input"
          aria-label="Shape texture"
          value={finish}
          onChange={(e) => onPatch({ finish: e.target.value || undefined })}
          style={{ width: '100%' }}
        >
          <option value="">None — solid colour</option>
          {surfaceMaterials.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
      {sliders.map(({ prop, value, min, max }) => (
        <div key={prop} style={{ marginTop: 'var(--s-2)' }}>
          <div
            className="label"
            style={{
              fontSize: 'var(--t-2xs)',
              color: 'var(--text-3)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ textTransform: 'capitalize' }}>
              {prop === 'emissiveIntensity' ? 'glow' : prop}
            </span>
            <span>{value.toFixed(2)}</span>
          </div>
          <input
            type="range"
            className="slider"
            min={min}
            max={max}
            step={0.05}
            value={value}
            aria-label={`${part.kind} ${prop}`}
            onChange={(e) => onPatch({ [prop]: Number(e.target.value) })}
            style={{ width: '100%' }}
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
