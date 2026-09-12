import { getGlassMaterial } from '../../materials/furnitureMaterials'
import type { GlassKind } from '../../materials/materialRealism'
import { useStore } from '../../state/store'

/**
 * Material for a glass pane (cabinet / vase / tank / shower / appliance door).
 * On the High / Maximum render tiers it renders **real refractive glass**
 * (`MeshPhysicalMaterial` transmission + ior 1.5 + thickness) so you see
 * through it with the slight refraction + edge tint real glass has; on
 * Performance / Medium it falls back to the cheap transparent + opacity pane
 * (no transmission render pass), keeping the GPU-less default fast. Mirrors
 * `MirrorMaterial`'s tier pattern.
 *
 * Used as the material child of an existing pane mesh — geometry is unchanged.
 * `opacity` is the legacy clarity the primitive used (lower = clearer);
 * `tint` (0..1) deepens the volume tint for coloured glass (tinted doors).
 * `kind` (default `'default'`) tags what the pane physically is — pass
 * `'showerScreen'` for a shower/bath screen so it earns the
 * `showerGlassRoughnessFloor` roughness floor (see `materialRealism.ts`);
 * every other caller is unaffected.
 */
export function GlassMaterial({
  color = '#cfe0e6',
  opacity = 0.3,
  tint = 0,
  kind = 'default',
}: {
  color?: string
  opacity?: number
  tint?: number
  kind?: GlassKind
}) {
  const tier = useStore((s) => s.qualityTier)
  // The factory returns a real three Material; attach it via `primitive` so the
  // tier-correct (physical or cheap) material is used without prop drift.
  const mat = getGlassMaterial(tier, color, opacity, tint, kind)
  return <primitive object={mat} attach="material" />
}
