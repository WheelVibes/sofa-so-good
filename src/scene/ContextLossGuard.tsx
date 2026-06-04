import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

/**
 * Safety net for WebGL context loss. By default a lost context leaves the canvas
 * blank (white) forever — the browser only attempts to RESTORE a context if the
 * `webglcontextlost` event was `preventDefault()`-ed. Under extreme main-thread
 * load (e.g. importing thousands of models) the GPU watchdog can drop the
 * context; this catches that, lets the browser restore it, and forces a repaint
 * on `webglcontextrestored` so the scene comes back instead of staying white.
 *
 * The real fix for the import case is not starving the loop in the first place
 * (batched store writes) — this is belt-and-suspenders for the worst case.
 */
export function ContextLossGuard() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const canvas = gl.domElement
    const onLost = (e: Event) => {
      // Required for the browser to attempt a restore.
      e.preventDefault()
      console.warn('[ContextLossGuard] WebGL context lost — awaiting restore')
    }
    const onRestored = () => {
      console.warn('[ContextLossGuard] WebGL context restored — repainting')
      invalidate()
    }
    canvas.addEventListener('webglcontextlost', onLost as EventListener, false)
    canvas.addEventListener('webglcontextrestored', onRestored as EventListener, false)
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost as EventListener)
      canvas.removeEventListener('webglcontextrestored', onRestored as EventListener)
    }
  }, [gl, invalidate])
  return null
}
