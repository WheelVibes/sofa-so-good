/**
 * Count of furniture items currently running a continuous per-frame animation
 * — spinning fan blades (CeilingFan / StandingFan). RenderPump polls this each
 * rAF tick to keep the demand-mode render loop alive while any are present, so
 * fan blades never freeze. A plain module singleton (not store state) keeps
 * register/unregister out of React re-renders — same pattern as fixtureGlow.
 *
 * Each animated primitive calls `registerAnimatedSource()` on mount and invokes
 * the returned disposer on unmount (the disposer is idempotent).
 */
let count = 0

export function registerAnimatedSource(): () => void {
  count += 1
  let released = false
  return () => {
    if (released) return
    released = true
    count = Math.max(0, count - 1)
  }
}

export function animatedSourceCount(): number {
  return count
}

// Dev-only diagnostic: `window.__animatedSourceCount()` from the browser console
// shows whether anything (fan, placement drop, wall-reveal fade) is currently
// holding the demand-mode RenderPump open — 0 while a fade is visibly stuck
// mid-way means the reveal's pump registration isn't running.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __animatedSourceCount?: () => number }).__animatedSourceCount = () =>
    count
}

/** Test-only reset. */
export function __resetAnimatedSources(): void {
  count = 0
}
