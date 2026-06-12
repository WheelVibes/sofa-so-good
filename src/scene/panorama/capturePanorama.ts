/**
 * Module singleton holding the "capture a 360° equirect panorama" function,
 * registered by PanoramaController (which owns the live gl/scene/camera) —
 * the panorama-flavoured sibling of `captureCanvas.ts`, so the DOM-side
 * PanoramaModal can capture without prop-drilling the renderer.
 *
 * Async: the capture first lets the camera-facing wall-reveal fade back to
 * fully opaque (otherwise revealed walls leave see-through holes in the
 * panorama), which takes a few rendered frames.
 */

export interface PanoramaResult {
  /** The assembled equirectangular image (width = 2 × height). */
  canvas: HTMLCanvasElement
}

export interface PanoramaCaptureOptions {
  /** Explicit capture eye position [x, y, z] in world metres. When absent the
   *  capture stands at the current viewpoint (walk camera / orbit pivot) —
   *  the 360° tour uses this to capture each stop without moving the camera. */
  eye?: [number, number, number]
}

type CaptureFn = (opts?: PanoramaCaptureOptions) => Promise<PanoramaResult | null>

let capture: CaptureFn | null = null

export function setPanoramaCapture(fn: CaptureFn | null): void {
  capture = fn
}

/** Capture a panorama from the current viewpoint (or an explicit eye),
 *  or null if unavailable. */
export async function capturePanorama(
  opts?: PanoramaCaptureOptions,
): Promise<PanoramaResult | null> {
  try {
    return (await capture?.(opts)) ?? null
  } catch {
    return null
  }
}
