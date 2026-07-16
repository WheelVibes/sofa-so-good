import type { GroupAssignment } from '../../furniture/configurator/designerExport'
import type { PartGroup } from '../../furniture/glbEdit/editSpec'
import { Disclosure } from '../controls/Disclosure'

/**
 * GLB designer — "Make configurable" authoring panel (Asset Studio Stage 3d).
 *
 * Exposes the design's top-level `PartGroup`s so the user can mark one or more as
 * **variant slots**: type a Slot name on a group to expose it, and give two groups
 * the SAME slot name to make them alternative options of that slot (the first
 * becomes the default "Standard"). Groups left blank bake into the fixed base
 * along with all ungrouped parts. Each exposed group carries an option label +
 * price (default 0). Purely presentational — the dialog owns the assignment state
 * and the async export/save.
 */
export function MakeConfigurablePanel({
  groups,
  assignments,
  slotCount,
  busy,
  canSave,
  onSetAssignment,
  onSave,
}: {
  groups: PartGroup[]
  assignments: Record<string, GroupAssignment>
  /** Distinct non-empty slot keys currently assigned (drives the save gate + hint). */
  slotCount: number
  busy: boolean
  canSave: boolean
  onSetAssignment: (groupId: string, patch: Partial<GroupAssignment>) => void
  onSave: () => void
}) {
  return (
    // Collapsed by default (progressive disclosure) — force open once at least
    // one slot is assigned so the save affordance stays visible.
    <Disclosure className="sec" summary="Make configurable" defaultOpen={slotCount > 0}>
      <div
        style={{
          fontSize: 'var(--t-2xs)',
          color: 'var(--text-3)',
          marginBottom: 'var(--s-2)',
          lineHeight: 'var(--lh-body)',
        }}
      >
        Name a Slot on a group to offer it as a swappable option. Give two groups the same slot name
        to make them alternatives (duplicate a group and edit the copy first). Blank groups + loose
        shapes become the fixed base.
      </div>
      {groups.length === 0 ? (
        <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
          Group some shapes first — each group can become a variant slot.
        </div>
      ) : (
        groups.map((g) => {
          const a = assignments[g.id] ?? { slot: null, label: g.name, price: 0 }
          const exposed = !!a.slot
          return (
            <div key={g.id} style={{ marginBottom: 'var(--s-2)' }}>
              <div
                className="label"
                style={{
                  fontSize: 'var(--t-2xs)',
                  color: 'var(--text-3)',
                  marginBottom: 'var(--s-1)',
                }}
              >
                {g.name}
              </div>
              <div style={{ display: 'flex', gap: 'var(--s-1)' }}>
                <input
                  className="input"
                  value={a.slot ?? ''}
                  aria-label={`Slot name for ${g.name}`}
                  placeholder="Slot (blank = base)"
                  onChange={(e) => onSetAssignment(g.id, { slot: e.target.value.trim() || null })}
                  style={{ flex: 1 }}
                />
                {exposed ? (
                  <input
                    className="input"
                    value={a.label}
                    aria-label={`Option label for ${g.name}`}
                    placeholder="Option label"
                    onChange={(e) => onSetAssignment(g.id, { label: e.target.value })}
                    style={{ flex: 1 }}
                  />
                ) : null}
                {exposed ? (
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step={10}
                    value={a.price}
                    aria-label={`Option price for ${g.name}`}
                    title="Price for this option (S$)"
                    onChange={(e) =>
                      onSetAssignment(g.id, { price: Math.max(0, Number(e.target.value) || 0) })
                    }
                    style={{ width: 72 }}
                  />
                ) : null}
              </div>
            </div>
          )
        })
      )}
      <button
        type="button"
        className="btn btn-soft btn-block"
        disabled={!canSave || busy}
        onClick={onSave}
        style={{ marginTop: 'var(--s-1)' }}
      >
        {busy
          ? 'Building…'
          : slotCount > 0
            ? `Save as configurable product (${slotCount} slot${slotCount === 1 ? '' : 's'})`
            : 'Save as configurable product'}
      </button>
    </Disclosure>
  )
}
