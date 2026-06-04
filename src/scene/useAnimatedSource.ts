import { useEffect } from 'react'
import { registerAnimatedSource } from './animatedSources'

/**
 * Marks the calling component as a continuous per-frame animation source while
 * it is mounted, so RenderPump keeps the demand-mode render loop alive (e.g. a
 * fan whose blades must keep spinning when the scene is otherwise idle).
 */
export function useAnimatedSource(): void {
  useEffect(() => registerAnimatedSource(), [])
}
