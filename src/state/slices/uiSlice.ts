import type { SliceCreator } from './types';
import type { RootState } from '../store';

/** Ephemeral UI flags — opened drawers, dialogs, etc. Not persisted. */
export interface UiSlice {
  catalogOpen: boolean;
  setCatalogOpen: (open: boolean) => void;
  toggleCatalogOpen: () => void;
}

export const UI_INITIAL: Pick<UiSlice, 'catalogOpen'> = {
  catalogOpen: false,
};

export const createUiSlice: SliceCreator<UiSlice, RootState> = (set) => ({
  ...UI_INITIAL,
  setCatalogOpen: (open) => set({ catalogOpen: open }),
  toggleCatalogOpen: () => set((s) => ({ catalogOpen: !s.catalogOpen })),
});
