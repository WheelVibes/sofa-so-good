import { useEffect } from 'react'
import { useStore } from '../state/store'

/**
 * Retired (RD-410). This used to drop a drei `AccumulativeShadows` ground plane
 * in while the camera was parked, to converge an area-light-soft ground shadow.
 *
 * That works for a single hero object floating over an empty floor — but this
 * scene is a whole apartment that already has its own floor, real-time PCF sun
 * shadows (medium+), under-furniture contact-shadow blobs, and corner AO. The
 * accumulator's 19 m catcher plane (1.5× the apartment's longest side, lying at
 * y≈0.01) therefore caught the building's own silhouette and rendered it as a
 * large dark rectangle on the ground — bigger than the footprint — the reported
 * artifact. The single synchronous frame the capture path renders never even
 * converged the accumulation, so it added the unconverged plane for no benefit.
 *
 * Grounding is fully covered by the cues above, so the plane is gone. The
 * component is kept (mounted once, renders nothing) only to guarantee the
 * `showcaseAccumulating` store flag is pinned `false` — so the demand-mode render
 * pump idles and per-item contact shadows are never suppressed (`FurnitureLayer`)
 * regardless of any stale override.
 */
export function ShowcaseController() {
  useEffect(() => {
    if (useStore.getState().showcaseAccumulating) {
      useStore.getState().setShowcaseAccumulating(false)
    }
  }, [])
  return null
}
