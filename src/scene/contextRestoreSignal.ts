/**
 * GPU-STARVE-2 — shared signal: "the WebGL context was just restored after a
 * loss". A context loss destroys every GPU-side resource; three re-uploads
 * textures/geometry from their CPU sources automatically, but anything that
 * lives ONLY in a render target is gone for good and must be re-rendered:
 * the procedural IBL probe (drei `<Environment>` renders its Lightformers into
 * a cubemap once), the PMREM of a file HDRI, and the frozen sun shadow map.
 *
 * `ContextLossGuard` bumps this on `webglcontextrestored`; `SceneEnvironment`
 * subscribes (useSyncExternalStore) and keys its `<Environment>` on the version
 * so the probe re-bakes. Module singleton + subscriber set — the sanctioned
 * DOM↔R3F signal pattern (`finishDragSignal`/`cameraForward`).
 */

let version = 0
const listeners = new Set<() => void>()

/** A context restore just happened — notify subscribers to rebuild. */
export function bumpContextRestore(): void {
  version += 1
  for (const l of listeners) l()
}

export function contextRestoreVersion(): number {
  return version
}

export function subscribeContextRestore(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test-only reset. */
export function __resetContextRestore(): void {
  version = 0
  listeners.clear()
}
