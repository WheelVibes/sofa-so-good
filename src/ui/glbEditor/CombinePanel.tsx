import { CSG_OPS, type CsgOp } from '../../furniture/glbEdit/csgCombine'
import type { CombineGroup } from '../../furniture/glbEdit/editSpec'

/**
 * CSG v2 combine panel (Stage 1b) — non-destructive booleans over a MULTI-select
 * of parts (TinkerCAD solid/hole model). Multi-select 2+ parts in the layers
 * list, then Union / Subtract / Intersect records a `CombineGroup`: the operands
 * STAY editable and the result is re-evaluated live whenever they move. Existing
 * groups list below with a **Bake to mesh** (freeze to one editable-position
 * mesh) and **Ungroup** (dissolve, operands untouched) action each.
 *
 * Subtract rule (documented in-panel): the parts marked **Hole** are carved out
 * of the solids; with no part marked as a hole, the FIRST selected part is the
 * base and the rest are subtracted from it. Mark a part as a Hole in its edit
 * panel. Purely presentational — the dialog owns the (async) evaluation.
 */
export function CombinePanel({
  eligibleCount,
  combining,
  groups,
  results,
  errors,
  computing,
  onCombine,
  onBake,
  onUngroup,
}: {
  /** Count of currently-selected FREE parts (≥2 enables the actions). */
  eligibleCount: number
  combining: boolean
  groups: CombineGroup[]
  /** groupId → evaluated result present (Bake enabled only when ready). */
  results: Set<string>
  errors: Set<string>
  computing: boolean
  onCombine: (op: CsgOp) => void
  onBake: (groupId: string) => void
  onUngroup: (groupId: string) => void
}) {
  const canCombine = eligibleCount >= 2 && !combining
  return (
    <div className="sec">
      <div className="sec-h">
        <span>Combine (boolean)</span>
        {computing ? (
          <span style={{ marginLeft: 'auto', fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Computing…
          </span>
        ) : null}
      </div>
      <div className="action-grid">
        {CSG_OPS.map(({ op, label }) => (
          <button
            key={op}
            type="button"
            className="act"
            disabled={!canCombine}
            aria-label={`${label} selected parts`}
            onClick={() => onCombine(op)}
          >
            {combining ? '…' : label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 4 }}>
        {eligibleCount >= 2
          ? `Combine ${eligibleCount} selected parts. `
          : 'Select 2+ shapes (Select mode, or shift/⌘-click rows) to combine. '}
        Non-destructive — the shapes stay editable and the result updates as you move them.
        <strong> Subtract</strong>: parts marked <em>Hole</em> are carved out of the solids; with no
        holes, the first selected part is the base. Avoid exactly aligned (coplanar) faces — overlap
        or offset shapes slightly to prevent flicker.
      </div>

      {groups.length > 0 ? (
        <div style={{ marginTop: 'var(--s-3)', display: 'grid', gap: 4 }}>
          <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Combined groups
          </div>
          {groups.map((g) => {
            const ready = results.has(g.id)
            const failed = errors.has(g.id)
            return (
              <div
                key={g.id}
                className="lyr-row"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span className="lyr-nm" title={g.name}>
                  {g.name} · {g.op}
                </span>
                {failed ? (
                  <span
                    className="badge err"
                    style={{ fontSize: 'var(--t-2xs)' }}
                    title="Result is empty — the shapes may not overlap"
                  >
                    Empty
                  </span>
                ) : null}
                <button
                  type="button"
                  className="chip"
                  style={{ marginLeft: 'auto', fontSize: 'var(--t-2xs)' }}
                  aria-label={`Bake ${g.name} to a mesh`}
                  disabled={!ready}
                  title="Freeze this combine into one editable mesh part"
                  onClick={() => onBake(g.id)}
                >
                  Bake
                </button>
                <button
                  type="button"
                  className="chip"
                  style={{ fontSize: 'var(--t-2xs)' }}
                  aria-label={`Ungroup ${g.name}`}
                  title="Dissolve the combine (shapes stay as they were)"
                  onClick={() => onUngroup(g.id)}
                >
                  Ungroup
                </button>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
