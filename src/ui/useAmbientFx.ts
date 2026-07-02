import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'

/**
 * The single gate for decorative ambient effects (P7): the `ambientFx` flag AND
 * a non-`performance` `qualityTier` AND no `prefers-reduced-motion`. Dormant by
 * default — Performance is every device's default tier — so these effects cost
 * nothing until a user opts into a heavier tier. Every effect consumes this and
 * renders nothing when it returns false.
 *
 * Continuously-animating effects (the HQ border-beam) additionally mount only
 * while active and IntersectionObserver-pause off-screen; event-driven ones (the
 * catalog radial gradient) need only this gate.
 */
export function useAmbientFx(): boolean {
  const on = useFeature('ambientFx')
  const tier = useStore((s) => s.qualityTier)
  const reduce =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return on && tier !== 'performance' && !reduce
}
