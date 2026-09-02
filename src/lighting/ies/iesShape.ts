/**
 * Bridge between the stateful IES registry and the pure lux model.
 *
 * `luxGrid.ts` is deliberately pure, so it takes an `iesShape` resolver instead
 * of importing `iesStore` (which carries module state for uploaded profiles).
 * This is that resolver: profile id + vertical angle → a distribution-shape
 * factor in `[0, 1]` relative to the profile's own peak.
 *
 * An unknown/unloaded profile id resolves to 1 — i.e. the fixture computes
 * isotropically, exactly as it did before — rather than zeroing it out. A
 * missing profile must never make a room read as dark.
 */

import { relativeIntensityAt } from './iesProfile'
import { resolveIesProfile } from './iesStore'

export function iesShapeFactor(profileId: string, angleDeg: number): number {
  const profile = resolveIesProfile(profileId)
  if (!profile) return 1
  return relativeIntensityAt(profile, angleDeg)
}
