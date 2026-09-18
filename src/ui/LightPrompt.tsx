import { isFeatureEnabled } from '../features/featureFlags'
import { useCatalogGetter } from '../furniture/catalog'
import { lightLabel } from '../furniture/lightInteract'
import { useStore } from '../state/store'

/**
 * Walk-mode "Press E to …" prompt for a light-capable item being aimed at —
 * the light counterpart to `FixturePrompt`/`ScreenPrompt` (WALK-LIGHT-
 * INTERACT). Suppressed whenever a door or curtain/blind fixture is *also*
 * nearby (those take priority — matches `App.tsx`'s E-key dispatch order:
 * door → fixture → screen/light). Screens and lights never compete for the
 * same prompt slot: `FirstPersonCamera`'s aim loop already resolves
 * nearest-wins between them before either `nearbyScreenId`/`nearbyLightId`
 * is set.
 */
export function LightPrompt() {
  const cameraMode = useStore((s) => s.cameraMode)
  const nearbyDoorId = useStore((s) => s.nearbyDoorId)
  const nearbyFixtureId = useStore((s) => s.nearbyFixtureId)
  const nearbyLightId = useStore((s) => s.nearbyLightId)
  const item = useStore((s) =>
    nearbyLightId ? s.items.find((it) => it.id === nearbyLightId) : undefined,
  )
  const toggleLightPower = useStore((s) => s.toggleLightPower)
  // W8 (walk-photoreal review, 2026-09-19): the prompt read the per-item
  // switch alone and could offer "Turn off ceiling light" in a room that was
  // visibly dark — `FurnitureLights.tsx`'s `fixturesLevel` returns exactly 0
  // whenever `lightsMode !== 'on'` (see `scene/look.ts`), so with the
  // scene-wide switch off NO fixture emits regardless of any item's own
  // `lightOn` flag: toggling one is a real store write with no visible
  // effect. Rather than mislabel that dead interaction, suppress the prompt
  // entirely while the global switch is off — there is nothing for "Turn on"
  // or "Turn off" to honestly describe until lights are on.
  const lightsOn = useStore((s) => s.lightsMode === 'on')
  const { getDef } = useCatalogGetter()

  if (cameraMode !== 'firstPerson' || !nearbyLightId || nearbyDoorId || nearbyFixtureId) return null
  if (!isFeatureEnabled('walkLights')) return null
  if (!lightsOn) return null
  if (!item) return null
  const def = getDef(item.defId)
  if (!def) return null
  const label = lightLabel(def, item.props)
  if (!label) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center">
      <button
        type="button"
        onClick={() => toggleLightPower(nearbyLightId)}
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
