import { MeshReflectorMaterial } from '@react-three/drei'
import type { RenderTier } from '../../scene/quality'
import { useStore } from '../../state/store'
import { MetalMaterial } from './MetalMaterial'
import { useMirrorRelevance } from './useMirrorRelevance'

/**
 * Material for a mirror pane. On the High / Maximum render tiers it renders a
 * real planar reflection of the room (drei's MeshReflectorMaterial re-renders
 * the scene from the mirror's plane each frame, so you see the actual opposite
 * wall + furniture — the space-enlarging effect). On Performance / Medium it
 * falls back to the cheap fake-shiny pane (low roughness + metalness + IBL,
 * faint emissive so it never reads black), keeping the GPU-less default fast.
 *
 * Used as the material child of an existing pane mesh — geometry is unchanged.
 */

/** Tier → reflector settings. `real` gates the planar reflector; resolution
 *  scales the reflection render-target cost with the tier. Pure for testing. */
export function mirrorReflectorConfig(tier: RenderTier): { real: boolean; resolution: number } {
  if (tier === 'maximum') return { real: true, resolution: 1024 }
  if (tier === 'high') return { real: true, resolution: 512 }
  return { real: false, resolution: 0 }
}

export function MirrorMaterial({ tint = '#dfe8ee' }: { tint?: string }) {
  const tier = useStore((s) => s.qualityTier)
  const { real: tierAllowsReal, resolution } = mirrorReflectorConfig(tier)
  // MIRROR-RELEVANCE: the tier only says the reflection is PERMITTED. Whether it
  // is worth an entire extra scene pass right now depends on how big the pane is
  // on screen and on the global reflection budget — see `mirrorRelevance.ts`.
  const { real, attachRef } = useMirrorRelevance(tierAllowsReal)

  if (real) {
    return (
      <MeshReflectorMaterial
        ref={attachRef}
        resolution={resolution}
        mirror={1}
        // Sharp, undistorted mirror (no glossy-floor blur).
        blur={[0, 0]}
        mixBlur={0}
        mixStrength={1.1}
        roughness={0}
        metalness={0}
        color={tint}
      />
    )
  }
  // Fallback: tier-cheap fake reflection (matches the pre-existing mirror look).
  // Still ref'd, so the relevance gate can keep measuring this pane and upgrade
  // it when the camera comes close enough.
  return (
    <MetalMaterial
      ref={attachRef}
      color={tint}
      roughness={0.07}
      metalness={0.7}
      envMapIntensity={2.0}
      emissive="#b9c6d0"
      emissiveIntensity={0.16}
    />
  )
}
