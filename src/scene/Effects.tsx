import { Suspense } from 'react'
import { isFeatureEnabled } from '../features/featureFlags'
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
export function Effects() {
  const { postprocessing, aoFullRes, cinematic, dof } = useQuality()
  const dofFStop = useStore((s) => s.dofFStop)
  const dofFocusDistance = useStore((s) => s.dofFocusDistance)
  if (!postprocessing) return null
  const dofEnabled = dof && isFeatureEnabled('cameraDof') && dofFStop > 0
  return (
    <Suspense fallback={null}>
      <EffectsImpl
        aoFullRes={aoFullRes}
        cinematic={cinematic}
        dof={dofEnabled}
        dofFStop={dofFStop}
        dofFocusDistance={dofFocusDistance}
      />
    </Suspense>
  )
}
