import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector2 } from 'three'
import { useStore } from '../state/store'
import { setCanvasCapture } from './captureCanvas'
import { boxDownsample } from './ssaaDownsample'

/** Custom event the toolbar fires to request a PNG export. */
export const EXPORT_EVENT = 'sofa:export'

/**
 * Supersampling factor for the PNG export: render at SSAA_FACTOR× the on-screen
 * resolution, then box-downsample to the target size for anti-aliased reference
 * stills. A transparent quality bump to the existing export (no new UI control),
 * so it needs no feature flag — like a perf/quality improvement.
 */
const SSAA_FACTOR = 2

/**
 * Box-downsample the supersampled drawing buffer to its target size and return a
 * PNG data URL at the target dimensions. Reads the large frame into an offscreen
 * 2D canvas, box-filters it, and re-encodes from a target-sized canvas. Returns
 * null if the 2D path is unavailable (caller falls back to the raw large frame).
 */
function downsampleToTargetPng(largeCanvas: HTMLCanvasElement, factor: number): string | null {
  if (factor <= 1) return null
  const srcW = largeCanvas.width
  const srcH = largeCanvas.height
  if (!srcW || !srcH) return null

  const readCanvas = document.createElement('canvas')
  readCanvas.width = srcW
  readCanvas.height = srcH
  const readCtx = readCanvas.getContext('2d')
  if (!readCtx) return null
  readCtx.drawImage(largeCanvas, 0, 0)
  const srcImage = readCtx.getImageData(0, 0, srcW, srcH)

  const down = boxDownsample(
    { data: srcImage.data, width: srcImage.width, height: srcImage.height },
    factor,
  )

  const outCanvas = document.createElement('canvas')
  outCanvas.width = down.width
  outCanvas.height = down.height
  const outCtx = outCanvas.getContext('2d')
  if (!outCtx) return null
  const outImage = outCtx.createImageData(down.width, down.height)
  outImage.data.set(down.data)
  outCtx.putImageData(outImage, 0, 0)
  return outCanvas.toDataURL('image/png')
}

/**
 * Captures the current canvas to a downloaded PNG on demand. Renders one
 * fresh frame and reads it back synchronously, so we avoid the per-frame
 * cost of `preserveDrawingBuffer` while still getting a non-blank image.
 */
export function ScreenshotController() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    // Capture the current frame as a supersampled PNG. We deliberately DON'T
    // touch the quality tier here: the read-back is a synchronous
    // `gl.render(scene, camera)` in a single tick, so a React-driven tier change
    // (post-processing, shadow maps, asset LOD swaps) can't take effect before
    // the read, and `gl.render` bypasses the post-processing composer anyway —
    // bumping the tier changed nothing in the captured pixels while firing the
    // "Applying … quality" transition overlay and churning the quality store,
    // which stranded the overlay and left the time-of-day lighting mid-transition
    // (SS-EXPORT-SIDE-EFFECTS). The export is now WYSIWYG (the live scene), just
    // anti-aliased. Shared by the PNG download and the AI photoreal capture.
    //
    // Supersampling (SSAA): temporarily raise the renderer's drawing-buffer
    // resolution by SSAA_FACTOR, render, then box-downsample back to the target
    // size for crisp anti-aliased stills. The 2× buffer is never presented to
    // the screen — the resize/render/restore is synchronous (no rAF between),
    // and the exact prior size + pixelRatio are restored in `finally`.
    const renderHiFiPng = (): string | null => {
      // Snapshot the exact prior renderer size + pixel ratio so we restore them
      // byte-for-byte (getSize writes into the passed Vector2).
      const prevSize = gl.getSize(new Vector2())
      const prevPixelRatio = gl.getPixelRatio()
      // Logical CSS size of the canvas — what we downsample back to.
      const targetW = prevSize.width
      const targetH = prevSize.height
      let ssaaApplied = false
      try {
        // Raise the drawing buffer by the SSAA factor without touching CSS size
        // (updateStyle = false), so the on-screen canvas element is unaffected.
        if (SSAA_FACTOR > 1 && targetW > 0 && targetH > 0) {
          gl.setPixelRatio(prevPixelRatio * SSAA_FACTOR)
          gl.setSize(targetW, targetH, false)
          ssaaApplied = true
        }

        gl.render(scene, camera)

        const large = gl.domElement as HTMLCanvasElement
        if (ssaaApplied) {
          const down = downsampleToTargetPng(large, SSAA_FACTOR)
          if (down) return down
        }
        // Fallback: no SSAA or 2D path unavailable — return the rendered frame.
        return large.toDataURL('image/png')
      } catch {
        return null
      } finally {
        // Restore the exact prior drawing-buffer size + pixel ratio. Synchronous:
        // the big buffer is never presented.
        if (ssaaApplied) {
          gl.setPixelRatio(prevPixelRatio)
          gl.setSize(targetW, targetH, false)
        }
      }
    }

    const onExport = () => {
      const url = renderHiFiPng()
      if (!url) {
        useStore.getState().notify.start({ title: 'Could not export the image', kind: 'error' })
        return
      }
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      a.href = url
      a.download = `hdb-design-${stamp}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      useStore.getState().notify.start({ title: 'Image saved to your downloads', kind: 'success' })
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
