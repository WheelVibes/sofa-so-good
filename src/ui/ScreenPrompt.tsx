import { isFeatureEnabled } from '../features/featureFlags'
import { useCatalogGetter } from '../furniture/catalog'
import { screenLabel } from '../furniture/screenInteract'
import { useStore } from '../state/store'

/**
 * Walk-mode "Press E to …" prompt for a monitor/TV being aimed at — the
 * screen counterpart to `FixturePrompt` (WALK-SCREEN-INTERACT). Suppressed
 * whenever a door or curtain/blind fixture is *also* nearby (those take
 * priority — matches `App.tsx`'s E-key dispatch order: door → fixture →
 * screen/light). Screens and lights never compete for the same prompt slot:
 * `FirstPersonCamera`'s aim loop already resolves nearest-wins between them
 * before either `nearbyScreenId`/`nearbyLightId` is set.
 */
export function ScreenPrompt() {
  const cameraMode = useStore((s) => s.cameraMode)
  const nearbyDoorId = useStore((s) => s.nearbyDoorId)
  const nearbyFixtureId = useStore((s) => s.nearbyFixtureId)
  const nearbyScreenId = useStore((s) => s.nearbyScreenId)
  const item = useStore((s) =>
    nearbyScreenId ? s.items.find((it) => it.id === nearbyScreenId) : undefined,
  )
  const cycleScreenContent = useStore((s) => s.cycleScreenContent)
  const { getDef } = useCatalogGetter()

  if (cameraMode !== 'firstPerson' || !nearbyScreenId || nearbyDoorId || nearbyFixtureId)
    return null
  if (!isFeatureEnabled('walkScreens')) return null
  if (!item) return null
  const def = getDef(item.defId)
  if (!def) return null
  const label = screenLabel(def)
  if (!label) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center">
      <button
        type="button"
        onClick={() => cycleScreenContent(nearbyScreenId)}
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
