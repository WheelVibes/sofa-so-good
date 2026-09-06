import { Suspense } from 'react'
import { isFeatureEnabled } from '../features/featureFlags'
import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'
import { lazyWithRetry } from '../ui/app/lazyWithRetry'
import { useQuality } from './useQuality'

// The post-processing stack (Bloom + SMAA + N8AO) and its dependencies are
// only used on the high tier. Lazy-load them so low/medium users — the fast
// path — never download the heavy postprocessing/n8ao code.
const EffectsImpl = lazyWithRetry(() => import('./EffectsImpl'))

/**
 * Mounts the high-tier post-processing stack when quality enables it; renders
 * nothing (and pulls in no postprocessing code) otherwise.
 *
 * Raster depth-of-field (PC2-CAM-DOF-LENS) is wired here from the shared store
 * lens/DoF model: it mounts only when the tier allows it (`quality.dof`, i.e.
 * high/maximum), the `cameraDof` feature flag is on, and the user has chosen a
 * non-zero aperture (`dofFStop`). Focus is the shared metres value
 * (`dofFocusDistance`); a lower f-stop → a larger bokeh + tighter focus range.
 */
/**
 * WALL-NO-COMPOSER invariant (v0.31.5.67), as a pure decision so it can be
 * tested without rendering: **a composer mounts for EVERY tier.** Returning
 * `null` here is what broke `performance` — see the comment in {@link Effects}.
 * `full` and `ao` only decide WHICH passes it carries, never whether it exists.
 */
export function composerPlan(q: { postprocessing: boolean; ao: boolean }): {
  mount: true
  full: boolean
  ao: boolean
} {
  return { mount: true, full: q.postprocessing, ao: q.ao }
}

/**
 * @param allowOrbitStudio ORBIT-STUDIO-LOOK. Only the main `Scene` passes it —
 * `RoomEditorScene` is a second canvas over the SAME store whose `cameraMode` is
 * also `'orbit'`, so the mode alone cannot separate the dollhouse from the
 * isolated-room editor. Structural, exactly as for `<Lighting allowOrbitStudio />`.
 */
export function Effects({ allowOrbitStudio = false }: { allowOrbitStudio?: boolean } = {}) {
  const { postprocessing, ao, aoFullRes, cinematic, dof } = useQuality()
  const cameraMode = useStore((s) => s.cameraMode)
  const orbitStudioFlag = useFeature('orbitStudioLook')
  const dofFStop = useStore((s) => s.dofFStop)
  const dofFocusDistance = useStore((s) => s.dofFocusDistance)
  //
  // WALL-NO-COMPOSER (v0.31.5.67): this used to `return null` when neither the
  // full stack nor AO was wanted, which made `performance` the only tier that
  // rasterised straight into the canvas' DEFAULT framebuffer. That framebuffer
  // is created with `preserveDrawingBuffer: true` (`Scene.tsx`, for the in-app
  // PNG/video capture), and in that combination interior WALL FACES are not
  // drawn at all — measured across headless-metal, headless-gl and a real
  // browser window. Mounting even a minimal composer moves the scene into an
  // offscreen target and the walls come back.
  //
  // The minimal composer is not empty: under a composer three does NOT apply
  // `gl.toneMapping` (see `toneMappingPost.ts`), so it must still carry the view
  // transform or the tier would render raw linear HDR. `ao={false}` keeps N8AO
  // off, which is the whole point of this tier.
  const dofEnabled = dof && isFeatureEnabled('cameraDof') && dofFStop > 0
  // The AO half of ORBIT-STUDIO-LOOK: a metre-scale kernel for the 15 m orbit
  // viewing distance. Walk keeps AO-SMALL-ROOM's 0.7 m / 5 byte-identical.
  const orbitStudio = allowOrbitStudio && orbitStudioFlag && cameraMode === 'orbit'
  return (
    <Suspense fallback={null}>
      <EffectsImpl
        ao={ao}
        full={postprocessing}
        aoFullRes={aoFullRes}
        cinematic={cinematic}
        dof={dofEnabled}
        dofFStop={dofFStop}
        dofFocusDistance={dofFocusDistance}
        orbitStudio={orbitStudio}
      />
    </Suspense>
  )
}
