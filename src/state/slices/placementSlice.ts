import type { WallGaps } from '../../collision/clearanceGap'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** Ephemeral drag-place state — tracks the def the user is dragging
 *  and the latest cursor position in screen pixels. The PlacementGhost
 *  R3F component unprojects screen → world each render.
 *
 *  Not persisted; not surfaced to the autosave subscriber. */
export interface PlacementSlice {
  activeDefId: string | null
  cursor: { x: number; y: number } | null
  /** Latest world-space ghost position (XZ), written by PlacementGhost
   *  on each useFrame. Read by the pointer-up commit handler so it
   *  uses the same position the user sees. */
  ghostWorld: [number, number] | null
  ghostValid: boolean
  /** Extra rotation (radians) the user dialed in with R before committing a
   *  placement — added to the def's defaultRotation. Reset when arming/cancelling. */
  ghostRotation: number
  rotateGhost: (deltaRad: number) => void
  /** Item currently being dragged in the scene; null when no drag is in
   *  progress. */
  draggingItemId: string | null
  /** Original [position, rotation] captured at drag start so an invalid
   *  release can revert. */
  dragOriginal: { position: [number, number]; rotation: number } | null
  /** Latest collision validity for the dragged item — drives red/green
   *  highlight + decides whether pointer-up commits or reverts. */
  dragValid: boolean
  /** Pointer offset from the item centre at drag start (XZ in metres).
   *  Subtracted each frame so the item doesn't snap-jump to the cursor. */
  dragOffset: [number, number]
  /** When the drag started on an item that's part of a multi-selection,
   *  this snapshots every member's original transform so the whole group
   *  can be translated in lock-step (and reverted if the release lands
   *  invalid). The anchor (= `draggingItemId`) is included. Empty array
   *  for single-item drags. */
  dragGroupOriginals: Array<{ id: string; position: [number, number]; rotation: number }>
  /** Active alignment guides (world lines) shown while dragging — each is a
   *  constant-X or constant-Z line the dragged item snapped to. */
  dragGuides: Array<{ axis: 'x' | 'z'; value: number }>
  setDragGuides: (guides: Array<{ axis: 'x' | 'z'; value: number }>) => void
  /** Live gap (metres) from the dragged item to the nearest wall, or null. */
  dragClearance: number | null
  setDragClearance: (gap: number | null) => void
  /** Live per-side gaps (metres) from the dragged item's footprint edges to the
   *  nearest facing wall on each side, or null when no drag / no facing wall. */
  dragWallGaps: WallGaps | null
  setDragWallGaps: (gaps: WallGaps | null) => void
  /** True while a rotate-gizmo gesture is in progress. The orbit camera is
   *  frozen during it (and during an item drag) so the gesture doesn't also
   *  spin the view — the view/edit split means camera + edit share orbit. */
  rotatingGizmo: boolean
  setRotatingGizmo: (v: boolean) => void
  setActiveDefId: (id: string | null) => void
  setCursor: (cursor: { x: number; y: number } | null) => void
  setGhostWorld: (pos: [number, number] | null, valid: boolean) => void
  cancelPlacement: () => void
  startDrag: (
    id: string,
    original: { position: [number, number]; rotation: number },
    offset: [number, number],
    groupOriginals?: Array<{ id: string; position: [number, number]; rotation: number }>,
  ) => void
  setDragValid: (valid: boolean) => void
  endDrag: () => void
}

export const PLACEMENT_INITIAL: Pick<
  PlacementSlice,
  | 'activeDefId'
  | 'cursor'
  | 'ghostWorld'
  | 'ghostValid'
  | 'ghostRotation'
  | 'draggingItemId'
  | 'dragOriginal'
  | 'dragValid'
  | 'dragOffset'
  | 'dragGroupOriginals'
  | 'dragGuides'
  | 'dragClearance'
  | 'dragWallGaps'
  | 'rotatingGizmo'
> = {
  activeDefId: null,
  cursor: null,
  ghostWorld: null,
  ghostValid: false,
  ghostRotation: 0,
  draggingItemId: null,
  dragOriginal: null,
  dragValid: true,
  dragOffset: [0, 0],
  dragGroupOriginals: [],
  dragGuides: [],
  dragClearance: null,
  dragWallGaps: null,
  rotatingGizmo: false,
}

export const createPlacementSlice: SliceCreator<PlacementSlice, RootState> = (set, get) => ({
  ...PLACEMENT_INITIAL,
  // Arming a new placement resets any dialed-in ghost rotation.
  setActiveDefId: (id) => set({ activeDefId: id, ghostRotation: 0 }),
  setCursor: (cursor) => set({ cursor }),
  setGhostWorld: (ghostWorld, ghostValid) => set({ ghostWorld, ghostValid }),
  rotateGhost: (deltaRad) => set((s) => ({ ghostRotation: s.ghostRotation + deltaRad })),
  cancelPlacement: () =>
    set({ activeDefId: null, cursor: null, ghostWorld: null, ghostValid: false, ghostRotation: 0 }),
  startDrag: (id, original, offset, groupOriginals) => {
    // Snapshot before any per-frame moveItem fires so undo restores the
    // pre-drag transform of every dragged item in one step.
    get().pushHistory()
    set({
      draggingItemId: id,
      dragOriginal: original,
      dragOffset: offset,
      dragValid: true,
      dragGroupOriginals: groupOriginals ?? [],
    })
  },
  setDragValid: (valid) => set({ dragValid: valid }),
  setDragGuides: (dragGuides) => set({ dragGuides }),
  setDragClearance: (dragClearance) => set({ dragClearance }),
  setDragWallGaps: (dragWallGaps) => set({ dragWallGaps }),
  setRotatingGizmo: (rotatingGizmo) => set({ rotatingGizmo }),
  endDrag: () =>
    set({
      draggingItemId: null,
      dragOriginal: null,
      dragOffset: [0, 0],
      dragValid: true,
      dragGroupOriginals: [],
      dragGuides: [],
      dragClearance: null,
      dragWallGaps: null,
    }),
})
