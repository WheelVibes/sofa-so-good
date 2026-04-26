import type { SliceCreator } from './types';
import type { RootState } from '../store';

export interface SelectionSlice {
  selectedItemId: string | null;
  /** Multi-selection set, populated by marquee drag and shift-click.
   *  When a single item is selected this contains exactly that id; when
   *  empty, no items are selected. `selectedItemId` mirrors the "primary"
   *  (most-recently-clicked) entry — kept for the inspector/keybinding
   *  paths that still operate on a single item. */
  selectedItemIds: string[];
  selectedRoomId: string | null;
  selectItem: (id: string | null) => void;
  setSelectedItemIds: (ids: string[]) => void;
  toggleSelectedItem: (id: string) => void;
  selectRoom: (id: string | null) => void;
}

export const SELECTION_INITIAL: Pick<
  SelectionSlice,
  'selectedItemId' | 'selectedItemIds' | 'selectedRoomId'
> = {
  selectedItemId: null,
  selectedItemIds: [],
  selectedRoomId: null,
};

export const createSelectionSlice: SliceCreator<SelectionSlice, RootState> = (set) => ({
  ...SELECTION_INITIAL,
  /** Selecting an item clears the room selection (and vice versa) so the
   *  Inspector / FinishPicker never both render at once. */
  selectItem: (id) =>
    set({
      selectedItemId: id,
      selectedItemIds: id ? [id] : [],
      selectedRoomId: null,
    }),
  setSelectedItemIds: (ids) =>
    set({
      selectedItemIds: ids,
      selectedItemId: ids.length > 0 ? ids[ids.length - 1] : null,
      selectedRoomId: null,
    }),
  toggleSelectedItem: (id) =>
    set((s) => {
      const has = s.selectedItemIds.includes(id);
      const next = has
        ? s.selectedItemIds.filter((x) => x !== id)
        : [...s.selectedItemIds, id];
      return {
        selectedItemIds: next,
        selectedItemId: next.length > 0 ? next[next.length - 1] : null,
        selectedRoomId: null,
      };
    }),
  selectRoom: (id) =>
    set({ selectedRoomId: id, selectedItemId: null, selectedItemIds: [] }),
});
