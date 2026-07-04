import { useEffect } from 'react'
import { registerAnimatedSource } from './animatedSources'

/**
 * Marks the calling component as a continuous per-frame animation source while
 * it is mounted, so RenderPump keeps the demand-mode render loop alive (e.g. a
 * fan whose blades must keep spinning when the scene is otherwise idle).
 *
 * Pass `enabled = false` to bow out (e.g. while the furniture-motion toggle is
 * off, bug #15) so the demand loop can idle instead of rendering forever.
 */
export function useAnimatedSource(enabled = true): void {
  useEffect(() => (enabled ? registerAnimatedSource() : undefined), [enabled])
}
