import { memo, useMemo, useState } from 'react'
import {
  combineGroups,
  partGroups,
  partLabel,
  type ShapePart,
} from '../../furniture/glbEdit/editSpec'
import { EmptyState } from '../EmptyState'
import { Icon } from '../toolbar/icons'
import { useDesigner } from './designerContext'

/** Inline rename input (shape + group) that owns its OWN draft state so
 *  keystrokes re-render only this field, never the whole layer tree (finding 9).
 *  Seeds from `initial` on mount; Enter/blur commits, Escape cancels. */
function GroupRenameInput({
  initial,
  ariaLabel,
  onCommit,
  onCancel,
}: {
  initial: string
  ariaLabel: string
  onCommit: (name: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  return (
    <input
      className="input"
      style={{ flex: 1, minWidth: 0, height: 24, fontSize: 'var(--t-sm)' }}
      // biome-ignore lint/a11y/noAutofocus: inline rename affordance
      autoFocus
      value={draft}
      aria-label={ariaLabel}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(draft)
        else if (e.key === 'Escape') onCancel()
      }}
    />
  )
}

/** One shape (layer) row — swatch, name (`kind N`), Hole / Combine tags, and
 *  duplicate / remove actions. Shared by ungrouped rows and the indented member
 *  rows under a transform group. `memo`ised so an unchanged row doesn't re-render
 *  when the tree does (finding 9). */
const PartRow = memo(function PartRow({
  part,
  number,
  selected,
  selectMode,
  combineTag,
  editing,
  onSelect,
  onStartRename,
  onRename,
  onEndRename,
  onDuplicate,
  onRemove,
}: {
  part: ShapePart
  number: number
  selected: boolean
  selectMode: boolean
  /** 1-based combine-group index (⛓ N) when the part is in a combine group. */
  combineTag: number | null
  editing: boolean
  onSelect: (id: string, additive: boolean) => void
  onStartRename: (id: string) => void
  onRename: (id: string, name: string) => void
  onEndRename: () => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
}) {
  const label = partLabel(part, number)
  const isHole = part.role === 'hole'
  // A hole only actually cuts inside a Subtract combine. A groupless hole
  // renders/exports as a plain solid — flag it as inert so the tag isn't misleading.
  const inertHole = isHole && combineTag === null
  return (
    <div
      className={`lyr-row${selected ? ' sel' : ''}`}
      onClick={(e) => onSelect(part.id, e.shiftKey || e.ctrlKey || e.metaKey || selectMode)}
    >
      {selectMode ? (
        <input
          type="checkbox"
          checked={selected}
          aria-label={`Select ${label}`}
          onChange={() => onSelect(part.id, true)}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="swatch"
          style={{
            background: part.color,
            width: 16,
            height: 16,
            borderRadius: 3,
            // Dim only a hole that's actually cutting (grouped); a free hole
            // renders as a solid, so keep it at full opacity.
            opacity: isHole && !inertHole ? 0.4 : 1,
          }}
        />
      )}
      {editing ? (
        <GroupRenameInput
          initial={part.name ?? ''}
          ariaLabel={`Rename ${label}`}
          onCommit={(name) => onRename(part.id, name)}
          onCancel={onEndRename}
        />
      ) : (
        <span
          className="lyr-nm"
          title={`${label} — double-click to rename`}
          onDoubleClick={(e) => {
            e.stopPropagation()
            onStartRename(part.id)
          }}
        >
          {label}
        </span>
      )}
      {isHole ? (
        <span
          className={`badge ${inertHole ? 'warn' : 'neutral'}`}
          style={{ fontSize: 'var(--t-2xs)' }}
          title={
            inertHole
              ? 'Hole — inert until added to a Subtract combine (renders as a solid)'
              : 'Hole — carved out inside a Subtract combine'
          }
        >
          {inertHole ? 'Hole (inert)' : 'Hole'}
        </span>
      ) : null}
      {combineTag !== null ? (
        <span
          className="badge"
          style={{ fontSize: 'var(--t-2xs)' }}
          title={`Part of Combine ${combineTag}`}
        >
          ⛓ {combineTag}
        </span>
      ) : null}
      <button
        type="button"
        className="icon-btn"
        aria-label={`Rename ${label}`}
        onClick={(e) => {
          e.stopPropagation()
          onStartRename(part.id)
        }}
      >
        <Icon.Edit width={13} height={13} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Duplicate ${label}`}
        onClick={(e) => {
          e.stopPropagation()
          onDuplicate(part.id)
        }}
      >
        <Icon.Copy width={13} height={13} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Remove ${label}`}
        onClick={(e) => {
          e.stopPropagation()
          onRemove(part.id)
        }}
      >
        <Icon.Close width={13} height={13} />
      </button>
    </div>
  )
})

