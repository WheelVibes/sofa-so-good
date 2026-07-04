/**
 * Time-of-day comparison reveal — capture orchestration (pure of React/three).
 *
 * FEAT-1: reuses the exact reveal-slider mechanism `stagingReveal.ts` pioneered
 * (capture the SAME camera twice, composite with a draggable divider) but drives
 * the existing sun/time rig (`timeSlice`) instead of furniture visibility, so the
 * two frames differ **only** in time of day — tone mapping, exposure, lights mode
 * and HDRI stay exactly as the user left them, in both frames.
 *
 * Produces the two frames the reveal slider compares:
 *   - **imageA** — the scene at time preset A (e.g. midday)
 *   - **imageB** — the scene at time preset B (e.g. night)
 *
 * All side effects (canvas capture, the time-state getters/setters, the settle
 * delay) are injected, so the orchestration is unit-testable without mounting a
 * component or a real renderer. The user's exact prior time state (mode + manual
 * hour) is restored afterwards, even if a capture throws — the scene is never left
 * stuck on a preset.
 */

import type { TimeMode, TimePreset } from '../../state/slices/timeSlice'

/** A captured time-of-day comparison pair as PNG data URLs. */
export interface TimeComparePair {
  /** The scene at time preset A. */
  imageA: string
  /** The scene at time preset B. */
  imageB: string
}

/** Injected effects for {@link captureTimeComparePair} — all impure work lives here. */
export interface TimeCompareCaptureDeps {
  /** Current time mode ('system' | 'manual'), to restore afterwards. */
  getTimeMode: () => TimeMode
  /** Current manual hour, to restore afterwards (ignored when mode is 'system'). */
  getManualHour: () => number
  /** Jump to a named time preset (sets mode to 'manual' at that preset's hour). */
  setPresetTime: (preset: TimePreset) => void
  /** Restore the time mode exactly (used to get back to 'system' if that's where
   *  the user was). */
  setTimeMode: (mode: TimeMode) => void
  /** Restore the manual hour exactly. */
  setManualHour: (hour: number) => void
  /** Grab the current scene frame as a PNG data URL, or null if unavailable. */
  capture: () => string | null
  /** Resolve after `ms` (lets the demand-loop re-render before a readback). */
  wait: (ms: number) => Promise<void>
  /** Settle delay between a time change and the capture (default 380ms). */
  settleMs?: number
}

/** Default settle delay — matches the render-compare / staging-reveal capture cadence. */
export const TIME_COMPARE_SETTLE_MS = 380

/**
 * Capture the scene at time preset A, then at time preset B — the SAME camera
 * both times — always restoring the caller's prior time mode/hour (even if a
 * capture throws).
 *
 * Throws a user-facing message if the canvas isn't capturable (3D view closed).
 */
export async function captureTimeComparePair(
  presetA: TimePreset,
  presetB: TimePreset,
  deps: TimeCompareCaptureDeps,
): Promise<TimeComparePair> {
  const settle = deps.settleMs ?? TIME_COMPARE_SETTLE_MS
  const prevMode = deps.getTimeMode()
  const prevHour = deps.getManualHour()

  try {
    deps.setPresetTime(presetA)
    await deps.wait(settle)
    const imageA = deps.capture()
    if (!imageA) throw new Error('Open the 3D view first, then compare.')

    deps.setPresetTime(presetB)
    await deps.wait(settle)
    const imageB = deps.capture()
    if (!imageB) throw new Error('Could not capture the second time of day.')

    return { imageA, imageB }
  } finally {
    // Restore the exact prior time state — never leave the scene on a preset.
    deps.setTimeMode(prevMode)
    if (prevMode === 'manual') deps.setManualHour(prevHour)
  }
}
