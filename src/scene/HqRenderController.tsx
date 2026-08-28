import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { setHqRenderSource } from './pathtrace/hqRenderSource'

/** Registers the live scene + camera for the HQ-render modal (the path-traced
 *  still uses its OWN offscreen renderer — only the graph + pose are shared). */
export function HqRenderController() {
  const { scene, camera, gl } = useThree()
  useEffect(() => {
    setHqRenderSource(() => ({ scene, camera, gl }))
    return () => setHqRenderSource(null)
  }, [scene, camera, gl])
  return null
}