/**
 * The designer's part (layer) list, a **shallow tree** (Stage 3a): named
 * transform-group rows (collapse/expand, inline rename, Ungroup / Duplicate /
 * Mirror) with their member shapes indented beneath, then the ungrouped shapes
 * flat. Rows are MULTI-selectable for CSG combine (Stage 1b) — a plain click
 * selects one, shift/ctrl/⌘-click (or Select mode) toggles it — and the
 * multi-select toolbar carries the **Group** action. A **transform group**
 * ("Group") is distinct from a **CombineGroup** ("Combine", ⛓) — a part can be
 * in one of each. Purely presentational — the dialog owns the spec + selection.
 */
export function LayersPanel() {
  const {
    spec,
    selIds,
    selGroupId,
    selectMode,
    eligibleGroupCount,
    onSelectPart: onSelect,
    selectGroup: onSelectGroup,
    toggleSelectMode: onToggleSelectMode,
    groupSelected: onGroup,
    ungroupTransform: onUngroup,
    renameGroup: onRenameGroup,
    duplicateGroup: onDuplicateGroup,
    mirrorGroup: onMirrorGroup,
    duplicate: onDuplicate,
    remove: onRemove,
    renamePartName: onRenamePart,
  } = useDesigner()
  const parts = spec.parts
  // Collapsed transform-group ids (local view state).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Which transform group is being inline-renamed (the draft text itself lives
  // inside `GroupRenameInput` so keystrokes don't re-render the tree — finding 9).
  const [editingId, setEditingId] = useState<string | null>(null)
  // Which part is being inline-renamed (Stage 4).
  const [editingPartId, setEditingPartId] = useState<string | null>(null)
  // Name filter (Stage 4). Case-insensitive substring over the part label; a
  // group is shown when any of its members matches (matched members only). Blank
  // shows everything.
  const [filter, setFilter] = useState('')
  const query = filter.trim().toLowerCase()

  // Derived lookups, recomputed only when the spec changes (finding 9) — not on
  // every selection/rename-toggle re-render.
  const { combineTagById, numberById, groups, ungrouped } = useMemo(() => {
    const combines = combineGroups(spec)
    const combineIndex = new Map(combines.map((g, i) => [g.id, i + 1]))
    const tagById = new Map<string, number>()
    for (const g of combines) for (const id of g.partIds) tagById.set(id, combineIndex.get(g.id)!)
    // 1-based number per part = its position in the (stable) parts array.
    const nums = new Map(spec.parts.map((p, i) => [p.id, i + 1]))
    const gps = partGroups(spec)
    const groupedIds = new Set<string>()
    for (const g of gps) for (const id of g.partIds) groupedIds.add(id)
    return {
      combineTagById: tagById,
      numberById: nums,
      groups: gps,
      ungrouped: spec.parts.filter((p) => !groupedIds.has(p.id)),
    }
  }, [spec])
  const combineTagFor = (partId: string): number | null => combineTagById.get(partId) ?? null

  // A part matches the filter when its label contains the query (blank → all).
  const matchPart = (p: ShapePart) =>
    !query ||
    partLabel(p, numberById.get(p.id) ?? 0)
      .toLowerCase()
      .includes(query)
  const filteredUngrouped = query ? ungrouped.filter(matchPart) : ungrouped
  const filteredGroups = query
    ? groups
        .map((g) => ({
          group: g,
          ids: g.partIds.filter((id) =>
            matchPart(spec.parts.find((p) => p.id === id) ?? ({} as ShapePart)),
          ),
        }))
        .filter((g) => g.ids.length > 0)
    : groups.map((g) => ({ group: g, ids: g.partIds }))
  const noMatches =
    query.length > 0 && filteredUngrouped.length === 0 && filteredGroups.length === 0

  if (parts.length === 0) return null

  const renamePartRow = (id: string, name: string) => {
    onRenamePart(id, name)
    setEditingPartId(null)
  }

  return (
    <div style={{ marginTop: 'var(--s-2)' }}>
      {parts.length > 1 ? (
        <div className="sec-h" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Shapes</span>
          {eligibleGroupCount >= 2 ? (
            <button
              type="button"
              className="chip"
              style={{ marginLeft: 'auto', fontSize: 'var(--t-2xs)' }}
              aria-label="Group selected shapes"
              title="Group the selected shapes so they move together"
              onClick={onGroup}
            >
              <Icon.Group width={12} height={12} /> Group {eligibleGroupCount}
            </button>
          ) : null}
          <button
            type="button"
            className={`chip${selectMode ? ' on' : ''}`}
            aria-pressed={selectMode}
            style={{
              marginLeft: eligibleGroupCount >= 2 ? undefined : 'auto',
              fontSize: 'var(--t-2xs)',
            }}
            title="Toggle multi-select (tap rows to add to the selection)"
            onClick={onToggleSelectMode}
          >
            {selectMode ? 'Selecting…' : 'Select'}
          </button>
        </div>
      ) : null}

      {/* Name filter (Stage 4) — shown once there's more than one shape. */}
      {parts.length > 1 ? (
        <div style={{ marginBottom: 6, position: 'relative' }}>
          <input
            className="input"
            type="text"
            value={filter}
            placeholder="Filter shapes…"
            aria-label="Filter shapes by name"
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: '100%', height: 28, paddingLeft: 26 }}
          />
          <Icon.Search
            width={13}
            height={13}
            style={{ position: 'absolute', left: 8, top: 8, color: 'var(--text-3)' }}
          />
        </div>
      ) : null}

      {noMatches ? (
        <EmptyState
          icon={Icon.Search}
          title="No shapes match"
          description={`Nothing named like "${filter.trim()}".`}
        />
      ) : null}

      <div style={{ display: 'grid', gap: 4 }}>
        {/* Transform groups first — header row + indented members. */}
        {filteredGroups.map(({ group: g, ids: memberIds }) => {
          // Force-expand under an active filter so matched members are visible.
          const isCollapsed = !query && collapsed.has(g.id)
          const groupSel = selGroupId === g.id
          return (
            <div key={g.id}>
              <div
                className={`lyr-row${groupSel ? ' sel' : ''}`}
                onClick={() => onSelectGroup(g.id)}
              >
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={isCollapsed ? `Expand ${g.name}` : `Collapse ${g.name}`}
                  aria-expanded={!isCollapsed}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCollapsed((s) => {
                      const next = new Set(s)
                      if (next.has(g.id)) next.delete(g.id)
                      else next.add(g.id)
                      return next
                    })
                  }}
                >
                  {isCollapsed ? (
                    <Icon.ChevronRight width={13} height={13} />
                  ) : (
                    <Icon.Chevron width={13} height={13} />
                  )}
                </button>
                <Icon.Group width={14} height={14} />
                {editingId === g.id ? (
                  <GroupRenameInput
                    initial={g.name}
                    ariaLabel={`Rename ${g.name}`}
                    onCommit={(name) => {
                      onRenameGroup(g.id, name)
                      setEditingId(null)
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <span
                    className="lyr-nm"
                    style={{ fontWeight: 600 }}
                    title={`${g.name} — double-click to rename`}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setEditingId(g.id)
                    }}
                  >
                    {g.name}
                  </span>
                )}
                <span
                  className="badge neutral"
                  style={{ fontSize: 'var(--t-2xs)' }}
                  title={`${g.partIds.length} shapes in this group`}
                >
                  {g.partIds.length}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Rename ${g.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingId(g.id)
                  }}
                >
                  <Icon.Edit width={13} height={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Mirror ${g.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onMirrorGroup(g.id)
                  }}
                >
                  <Icon.FlipH width={13} height={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Duplicate ${g.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDuplicateGroup(g.id)
                  }}
                >
                  <Icon.Copy width={13} height={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Ungroup ${g.name}`}
                  title="Ungroup (shapes keep their positions)"
                  onClick={(e) => {
                    e.stopPropagation()
                    onUngroup(g.id)
                  }}
                >
                  <Icon.Close width={13} height={13} />
                </button>
              </div>
              {isCollapsed ? null : (
                <div
                  style={{
                    marginLeft: 10,
                    paddingLeft: 8,
                    borderLeft: '1px solid var(--border)',
                    display: 'grid',
                    gap: 4,
                  }}
                >
                  {memberIds.map((id) => {
                    const p = parts.find((pp) => pp.id === id)
                    return p ? (
                      <PartRow
                        key={id}
                        part={p}
                        number={numberById.get(id) ?? 0}
                        selected={selIds.includes(id)}
                        selectMode={selectMode}
                        combineTag={combineTagFor(id)}
                        editing={editingPartId === id}
                        onSelect={onSelect}
                        onStartRename={setEditingPartId}
                        onRename={renamePartRow}
                        onEndRename={() => setEditingPartId(null)}
                        onDuplicate={onDuplicate}
                        onRemove={onRemove}
                      />
                    ) : null
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Ungrouped shapes. */}
        {filteredUngrouped.map((p) => (
          <PartRow
            key={p.id}
            part={p}
            number={numberById.get(p.id) ?? 0}
            selected={selIds.includes(p.id)}
            selectMode={selectMode}
            combineTag={combineTagFor(p.id)}
            editing={editingPartId === p.id}
            onSelect={onSelect}
            onStartRename={setEditingPartId}
            onRename={renamePartRow}
            onEndRename={() => setEditingPartId(null)}
            onDuplicate={onDuplicate}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  )
}
