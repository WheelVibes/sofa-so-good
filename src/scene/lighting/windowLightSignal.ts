/**
 * windowLightSignal.ts
 *
 * Module-level signals for window-light modifiers (attenuation + glass tint).
 * Uses the same pattern as fixtureGlow.ts: plain module singletons, written by
 * CurtainLightController (store subscriber) and read each frame in Lighting.tsx.
 * Keeps these values out of React re-renders — polled in useFrame, zero per-frame
 * cost when unchanged.
 */

/** Sun-intensity multiplier ∈ (0, 1]. 1 = no curtains blocking any window. */
let attenuation = 1.0

/** Sun-colour tint [r,g,b] ∈ [0,1]³. [1,1,1] = neutral/clear glass. */
const glassTint: [number, number, number] = [1, 1, 1]

export function setWindowAttenuation(v: number): void {
  attenuation = v
}

export function getWindowAttenuation(): number {
  return attenuation
}

export function setWindowGlassTint(r: number, g: number, b: number): void {
  glassTint[0] = r
  glassTint[1] = g
  glassTint[2] = b
}

export function getWindowGlassTint(): readonly [number, number, number] {
  return glassTint
}
