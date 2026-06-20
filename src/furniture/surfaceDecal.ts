/**
 * PC2-CONTACT-AO-DECOR — decides whether a placed item gets a small contact-shadow
 * decal under it because it's *decor resting on a surface* (a table/shelf), so it
 * reads as sitting there rather than pasted on.
 *
 * Pure (no React/three) so the qualification rule unit-tests in isolation; the
 * Furniture component renders the `ContactShadow` from the returned spec.
 *
 * Targets only **small `noClip` parametric decor** that carries a numeric
 * `surfaceHeight` prop (the props in `layout/decorStyling.ts` + the tabletop
 * defaults). Those primitives self-lift to `surfaceHeight` in local space, so the
 * decal sits at that height — just above the host top. `noClip` guarantees the
 * floor-shadow path already skipped the item, so there's no double shadow; rugs
 * (noClip but no `surfaceHeight`) and large/heavy pieces are excluded.
 */
import type { FurnitureDef } from './types'

/** Above this footprint half-extent (m) a noClip piece isn't tabletop decor. */
export const MAX_DECOR_HALF = 0.6

export interface SurfaceDecalSpec {
  /** Local-frame Y of the decal (the host surface height). */
  y: number
  /** Footprint width / depth (m) the decal is sized from. */
  w: number
  d: number
}

export function surfaceDecalSpec(
  def: Pick<FurnitureDef, 'noClip' | 'kind' | 'mounted'>,
  props: Record<string, unknown>,
  hx: number,
  hz: number,
): SurfaceDecalSpec | null {
  if (!def.noClip || def.mounted || def.kind !== 'parametric') return null
  const sh = props['surfaceHeight']
  if (typeof sh !== 'number' || sh <= 0.01) return null
  if (hx > MAX_DECOR_HALF || hz > MAX_DECOR_HALF) return null
  return { y: sh, w: hx * 2, d: hz * 2 }
}
