import { useState } from 'react'
import { DECAL_KINDS, DECAL_LABEL, type DecalKind } from '../../furniture/glbEdit/editSpec'
import { PIPING_DEFAULTS, PIPING_LIMITS, type PipingParams } from '../../furniture/glbEdit/piping'
import { Disclosure } from '../controls/Disclosure'
import { SliderField } from '../controls/SliderField'
import { EmptyState } from '../EmptyState'
import { Icon } from '../toolbar/icons'
import { ArmedCard } from './ArmedCard'
import { useDesigner } from './designerContext'

/**
 * The GLB designer's realism detail layer (Asset Studio Stage 5). Two tools:
 *
 *  - **Details** — arm a decal kind (Button / Stitch line / Seam / Round patch /
 *    Wear spot), then click a part's surface in the preview to project it (the
 *    Stage-3b SWOOD face-click, reused). Placed decals follow their part and
 *    export into the GLB as real geometry. A list below lets each be removed.
 *  - **Piping** — one tap traces the selected box/extrude's top-face perimeter as
 *    a thin welt (a `sweep` part), grouped with the host. Tube diameter + edge
 *    inset tune it.
 *
 * Purely presentational — the designer context owns the armed state, the
 * placement seam and the spec ops.
 */
export function DetailsPanel() {
  const {
    armedDecalKind,
    decalArmed,
    decalList,
    armDecal,
    disarmDecal,
    removeDecal,
    canPipeSelected,
    addPipingToSelected,
  } = useDesigner()
  const [piping, setPiping] = useState<PipingParams>(PIPING_DEFAULTS)

  return (
    <Disclosure className="sec" summary="Details" defaultOpen={decalArmed || decalList.length > 0}>
      <div
        className="label"
        style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', margin: '0 0 var(--s-1)' }}
      >
        Add a detail — then click a shape's surface
      </div>
      <div className="action-grid two">
        {DECAL_KINDS.map((kind: DecalKind) => (
          <button
            key={kind}
            type="button"
            className={`act${armedDecalKind === kind ? ' on' : ''}`}
            aria-pressed={armedDecalKind === kind}
            aria-label={`${armedDecalKind === kind ? 'Disarm' : 'Place'} ${DECAL_LABEL[kind]}`}
            title={
              armedDecalKind === kind
                ? `${DECAL_LABEL[kind]} armed — click a surface to place, or tap again to cancel`
                : `Arm ${DECAL_LABEL[kind]}, then click a shape's surface`
            }
            onClick={() => (armedDecalKind === kind ? disarmDecal() : armDecal(kind))}
          >
            {DECAL_LABEL[kind]}
          </button>
        ))}
      </div>

      {decalArmed && armedDecalKind ? (
        <ArmedCard
          title={`${DECAL_LABEL[armedDecalKind]} armed`}
          closeLabel="Cancel detail"
          closeTitle="Cancel (Esc)"
          marginTop="var(--s-2)"
          hint="Click a shape's surface in the preview to project it. It follows the shape and exports into the GLB."
          onClose={disarmDecal}
        />
      ) : null}

      {/* Placed decals — a compact removable list. */}
      {decalList.length > 0 ? (
        <div style={{ marginTop: 'var(--s-2)' }}>
          <div
            className="label"
            style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', margin: '0 0 var(--s-1)' }}
          >
            Placed details ({decalList.length})
          </div>
          {decalList.map((d) => (
            <div
              key={d.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '2px 0',
              }}
            >
              <span style={{ fontSize: 'var(--t-sm)' }}>{DECAL_LABEL[d.kind]}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${DECAL_LABEL[d.kind]}`}
                title="Remove detail"
                onClick={() => removeDecal(d.id)}
              >
                <Icon.Close width={13} height={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Piping preset — one tap on a selected box/extrude. */}
      <div
        className="label"
        style={{
          fontSize: 'var(--t-2xs)',
          color: 'var(--text-3)',
          margin: 'var(--s-3) 0 var(--s-1)',
        }}
      >
        Piping
      </div>
      {canPipeSelected ? (
        <>
          <SliderField
            label="Tube ⌀ (m)"
            value={piping.tubeDiameter}
            min={PIPING_LIMITS.tubeDiameter.min}
            max={PIPING_LIMITS.tubeDiameter.max}
            step={PIPING_LIMITS.tubeDiameter.step}
            format={(v) => v.toFixed(3)}
            onChange={(v) => setPiping((p) => ({ ...p, tubeDiameter: v }))}
          />
          <SliderField
            label="Edge inset (m)"
            value={piping.edgeInset}
            min={PIPING_LIMITS.edgeInset.min}
            max={PIPING_LIMITS.edgeInset.max}
            step={PIPING_LIMITS.edgeInset.step}
            format={(v) => v.toFixed(3)}
            onChange={(v) => setPiping((p) => ({ ...p, edgeInset: v }))}
          />
          <button
            type="button"
            className="btn btn-soft btn-block"
            style={{ marginTop: 'var(--s-2)' }}
            aria-label="Add piping to selected shape"
            onClick={() => addPipingToSelected(piping)}
          >
            <Icon.Cube width={14} height={14} />
            Add piping
          </button>
        </>
      ) : (
        <EmptyState
          icon={Icon.Cube}
          title="Select a box or extrude"
          description="Piping traces a rectangular part's top-face edge as a soft welt."
        />
      )}
    </Disclosure>
  )
}
