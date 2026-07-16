import { FURNITURE_CATEGORIES, type FurnitureCategory } from '../../furniture/types'
import { Select } from '../controls/Select'

export type PlacementKind = 'floor' | 'wall' | 'floorCovering'

/**
 * The designer's "Save to catalog" panel: asset name / category / placement, the
 * optional "Update original" toggle (when editing an existing source), and the
 * save button. Purely presentational — the dialog owns the spec + save flow.
 */
export function SavePanel({
  name,
  category,
  placement,
  hasSource,
  overwrite,
  busy,
  canSave,
  canSplitGroups,
  splitGroups,
  groupCount,
  onName,
  onCategory,
  onPlacement,
  onToggleOverwrite,
  onToggleSplitGroups,
  onSave,
}: {
  name: string
  category: FurnitureCategory
  placement: PlacementKind
  hasSource: boolean
  overwrite: boolean
  busy: boolean
  canSave: boolean
  /** Whether the design has ≥1 top-level group, so it can be split into a "set"
   *  (Stage 3d). When false the checkbox is hidden. Gated by the `assetSets` flag
   *  upstream (absent → false). */
  canSplitGroups?: boolean
  /** When true, each top-level group ALSO saves as its own catalog asset. */
  splitGroups?: boolean
  /** Number of top-level groups (shown in the checkbox hint). */
  groupCount?: number
  onName: (name: string) => void
  onCategory: (c: FurnitureCategory) => void
  onPlacement: (p: PlacementKind) => void
  onToggleOverwrite: () => void
  onToggleSplitGroups?: () => void
  onSave: () => void
}) {
  return (
    <div className="sec">
      <div className="sec-h">
        <span>Save to catalog</span>
      </div>
      <input
        className="input"
        value={name}
        aria-label="Asset name"
        onChange={(e) => onName(e.target.value)}
        placeholder="Asset name"
        style={{ width: '100%', marginBottom: 'var(--s-2)' }}
      />
      <Select
        className="input"
        ariaLabel="Asset category"
        value={category}
        onChange={(v) => onCategory(v as FurnitureCategory)}
        style={{ width: '100%', marginBottom: 'var(--s-2)' }}
        options={FURNITURE_CATEGORIES.map((c) => ({ value: c, label: c }))}
      />
      <Select
        className="input"
        ariaLabel="Placement type"
        value={placement}
        onChange={(v) => onPlacement(v as PlacementKind)}
        style={{ width: '100%', marginBottom: 'var(--s-2)' }}
        options={[
          { value: 'floor', label: 'Stands on the floor' },
          { value: 'wall', label: 'Mounts on a wall' },
          { value: 'floorCovering', label: 'Floor covering (rug — never blocks)' },
        ]}
      />
      {hasSource ? (
        <label
          className="row"
          style={{ cursor: 'pointer', marginBottom: 'var(--s-2)' }}
          title="Replace the source asset in place — every piece already placed from it updates to this edit."
        >
          <div className="rk" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
            <div>Update original</div>
            <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', fontWeight: 500 }}>
              Overwrite the source asset (keeps placed copies)
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={overwrite}
            aria-label="Update original"
            onClick={onToggleOverwrite}
            className={`switch${overwrite ? ' on' : ''}`}
          />
        </label>
      ) : null}
      {canSplitGroups && onToggleSplitGroups ? (
        <label
          className="row"
          style={{ cursor: 'pointer', marginBottom: 'var(--s-2)' }}
          title="Also save each top-level group as its own catalog asset (a set). Placed pieces are the individual assets."
        >
          <div className="rk" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
            <div>Save groups as separate assets</div>
            <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', fontWeight: 500 }}>
              {groupCount
                ? `Adds ${groupCount} single-piece asset${groupCount === 1 ? '' : 's'} + the whole`
                : 'Each group also saves on its own'}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!splitGroups}
            aria-label="Save groups as separate assets"
            onClick={onToggleSplitGroups}
            className={`switch${splitGroups ? ' on' : ''}`}
          />
        </label>
      ) : null}
      <button
        type="button"
        className="btn btn-accent btn-block"
        disabled={!canSave || busy}
        onClick={onSave}
      >
        {busy ? 'Saving…' : overwrite && hasSource ? 'Update original' : 'Save asset'}
      </button>
    </div>
  )
}
