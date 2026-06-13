import type { FeatureFlag } from '../features/featureFlags'
import { useFeature } from '../features/useFeature'
import type { BackdropKind } from '../state/slices/uiSlice'
import { useStore } from '../state/store'

export type { BackdropKind }

import { CityBackdrop } from './CityBackdrop'
import { HillsBackdrop } from './HillsBackdrop'
import { ParkBackdrop } from './ParkBackdrop'
import { SkylineBackdrop } from './SkylineBackdrop'
import { StudioBackdrop } from './StudioBackdrop'

/** A selectable scene backdrop (label/sub for the picker UI). `flag` gates the
 *  option behind a feature flag (hidden when off). */
export interface BackdropOption {
  id: BackdropKind
  label: string
  sub: string
  flag?: FeatureFlag
}

/** The selectable scene backdrops. `skyline` is the cheap equirectangular photo
 *  backdrop (zero per-frame draws), gated by `photoBackdrop`. */
export const BACKDROPS: BackdropOption[] = [
  { id: 'city', label: 'City', sub: 'HDB estate blocks' },
  { id: 'skyline', label: 'Skyline', sub: 'Flat photo horizon', flag: 'photoBackdrop' },
  { id: 'park', label: 'Park', sub: 'Trees & greenery' },
  { id: 'hills', label: 'Hills', sub: 'Calm green horizon' },
  { id: 'none', label: 'Studio', sub: 'Seamless cove' },
]

/** Backdrops whose gating flag is enabled — the options to show in the picker. */
export function visibleBackdrops(isOn: (flag: FeatureFlag) => boolean): BackdropOption[] {
  return BACKDROPS.filter((b) => !b.flag || isOn(b.flag))
}

/** Resolve the *effective* backdrop kind: `skyline` falls back to `city` when its
 *  `photoBackdrop` flag is off (e.g. a persisted choice in a build with it
 *  disabled), so the scene never renders an empty background. Pure for testing. */
export function resolveBackdrop(kind: BackdropKind, photoBackdropOn: boolean): BackdropKind {
  if (kind === 'skyline' && !photoBackdropOn) return 'city'
  return kind
}

/** The effective backdrop kind for the live scene (store choice + flag gating). */
export function useEffectiveBackdrop(): BackdropKind {
  const kind = useStore((s) => s.backdrop)
  const photoOn = useFeature('photoBackdrop')
  return resolveBackdrop(kind, photoOn)
}

/** Dispatches to the selected backdrop. Defaults to the city skyline. The Park
 *  and Hills backdrops live in their own files (instanced for cheap depth); City
 *  is the instanced HDB estate; Skyline is the flat equirectangular photo. */
export function SceneBackdrop() {
  const kind = useEffectiveBackdrop()
  if (kind === 'skyline') return <SkylineBackdrop />
  if (kind === 'park') return <ParkBackdrop />
  if (kind === 'hills') return <HillsBackdrop />
  if (kind === 'none') return <StudioBackdrop />
  return <CityBackdrop />
}
