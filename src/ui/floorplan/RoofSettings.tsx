import { isMultiLevel } from '../../floorplan/levels'
import { ROOF_OVERHANG_MAX, ROOF_PITCH_MAX, ROOF_PITCH_MIN } from '../../floorplan/roofModel'
import type {
  FloorPlan,
  PlanRoof,
  PlanRoofDormer,
  RoofDormerSide,
  RoofMaterialKind,
  RoofStyle,
} from '../../floorplan/types'
import { useStore } from '../../state/store'
import { Select } from '../controls/Select'
import { Icon } from '../toolbar/icons'
import { Num } from './editor/inspector/shared'

const STYLE_OPTIONS: { value: RoofStyle; label: string }[] = [
  { value: 'gable', label: 'Gable' },
  { value: 'hip', label: 'Hip' },
  { value: 'flat-parapet', label: 'Flat + parapet' },
]

const RIDGE_OPTIONS: { value: PlanRoof['ridgeAxis']; label: string }[] = [
  { value: 'auto', label: 'Auto (longer side)' },
  { value: 'x', label: 'East–West' },
  { value: 'z', label: 'North–South' },
]

const MATERIAL_OPTIONS: { value: RoofMaterialKind; label: string }[] = [
  { value: 'clay-tile', label: 'Clay tile' },
  { value: 'metal-seam', label: 'Metal seam' },
]

const SIDE_OPTIONS: { value: RoofDormerSide; label: string }[] = [
  { value: 'N', label: 'North' },
  { value: 'S', label: 'South' },
  { value: 'E', label: 'East' },
  { value: 'W', label: 'West' },
]

const DEFAULT_ROOF: PlanRoof = {
  style: 'gable',
  pitchDeg: 30,
  overhang: 0.4,
  ridgeAxis: 'auto',
  material: 'clay-tile',
}

/** True when the plan is eligible for a parametric roof: a landed template or
 *  any multi-storey plan (matching the TODO's "only offered on Maisonette /
 *  terrace templates" intent, generalised to user multi-level plans). */
export function planRoofEligible(plan: FloorPlan): boolean {
  return plan.category?.housingType === 'Landed' || isMultiLevel(plan)
}

/**
 * Roof authoring section for the floor-plan editor's plan defaults panel
 * (`parametricRoof` pro flag). Shows only when the plan is landed / multi-storey
 * (see {@link planRoofEligible}). Add/remove the roof, pick style / pitch /
 * overhang / ridge / material, and manage gable dormers.
 */
export function RoofSettings({ plan }: { plan: FloorPlan }) {
  const a = useStore.getState()
  const roof = plan.roof
  const setRoof = (patch: Partial<PlanRoof>) => {
    if (!roof) return
    a.updateFloorPlanMeta({ roof: { ...roof, ...patch } })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="label">Roof</span>
        {roof ? (
          <button
            type="button"
            className="btn ghost btn-sm"
            onClick={() => a.updateFloorPlanMeta({ roof: undefined })}
          >
            Remove
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-soft btn-sm"
            onClick={() => a.updateFloorPlanMeta({ roof: DEFAULT_ROOF })}
          >
            Add roof
          </button>
        )}
      </div>

      {roof ? (
        <>
          <div className="row" style={{ alignItems: 'center' }}>
            <span className="label">Style</span>
            <Select
              className="input"
              style={{ marginLeft: 'auto', maxWidth: '60%' }}
              value={roof.style}
              onChange={(v) => setRoof({ style: v as RoofStyle })}
              ariaLabel="Roof style"
              options={STYLE_OPTIONS}
            />
          </div>

          {roof.style !== 'flat-parapet' ? (
            <>
              <Num
                label="Pitch (°)"
                value={roof.pitchDeg}
                step={1}
                min={ROOF_PITCH_MIN}
                onChange={(v) => {
                  if (!Number.isFinite(v)) return
                  setRoof({ pitchDeg: Math.min(ROOF_PITCH_MAX, Math.max(ROOF_PITCH_MIN, v)) })
                }}
              />
              <div className="row" style={{ alignItems: 'center' }}>
                <span className="label">Ridge</span>
                <Select
                  className="input"
                  style={{ marginLeft: 'auto', maxWidth: '60%' }}
                  value={roof.ridgeAxis}
                  onChange={(v) => setRoof({ ridgeAxis: v as PlanRoof['ridgeAxis'] })}
                  ariaLabel="Ridge direction"
                  options={RIDGE_OPTIONS}
                />
              </div>
            </>
          ) : null}

          <Num
            label="Overhang (m)"
            value={roof.overhang}
            step={0.05}
            min={0}
            onChange={(v) => {
              if (!Number.isFinite(v)) return
              setRoof({ overhang: Math.min(ROOF_OVERHANG_MAX, Math.max(0, v)) })
            }}
          />

          <div className="row" style={{ alignItems: 'center' }}>
            <span className="label">Material</span>
            <Select
              className="input"
              style={{ marginLeft: 'auto', maxWidth: '60%' }}
              value={roof.material ?? 'clay-tile'}
              onChange={(v) => setRoof({ material: v as RoofMaterialKind })}
              ariaLabel="Roof material"
              options={MATERIAL_OPTIONS}
            />
          </div>

          {roof.style !== 'flat-parapet' ? (
            <DormerEditor roof={roof} onChange={(dormers) => setRoof({ dormers })} />
          ) : null}

          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
            Roof is built over the top storey and hides when you orbit to look inside.
          </span>
        </>
      ) : (
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          Add a pitched roof over the top storey (gable / hip / flat).
        </span>
      )}
    </div>
  )
}

