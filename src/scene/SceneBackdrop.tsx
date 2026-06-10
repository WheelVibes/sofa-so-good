import type { BackdropKind } from '../state/slices/uiSlice'
import { useStore } from '../state/store'

export type { BackdropKind }

import { CityBackdrop } from './CityBackdrop'
import { HillsBackdrop } from './HillsBackdrop'
import { ParkBackdrop } from './ParkBackdrop'
import { StudioBackdrop } from './StudioBackdrop'

/** The four selectable scene backdrops (label/sub for the picker UI). */
export const BACKDROPS: { id: BackdropKind; label: string; sub: string }[] = [
  { id: 'city', label: 'City', sub: 'HDB estate blocks' },
  { id: 'park', label: 'Park', sub: 'Trees & greenery' },
  { id: 'hills', label: 'Hills', sub: 'Calm green horizon' },
  { id: 'none', label: 'Studio', sub: 'Seamless cove' },
]

/** Dispatches to the selected backdrop. Defaults to the city skyline. The Park
 *  and Hills backdrops live in their own files (instanced for cheap depth);
 *  City is the instanced HDB estate. */
export function SceneBackdrop() {
  const kind = useStore((s) => s.backdrop)
  if (kind === 'park') return <ParkBackdrop />
  if (kind === 'hills') return <HillsBackdrop />
  if (kind === 'none') return <StudioBackdrop />
  return <CityBackdrop />
}
