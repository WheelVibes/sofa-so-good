import { isFeatureEnabled } from '../features/featureFlags'
import { useCatalogGetter } from '../furniture/catalog'
import { windowFixtureLabel } from '../furniture/windowFixtureInteract'
import { useStore } from '../state/store'

/**
 * Walk-mode "Press E to …" prompt for a curtain/roller-blind being aimed at —
 * the window-fixture counterpart to `DoorPrompt` (WINDOW-FIXTURE-INTERACT),
 * mirroring its copy shape ("{action} {noun}") and HUD placement. Suppressed
 * whenever a door is *also* nearby so the two prompts never stack in the same
 * spot — a door in range takes priority (matches `App.tsx`'s E-key dispatch,
 * which checks `nearbyDoorId` before `nearbyFixtureId`).
 */
export function FixturePrompt() {
  const cameraMode = useStore((s) => s.cameraMode)
  const nearbyDoorId = useStore((s) => s.nearbyDoorId)
  const nearbyFixtureId = useStore((s) => s.nearbyFixtureId)
  const item = useStore((s) =>
    nearbyFixtureId ? s.items.find((it) => it.id === nearbyFixtureId) : undefined,
  )
  const toggleWindowFixture = useStore((s) => s.toggleWindowFixture)
  const { getDef } = useCatalogGetter()

  if (cameraMode !== 'firstPerson' || !nearbyFixtureId || nearbyDoorId) return null
  if (!isFeatureEnabled('walkWindowFixtures')) return null
  if (!item) return null
  const def = getDef(item.defId)
  if (!def) return null
  const label = windowFixtureLabel(def, item.props)
  if (!label) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center">
      <button
        type="button"
        onClick={() => toggleWindowFixture(nearbyFixtureId)}
        className="hud-pill pointer-events-auto"
      >
        <kbd>E</kbd>
        <span>
          {label.action} {label.noun}
        </span>
      </button>
    </div>
  )
}
