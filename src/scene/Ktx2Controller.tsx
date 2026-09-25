import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { contextRestoreVersion, subscribeContextRestore } from './contextRestoreSignal'
import { bindKtx2Renderer } from './ktx2'

/**
 * Binds the shared `KTX2Loader` to this Canvas's renderer (`src/scene/ktx2.ts`), the sibling of
 * `AnisotropyController` for `getMaxAnisotropy()` — the same "a capability that only the live
 * context can answer" shape.
 *
 * **The bind runs in `useMemo`, not `useEffect`, and that is the point.** `KTX2Loader.load()`
 * throws while `detectSupport` has not run, and drei's `useGLTF` starts its fetch *during render*
 * of whichever component suspends first. Effects commit after the whole subtree has rendered, so
 * an effect-based bind would be ordered after the first GLB request rather than before it. A
 * memoised bind keyed on the renderer is synchronous, idempotent (`bindKtx2Renderer` re-detects and
 * keeps the existing loader when the answer is unchanged) and ordered before every sibling that
 * follows this component in the tree — so mount it FIRST inside the Canvas.
 *
 * **Re-runs on context restore.** A lost context destroys the GL-side extension registry;
 * `ContextLossGuard` bumps `contextRestoreSignal` on `webglcontextrestored` and this re-detects,
 * replacing the loader outright if the supported format set actually changed (see `ktx2.ts` for why
 * an in-place re-detect cannot reach already-spawned transcode workers).
 */
export function Ktx2Controller() {
  const gl = useThree((s) => s.gl)
  const restoreVersion = useSyncExternalStore(
    subscribeContextRestore,
    contextRestoreVersion,
    contextRestoreVersion,
  )
  // Render-time bind; see the docblock. `restoreVersion` is a deliberate RE-RUN TRIGGER, not a
  // value either body reads — a linter cannot see a dependency whose only purpose is invalidation
  // (same shape as `VisibilityLightmaps`'s `floorPlan` key).
  // biome-ignore lint/correctness/useExhaustiveDependencies: restoreVersion is an invalidation key
  useMemo(() => bindKtx2Renderer(gl), [gl, restoreVersion])
  // Belt and braces for the case where a restore does not itself trigger a re-render of this
  // component (nothing else in the subtree changed): the effect re-runs on the same key.
  // biome-ignore lint/correctness/useExhaustiveDependencies: restoreVersion is an invalidation key
  useEffect(() => {
    bindKtx2Renderer(gl)
  }, [gl, restoreVersion])
  return null
}
