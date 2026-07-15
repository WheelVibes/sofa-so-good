import type { ShapePart } from '../../furniture/glbEdit/editSpec'
import { Icon } from '../toolbar/icons'

/**
 * The designer's part (layer) list: one row per shape with a colour swatch,
 * a name (`kind N`), and duplicate / remove actions; the row selects the part.
 * Purely presentational — the dialog owns the spec + selection.
 */
export function LayersPanel({
  parts,
  selId,
  onSelect,
  onDuplicate,
  onRemove,
}: {
  parts: ShapePart[]
  selId: string | null
  onSelect: (id: string) => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
}) {
  if (parts.length === 0) return null
  return (
    <div style={{ marginTop: 'var(--s-2)', display: 'grid', gap: 4 }}>
      {parts.map((p, i) => (
        <div
          key={p.id}
          className={`lyr-row${selId === p.id ? ' sel' : ''}`}
          onClick={() => onSelect(p.id)}
        >
          <span
            className="swatch"
            style={{ background: p.color, width: 16, height: 16, borderRadius: 3 }}
          />
          <span className="lyr-nm" title={`${p.kind} ${i + 1}`}>
            {p.kind} {i + 1}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Duplicate ${p.kind} ${i + 1}`}
            onClick={(e) => {
              e.stopPropagation()
              onDuplicate(p.id)
            }}
          >
            <Icon.Copy width={13} height={13} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Remove ${p.kind} ${i + 1}`}
            onClick={(e) => {
              e.stopPropagation()
              onRemove(p.id)
            }}
          >
            <Icon.Close width={13} height={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
