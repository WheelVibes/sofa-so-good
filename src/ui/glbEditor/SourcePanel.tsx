import type { AssetEditSpec } from '../../furniture/glbEdit/editSpec'
import type { UserGltfDef } from '../../furniture/types'
import { ColorPicker } from '../controls/ColorPicker'
import { Select } from '../controls/Select'
import { Icon } from '../toolbar/icons'

/**
 * The designer's "Start from" source picker + per-mesh recolour list. Picks an
 * uploaded/bundled user GLB to build around (uniformly scaled) or "Blank" to
 * compose from shapes only. When the picked source was itself built in the
 * designer (carries a restorable `assetSpec`), it offers restoring the full
 * editable part list instead of editing the frozen source mesh (Asset Studio S0).
 * Purely presentational — the dialog owns the spec.
 */
export function SourcePanel({
  spec,
  userGlbs,
  meshNames,
  canRestore,
  onPickSource,
  onScaleChange,
  onRestoreSpec,
  onSetMeshColor,
  onToggleMeshHidden,
  onResetMesh,
}: {
  spec: AssetEditSpec
  userGlbs: UserGltfDef[]
  meshNames: string[]
  /** True when the picked source carries a restorable designer spec. */
  canRestore: boolean
  onPickSource: (id: string) => void
  onScaleChange: (scale: number) => void
  onRestoreSpec: () => void
  onSetMeshColor: (meshName: string, hex: string) => void
  onToggleMeshHidden: (meshName: string, hidden: boolean) => void
  onResetMesh: (meshName: string) => void
}) {
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
          <label className="fld" style={{ marginTop: 'var(--s-2)' }}>
            <span>Scale ×{spec.sourceScale.toFixed(2)}</span>
            <input
              type="range"
              min={0.1}
              max={3}
              step={0.05}
              value={spec.sourceScale}
              onChange={(e) => onScaleChange(Number(e.target.value))}
              aria-label="Source scale"
            />
          </label>
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