function DormerEditor({
  roof,
  onChange,
}: {
  roof: PlanRoof
  onChange: (dormers: PlanRoofDormer[]) => void
}) {
  const dormers = roof.dormers ?? []
  // Valid dormer sides follow the ridge axis (the sides the main planes face).
  const facing: RoofDormerSide[] =
    roof.ridgeAxis === 'z' ? ['E', 'W'] : roof.ridgeAxis === 'x' ? ['N', 'S'] : ['N', 'S', 'E', 'W']
  const sideOptions = SIDE_OPTIONS.filter((o) => facing.includes(o.value))
  const add = () =>
    onChange([...dormers, { wallSide: sideOptions[0]?.value ?? 'S', offset: 1, width: 1.2 }])
  const update = (i: number, patch: Partial<PlanRoofDormer>) =>
    onChange(dormers.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const remove = (i: number) => onChange(dormers.filter((_, j) => j !== i))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="label">Dormers</span>
        <button type="button" className="btn btn-soft btn-sm" onClick={add}>
          Add dormer
        </button>
      </div>
      {dormers.length === 0 ? (
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          No dormers.
        </span>
      ) : (
        dormers.map((d, i) => (
          <div
            key={`dormer-${i}`}
            className="flex flex-col gap-1"
            style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--s-2)' }}
          >
            <div className="row" style={{ alignItems: 'center' }}>
              <span className="label">Side</span>
              <Select
                className="input"
                style={{ marginLeft: 'auto', maxWidth: '48%' }}
                value={d.wallSide}
                onChange={(v) => update(i, { wallSide: v as RoofDormerSide })}
                ariaLabel={`Dormer ${i + 1} side`}
                options={sideOptions}
              />
              <button
                type="button"
                className="icon-btn danger"
                aria-label={`Remove dormer ${i + 1}`}
                title="Remove dormer"
                onClick={() => remove(i)}
                style={{ marginLeft: 'var(--s-2)' }}
              >
                <Icon.Trash width={16} height={16} />
              </button>
            </div>
            <Num
              label="Offset (m)"
              value={d.offset}
              step={0.1}
              min={0}
              onChange={(v) => Number.isFinite(v) && update(i, { offset: Math.max(0, v) })}
            />
            <Num
              label="Width (m)"
              value={d.width}
              step={0.1}
              min={0.6}
              onChange={(v) => Number.isFinite(v) && update(i, { width: Math.max(0.6, v) })}
            />
          </div>
        ))
      )}
    </div>
  )
}
