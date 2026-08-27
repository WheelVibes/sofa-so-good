import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Material, Mesh } from 'three'
import { useStore } from '../state/store'

/**
 * Pre-compiles the shader variant the wall reveal is about to need, while a
 * loading overlay is still covering the canvas (SHADER-WARMUP).
 *
 * ## The measured defect
 *
 * Steady-state cost at Maximum is tight — p50 10.9 / p90 11.4 / p99 12.0 ms over
 * ~1480 orbit frames, all inside the 16.67 ms budget. But one frame inside the
 * first ~44 costs **204–214 ms and compiles +25 to +29 shader programs**
 * (`scripts/dev-probes/frame-spikes.mjs`). So the tiers are not slow; the user's
 * FIRST interaction stalls for a fifth of a second — invisible to a p90, and
 * exactly when an impression is formed.
 *
 * ## Why it happens
 *
 * A material census across that gesture reads **+0 materials but +29 programs**:
 * nothing is being created, EXISTING materials are recompiling. The cause is
 * `material.transparent`. three derives a program parameter from it —
 * `opaque: material.transparent === false && blending === NormalBlending &&
 * alphaToCoverage === false` — so `transparent` is part of the program cache key,
 * and flipping it false → true forces a fresh compile.
 *
 * The wall reveal flips exactly that, on the first frame of the first camera
 * gesture, across every fading surface at once: `WallSegment`, `useWallReveal`,
 * `PlanShell`, `PlanRoomShell`, `Skirting`, `Door`, `Window` all set
 * `transparent = opacity < 0.985`. ~29 distinct materials cross that threshold
 * together, so ~29 programs compile in one frame.
 *
 * ## The fix
 *
 * Compile the *other* variant up front. This flips every scene material to
 * `transparent: true`, asks three to compile, and restores the original flags —
 * all inside ONE task, so no frame can render in the flipped state. Afterwards
 * both variants are in three's program cache, and the reveal's flip is a cache
 * hit instead of a compile.
 *
 * Two notes for anyone changing this:
 *  - **An earlier version of this file was reverted for not working.** It called
 *    `compileAsync(scene, camera)` in the CURRENT state and drove extra frames.
 *    That warms only the variant already being rendered, which is by definition
 *    the one that is already compiled — it moved the spike not at all, across
 *    several variants (immediate rAFs, and spread over 1.5 s to cover the lazy
 *    `EffectsImpl` import). Warming the *opposite* `transparent` state is the
 *    part that matters.
 *  - It deliberately does NOT make `transparent` permanently true, which would
 *    also avoid the recompile: that would move these surfaces into the sorted
 *    transparent pass for the whole session and change draw ordering against
 *    opaque geometry. Pre-warming keeps runtime behaviour byte-identical.
 *
 * Fire-and-forget: a driver that refuses to pre-compile just falls back to the
 * old lazy behaviour. Nothing here changes what is rendered.
 */
export function ShaderWarmup() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const sceneReady = useStore((s) => s.sceneReady)
  const tier = useStore((s) => s.qualityTier)
  // A tier change legitimately needs a fresh pass (new defines → new programs);
  // an unrelated re-render must not, because compiling is not free.
  const warmed = useRef<string | null>(null)

  useEffect(() => {
    if (!sceneReady) return
    if (warmed.current === tier) return
    warmed.current = tier

    const flipped: Array<[Material, boolean]> = []
    try {
      scene.traverse((o) => {
        const mesh = o as Mesh
        if (!mesh.isMesh || !mesh.material) return
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (m.transparent) continue
          flipped.push([m, m.transparent])
          m.transparent = true
          // `needsUpdate` is what makes three re-derive the program parameters;
          // without it the cached program for the old key is reused and nothing
          // is warmed.
          m.needsUpdate = true
        }
      })
      if (flipped.length === 0) return
      const r = gl as unknown as {
        compileAsync?: (s: unknown, c: unknown) => Promise<unknown>
        compile?: (s: unknown, c: unknown) => unknown
      }
      // Programs are CREATED synchronously by both of these; `compileAsync` only
      // defers the promise until parallel compilation finishes. So the restore
      // below still happens in this same task, before any frame can render.
      const p = r.compileAsync?.(scene, camera)
      if (!p) r.compile?.(scene, camera)
      else p.then(undefined, () => {})
    } catch {
      // Mid-teardown or an uncooperative driver — fall through to the restore.
    } finally {
      for (const [m, was] of flipped) {
        m.transparent = was
        m.needsUpdate = true
      }
    }
  }, [gl, scene, camera, sceneReady, tier])

  return null
}
