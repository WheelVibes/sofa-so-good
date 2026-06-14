/**
 * Module singleton holding a getter for the live three.js scene root, registered
 * by SceneExportController (which has the in-Canvas `scene` from `useThree`).
 * Lets DOM-side features (the 3D-export menu items / ⌘K command) grab the scene
 * graph for GLTF/OBJ export without prop-drilling the renderer out of the
 * Canvas — mirrors `captureCanvas.ts` for the PNG export path.
 */
import type { Object3D } from 'three'

let getter: (() => Object3D | null) | null = null

export function setSceneRootGetter(fn: (() => Object3D | null) | null): void {
  getter = fn
}

/** The live scene root, or null if the Canvas isn't mounted / ready. */
export function getSceneRoot(): Object3D | null {
  try {
    return getter?.() ?? null
  } catch {
    return null
  }
}
