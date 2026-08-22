import { useEffect, useRef, useState } from 'react'

/** Duration of the settle (ms) — interaction feedback stays ≤300ms (DESIGN.md). */
const DUR_MS = 300

/**
 * Animated numeric readout (UIUX-21, the Motion-Primitives "animated number"
 * mechanic without the dependency): returns a display value that eases from the
 * previous number to `value` over ~300ms (rAF lerp, easeOutCubic), so a budget
 * total rolls to its new figure instead of teleporting. Snaps immediately under
 * `prefers-reduced-motion`, on the first render, and for non-finite values.
 * Render the result with `tabular-nums`/`.mono` so digits don't jitter.
 */
export function useAnimatedNumber(value: number): number {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    if (
      from === value ||
      !Number.isFinite(value) ||
      !Number.isFinite(from) ||
      (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    ) {
      fromRef.current = value
      setDisplay(value)
      return
    }
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / DUR_MS)
      const eased = 1 - (1 - t) ** 3
      const v = from + (value - from) * eased
      fromRef.current = v
      setDisplay(t >= 1 ? value : v)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value])

  return display
}
