import { GROUND_LEVEL_ID, levelById } from '../../../../floorplan/levels'
import { type PlanElectricalPoint, pointInRoom } from '../../../../floorplan/types'
import { isEmitter } from '../../../../furniture/lightEmitters'
import { useStore } from '../../../../state/store'
import { Select } from '../../../controls/Select'
import { EmptyState } from '../../../EmptyState'
import { Icon } from '../../../toolbar/icons'

/** Whether a placed item is a light FIXTURE that a switch can control — a
 *  registered emitter (ceiling light/fan, cove, sconce, lamp, …) or any item
 *  the user flagged as a light source (`props.lightOn === 'yes'`). Mirrors the
 *  lighting-plan emitter set but ignores the on/off state (an off light is
 *  still wireable). */
function isLightFixture(defId: string, props: Record<string, unknown> | undefined): boolean {
  return isEmitter(defId) || props?.lightOn === 'yes'
}

/**
 * "Controls" section of the selected `switch` point's inspector (BSJ-3,
 * `switchCircuits` pro flag): pick the light fixtures this switch operates
 * (grouped by room), toggle two-way switching, and set the gang count. v1 is
 * LIST-ONLY — on-plan click-to-pick was judged disproportionate for a first
 * cut (the room-grouped list is unambiguous for a typical HDB fixture count,
 * and the selected switch already draws leader lines to its controlled lights
 * on the plan for spatial confirmation). The controlled ids are light-fixture
 * item ids (`PlanLight.id === item.id`; see `floorplan/switchCircuits.ts` for
 * the id-vocabulary decision).
 */
export function SwitchControlsSection({
  point,
  levelId,
}: {
  point: PlanElectricalPoint
  levelId?: string
}) {
  const items = useStore((s) => s.items)
  const plan = useStore((s) => s.floorPlan)
  const update = useStore((s) => s.updateElectricalPoint)

  const onLevel = (lv?: string) => (lv ?? GROUND_LEVEL_ID) === (levelId ?? GROUND_LEVEL_ID)
  // The active storey's rooms (plan.rooms is ground-only; an upper level's
  // geometry lives on `upperLevels`).
  const rooms = levelById(plan, levelId).rooms
  const fixtures = items.filter((it) => onLevel(it.levelId) && isLightFixture(it.defId, it.props))

  const controls = point.controls ?? []
  const controlled = new Set(controls)

  const toggle = (id: string) => {
    const next = controlled.has(id) ? controls.filter((c) => c !== id) : [...controls, id]
    update(point.id, { controls: next.length ? next : undefined })
  }

  // Group fixtures by the room whose footprint contains them (else "Elsewhere").
  const byRoom = new Map<string, typeof fixtures>()
  const OTHER = ' Elsewhere'
  for (const it of fixtures) {
    const room = rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
    const key = room?.name ?? OTHER
    const arr = byRoom.get(key)
    if (arr) arr.push(it)
    else byRoom.set(key, [it])
  }
  const roomKeys = [...byRoom.keys()].sort((a, b) =>
    a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b),
  )

  const way = point.way ?? 1
  const gang = point.gang ?? 1

  return (
    <div className="space-y-2">
      <div className="sec-h" style={{ marginTop: 'var(--s-2)' }}>
        <span>Controls ({controls.length})</span>
      </div>
      {fixtures.length === 0 ? (
        <EmptyState
          icon={Icon.Lights}
          title="No light fixtures on this storey"
          description="Place ceiling lights or lamps, then link them here."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {roomKeys.map((rk) => (
            <div key={rk} className="flex flex-col gap-1">
              <span className="label" style={{ color: 'var(--text-3)' }}>
                {rk === OTHER ? 'Elsewhere' : rk}
              </span>
              {byRoom.get(rk)!.map((it) => {
                const label = it.label || it.defId
                return (
                  <label key={it.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={controlled.has(it.id)}
                      onChange={() => toggle(it.id)}
                      aria-label={`Switch controls ${label}`}
                    />
                    <span style={{ color: 'var(--text)' }}>{label}</span>
                  </label>
                )
              })}
            </div>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={way === 2}
          onChange={(e) => update(point.id, { way: e.target.checked ? 2 : undefined })}
          aria-label="Two-way switch"
        />
        <span style={{ color: 'var(--text)' }}>Two-way (a second switch on the same circuit)</span>
      </label>
      <div className="row" style={{ padding: 'var(--s-2) 0', alignItems: 'center' }}>
        <span className="label">Gang</span>
        <Select
          className="input"
          style={{ marginLeft: 'auto', maxWidth: '50%' }}
          value={String(gang)}
          onChange={(v) => update(point.id, { gang: v === '1' ? undefined : Number(v) })}
          ariaLabel="Switch gang count"
          options={[
            { value: '1', label: '1-gang' },
            { value: '2', label: '2-gang' },
          ]}
        />
      </div>
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        Two-way: add a second switch, tick Two-way on both, and pick the same lights — they share
        one circuit (S1a / S1b) on the electrical plan.
      </p>
    </div>
  )
}
