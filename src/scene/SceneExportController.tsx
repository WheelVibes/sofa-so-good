import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { setSceneRootGetter } from './sceneExportAccess'

/**
 * Registers a getter for the live scene root so DOM-side 3D-export features can
 * reach the scene graph (GLTF/OBJ export) without prop-drilling the renderer out
 * of the Canvas. Mirrors ScreenshotController's `setCanvasCapture` registration.
 * Renders nothing.
 */
export function SceneExportController() {
  const { scene } = useThree()
  useEffect(() => {
    setSceneRootGetter(() => scene)
    return () => setSceneRootGetter(null)
  }, [scene])
  return null
}
