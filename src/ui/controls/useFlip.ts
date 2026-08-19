import { type RefObject, useLayoutEffect, useRef } from 'react'

/** Max animated elements per pass — beyond this a reflow reads better instant. */
const MAX_FLIP = 60

/**
 * FLIP layout animation (UIUX-36, the motion.dev layout-animation mechanic,
 * dependency-free): after `depsKey` changes, every child of `containerRef`
 * carrying `data-flip-id` that MOVED is animated from its previous position to
 * its new one (transform-only, WAAPI). Additions/removals are untouched (the
 * existing entrance patterns own those). Skipped under prefers-reduced-motion
 * and for over-large lists. Positions are re-captured every pass, so
 * consecutive changes chain correctly.
 */
export function useFlip(containerRef: RefObject<HTMLElement | null>, depsKey: unknown): void {
  const prevRects = useRef<Map<string, DOMRect>>(new Map())

  // biome-ignore lint/correctness/useExhaustiveDependencies: depsKey IS the dependency — it names the layout-affecting state.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const els = [...el.querySelectorAll<HTMLElement>('[data-flip-id]')]
    const next = new Map<string, DOMRect>()
    for (const node of els) next.set(node.dataset.flipId as string, node.getBoundingClientRect())

    const prev = prevRects.current
    prevRects.current = next
    if (prev.size === 0 || els.length > MAX_FLIP) return
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
      return

    for (const node of els) {
      const id = node.dataset.flipId as string
      const from = prev.get(id)
      const to = next.get(id)
      if (!from || !to) continue
      const dx = from.left - to.left
      const dy = from.top - to.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 240, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      )
    }
  }, [depsKey, containerRef])
}
