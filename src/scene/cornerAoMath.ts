import type { RenderTier } from './quality'

/**
 * Width (m) the wall-base ambient-occlusion strip reaches out into the room
 * from the wall face. A short reach keeps the cue subtle and the overdraw tiny;
 * it darkens only the floor immediately against the skirting.
 */
export const CORNER_AO_REACH = 0.32

/** Peak alpha of the strip right at the wall face (fades to 0 at the reach). */
export const CORNER_AO_OPACITY = 0.42

/**
 * Whether the cheap baked wall/floor corner-AO strips should render on a given
 * render tier.
 *
 * The strips are a *substitute* for real ambient occlusion on the GPU-light
 * tiers: the flat `performance` default has no SSAO at all, and `medium` adds
 * sun shadows + IBL but still no post-processing AO. From `high` upward the
 * post stack runs N8AO/SSAO, which already darkens corners — so the baked strip
 * is suppressed there to avoid double-darkening the same junction.
 *
 * (`postprocessing` is the property that actually carries the SSAO pass; we key
 * off the tier name rather than the resolved settings so this stays a pure,
 * dependency-free predicate — the two agree for every shipped preset.)
 */
export function cornerAoEnabledForTier(tier: RenderTier): boolean {
  return tier === 'performance' || tier === 'medium'
}

/**
 * The floor strip's dimensions in the wall's local frame, for one interior
 * face span. The wall runs along local X; the interior face sits at
 * `+thickness/2` (sign +1) or `-thickness/2` (sign -1) in local Z. The strip is
 * a horizontal quad hugging that face and reaching `CORNER_AO_REACH` into the
 * room.
 *
 * Returns the quad length (along X), depth (along Z, = reach), and the local-Z
 * centre offset of the quad (face edge + half the reach, toward the room).
 */
export function cornerAoStripDims(
  segLen: number,
  thickness: number,
  sign: 1 | -1,
  reach: number = CORNER_AO_REACH,
): { length: number; depth: number; zCenter: number } {
  const faceZ = sign * (thickness / 2)
  // Reach extends from the face outward (in the same sign direction as the face).
  const zCenter = faceZ + sign * (reach / 2)
  return { length: segLen, depth: reach, zCenter }
}
