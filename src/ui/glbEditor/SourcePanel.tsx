import { useState } from 'react'
import { ColorPicker } from '../controls/ColorPicker'
import { Select, type SelectOption } from '../controls/Select'
import { SliderField } from '../controls/SliderField'
import { Icon } from '../toolbar/icons'
import { useDesigner } from './designerContext'

/**
 * The designer's "Start from" source picker + per-mesh recolour list. Picks an
 * uploaded/bundled user GLB to build around (uniformly scaled) or "Blank" to
 * compose from shapes only. When the picked source was itself built in the
 * designer (carries a restorable `assetSpec`), it offers restoring the full
 * editable part list instead of editing the frozen source mesh (Asset Studio S0).
 * Purely presentational — the dialog owns the spec.
 */
export function SourcePanel() {
  const {
    spec,
    userGlbs,
    meshNames,
    canRestore,
    decomposableDefs,
    decomposing,
    makePartsEditable,
    decomposePreview,
    selectedDecomposeIds,
    loadDecomposePreview,
    clearDecomposePreview,
    toggleDecomposeEntry,
    insertSelectedParts,
    pickSource: onPickSource,
    setSourceScale: onScaleChange,
    restoreSpec: onRestoreSpec,
    setMeshColor: onSetMeshColor,
    toggleMeshHidden: onToggleMeshHidden,
    resetMesh: onResetMesh,
  } = useDesigner()
  // The def picked for "Make parts editable" (Stage 9a) — local, opt-in; distinct
  // from the frozen-source `sourceAssetId` above.
  const [editableDefId, setEditableDefId] = useState('')
  // Grouped, all-catalog options (built-ins / my uploads / shared / packs) with
  // disabled section headers — Select has no native optgroups (`src/ui/CLAUDE.md`).
  const editableOptions: SelectOption[] = []
  const pushGroup = (label: string, defs: { id: string; name: string }[]) => {
    if (defs.length === 0) return
    editableOptions.push({ value: `__h:${label}`, label: `— ${label} —`, disabled: true })
    for (const d of defs) editableOptions.push({ value: d.id, label: d.name })
  }
  editableOptions.push({ value: '', label: 'Pick an item…' })
  pushGroup('Built-ins', decomposableDefs.builtins)
  pushGroup('My uploads', decomposableDefs.user)
  pushGroup('Shared library', decomposableDefs.shared)
  pushGroup('Packs', decomposableDefs.packs)
  return (
    <>
      <div className="sec">
        <div className="sec-h">
          <span>Start from</span>
        </div>
        <Select
          className="input"
          ariaLabel="Source model"
          value={spec.sourceAssetId ?? ''}
          onChange={onPickSource}
          style={{ width: '100%' }}
          options={[
            { value: '', label: 'Blank (compose from shapes)' },
            ...userGlbs.map((d) => ({ value: d.id, label: d.name })),
          ]}
        />
        {spec.sourceAssetId ? (
          <div style={{ marginTop: 'var(--s-2)' }}>
            {/* The label carries the live value, so suppress the duplicate readout. */}
            <SliderField
              label={`Scale ×${spec.sourceScale.toFixed(2)}`}
              ariaLabel="Source scale"
              value={spec.sourceScale}
              min={0.1}
              max={3}
              step={0.05}
              hideReadout
              onChange={onScaleChange}
            />
          </div>
        ) : null}
        {/* This asset was built in the designer — offer restoring its editable
            part list instead of editing the baked source mesh (Asset Studio S0). */}
        {canRestore ? (
          <div style={{ marginTop: 'var(--s-2)' }}>
            <button
              type="button"
              className="btn btn-soft btn-block"
              onClick={onRestoreSpec}
              title="Reopen this asset's original shapes so you can edit them again"
            >
              <Icon.Cube width={14} height={14} />
              Restore editable parts
            </button>
            <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 4 }}>
              This asset was made in the designer — restore its shapes to edit them, instead of
              treating it as a fixed model.
            </div>
          </div>
        ) : null}
      </div>

      {/* Make parts editable (Stage 9a) — decompose ANY catalog item into editable
          parts/groups. Opt-in + heavier than the frozen-source path above. */}
      <div className="sec">
        <div className="sec-h">
          <span>Make parts editable</span>
        </div>
        <Select
          className="input"
          ariaLabel="Item to make editable"
          value={editableDefId}
          onChange={setEditableDefId}
          style={{ width: '100%' }}
          options={editableOptions}
        />
        <div style={{ marginTop: 'var(--s-2)' }}>
          <button
            type="button"
            className="btn btn-soft btn-block"
            disabled={!editableDefId || decomposing}
            onClick={() => makePartsEditable(editableDefId)}
            title="Break this item into editable shapes you can move, recolour and combine"
          >
            <Icon.Cube width={14} height={14} />
            {decomposing ? 'Making editable…' : 'Make parts editable'}
          </button>
          <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 4 }}>
            Turn any furniture — a built-in, your upload, a shared or pack item — into editable
            parts. Replaces the current design.
          </div>
        </div>
        {/* Selective extraction (Stage 9b) — pick just some meshes/groups and add
            them alongside the current design instead of replacing it. */}
        <div style={{ marginTop: 'var(--s-2)' }}>
          <button
            type="button"
            className="btn btn-soft btn-block"
            disabled={!editableDefId || decomposing}
            onClick={() => loadDecomposePreview(editableDefId)}
            title="Choose which parts of this item to add to your current design"
          >
            <Icon.Layers width={14} height={14} />
            {decomposing ? 'Reading parts…' : 'Choose parts to insert…'}
          </button>
          <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)', marginTop: 4 }}>
            Grab just the pieces you want (e.g. the legs) and add them alongside your current
            design.
          </div>
        </div>
      </div>

      {/* The part picker (Stage 9b): checkbox each top-level group / loose part;
          "Insert selected" adds only those, offset on X (does not replace). */}
      {decomposePreview ? (
        <div className="sec">
          <div className="sec-h">
            <span>Insert parts from “{decomposePreview.defName}”</span>
          </div>
          <div style={{ display: 'grid', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
            {decomposePreview.entries.map((e) => {
              const checked = e.partIds.every((id) => selectedDecomposeIds.includes(id))
              return (
                <label
                  key={`${e.kind}:${e.id}`}
                  className="lyr-row"
                  style={{
                    gap: 'var(--s-2)',
                    cursor: 'pointer',
                    alignItems: 'center',
                    paddingLeft: e.member ? 'var(--s-3)' : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={`Include ${e.name}`}
                    onChange={() => toggleDecomposeEntry(e.partIds)}
                  />
                  <span
                    className="lyr-nm"
                    title={e.name}
                    style={e.kind === 'group' ? { fontWeight: 600 } : undefined}
                  >
                    {e.name}
                  </span>
                  <span style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
                    {e.kind === 'group' ? `${e.partIds.length} parts` : 'part'}
                  </span>
                </label>
              )
            })}
          </div>
          <div className="action-grid" style={{ marginTop: 'var(--s-2)' }}>
            <button
              type="button"
              className="act"
              aria-label="Insert selected parts"
              disabled={selectedDecomposeIds.length === 0}
              onClick={() => insertSelectedParts()}
            >
              <Icon.Plus width={13} height={13} /> Insert selected parts
            </button>
            <button
              type="button"
              className="act"
              aria-label="Cancel part picker"
              onClick={clearDecomposePreview}
            >
              <Icon.Close width={13} height={13} /> Cancel
            </button>
          </div>
        </div>
      ) : null}

      {meshNames.length > 0 ? (
        <div className="sec">
          <div className="sec-h">
            <span>Recolour parts</span>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {meshNames.map((mn) => {
              const ov = spec.meshOverrides[mn] ?? {}
              return (
                <div key={mn} className="lyr-row" style={{ gap: 'var(--s-2)' }}>
                  <ColorPicker
                    value={ov.color ?? '#cccccc'}
                    ariaLabel={`Recolour ${mn}`}
                    onChange={(hex) => onSetMeshColor(mn, hex)}
                    disabled={ov.hidden}
                  />
                  <span className="lyr-nm" title={mn}>
                    {mn}
                  </span>
                  <button
                    type="button"
                    className={`icon-btn${ov.hidden ? ' on' : ''}`}
                    aria-label={`${ov.hidden ? 'Show' : 'Hide'} ${mn}`}
                    title={ov.hidden ? 'Show part' : 'Hide part'}
                    onClick={() => onToggleMeshHidden(mn, !ov.hidden)}
                  >
                    <Icon.Eye width={14} height={14} />
                  </button>
                  {ov.color !== undefined || ov.hidden ? (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Reset ${mn}`}
                      title="Reset to original"
                      onClick={() => onResetMesh(mn)}
                    >
                      <Icon.Close width={13} height={13} />
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </>
  )
}
