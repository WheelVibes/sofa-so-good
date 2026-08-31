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
 * **This guard is unconditional again (v0.31.5.165).** `.163` briefly made its
 * daytime half opt out under `photographicFill`; `.165` measured that in the ORBIT
 * boot view — which is where this runs — and it cost the model its warmth
 * entirely (R/B 1.047 → 0.998, saturation −43 %) for no photographic gain. The
 * fixture decision belongs at RENDER time and per VIEW, not at boot: see
 * `scene/look.ts:fixturesRender`. This guard owns the user's SETTING and nothing
 * else, which is also why it may only ever touch untouched defaults.
 */

import { useStore } from '../store'

/**
 * Turn the interior lights on for a fresh first paint, at any hour.
 *
 * @returns true when the lights were switched on.
 */
export function ensureDaylightFirstPaint(): boolean {
  const s = useStore.getState()
  // Only ever touch untouched defaults — never override a real preference.
  if (s.timeMode !== 'system') return false
  if (s.lightsMode !== 'off') return false
  s.setLightsMode('on')
  return true
}
