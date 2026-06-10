import type { BackdropKind } from '../state/slices/uiSlice'
import { useStore } from '../state/store'

export type { BackdropKind }

import { useBackdropOffset } from './backdropOffset'
import { CityBackdrop } from './CityBackdrop'
import { Ground } from './Ground'
import { HillsBackdrop } from './HillsBackdrop'
import { ParkBackdrop } from './ParkBackdrop'

/** The four selectable scene backdrops (label/sub for the picker UI). */
export const BACKDROPS: { id: BackdropKind; label: string; sub: string }[] = [
  { id: 'city', label: 'City', sub: 'HDB estate blocks' },
  { id: 'park', label: 'Park', sub: 'Trees & greenery' },
  { id: 'hills', label: 'Hills', sub: 'Calm green horizon' },
  { id: 'none', label: 'Studio', sub: 'Clean, no surroundings' },
]

/** Clean studio: just a neutral ground, no surroundings. */
function StudioBackdrop() {
  const offset = useBackdropOffset()
  return (
    <group renderOrder={-1} position={offset}>
      <Ground color="#c9c6c0" />
    </group>
  )
}

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
