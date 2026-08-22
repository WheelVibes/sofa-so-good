import { useEffect, useRef } from 'react'

/**
 * Direction-aware panel switches (UIUX-34, the "smooth-tab" content mechanic):
 * given the active option's index, returns which way the selection just moved
 * so the incoming panel can slide in from that side. Pair with the
 * `.panel-slide` class + `data-dir` attribute and a `key` on the panel so React
 * remounts it (the entrance animation replays); `null` on the first render
 * (no slide on mount). Reduced-motion zeroes the animation globally.
 */
export function useSlideDir(index: number): 'left' | 'right' | null {
  const prev = useRef<number | null>(null)
  const last = prev.current
  useEffect(() => {
    prev.current = index
  }, [index])
  if (last === null || last === index) return null
  return index > last ? 'right' : 'left'
}
