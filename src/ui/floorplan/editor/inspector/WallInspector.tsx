import { useFeature } from '../../../../features/useFeature'
import { defaultWallName } from '../../../../floorplan/planElementName'
import { DEFAULT_PLAN_WALL_COLOR, type PlanWall, wallLength } from '../../../../floorplan/types'
import { endForAngle, endForLength, wallAngleDeg } from '../../../../floorplan/wallOps'
import { useStore } from '../../../../state/store'
import { ColorPicker } from '../../../controls/ColorPicker'
import { Select } from '../../../controls/Select'
import { Icon } from '../../../toolbar/icons'
import { ActBtn, NameField, Num } from './shared'

/** Structure select options (TODO G7). Order: most → least structural. Exported
 *  for the bulk-classify action on the multi-wall selection panel (`PlanInspector`). */
export const STRUCTURE_OPTIONS = [
  ['unknown', 'Unknown / not verified'],
  ['load-bearing', 'Load-bearing'],
  ['rc-partition', 'RC partition'],
  ['brick-partition', 'Brick partition'],
  ['drywall', 'Drywall'],
] as const

/** Inspector body for a selected wall. Reads edits/state from the store exactly
 *  as the inline dispatcher code did. */
export function WallInspector({ wall: w, levelId }: { wall: PlanWall; levelId?: string }) {
  const a = useStore.getState()
  const plan = useStore((s) => s.floorPlan)
  const wallThicknessOn = useFeature('wallThickness')
  const slopingWallsOn = useFeature('slopingWalls')
  const wallBaseboardOn = useFeature('wallBaseboard')
  const elementColorsOn = useFeature('elementColors')
  const wallStructureOn = useFeature('wallStructure')
  return (
    <div className="space-y-2">
      <NameField
        value={w.name}
        placeholder={defaultWallName(w)}
        // Editing the name makes it permanent (clears the auto-assigned flag)
        // so room/auto-room allocation never overwrites it again.
        onChange={(v) => a.updateWall(w.id, { name: v, nameAuto: undefined }, levelId)}
      />
      <div className="action-grid">
        <ActBtn
          label="Reverse"
          icon={<Icon.FlipH width={16} height={16} />}
          disabled={w.locked}
          title="Reverse this wall's direction (flips its sides / door-swing reference)"
          onClick={() => a.reverseWall(w.id, levelId)}
        />
        <ActBtn
          label="Split"
          icon={<Icon.FlipV width={16} height={16} />}
          disabled={w.locked}
          title="Split this wall into two segments at its midpoint"
          onClick={() => a.splitWall(w.id, 0.5, levelId)}
        />
        <ActBtn
          label="Join"
          icon={<Icon.Rotate width={16} height={16} />}
          disabled={w.locked}
          title="Merge with a collinear neighbouring wall (inverse of Split)"
          onClick={() => a.joinWall(w.id, levelId)}
        />
        <ActBtn
          label="Duplicate"
          icon={<Icon.Copy width={16} height={16} />}
          title="Make a copy of this wall"
          onClick={() => a.duplicateWall(w.id, levelId)}
        />
        <ActBtn
          label={w.locked ? 'Locked' : 'Lock'}
          icon={
            w.locked ? <Icon.Lock width={16} height={16} /> : <Icon.Unlock width={16} height={16} />
          }
          on={w.locked}
          title={w.locked ? 'Unlock — allow moving/editing' : 'Lock in place'}
          onClick={() => a.updateWall(w.id, { locked: !w.locked || undefined }, levelId)}
        />
        <ActBtn
          label="Delete"
          icon={<Icon.Trash width={16} height={16} />}
          danger
          disabled={w.locked}
          onClick={() => a.removeWall(w.id, levelId)}
        />
      </div>
      <div className="seg accent" style={{ display: 'flex' }}>
        {(['external', 'internal'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => a.updateWall(w.id, { thickness: t }, levelId)}
            className={`capitalize${w.thickness === t ? ' on' : ''}`}
            style={{ flex: 1 }}
          >
            {t}
          </button>
        ))}
      </div>
      {wallStructureOn ? (
        <div className="flex flex-col gap-1" style={{ marginTop: 'var(--s-1)' }}>
          <div className="row" style={{ padding: '6px 0', alignItems: 'center' }}>
            <span className="label">Structure</span>
            <Select
              className="input"
              style={{ marginLeft: 'auto', maxWidth: '56%' }}
              value={w.structure ?? 'unknown'}
              onChange={(v) =>
                a.updateWall(w.id, { structure: v as PlanWall['structure'] }, levelId)
              }
              ariaLabel="Structure"
              options={STRUCTURE_OPTIONS.map(([value, label]) => ({ value, label }))}
            />
          </div>
          <div
            className="label"
            style={{
              fontSize: 'var(--t-2xs)',
              color: 'var(--text-3)',
              lineHeight: 'var(--lh-body)',
            }}
          >
            User-declared, not verified — older HDB blocks can hide a load-bearing beam-and-column
            wall behind what looks like a partition on plan. Confirm against HDB/BCA as-built
            records (or a PE) before hacking.
          </div>
        </div>
      ) : null}
      {wallThicknessOn ? (
        <div className="flex flex-col gap-1">
          <Num
            label="Thickness (m)"
            value={w.thicknessM ?? (w.thickness === 'external' ? 0.2 : 0.1)}
            step={0.01}
            min={0.05}
            onChange={(v) => {
              if (!Number.isFinite(v)) return
              a.updateWall(w.id, { thicknessM: Math.min(1, Math.max(0.05, v)) }, levelId)
            }}
          />
          {w.thicknessM != null ? (
            <button
              type="button"
              className="btn ghost btn-sm self-start"
              onClick={() => a.updateWall(w.id, { thicknessM: undefined }, levelId)}
            >
              Use plan default
            </button>
          ) : null}
        </div>
      ) : null}
      <Num
        label="Start X"
        value={w.start[0]}
        onChange={(v) => a.updateWall(w.id, { start: [v, w.start[1]] }, levelId)}
      />
      <Num
        label="Start Z"
        value={w.start[1]}
        onChange={(v) => a.updateWall(w.id, { start: [w.start[0], v] }, levelId)}
      />
      <Num
        label="End X"
        value={w.end[0]}
        onChange={(v) => a.updateWall(w.id, { end: [v, w.end[1]] }, levelId)}
      />
      <Num
        label="End Z"
        value={w.end[1]}
        onChange={(v) => a.updateWall(w.id, { end: [w.end[0], v] }, levelId)}
      />
      <Num
        label="Length (m)"
        value={wallLength(w)}
        min={0.01}
        onChange={(v) => a.updateWall(w.id, { end: endForLength(w, v) }, levelId)}
      />
      <Num
        label="Angle (°)"
        value={Math.round(wallAngleDeg(w) * 10) / 10}
        step={1}
        onChange={(v) => a.updateWall(w.id, { end: endForAngle(w, v) }, levelId)}
      />
      {slopingWallsOn ? (
        <div className="space-y-1" style={{ marginTop: 'var(--s-1)' }}>
          <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Sloping top (shed / mono-pitch — no openings)
          </div>
          <Num
            label="Top height @ start (m)"
            value={w.topHeight ?? plan.ceilingHeight}
            min={0.3}
            onChange={(v) => a.updateWall(w.id, { topHeight: v }, levelId)}
          />
          <Num
            label="Top height @ end (m)"
            value={w.topHeightEnd ?? w.topHeight ?? plan.ceilingHeight}
            min={0.3}
            onChange={(v) => a.updateWall(w.id, { topHeightEnd: v }, levelId)}
          />
          {w.topHeightEnd !== undefined ? (
            <button
              type="button"
              className="btn btn-soft btn-sm btn-block"
              onClick={() =>
                a.updateWall(w.id, { topHeightEnd: undefined, topHeight: undefined }, levelId)
              }
            >
              Reset to flat top
            </button>
          ) : null}
        </div>
      ) : null}
      {wallBaseboardOn ? (
        <div className="space-y-1" style={{ marginTop: 'var(--s-1)' }}>
          <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Baseboard / skirting
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={!w.baseboard?.hidden}
              onChange={(e) =>
                a.updateWall(
                  w.id,
                  { baseboard: { ...w.baseboard, hidden: !e.target.checked } },
                  levelId,
                )
              }
            />
            <span>Show baseboard</span>
          </label>
          {!w.baseboard?.hidden ? (
            <>
              <Num
                label="Height (m)"
                value={w.baseboard?.height ?? 0.09}
                step={0.01}
                min={0.01}
                onChange={(v) =>
                  a.updateWall(
                    w.id,
                    {
                      baseboard: {
                        ...w.baseboard,
                        height: Math.abs(v - 0.09) < 1e-4 ? undefined : Math.max(0.01, v),
                      },
                    },
                    levelId,
                  )
                }
              />
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="label">Colour</span>
                <ColorPicker
                  ariaLabel="Baseboard colour"
                  value={w.baseboard?.color ?? '#eceae4'}
                  onChange={(hex) =>
                    a.updateWall(w.id, { baseboard: { ...w.baseboard, color: hex } }, levelId)
                  }
                />
              </div>
            </>
          ) : null}
          {w.baseboard ? (
            <button
              type="button"
              className="btn btn-soft btn-sm btn-block"
              onClick={() => a.updateWall(w.id, { baseboard: undefined }, levelId)}
            >
              Reset baseboard
            </button>
          ) : null}
        </div>
      ) : null}
      {elementColorsOn ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="label">Wall colour</span>
          <span className="flex items-center gap-2">
            <ColorPicker
              ariaLabel="Wall colour"
              value={w.color ?? plan.wallColor ?? DEFAULT_PLAN_WALL_COLOR}
              onChange={(hex) => a.updateWall(w.id, { color: hex }, levelId)}
            />
            {w.color ? (
              <button
                type="button"
                className="text-[10px] text-[var(--text-3)] hover:text-[var(--text-2)]"
                onClick={() => a.updateWall(w.id, { color: undefined }, levelId)}
              >
                reset
              </button>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  )
}
