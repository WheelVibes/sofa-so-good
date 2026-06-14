import type { BackdropKind } from '../state/slices/uiSlice'
import { useStore } from '../state/store'

export type { BackdropKind }

import { CityBackdrop } from './CityBackdrop'
import { HillsBackdrop } from './HillsBackdrop'
import { ParkBackdrop } from './ParkBackdrop'
import { PhotoBackdrop } from './PhotoBackdrop'
import { StudioBackdrop } from './StudioBackdrop'

/** The selectable scene backdrops (label/sub for the picker UI). */
export const BACKDROPS: { id: BackdropKind; label: string; sub: string }[] = [
  { id: 'photo', label: 'Skyline photo', sub: 'Lightweight — best performance' },
  { id: 'city', label: 'City', sub: 'HDB estate blocks (3D)' },
  { id: 'park', label: 'Park', sub: 'Trees & greenery (3D)' },
  { id: 'hills', label: 'Hills', sub: 'Calm green horizon (3D)' },
  { id: 'none', label: 'Studio', sub: 'Seamless cove' },
]

/** Dispatches to the selected backdrop. The `photo` backdrop is a single
 *  equirectangular `scene.background` image (no per-frame geometry — the cheap
 *  "budget trick"); City/Park/Hills are instanced 3D estates; Studio is a cove. */
export function SceneBackdrop() {
  const kind = useStore((s) => s.backdrop)
  if (kind === 'photo') return <PhotoBackdrop />
  if (kind === 'park') return <ParkBackdrop />
  if (kind === 'hills') return <HillsBackdrop />
  if (kind === 'none') return <StudioBackdrop />
  return <CityBackdrop />
}
