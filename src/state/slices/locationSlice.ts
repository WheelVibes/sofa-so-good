import type { SliceCreator } from './types';
import type { RootState } from '../store';

export interface Location {
  lat: number;
  lon: number;
  /** Optional human-readable label (e.g. "London, UK"). Populated when
   *  the location was selected via the city search; absent for direct
   *  geolocation or manual lat/lon entry. */
  label?: string;
}

export interface LocationSlice {
  location: Location | null;
  /** True once the user has explicitly skipped the prompt or denied
   *  geolocation. The prompt should not auto-open again, but the user
   *  can re-open it from the time dropdown's footer. */
  locationPromptDismissed: boolean;
  setLocation: (loc: Location) => void;
  dismissLocationPrompt: () => void;
  /** Allows the user to reopen the prompt (e.g. via a "Change location"
   *  link). Clears `locationPromptDismissed` so the modal renders again. */
  resetLocationPrompt: () => void;
}

export const LOCATION_INITIAL: Pick<LocationSlice, 'location' | 'locationPromptDismissed'> = {
  location: null,
  locationPromptDismissed: false,
};

export const createLocationSlice: SliceCreator<LocationSlice, RootState> = (set) => ({
  ...LOCATION_INITIAL,
  setLocation: (loc) => set({ location: loc }),
  dismissLocationPrompt: () => set({ locationPromptDismissed: true }),
  resetLocationPrompt: () => set({ locationPromptDismissed: false }),
});
