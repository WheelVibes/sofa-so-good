import { useFrame } from '@react-three/fiber'
import { notifyFrameRendered } from './frameRenderedSignal'

/** Publishes every rendered frame to `frameRenderedSignal`. Mounted in BOTH
 *  Canvases (main + room editor) so the transition overlay's readiness-based
 *  hide sees frames from whichever scene a transition swaps in. */
export function FrameRenderedNotifier() {
  useFrame(() => {
    notifyFrameRendered()
  })
  return null
}
