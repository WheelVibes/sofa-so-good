import { MeshReflectorMaterial } from '@react-three/drei'
import type { RenderTier } from '../../scene/quality'
import { useStore } from '../../state/store'
import { MetalMaterial } from './MetalMaterial'

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
  const { real, resolution } = mirrorReflectorConfig(tier)

  if (real) {
    return (
      <MeshReflectorMaterial
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
  return (
    <MetalMaterial
      color={tint}
      roughness={0.07}
      metalness={0.7}
      envMapIntensity={2.0}
      emissive="#b9c6d0"
      emissiveIntensity={0.16}
    />
  )
}
