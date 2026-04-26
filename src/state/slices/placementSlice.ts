import type { SliceCreator } from './types';
import type { RootState } from '../store';

/** Ephemeral drag-place state — tracks the def the user is dragging
 *  and the latest cursor position in screen pixels. The PlacementGhost
 *  R3F component unprojects screen → world each render.
 *
 *  Not persisted; not surfaced to the autosave subscriber. */
export interface PlacementSlice {
  activeDefId: string | null;
  cursor: { x: number; y: number } | null;
  /** Latest world-space ghost position (XZ), written by PlacementGhost
   *  on each useFrame. Read by the pointer-up commit handler so it
   *  uses the same position the user sees. */
  ghostWorld: [number, number] | null;
  ghostValid: boolean;
  setActiveDefId: (id: string | null) => void;
  setCursor: (cursor: { x: number; y: number } | null) => void;
  setGhostWorld: (pos: [number, number] | null, valid: boolean) => void;
  cancelPlacement: () => void;
}

export const PLACEMENT_INITIAL: Pick<
  PlacementSlice,
  'activeDefId' | 'cursor' | 'ghostWorld' | 'ghostValid'
> = {
  activeDefId: null,
  cursor: null,
  ghostWorld: null,
  ghostValid: false,
};

export const createPlacementSlice: SliceCreator<PlacementSlice, RootState> = (set) => ({
  ...PLACEMENT_INITIAL,
  setActiveDefId: (id) => set({ activeDefId: id }),
  setCursor: (cursor) => set({ cursor }),
  setGhostWorld: (ghostWorld, ghostValid) => set({ ghostWorld, ghostValid }),
  cancelPlacement: () =>
    set({ activeDefId: null, cursor: null, ghostWorld: null, ghostValid: false }),
});
