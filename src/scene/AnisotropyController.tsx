import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { setMaxAnisotropy } from '../materials/anisotropy'

/**
 * Reads the renderer's true maximum texture anisotropy on first render and
 * publishes it to the shared `materials/anisotropy` cap (RD-401). Textures
 * created before the renderer existed (module-load singletons, procedural
 * worker hot-swaps) get the default cap; this re-applies the real device max to
 * all of them so floors/walls/wood stay crisp at grazing angles.
 *
 * Mounted in every Canvas (main scene + room editor) so whichever renders first
 * resolves the cap. `getMaxAnisotropy()` is cheap + cached by three; re-running
 * it on a re-created context (context loss) re-clamps to the new renderer.
 */
export function AnisotropyController() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    setMaxAnisotropy(gl.capabilities.getMaxAnisotropy())
  }, [gl])
  return null
}
