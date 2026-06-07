import type { LightsMode } from '../../state/slices/uiSlice'
import { useStore } from '../../state/store'

/** A one-click lighting "mood": a sun time of day + a fixture-lights mode.
 *  Bundles the two controls users would otherwise set separately, so a room can
 *  be previewed at golden hour, a cosy lamp-lit evening, etc. */
export interface LightingScene {
  id: string
  label: string
  /** Fractional hour [0,24) for the sun. */
  hour: number
  /** Fixture lights: 'auto' (day-gated), 'on' (forced) or 'off'. */
  lights: LightsMode
}

/** Curated moods, day → night. Hours chosen for distinct, flattering light. */
export const LIGHTING_SCENES: LightingScene[] = [
  { id: 'daylight', label: 'Daylight', hour: 13, lights: 'off' },
  { id: 'golden', label: 'Golden hour', hour: 18, lights: 'auto' },
  { id: 'cozy', label: 'Cosy evening', hour: 20.5, lights: 'on' },
  { id: 'night', label: 'Night', hour: 23, lights: 'on' },
]

/** The store patch a scene applies — pure, so it's unit-testable and reusable
 *  by the "is this scene active?" check. */
export function lightingSceneState(scene: LightingScene): {
  timeMode: 'manual'
  manualHour: number
  lightsMode: LightsMode
} {
  return { timeMode: 'manual', manualHour: scene.hour, lightsMode: scene.lights }
}

/** True when the current store state matches the scene (for highlighting). */
export function isLightingSceneActive(
  scene: LightingScene,
  state: { timeMode: string; manualHour: number; lightsMode: LightsMode },
): boolean {
  return (
    state.timeMode === 'manual' &&
    Math.abs(state.manualHour - scene.hour) < 1e-3 &&
    state.lightsMode === scene.lights
  )
}

/** Apply a mood: set the sun time (switches to manual) + the fixture mode. */
export function applyLightingScene(scene: LightingScene): void {
  const s = useStore.getState()
  s.setManualHour(scene.hour)
  s.setLightsMode(scene.lights)
}
