import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { useStore } from '../state/store'
import { setCanvasCapture } from './captureCanvas'

/** Custom event the toolbar fires to request a PNG export. */
export const EXPORT_EVENT = 'sofa:export'

/**
 * Captures the current canvas to a downloaded PNG on demand. Renders one
 * fresh frame and reads it back synchronously, so we avoid the per-frame
 * cost of `preserveDrawingBuffer` while still getting a non-blank image.
 */
export function ScreenshotController() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    // Render one frame at the highest fidelity (regardless of the live tier),
    // read it back as a PNG data URL, then restore the exact prior quality
    // state. Shared by the PNG download and the AI photoreal capture.
    const renderHiFiPng = (): string | null => {
      const store = useStore.getState()
      const prev = {
        qualityTier: store.qualityTier,
        qualityUserSet: store.qualityUserSet,
        qualityOverrides: store.qualityOverrides,
        autoShadowsOff: store.autoShadowsOff,
      }
      try {
        store.setQualityTier('high')
        store.setQualityOverride('showcase', true)
        store.setQualityOverride('postprocessing', true)
        gl.render(scene, camera)
        return gl.domElement.toDataURL('image/png')
      } catch {
        return null
      } finally {
        useStore.setState(prev)
      }
    }

    const onExport = () => {
      const url = renderHiFiPng()
      if (!url) return
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      a.href = url
      a.download = `hdb-design-${stamp}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    window.addEventListener(EXPORT_EVENT, onExport)
    setCanvasCapture(renderHiFiPng)
    return () => {
      window.removeEventListener(EXPORT_EVENT, onExport)
      setCanvasCapture(null)
    }
  }, [gl, scene, camera])
  return null
}
