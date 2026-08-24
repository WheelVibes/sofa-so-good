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
 * Only ever applied on a fresh seed, and only while both settings are still the
 * untouched defaults.
 */

import { hoursFromDate } from '../../scene/lighting/useEffectiveHour'
import { useStore } from '../store'

/** Daylight window, in local hours — outside this the flat needs interior light. */
export const DAYLIGHT_START = 8
export const DAYLIGHT_END = 18

/** True while `hour` is bright enough to read the flat without interior lights. */
export function isDaylightHour(hour: number): boolean {
  return hour >= DAYLIGHT_START && hour < DAYLIGHT_END
}

/**
 * Turn the interior lights on when a fresh first paint would land after dark.
 *
 * @returns true when the lights were switched on (i.e. it was dark outside).
 */
export function ensureDaylightFirstPaint(now: Date = new Date()): boolean {
  const s = useStore.getState()
  // Only ever touch untouched defaults — never override a real preference.
  if (s.timeMode !== 'system') return false
  if (s.lightsMode !== 'off') return false
  if (isDaylightHour(hoursFromDate(now))) return false
  s.setLightsMode('on')
  return true
}
