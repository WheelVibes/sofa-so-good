import { walkLevel } from '../floorplan/levels'
import { useStore } from '../state/store'

/** Hand-written copy for the DEFAULT flat's eight doors, whose ids are stable and
 *  whose rooms have familiar names ("Open bedroom 2"). Any other plan falls back
 *  to a generic label — see `doorPromptLabel`. */
const LABELS: Record<string, string> = {
  'door-main': 'main door',
  'door-mainBedroom': 'main bedroom',
  'door-bedroom2': 'bedroom 2',
  'door-bedroom3': 'bedroom 3',
  'door-bath1': 'bath 1',
  'door-bath2': 'bath 2',
  'door-householdShelter': 'household shelter',
  'door-serviceYard': 'service yard',
}

/**
 * The prompt's noun for a door id.
 *
 * WALK-AIM-PROMPT: this used to be gated on `DOORS.find(...)` — the DEFAULT
 * flat's hardcoded constants — and returned null when the id was absent. So even
 * once WALK-AIM-PLAN (v0.31.5.99) made `nearbyDoorId` correct on every template,
 * the prompt still refused to render for any of them: the walker was standing at
 * an openable door with no affordance on screen. Pure so the fallback order is
 * unit-testable.
 */
export function doorPromptLabel(id: string, name?: string): string {
  // `||` not `??` for the name: a whitespace-only custom name trims to '', which
  // is not nullish, so `??` would render an empty noun ("Open ").
  return LABELS[id] ?? (name?.trim() || 'door')
}

export function DoorPrompt() {
  const cameraMode = useStore((s) => s.cameraMode)
  const nearbyDoorId = useStore((s) => s.nearbyDoorId)
  const isOpen = useStore((s) => (nearbyDoorId ? (s.doors[nearbyDoorId]?.open ?? false) : false))
  const toggleDoor = useStore((s) => s.toggleDoor)
  // Validate against the storey being WALKED, the same source the aim ray uses
  // (`collision/doorAim.ts`) — so a stale id from a previous plan still can't
  // render a prompt, but every door of the current one can.
  const opening = useStore((s) => {
    if (!nearbyDoorId) return undefined
    return walkLevel(s.floorPlan, s.viewLevelId).openings.find(
      (o) => o.kind === 'door' && o.id === nearbyDoorId,
    )
  })

  if (cameraMode !== 'firstPerson' || !nearbyDoorId) return null
  if (!opening) return null
  const label = doorPromptLabel(nearbyDoorId, opening.name)
  const action = isOpen ? 'Close' : 'Open'

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center">
      <button
        type="button"
        onClick={() => toggleDoor(nearbyDoorId)}
        className="hud-pill pointer-events-auto"
      >
        <kbd>E</kbd>
        <span>
          {action} {label}
        </span>
      </button>
    </div>
  )
}
