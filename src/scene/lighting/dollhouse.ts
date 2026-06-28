/**
 * Orbit "dollhouse" lighting mode (ORBIT-DOLLHOUSE).
 *
 * Orbit view removes the ceiling (back-face culled), so the real exterior-sun
 * simulation — directional sun, hard shadows, day/night exposure grading and
 * bloom — is *inaccurate* there (light pours straight in from above). So in
 * orbit, during the **day with the interior lights off**, we drop that
 * atmosphere for a flat, uniform "dollhouse" fill (even brightness, no sun
 * shadow, no bloom, neutral exposure). Material quality — IBL reflections,
 * sheen/gloss, PBR detail — is untouched, so a glossy sofa still reads glossy.
 *
 * Everything else keeps the full simulation: **walk mode** always, and **orbit
 * at night** (interior fixtures light the scene as before). The pure predicate
 * is unit-tested; the module signal lets `Lighting` (writer) and the post-stack
 * (`EffectsImpl`, reader) agree without a React re-render.
 */

export interface DollhouseInputs {
  cameraMode: 'orbit' | 'firstPerson'
  /** Sun altitude in radians (>= 0 is above the horizon = daytime). */
  sunAltitude: number
  lightsMode: 'auto' | 'on' | 'off'
}

/**
 * True when orbit view should render as a flat daytime dollhouse: orbit camera,
 * sun above the horizon, and the interior lights not force-ON (auto resolves to
 * off in daylight; an explicit "on" keeps the real interior-lit look).
 */
export function isDollhouseLighting({
  cameraMode,
  sunAltitude,
  lightsMode,
}: DollhouseInputs): boolean {
  return cameraMode === 'orbit' && sunAltitude >= 0 && lightsMode !== 'on'
}

// ── Module signal (no React re-render) — written by Lighting, read by the post
//    stack, mirroring the windowLightSignal pattern. ────────────────────────
let dollhouseActive = false

export function setDollhouseActive(v: boolean): void {
  dollhouseActive = v
}

export function getDollhouseActive(): boolean {
  return dollhouseActive
}
