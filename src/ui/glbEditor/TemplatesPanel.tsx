import {
  TEMPLATE_LIBRARY,
  type TemplateParam,
  templateById,
} from '../../furniture/glbEdit/templates'
import { Disclosure } from '../controls/Disclosure'
import { SliderField } from '../controls/SliderField'
import { Icon } from '../toolbar/icons'
import { ArmedCard } from './ArmedCard'

/**
 * The GLB designer's template picker (Asset Studio Stage 3c — template-first
 * flows). Tap an archetype starter (Dining/Coffee table, Bookshelf, Cabinet, Bed
 * frame, Sofa frame) to ARM it: a compact parametric step opens with the
 * template's 2–4 ergonomic sliders (each showing its unit + allowed range + a
 * hint naming the standard) and a **live preview** in the viewport (the dialog
 * renders the would-be-inserted spec). **Use template** flattens it into the
 * current spec (empty → replaces; non-empty → inserts alongside); **Cancel**
 * backs out. Purely presentational — the dialog owns the armed state, the live
 * preview and the insertion.
 */
export function TemplatesPanel({
  armedId,
  params,
  onArm,
  onCancel,
  onUse,
  onParam,
}: {
  armedId: string | null
  params: Record<string, number>
  onArm: (id: string) => void
  onCancel: () => void
  onUse: () => void
  onParam: (key: string, value: number) => void
}) {
  const armed = armedId ? templateById(armedId) : null

  /** Readout for a param: the preset label for an index param, else the value
   *  with its unit. */
  const format = (p: TemplateParam) => (v: number) => {
    if (p.presetLabels) return p.presetLabels[Math.round(v)] ?? String(v)
    if (p.unit === 'shelves' || p.unit === 'doors') return `${Math.round(v)} ${p.unit}`
    return `${v.toFixed(2)}${p.unit ? ` ${p.unit}` : ''}`
  }

  /** The allowed range, formatted for the hint line under a slider. */
  const rangeLabel = (p: TemplateParam) => {
    if (p.presetLabels) return `${p.presetLabels[0]}–${p.presetLabels[p.presetLabels.length - 1]}`
    const suffix = p.unit ? ` ${p.unit}` : ''
    return `${p.min}–${p.max}${suffix}`
  }

  return (
    // Collapsed by default (progressive disclosure, src/ui/CLAUDE.md) — force
    // open while a template is armed so its live-preview controls stay visible.
    <Disclosure className="sec" summary="Templates" defaultOpen={!!armed}>
      {!armed ? (
        <>
          <div
            className="label"
            style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', margin: '0 0 var(--s-1)' }}
          >
            Start from a ready-made piece, then edit its parts.
          </div>
          <div className="action-grid two">
            {TEMPLATE_LIBRARY.map((t) => (
              <button
                key={t.id}
                type="button"
                className="act"
                aria-label={`Start from ${t.name} template`}
                title={`Start from a ${t.name} — tune it, then insert its editable parts`}
                onClick={() => onArm(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
        </>
      ) : (
        <ArmedCard
          title={armed.name}
          closeLabel="Cancel template"
          hint="Adjust the dimensions — the preview updates live — then insert its editable parts."
          onClose={onCancel}
          footer={
            <div className="action-grid" style={{ marginTop: 'var(--s-2)' }}>
              <button
                type="button"
                className="act on"
                aria-label={`Use ${armed.name} template`}
                onClick={onUse}
              >
                <Icon.Cube width={13} height={13} /> Use template
              </button>
              <button type="button" className="act" aria-label="Cancel template" onClick={onCancel}>
                <Icon.Close width={13} height={13} /> Cancel
              </button>
            </div>
          }
        >
          {armed.params.map((p) => (
            <div key={p.key} style={{ marginBottom: 'var(--s-2)' }}>
              <SliderField
                label={p.label}
                ariaLabel={`${armed.name} ${p.label}`}
                value={params[p.key] ?? p.default}
                min={p.min}
                max={p.max}
                step={p.step}
                onChange={(v) => onParam(p.key, v)}
                format={format(p)}
              />
              <div
                style={{
                  fontSize: 'var(--t-2xs)',
                  color: 'var(--text-3)',
                  marginTop: 'var(--s-1)',
                }}
              >
                {p.hint} · range {rangeLabel(p)}
              </div>
            </div>
          ))}
        </ArmedCard>
      )}
    </Disclosure>
  )
}
