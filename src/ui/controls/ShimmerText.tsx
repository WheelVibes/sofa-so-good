import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { useAmbientFx } from '../useAmbientFx'

/**
 * Progress-label shimmer (UIUX-22, the Motion-Primitives text-shimmer
 * mechanic): a soft highlight sweeps across the text while `active`, telling
 * the user work is in flight. Continuous animation, so it follows the P7
 * ambient-fx mandate: gated by `useAmbientFx()` (flag + quality tier +
 * reduced-motion — dormant in the default Performance tier), and
 * IntersectionObserver-paused while off-screen. When the gate is off it
 * renders plain static text — the copy is the content, the sweep is garnish.
 */
export function ShimmerText({
  active = true,
  children,
  className,
  style,
}: {
  active?: boolean
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const fx = useAmbientFx()
  const on = fx && active
  const ref = useRef<HTMLSpanElement>(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!on || typeof IntersectionObserver === 'undefined') return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setPaused(!e?.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [on])

  const cls = [on ? 'shimmer-text' : '', on && paused ? 'paused' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <span ref={ref} className={cls || undefined} style={style}>
      {children}
    </span>
  )
}
