import { useEffect, useRef, useState } from 'react'

/**
 * Cross-fade duration (ms) for the orbit<->walk mode-switch veil (MODE-SWITCH-CROSSFADE,
 * N3 in `docs/audit/interaction-sweep-2026-09-18.md`). Chosen to match the existing
 * overlay's own fade constant (`useOverlayLifecycle.ts:FADE_MS`) rather than invent a new
 * number -- DESIGN.md's motion scale has no token at exactly 250ms (`--dur-2` is the
 * nearest entrance token, at 300ms), and reusing FADE_MS keeps every transition in the app
 * feeling like the same mechanism even though this one is visually a plain veil, not the
 * branded splash.
 */
export const MODE_CROSSFADE_MS = 250

export interface ModeCrossfadeTimerDeps {
  now: () => number
  setTimeout: (cb: () => void, ms: number) => number
  clearTimeout: (id: number) => void
}

const domTimerDeps: ModeCrossfadeTimerDeps = {
  now: () => Date.now(),
  setTimeout: (cb, ms) => window.setTimeout(cb, ms),
  clearTimeout: (id) => window.clearTimeout(id),
}

export interface ModeCrossfadeState {
  /** Whether the veil should be in the DOM at all. */
  mounted: boolean
  /** Whether it is currently playing its fade-to-transparent (drives opacity -> 0). */
  fading: boolean
}

/**
 * Pure mount/fade timeline for the mode-switch veil, retriggered by `nonce` incrementing
 * (`cameraSlice.ts:setCameraMode` bumps `modeTransition.nonce` on every real orbit<->walk
 * switch, under the `modeSwitchCrossfade` flag).
 *
 * Unlike `useOverlayLifecycle` -- which HOLDS the branded splash up for a minimum time to
 * mask a compile that hasn't happened yet -- this assumes the compile is already paid for
 * (`ShaderWarmup` pre-warms the walk-mode backdrop program at boot; see its docstring) and
 * starts fading on the very next tick: the veil exists to make the cut a cross-fade instead
 * of a hard cut, not to buy time. It mounts already at full opacity for exactly one tick
 * (a same-frame opacity:0 would never be visible at all -- there would be nothing to
 * cross-fade FROM), then eases to transparent over `MODE_CROSSFADE_MS`, then unmounts.
 *
 * `reducedMotion` short-circuits the whole timeline: the veil never mounts, so
 * `prefers-reduced-motion` gets an instant switch with no dip at all (a11y motion rule,
 * DESIGN.md Motion section).
 *
 * A rapid second switch mid-fade (nonce bumps again before the previous timeline finished)
 * restarts from full opacity rather than layering timers -- exactly the flicker a mid-drag
 * mode switch (S8/N3's own scenario) would otherwise produce.
 */
export function useModeSwitchCrossfade(
  nonce: number,
  reducedMotion: boolean,
  deps: ModeCrossfadeTimerDeps = domTimerDeps,
): ModeCrossfadeState {
  const [mounted, setMounted] = useState(false)
  const [fading, setFading] = useState(false)
  const lastNonce = useRef(nonce)
  const timers = useRef<number[]>([])

  // React to `nonce` edges only -- `reducedMotion`/`deps` are read fresh each run but must
  // not themselves retrigger the timeline (a flag/prop identity change mid-fade is not a
  // new switch).
  // biome-ignore lint/correctness/useExhaustiveDependencies: see note above
  useEffect(() => {
    if (nonce === lastNonce.current) return
    lastNonce.current = nonce

    const clear = () => {
      timers.current.forEach(deps.clearTimeout)
      timers.current = []
    }
    clear()

    if (reducedMotion) {
      // Instant: the veil never mounts, so there is nothing to fade.
      setMounted(false)
      setFading(false)
      return clear
    }

    setMounted(true)
    setFading(false)
    timers.current.push(
      deps.setTimeout(() => {
        setFading(true)
        timers.current.push(
          deps.setTimeout(() => {
            setMounted(false)
            setFading(false)
          }, MODE_CROSSFADE_MS),
        )
      }, 0),
    )
    return clear
  }, [nonce])

  return { mounted, fading }
}
