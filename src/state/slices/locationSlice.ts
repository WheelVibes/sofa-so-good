import type { RootState } from '../store'
import type { SliceCreator } from './types'

interface Location {
  lat: number
  lon: number
  /** Optional human-readable label (e.g. "London, UK"). Populated when
   *  the location was selected via the city search; absent for direct
   *  geolocation or manual lat/lon entry. */
  label?: string
}

export interface LocationSlice {
  location: Location | null
  /** True once the user has explicitly skipped the prompt or denied
   *  geolocation. The prompt should not auto-open again, but the user
   *  can re-open it from the time dropdown's footer. */
  locationPromptDismissed: boolean
  setLocation: (loc: Location) => void
  dismissLocationPrompt: () => void
  /** Allows the user to reopen the prompt (e.g. via a "Change location"
   *  link). Clears `locationPromptDismissed` so the modal renders again. */
  resetLocationPrompt: () => void
}

export const LOCATION_INITIAL: Pick<LocationSlice, 'location' | 'locationPromptDismissed'> = {
  location: null,
  locationPromptDismissed: false,
}

/** Human-readable summary of a resolved location for the "Location set" toast:
 *  prefer the geocoded label (city search / reverse-geocoded geolocation),
 *  else fall back to formatted coordinates (manual entry, or geolocation
 *  when reverse-geocoding returned no label). */
function formatLocation(loc: Location): string {
  if (loc.label) return loc.label
  const lat = `${Math.abs(loc.lat).toFixed(2)}°${loc.lat >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(loc.lon).toFixed(2)}°${loc.lon >= 0 ? 'E' : 'W'}`
  return `${lat}, ${lon}`
}

export const createLocationSlice: SliceCreator<LocationSlice, RootState> = (set, get) => ({
  ...LOCATION_INITIAL,
  setLocation: (loc) => {
    set({ location: loc })
    get().notify.start({
      title: 'Location set',
      kind: 'success',
      message: formatLocation(loc),
    })
  },
  dismissLocationPrompt: () => set({ locationPromptDismissed: true }),
  resetLocationPrompt: () => set({ locationPromptDismissed: false }),
})
