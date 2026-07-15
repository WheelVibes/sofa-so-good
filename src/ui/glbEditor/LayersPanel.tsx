import { type AssetEditSpec, combineGroups, groupForPart } from '../../furniture/glbEdit/editSpec'
import { Icon } from '../toolbar/icons'

/**
 * The designer's part (layer) list: one row per shape with a colour swatch,
 * a name (`kind N`), a Hole tag / combine-group tag, and duplicate / remove
 * actions. CSG v2 (Stage 1b): rows are MULTI-selectable — a plain click selects
 * one, shift/ctrl/⌘-click (or any click while "Select" mode is on) toggles the
 * part in the selection, so 2+ parts can be picked for a Union/Subtract/
 * Intersect. Purely presentational — the dialog owns the spec + selection.
 */
export function LayersPanel({
  spec,
  selIds,
  selectMode,
  onSelect,
  onToggleSelectMode,
  onDuplicate,
  onRemove,
}: {
  spec: AssetEditSpec
  selIds: string[]
  selectMode: boolean
  /** `additive` = shift/ctrl/⌘-click or select-mode → toggle in the selection. */
  onSelect: (id: string, additive: boolean) => void
  onToggleSelectMode: () => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
}) {
  const parts = spec.parts
  if (parts.length === 0) return null
  const groups = combineGroups(spec)
  // Stable 1-based group index for the "Combine N" tag.
  const groupIndex = new Map(groups.map((g, i) => [g.id, i + 1]))
  return (
    <div style={{ marginTop: 'var(--s-2)' }}>
      {parts.length > 1 ? (
        <div className="sec-h" style={{ display: 'flex', alignItems: 'center' }}>
          <span>Shapes</span>
          <button
            type="button"
            className={`chip${selectMode ? ' on' : ''}`}
            aria-pressed={selectMode}
            style={{ marginLeft: 'auto', fontSize: 'var(--t-2xs)' }}
            title="Toggle multi-select (tap rows to add to the selection)"
            onClick={onToggleSelectMode}
          >
            {selectMode ? 'Selecting…' : 'Select'}
          </button>
        </div>
      ) : null}
      <div style={{ display: 'grid', gap: 4 }}>
        {parts.map((p, i) => {
          const selected = selIds.includes(p.id)
          const grp = groupForPart(spec, p.id)
          const isHole = p.role === 'hole'
          return (
            <div
              key={p.id}
              className={`lyr-row${selected ? ' sel' : ''}`}
              onClick={(e) => onSelect(p.id, e.shiftKey || e.ctrlKey || e.metaKey || selectMode)}
            >
              {selectMode ? (
                <input
                  type="checkbox"
                  checked={selected}
                  aria-label={`Select ${p.kind} ${i + 1}`}
                  onChange={() => onSelect(p.id, true)}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="swatch"
                  style={{
                    background: p.color,
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    opacity: isHole ? 0.4 : 1,
                  }}
                />
              )}
              <span className="lyr-nm" title={`${p.kind} ${i + 1}`}>
                {p.kind} {i + 1}
              </span>
              {isHole ? (
                <span
                  className="badge neutral"
                  style={{ fontSize: 'var(--t-2xs)' }}
                  title="Hole — carved out inside a Subtract combine"
                >
                  Hole
                </span>
              ) : null}
              {grp ? (
                <span
                  className="badge"
                  style={{ fontSize: 'var(--t-2xs)' }}
                  title={`Part of ${grp.name}`}
                >
                  ⛓ {groupIndex.get(grp.id)}
                </span>
              ) : null}
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
          )
        })}
      </div>
    </div>
  )
}
