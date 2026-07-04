import { useEffect, useState } from 'react'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Drives a smooth collapse/expand for a bottom-sheet's body (inspector + catalog
 * minimize on mobile) while KEEPING the body unmounted once fully collapsed — so
 * a minimized inspector still doesn't re-render its (potentially per-frame,
 * during a drag) contents. Pairs with the `.sheet-collapse` grid-rows CSS:
 *
 *   const { mounted, collapsed } = useCollapseTransition(minimized)
 *   {mounted && (
 *     <div className={`sheet-collapse${collapsed ? ' collapsed' : ''}`}>
 *       <div className="sheet-collapse-inner">…body…</div>
 *     </div>
 *   )}
 *
 * Expand: mount collapsed (0fr) → next frame un-collapse (→1fr) so the grid-rows
 * transition runs. Collapse: set collapsed (→0fr), then unmount after the
 * animation. Reduced-motion resolves instantly (no rAF/timer, no transition).
 */
export function useCollapseTransition(
  collapsed: boolean,
  durationMs = 240,
): { mounted: boolean; collapsed: boolean } {
  const [state, setState] = useState(() => ({ mounted: !collapsed, collapsed }))

  useEffect(() => {
    if (prefersReducedMotion()) {
      setState({ mounted: !collapsed, collapsed })
      return
    }
    if (!collapsed) {
      // Expand: ensure it's mounted (collapsed if it was unmounted), then
      // un-collapse on a later frame so the 0fr→1fr transition actually animates.
      setState((s) => ({ mounted: true, collapsed: s.mounted ? s.collapsed : true }))
      let raf2 = 0
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setState({ mounted: true, collapsed: false }))
      })
      return () => {
        cancelAnimationFrame(raf1)
        if (raf2) cancelAnimationFrame(raf2)
      }
    }
    // Collapse: animate to 0fr, then unmount once the animation has run.
    setState((s) => ({ mounted: s.mounted, collapsed: true }))
    const t = window.setTimeout(() => setState({ mounted: false, collapsed: true }), durationMs)
    return () => window.clearTimeout(t)
  }, [collapsed, durationMs])

  return state
}
