/**
 * Module singleton exposing the live scene + camera to the HQ-render modal —
 * the same pattern as `captureCanvas.ts` / `capturePanorama.ts`, registered by
 * `HqRenderController` inside the Canvas.
 */

import type { Camera, Scene, WebGLRenderer } from 'three'

export interface HqRenderSource {
  scene: Scene
  camera: Camera
  /** The LIVE renderer, so the still can read the graded `toneMappingExposure`
   *  the viewport is actually using (HQ-TONE-MATCH). `Lighting` rewrites it every
   *  frame from the day/night curve plus the user's exposure, so there is no pure
   *  function to recompute it from — reading it is the only way to match. */
  gl: WebGLRenderer
}

let source: (() => HqRenderSource) | null = null

export function setHqRenderSource(fn: (() => HqRenderSource) | null): void {
  source = fn
}

/** The live scene/camera, or null outside the 3D view. */
export function getHqRenderSource(): HqRenderSource | null {
  try {
    return source?.() ?? null
  } catch {
    return null
  }
}
