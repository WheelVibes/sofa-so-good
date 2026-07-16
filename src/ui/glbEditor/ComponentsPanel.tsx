import {
  COMPONENT_CATEGORIES,
  COMPONENT_LIBRARY,
  type ComponentCategory,
  componentById,
} from '../../furniture/glbEdit/components'
import { Disclosure } from '../controls/Disclosure'
import { SliderField } from '../controls/SliderField'
import { ArmedCard } from './ArmedCard'
import { useDesigner } from './designerContext'

/**
 * The GLB designer's fittings/component library (Asset Studio Stage 3b). Tap a
 * component to ARM it; the hint then invites the user to **click a face in the
 * preview to place it** (SWOOD pattern — the component lands oriented to the
 * clicked surface as a named, fully-editable `PartGroup`). While armed, 1–3
 * sliders tune the component's params before/while placing; a second tap on the
 * armed component (or Esc) disarms. Text buttons per the toolbar idiom; 44px
 * touch targets via the shared `.act` class. Purely presentational — the dialog
 * owns the armed state + runs the placement.
 */
export function ComponentsPanel() {
  const {
    armedComponentId: armedId,
    armedParams: params,
    armComponent: onArm,
    disarmComponent: onDisarm,
    setArmedParam: onParam,
  } = useDesigner()
  const armed = armedId ? componentById(armedId) : null
  const byCategory = (cat: ComponentCategory) => COMPONENT_LIBRARY.filter((c) => c.category === cat)

  return (
    // Collapsed by default (progressive disclosure) — force open while a
    // component is armed so its placement hint + sliders stay visible.
    <Disclosure className="sec" summary="Components" defaultOpen={!!armed}>
      {COMPONENT_CATEGORIES.map((cat) => (
        <div key={cat} style={{ marginBottom: 'var(--s-2)' }}>
          <div
            className="label"
            style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', margin: '0 0 var(--s-1)' }}
          >
            {cat}
          </div>
          <div className="action-grid two">
            {byCategory(cat).map((c) => (
              <button
                key={c.id}
                type="button"
                className={`act${armedId === c.id ? ' on' : ''}`}
                aria-pressed={armedId === c.id}
                aria-label={`${armedId === c.id ? 'Disarm' : 'Place'} ${c.name}`}
                title={
                  armedId === c.id
                    ? `${c.name} armed — click a face to place, or tap again to cancel`
                    : `Arm ${c.name}, then click a face to place it`
                }
                onClick={() => (armedId === c.id ? onDisarm() : onArm(c.id))}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      ))}

      {armed ? (
        <ArmedCard
          title={`${armed.name} armed`}
          closeLabel="Cancel placement"
          closeTitle="Cancel (Esc)"
          marginTop="var(--s-1)"
          hint={
            <>
              Click a surface in the preview to place it.{' '}
              {armed.mount === 'floor'
                ? 'Legs/feet drop from downward faces (a table underside or the floor).'
                : 'Handles/hinges sit on upright faces (a drawer or door front).'}
            </>
          }
          onClose={onDisarm}
        >
          {armed.params.map((p) => (
            <SliderField
              key={p.key}
              label={p.label}
              value={params[p.key] ?? p.default}
              min={p.min}
              max={p.max}
              step={p.step}
              onChange={(v) => onParam(p.key, v)}
              format={(v) => v.toFixed(3)}
            />
          ))}
        </ArmedCard>
      ) : null}
    </Disclosure>
  )
}
