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

let capture: (() => Promise<PanoramaResult | null>) | null = null

export function setPanoramaCapture(fn: (() => Promise<PanoramaResult | null>) | null): void {
  capture = fn
}

/** Capture a panorama from the current viewpoint, or null if unavailable. */
export async function capturePanorama(): Promise<PanoramaResult | null> {
  try {
    return (await capture?.()) ?? null
  } catch {
    return null
  }
}
