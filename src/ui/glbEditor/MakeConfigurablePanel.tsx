import type { GroupAssignment, OptionRule } from '../../furniture/configurator/designerExport'
import { Disclosure } from '../controls/Disclosure'
import { Select, type SelectOption } from '../controls/Select'
import { useDesigner } from './designerContext'

/**
 * GLB designer — "Make configurable" authoring panel (Asset Studio Stage 3d + 7d).
 *
 * Exposes the design's top-level `PartGroup`s so the user can mark one or more as
 * **variant slots**: type a Slot name on a group to expose it, and give two groups
 * the SAME slot name to make them alternative options of that slot (the first
 * becomes the default "Standard"). Groups left blank bake into the fixed base
 * along with all ungrouped parts. Each exposed group carries an option label +
 * price (default 0).
 *
 * Stage 7d adds a compact per-option **Rules** affordance: an author can declare
 * `requires` / `excludes` rules against options of OTHER slots (the configurator's
 * existing constraint vocabulary), so the exported product family encodes real
 * compatibility rules that `clampConfig` enforces at pick time. Purely
 * presentational — the dialog owns the assignment state + the async export/save.
 */
export function MakeConfigurablePanel() {
  const {
    configurableEnabled,
    transformGroups: groups,
    assignments,
    assignedSlotCount: slotCount,
    cfgBusy: busy,
    setAssignment: onSetAssignment,
    exportConfigurable,
  } = useDesigner()
  // Gated by the `assetConfigurableExport` flag AND the design having ≥1 group.
  if (!configurableEnabled || groups.length === 0) return null
  const canSave = slotCount > 0
  const onSave = () => exportConfigurable(true)
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
              {exposed ? (
                <OptionRulesEditor
                  groupId={g.id}
                  groupName={g.name}
                  slot={a.slot as string}
                  rules={a.rules ?? []}
                  groups={groups}
                  assignments={assignments}
                  onSetAssignment={onSetAssignment}
                />
              ) : null}
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

const KIND_OPTIONS: SelectOption[] = [
  { value: 'requires', label: 'requires' },
  { value: 'excludes', label: 'excludes' },
]

/** Per-option cross-slot rule editor (Stage 7d): a "Rules" disclosure holding a
 *  list of `requires`/`excludes` rows (kind Select + cross-slot target Select +
 *  remove) plus an add button. Only options in OTHER slots are offered as targets. */
function OptionRulesEditor({
  groupId,
  groupName,
  slot,
  rules,
  groups,
  assignments,
  onSetAssignment,
}: {
  groupId: string
  groupName: string
  slot: string
  rules: OptionRule[]
  groups: { id: string; name: string }[]
  assignments: Record<string, GroupAssignment>
  onSetAssignment: (groupId: string, patch: Partial<GroupAssignment>) => void
}) {
  // Cross-slot targets: every OTHER exposed group whose slot differs from this
  // option's slot. Labelled "<slot> · <option label>".
  const targets: SelectOption[] = groups
    .filter((t) => {
      if (t.id === groupId) return false
      const ta = assignments[t.id]
      return !!ta?.slot && ta.slot !== slot
    })
    .map((t) => {
      const ta = assignments[t.id] as GroupAssignment
      return { value: t.id, label: `${ta.slot} · ${ta.label || t.name}` }
    })

  const setRules = (next: OptionRule[]) => onSetAssignment(groupId, { rules: next })
  const addRule = () => {
    const first = targets[0]
    if (!first) return
    setRules([...rules, { kind: 'requires', target: first.value }])
  }
  const patchRule = (i: number, patch: Partial<OptionRule>) =>
    setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const removeRule = (i: number) => setRules(rules.filter((_, j) => j !== i))

  return (
    <Disclosure
      className="sec"
      summary={`Rules${rules.length > 0 ? ` (${rules.length})` : ''}`}
      defaultOpen={rules.length > 0}
      style={{ marginTop: 'var(--s-1)', marginLeft: 'var(--s-2)' }}
    >
      {targets.length === 0 ? (
        <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
          Add another slot to set compatibility rules between options.
        </div>
      ) : (
        <>
          {rules.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--s-1)', marginBottom: 'var(--s-1)' }}>
              <Select
                value={r.kind}
                onChange={(v) => patchRule(i, { kind: v as OptionRule['kind'] })}
                options={KIND_OPTIONS}
                ariaLabel={`Rule ${i + 1} kind for ${groupName}`}
                style={{ flex: '0 0 92px' }}
              />
              <Select
                value={targets.some((t) => t.value === r.target) ? r.target : ''}
                onChange={(v) => patchRule(i, { target: v })}
                options={targets}
                placeholder="(removed option)"
                ariaLabel={`Rule ${i + 1} target for ${groupName}`}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-sm btn-soft"
                aria-label={`Remove rule ${i + 1} for ${groupName}`}
                title="Remove rule"
                onClick={() => removeRule(i)}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-sm btn-soft" onClick={addRule}>
            + Add rule
          </button>
        </>
      )}
    </Disclosure>
  )
}
