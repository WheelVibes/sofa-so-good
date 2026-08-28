import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

/**
 * Dev-only: expose the live r3f camera + controls + gl on `window.__three`
 * so screenshot/automation harnesses can frame views deterministically
 * (orbit drag/zoom emulation is unreliable headless). Mirrors `__store`.
 * Tree-shaken out of production by the `import.meta.env.DEV` guard at the
 * mount site.
 */
export function DevCameraExpose() {
  const { camera, gl, controls, scene, raycaster, advance } = useThree()
  useEffect(() => {
    ;(window as unknown as { __three?: unknown }).__three = {
      camera,
      gl,
      controls,
      scene,
      raycaster,
      // r3f's SYNCHRONOUS render driver. A harness measuring cost must drive
      // the REAL pipeline (post composer included) — `gl.render(scene, camera)`
      // skips the composer and under-reports anything the post stack re-renders
      // the geometry for.
      advance,
    }
  }, [camera, gl, controls, scene, raycaster, advance])
  return null
}
