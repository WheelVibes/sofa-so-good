import type { SliceCreator } from './types';
import type { RootState } from '../store';
import { defaultLayout } from '../../furniture/defaultLayout';

/** Catalog-driven layout resets. Kept in their own slice so they can
 *  call into items + selection without those slices needing to know
 *  about defaultLayout. */
export interface ResetSlice {
  resetToEmpty: () => void;
  resetToDefault: () => void;
}

export const createResetSlice: SliceCreator<ResetSlice, RootState> = (set) => ({
  resetToEmpty: () => set({ items: [], selectedItemId: null }),
  resetToDefault: () => set({ items: defaultLayout(), selectedItemId: null }),
});
