import type { SliceCreator } from './types';
import type { RootState } from '../store';

export interface SelectionSlice {
  selectedItemId: string | null;
  selectedRoomId: string | null;
  selectItem: (id: string | null) => void;
  selectRoom: (id: string | null) => void;
}

export const SELECTION_INITIAL: Pick<
  SelectionSlice,
  'selectedItemId' | 'selectedRoomId'
> = {
  selectedItemId: null,
  selectedRoomId: null,
};

export const createSelectionSlice: SliceCreator<SelectionSlice, RootState> = (set) => ({
  ...SELECTION_INITIAL,
  /** Selecting an item clears the room selection (and vice versa) so the
   *  Inspector / FinishPicker never both render at once. */
  selectItem: (id) => set({ selectedItemId: id, selectedRoomId: null }),
  selectRoom: (id) => set({ selectedRoomId: id, selectedItemId: null }),
});
