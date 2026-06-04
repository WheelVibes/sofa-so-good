/**
 * Module singleton holding a "render a hi-fi PNG of the current scene" function,
 * registered by ScreenshotController (which has the live `gl`/scene/camera).
 * Lets DOM-side features (e.g. the AI photoreal export) grab the current frame
 * as a data URL without prop-drilling the renderer out of the Canvas.
 */
let capture: (() => string | null) | null = null

export function setCanvasCapture(fn: (() => string | null) | null): void {
  capture = fn
}

/** Returns a PNG data URL of the current scene, or null if unavailable. */
export function captureCanvasPng(): string | null {
  try {
    return capture?.() ?? null
  } catch {
    return null
  }
}
