import {
  type FaceFinish,
  type FaceFinishZone,
  type ShapePart,
  setFaceFinish,
} from '../../furniture/glbEdit/editSpec'
import { ColorPicker } from '../controls/ColorPicker'
import { Disclosure } from '../controls/Disclosure'
import { Select } from '../controls/Select'
import { useSurfaceMaterialOptions } from '../inspector/ParametricBody'

/**
 * GLB designer Stage 6c — per-face finishes on a SHARP box (the board-construction
 * / **edge-banding** cue). Three zones, not six faces: **Top** and **Bottom** are
 * the veneer faces (±Y) and **Edge** is the shared band around the sides (±X, ±Z)
 * — exactly the veneer + edge-band split of a laminated board. Each zone
 * optionally overrides the part's base colour and/or textured finish; blank
 * inherits the base. Rendered only for a sharp box (`boxFaceFinishesActive` gate
 * in `PartInspector` — a bevelled/hollow/plumped box hides this section). Pure
 * presentational — edits flow back through `onPatch` (one `updatePart` patch).
 */
export function PartFaceFinishSection({
  part,
  onPatch,
}: {
  part: ShapePart
  onPatch: (patch: Partial<ShapePart>) => void
}) {
  const surfaceMaterials = useSurfaceMaterialOptions()
  const ff = part.faceFinishes
  const setZone = (zone: FaceFinishZone, patch: FaceFinish) =>
    onPatch({ faceFinishes: setFaceFinish(ff, zone, patch) })

  const zones: Array<{ zone: FaceFinishZone; label: string }> = [
    { zone: 'top', label: 'Top (veneer)' },
    { zone: 'sides', label: 'Edge (band)' },
    { zone: 'bottom', label: 'Bottom' },
  ]

  return (
    <div style={{ marginTop: 'var(--s-2)' }}>
      <Disclosure summary="Per-face finish (edge banding)" defaultOpen={!!ff}>
        <div
          style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginBottom: 'var(--s-2)' }}
        >
          Give the top/bottom veneer and the edge band their own colour or texture — leave a zone
          blank to inherit the part's base look.
        </div>
        {zones.map(({ zone, label }) => {
          const zf = ff?.[zone]
          return (
            <div key={zone} style={{ marginBottom: 'var(--s-2)' }}>
              <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
                {label}
              </div>
              <div className="fld">
                <span>Colour</span>
                <ColorPicker
                  value={zf?.color ?? part.color}
                  ariaLabel={`${label} colour`}
                  paletteRoomId={null}
                  onChange={(hex) => setZone(zone, { color: hex })}
                />
              </div>
              <Select
                className="input"
                ariaLabel={`${label} texture`}
                value={zf?.finish ?? ''}
                onChange={(v) => setZone(zone, { finish: v || undefined })}
                style={{ width: '100%', marginTop: 'var(--s-1)' }}
                options={[
                  { value: '', label: 'Inherit base' },
                  ...surfaceMaterials.map((o) => ({ value: o.value, label: o.label })),
                ]}
              />
              {zf?.color !== undefined || zf?.finish !== undefined ? (
                <button
                  type="button"
                  className="btn btn-soft btn-block"
                  style={{ marginTop: 'var(--s-1)' }}
                  onClick={() => setZone(zone, { color: undefined, finish: undefined })}
                >
                  Reset {label.split(' ')[0].toLowerCase()} to base
                </button>
              ) : null}
            </div>
          )
        })}
      </Disclosure>
    </div>
  )
}
