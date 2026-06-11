/**
 * Module singleton exposing the live scene + camera to the HQ-render modal —
 * the same pattern as `captureCanvas.ts` / `capturePanorama.ts`, registered by
 * `HqRenderController` inside the Canvas.
 */

import type { Camera, Scene } from 'three'

export interface HqRenderSource {
  scene: Scene
  camera: Camera
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
