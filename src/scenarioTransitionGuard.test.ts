import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SCENARIO-TRANSITION-GUARD (v0.31.8.90) — a scenario that switches camera mode
 * and then screenshots must wait for the transition splash to clear.
 *
 * ## Why this is a test and not a convention
 *
 * `setCameraMode` raises a full-screen "Entering walkthrough…" / "Switching to
 * overview…" splash, and the scene swap **blocks the main thread for 3-6 s** in
 * the headless harness — long enough that even `transitionHide.ts`'s 2000 ms
 * safety timeout fires late. A scenario that follows the switch with a fixed
 * `wait` screenshots the SPLASH, and the failure is SILENT: the run goes green
 * and the reviewer sees a plausible-looking loading screen.
 *
 * Two shipped scenarios were doing exactly that, undetected for ~40 releases
 * (`backdrop-walk-simple` v0.31.8.88, `backdrop-upload-simple` v0.31.8.89).
 * Auditing the rest found **34 more sites across 28 files**. That is not a
 * convention anyone will remember — hence a guard.
 *
 * ## The rule
 *
 * Between a step that CHANGES `cameraMode` and the next `screenshot`, there must
 * be a `waitFor` on `[data-transition-overlay]` with `visible: false`. Waiting on
 * `state.loading.active === false` is NOT sufficient (the overlay outlives the
 * flag by `MIN_VISIBLE_MS` + `FADE_MS`), and matching the label TEXT is not
 * either — `visible` ignores `opacity`. All three dead ends are written up in
 * `docs/visual-verification-playbook.md`.
 *
 * ## What is deliberately NOT flagged
 *
 * - `setCameraMode` to the mode already active: `cameraSlice` gates the splash on
 *   `changed`, so there is nothing to wait for.
 * - a transition taken while the ROOM EDITOR is active: it owns the overlay, so
 *   again no splash.
 * - the scenario that TESTS the overlay lifecycle — see `EXEMPT_SCENARIOS`.
 * - a transition with no screenshot after it — nothing can capture the splash.
 */

const DIR = 'scripts/scenarios'

interface Step {
  name?: string
  wait?: number
  screenshot?: unknown
  store?: { action?: string; args?: unknown[] }
  waitFor?: { css?: string; visible?: boolean }
  eval?: unknown
}

/** The mode a step switches to, or null. Covers both the `store` action form and
 *  a raw `setCameraMode('…')` inside an `eval`. */
function modeSetBy(s: Step): string | null {
  if (s.store?.action === 'setCameraMode') {
    const a = s.store.args?.[0]
    return typeof a === 'string' ? a : null
  }
  const m = /setCameraMode\(\s*['"](\w+)['"]/.exec(JSON.stringify(s))
  return m?.[1] ?? null
}

function isGoneWait(s: Step): boolean {
  return s.waitFor?.css === '[data-transition-overlay]' && s.waitFor?.visible === false
}

/**
 * Scenarios exempt from the rule, each for a structural reason — NOT because the
 * guard was inconvenient there.
 *
 * - `view-modes-journey` switches mode with the ROOM EDITOR active, and the
 *   editor owns the overlay, so `cameraSlice` raises no splash to wait for.
 * - `transition-overlay-readiness` is the scenario whose SUBJECT is the overlay
 *   lifecycle: it asserts the splash appears, holds and auto-hides. Adding the
 *   standard guard there made its own `walk-overlay-appears` step time out,
 *   because the guard consumed the very appearance the scenario exists to
 *   observe. Its bespoke waits are the point.
 */
const EXEMPT_SCENARIOS = new Set(['view-modes-journey.json', 'transition-overlay-readiness.json'])

describe('scenario camera-mode transitions wait for the splash', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))

  it('finds the scenario corpus', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('has no camera switch that screenshots before the overlay clears', () => {
    const offenders: string[] = []
    for (const file of files) {
      if (EXEMPT_SCENARIOS.has(file)) continue
      const steps = (JSON.parse(readFileSync(join(DIR, file), 'utf8')).steps ?? []) as Step[]
      let current = 'orbit'
      steps.forEach((step, i) => {
        const mode = modeSetBy(step)
        if (!mode || mode === current) return
        current = mode
        for (const next of steps.slice(i + 1)) {
          if (isGoneWait(next)) return
          if (next.screenshot !== undefined) {
            offenders.push(`${file}: ${step.name ?? `step ${i}`} -> ${String(next.name)}`)
            return
          }
          if (modeSetBy(next)) return
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
