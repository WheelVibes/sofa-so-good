import { useEffect, useRef, useState } from 'react'

/** Minimum time (ms) the overlay stays fully visible once shown, so a
 *  sub-100ms load doesn't flash it on and straight off. */
export const MIN_VISIBLE_MS = 600
/** Fade-out duration (ms) after the min-visible window elapses. */
export const FADE_MS = 250

export interface OverlayLifecycle {
  /** Whether the overlay should be in the DOM at all. */
  mounted: boolean
  /** Whether it's currently playing its fade-out (drives opacity → 0). */
  fading: boolean
}

/**
 * Min-time + fade lifecycle for the loading overlay.
 *
 * - When `active` turns true: mount immediately, cancel any pending hide.
 * - When `active` turns false: hold visible until MIN_VISIBLE_MS has elapsed
 *   since it was shown, then fade for FADE_MS, then unmount.
 * - If `active` flips back to true mid-hide, the pending hide is cancelled and
 *   the overlay stays up.
 *
 * Pure timer logic (no DOM) so it's unit-testable with fake timers. `now`
 * defaults to Date.now but is injectable for tests.
 */
export function useOverlayLifecycle(
  active: boolean,
  now: () => number = () => Date.now(),
): OverlayLifecycle {
  const [mounted, setMounted] = useState(active)
  const [fading, setFading] = useState(false)
  const shownAt = useRef<number>(active ? now() : 0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const clear = () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
    }

    if (active) {
      clear()
      setFading(false)
      if (!mounted) {
        shownAt.current = now()
        setMounted(true)
      }
      return clear
    }

    // active === false → schedule hide respecting min-visible time.
    if (!mounted) return clear
    const elapsed = now() - shownAt.current
    const holdFor = Math.max(0, MIN_VISIBLE_MS - elapsed)
    timers.current.push(
      setTimeout(() => {
        setFading(true)
        timers.current.push(
          setTimeout(() => {
            setMounted(false)
            setFading(false)
          }, FADE_MS),
        )
      }, holdFor),
    )
    return clear
    // `mounted` intentionally excluded: we react to `active` edges; including
    // it would re-run on our own setMounted and reset the hold timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return { mounted, fading }
}
