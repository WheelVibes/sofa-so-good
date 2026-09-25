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
   *  can re-open it from the Scene menu's "Sun position" row. */
  locationPromptDismissed: boolean
  /**
   * GEO-PROMPT-ONDEMAND (V5). Set only by {@link LocationSlice.openLocationPrompt},
   * i.e. by a real user gesture. It is the ONE way the dialog opens when the
   * auto-open path is suppressed — a showroom visitor already has a location
   * (the sender's, or the Singapore fallback) and must never be ambushed by a
   * permission primer on first paint, but they must still be able to ask for one.
   *
   * Session-only: deliberately outside `serialize()`/the schema, because a
   * "the user asked for this dialog just now" bit has no meaning after a reload.
   */
  locationPromptRequested: boolean
  setLocation: (loc: Location) => void
  dismissLocationPrompt: () => void
  /** Open the prompt on demand (the Scene menu's "Sun position" row). Wins over
   *  both `locationPromptDismissed` and an already-set location, so it doubles
   *  as "change location". */
  openLocationPrompt: () => void
}

export const LOCATION_INITIAL: Pick<
  LocationSlice,
  'location' | 'locationPromptDismissed' | 'locationPromptRequested'
> = {
  location: null,
  locationPromptDismissed: false,
  locationPromptRequested: false,
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
    set({ location: loc, locationPromptRequested: false })
    get().notify.start({
      title: 'Location set',
      kind: 'success',
      message: formatLocation(loc),
    })
  },
  dismissLocationPrompt: () =>
    set({ locationPromptDismissed: true, locationPromptRequested: false }),
  openLocationPrompt: () => set({ locationPromptDismissed: false, locationPromptRequested: true }),
})
