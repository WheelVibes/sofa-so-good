import { Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useSyncExternalStore } from 'react'
import { isFeatureEnabled } from '../../features/featureFlags'
import { useFeature } from '../../features/useFeature'
import { setIblActive } from '../../materials/iblSignal'
import { useStore } from '../../state/store'
import { contextRestoreVersion, subscribeContextRestore } from '../contextRestoreSignal'
import { photographicFillScale, windowFillAttenuation } from '../look'
import { useQuality } from '../useQuality'
import { lightingFromAltitude } from './altitudeCurve'
import { hdriById } from './hdriCatalog'
import { useSunPosition } from './useSunPosition'
import { getWindowAttenuation } from './windowLightSignal'

/**
 * A lightweight procedural image-based-lighting environment, built once from
 * Lightformers (no network HDR fetch). It gives PBR surfaces — varnished
 * wood, tile, marble, glass, metal — believable reflections and soft ambient
 * bounce. The IBL intensity is dialled down as the sun sets so interiors go
 * appropriately dark at night.
 *
 * NOTE: the GLB designer's "Room" preview mode carries a documented local copy
 * of this Lightformer set (`ui/glbEditor/DesignerEnvironment.tsx`) — if you
 * tune the formers here, mirror the change there (cross-referenced both ways).
 */
export function SceneEnvironment() {
  const { scene } = useThree()
  const sun = useSunPosition()
  const quality = useQuality()
  const photoFlag = useFeature('photographicFill')
  const photographicLookSetting = useStore((s) => s.photographicLook)
  const photographicLook = photographicLookSetting && photoFlag
  const enabled = quality.ibl
  // Tell the material layer whether metals have anything to reflect. Without an
  // environment a `metalness: 0.9` appliance renders pure black, so
  // `getMetalMaterial` caps metalness while this is false.
  useEffect(() => {
    setIblActive(enabled)
  }, [enabled])
  // Opt-in CC0 HDRI environment (F3/R-HDRI · PHOTO-HDRI): when the user selects an
  // HDRI (and the flag is on), it replaces the procedural Lightformer probe. The
  // default (`hdriId === null`) keeps the exact procedural probe — no look change.
  const hdriOn = useFeature('hdriEnvironment')
  const hdriId = useStore((s) => s.hdriId)
  const hdri = hdriOn ? hdriById(hdriId) : null
  // GPU-STARVE-2: the probe lives ONLY in a render target (the Lightformer bake
  // / a file HDRI's PMREM), which a WebGL context loss destroys — remount the
  // <Environment> after every restore so it re-bakes instead of staying black.
  const restoreVersion = useSyncExternalStore(subscribeContextRestore, contextRestoreVersion)

  useFrame(() => {
    if (!enabled) return
    const level = lightingFromAltitude(sun.altitude).sun // 1 day → 0 night
    // KEY-FILL-BALANCE: the probe is diffuse skylight bounce, so drawn curtains
    // dim it along with the analytical fill in `Lighting` (they used to dim the
    // SUN instead, which flattened the whole scene — see `windowFillAttenuation`).
    const fillAtten = isFeatureEnabled('curtainLightEffect')
      ? windowFillAttenuation(getWindowAttenuation())
      : 1
    // Keep a little IBL at night so reflective surfaces aren't pure black.
    // PHOTO-FILL: the IBL probe is the OTHER half of the positionless fill, and
    // the larger half by day — scaling only the analytical hemisphere/ambient
    // moved the deep-shadow fraction 1.28% -> 1.46% against a photographic
    // 11.2-12.2%. Both halves have to come down together.
    scene.environmentIntensity =
      (0.12 + level * 0.55) *
      fillAtten *
      photographicFillScale(photographicLook, useStore.getState().qualityTier)
  })

  if (!enabled) {
    if (scene.environment) scene.environment = null
    return null
  }
  // A real captured HDRI (drei loads the .hdr via RGBELoader + PMREM); shown as
  // IBL only (`background={false}` — the walk-mode backdrop owns scene.background).
  if (hdri) {
    return (
      <Environment
        key={restoreVersion}
        files={hdri.url}
        resolution={quality.envResolution}
        background={false}
      />
    )
  }
  return (
    <Environment
      key={restoreVersion}
      resolution={quality.envResolution}
      frames={1}
      background={false}
    >
      {/* Bright sky cap + cooler horizon for a soft top-down gradient. */}
      <Lightformer
        form="rect"
        intensity={1.4}
        color="#cfe0f2"
        scale={[12, 12, 1]}
        position={[0, 8, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.5}
        color="#9fb0c4"
        scale={[14, 6, 1]}
        position={[0, 2, -9]}
        rotation={[0, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.5}
        color="#9fb0c4"
        scale={[14, 6, 1]}
        position={[0, 2, 9]}
        rotation={[0, Math.PI, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.45}
        color="#b8c2cf"
        scale={[6, 6, 1]}
        position={[-9, 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.45}
        color="#b8c2cf"
        scale={[6, 6, 1]}
        position={[9, 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      {/* Warm ground bounce. */}
      <Lightformer
        form="rect"
        intensity={0.25}
        color="#6b5b48"
        scale={[14, 14, 1]}
        position={[0, -3, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      {/* Warm key aimed down-and-inward from the sun-side corner for spec variation on wood/metal. */}
      <Lightformer
        form="rect"
        intensity={0.8}
        color="#ffe6c2"
        scale={[5, 5, 1]}
        position={[5, 5, 5]}
        rotation={[Math.PI / 4, -Math.PI / 4, 0]}
      />
      {/* Cool counter-fill from the opposite corner so reflections aren't flat. */}
      <Lightformer
        form="rect"
        intensity={0.35}
        color="#c2d4ff"
        scale={[5, 5, 1]}
        position={[-5, 4, -5]}
        rotation={[Math.PI / 4, (3 * Math.PI) / 4, 0]}
      />
    </Environment>
  )
}
