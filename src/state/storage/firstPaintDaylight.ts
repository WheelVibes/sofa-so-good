/**
 * First-paint legibility guard.
 *
 * `timeMode` defaults to `'system'`, so the sun follows the real local clock.
 * That is right for a returning user, but it means a brand-new visitor opening
 * the app after dark is shown a **pitch-black flat**: the move-in demo seeds 87
 * items and every one of them is invisible, through onboarding, the whole 9-step
 * tour and the location prompt (Chrome audit 2026-08, boot at 20:00).
 *
 * The fix keeps the REAL time of day and switches the interior lights on
 * instead. Measured side by side, a night render with lights on is not just
 * legible, it is the more inviting first impression of the two — warm pools of
 * light, the TV glowing, the windows dark — and it stays honest about the hour
 * rather than teleporting the user to 1pm. Overriding the clock was the first
 * version of this fix; it worked, but it silently disagreed with the time
 * displayed in the Scene panel.
 *
 * **This applies at EVERY hour, not only after dark (DEFAULT-GLOOM, v0.31.5.86,
 * shipped on the user's decision).** It began as a night-only guard gated on an
 * 8:00–18:00 daylight window, on the assumption that daylight alone reads well
 * enough. Measured, it does not: switching the fixtures on is worth **2.3–2.5x**
 * in the daytime walk view (`.54`). The mechanism is also demonstrably cheap and
 * benign — at 21:00 in the orbit/boot view the fixtures move mean luminance
 * 16.9 -> 132.2 (~7.8x) while moving mean chroma only 0.248 -> 0.249, so they buy
 * legibility without pushing the frame toward the over-saturated look the AgX
 * tone-operator choice exists to avoid (`.83`).
 *
 * The function keeps its original name because it is referenced by that name
 * throughout `CHANGELOG.md` and the path-scoped docs; read "Daylight" as the
 * historical motivation rather than a description of when it fires.
 *
 * Only ever applied on a fresh seed, and only while both settings are still the
 * untouched defaults.
 *
 * **`photographicFill` opts OUT of the daytime half of this** (PHOTO-FILL-FIXTURES,
 * v0.31.5.163) — and only the daytime half. Measured across `.157`–`.162`, the
 * fixtures burning at midday are the single largest thing flattening the frame:
 * turning them off raises the sofa's surface micro-contrast **+62 %**, against
 * ≤ +20 % for any material change and +7–18 % for the positionless fill itself.
 * No real interior has every lamp on at 1 pm. The night behaviour is untouched —
 * a dark flat is still lit, which is the legibility case this guard exists for —
 * and the DEFAULT is untouched too, because the all-hours rule is a recorded
 * user decision (DEFAULT-GLOOM, `.86`). The flag only makes the alternative
 * reachable and comparable.
 */

import { isFeatureEnabled } from '../../features/featureFlags'
import { daylightFromAltitude } from '../../scene/lighting/altitudeCurve'
import { computeSun, hoursToDate } from '../../scene/lighting/sunPosition'
import { FALLBACK_LOCATION } from '../../scene/lighting/useSunPosition'
import { useStore } from '../store'

/**
 * Daylight (0 night … 1 full day) at a location and instant, for the fixture
 * decision below. Pure apart from the clock it is handed.
 */
export function firstPaintDaylight(date: Date, lat: number, lon: number): number {
  // Match `useSunPosition` exactly — effective LOCAL hour mapped through
  // `hoursToDate`, not the raw instant — so the guard and the renderer can never
  // disagree about whether it is daytime.
  const hour = date.getHours() + date.getMinutes() / 60
  return daylightFromAltitude(computeSun(hoursToDate(hour, date), lat, lon).altitude)
}

/**
 * Should the first paint switch the interior lights on?
 *
 * Shipped behaviour is unconditional (DEFAULT-GLOOM). With `photographicFill` on,
 * a frame that is already in full daylight is left unlit. Pure, so the rule is
 * unit-testable without a clock or a store.
 */
export function shouldLightFirstPaint(daylight: number, photographicFill: boolean): boolean {
  if (!photographicFill) return true
  return !(Number.isFinite(daylight) && daylight >= 1)
}

/**
 * Turn the interior lights on for a fresh first paint, at any hour.
 *
 * @returns true when the lights were switched on.
 */
export function ensureDaylightFirstPaint(now: Date = new Date()): boolean {
  const s = useStore.getState()
  // Only ever touch untouched defaults — never override a real preference.
  if (s.timeMode !== 'system') return false
  if (s.lightsMode !== 'off') return false
  const loc = s.location ?? FALLBACK_LOCATION
  const daylight = firstPaintDaylight(now, loc.lat, loc.lon)
  if (!shouldLightFirstPaint(daylight, isFeatureEnabled('photographicFill'))) return false
  s.setLightsMode('on')
  return true
}
