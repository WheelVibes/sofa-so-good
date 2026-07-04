import type { WallGaps } from '../../collision/clearanceGap'
import type { EqualSpacing } from '../../collision/equalSpacing'
import type { FurnitureItem, ParamProps } from '../../furniture/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** A move / rotate / placement awaiting an explicit tick (commit) or cross
 *  (cancel) confirmation before it's final. `transform` edits already wrote their
 *  new transform live (so the user sees the result); confirming keeps it,
 *  cancelling restores `originals`. A `placement` add can be undone wholesale by
 *  restoring `priorItems` (the items array before the add). */
export interface PendingEdit {
  kind: 'transform' | 'placement'
  ids: string[]
  originals: Array<{ id: string; position: [number, number]; rotation: number }>
  /** placement only: the items array reference captured before the add. */
  priorItems?: FurnitureItem[]
}

/** Ephemeral drag-place state — tracks the def the user is dragging
 *  and the latest cursor position in screen pixels. The PlacementGhost
 *  R3F component unprojects screen → world each render.
 *
 *  Not persisted; not surfaced to the autosave subscriber. */
export interface PlacementSlice {
  activeDefId: string | null
  /** Extra initial props merged OVER `defaultItemProps(def)` for the currently
   *  armed placement (CATALOG-VARIANT) — set when a catalog card's quick-look
   *  swatch popover chose a non-default finish/variant before arming. Session
   *  state only (not persisted); cleared whenever placement is (re)armed via
   *  `setActiveDefId` or dropped via `cancelPlacement` so a stale variant can
   *  never leak onto a later, unrelated placement. Survives a `keepArmed`
   *  stamp/shift re-commit (the whole point of "stamp this finish"). */
  armedVariantProps: ParamProps | null
  setArmedVariantProps: (props: ParamProps | null) => void
  /** Arm placement for `defId` carrying `props` as the extra initial props
   *  (CATALOG-VARIANT) — the swatch-popover equivalent of `setActiveDefId`,
   *  arming in one atomic update instead of two separate store writes. */
  armWithVariant: (defId: string, props: ParamProps) => void
  /** Sticky "stamp" placement (PARITY-STAMP-PLACE, `stampPlace` flag): when true,
   *  a plain commit click keeps the placement armed (same def + orientation) so the
   *  user can drop a row of identical items without re-selecting. Off ⇒ a click
   *  commits once and disarms (the classic single-add behaviour). The armed def is
   *  always `activeDefId`; this flag only changes whether a commit disarms. Cleared
   *  by `cancelPlacement` (Escape / Done / leaving the editor). Session-only. */
  stampMode: boolean
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
  /** The `pointerId` of the pointer that started the current drag, or null when
   *  no drag is active (BUG-1). `DragController`'s window-level pointermove/up/
   *  cancel listeners gate on this (via `isActiveDragPointer`) so a second
   *  finger's independent pointer stream can never hijack/teleport the item the
   *  first finger is dragging — only the initiating pointer drives + ends it. */
  dragPointerId: number | null
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
  /** Equal-spacing matches detected while dragging — pairs/runs of equal gaps
   *  (per axis) the dragged item lines up with, rendered as matching distance
   *  badges. Empty when no even-spacing relationship is present. */
  dragSpacings: EqualSpacing[]
  setDragSpacings: (spacings: EqualSpacing[]) => void
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
  /** A move/rotate/placement awaiting tick/cross confirmation, or null. */
  pendingEdit: PendingEdit | null
  setPendingEdit: (p: PendingEdit | null) => void
  /** Accept the pending edit (keep the change; clear the confirmation). */
  confirmPendingEdit: () => void
  /** Reject the pending edit: restore the pre-edit transform (or remove a
   *  just-placed item) and drop its dead history step. */
  cancelPendingEdit: () => void
  /** When a placement was armed via a mobile long-press on the catalog, the
   *  catalog was auto-hidden and should reappear once the placement resolves
   *  (committed, cancelled or aborted). */
  reopenCatalogAfterPlace: boolean
  setReopenCatalogAfterPlace: (v: boolean) => void
  setActiveDefId: (id: string | null) => void
  /** Arm sticky stamp placement for `defId`: arms the def AND turns on stamp mode
   *  so each commit re-arms instead of disarming. Toggles off (cancels placement)
   *  when called again with the def already armed in stamp mode. */
  startStamp: (defId: string) => void
  /** Turn stamp mode on/off without changing the armed def (e.g. a "keep placing"
   *  toggle while a def is armed). */
  setStampMode: (on: boolean) => void
  setCursor: (cursor: { x: number; y: number } | null) => void
  setGhostWorld: (pos: [number, number] | null, valid: boolean) => void
  cancelPlacement: () => void
  startDrag: (
    id: string,
    original: { position: [number, number]; rotation: number },
    offset: [number, number],
    pointerId: number | null,
    groupOriginals?: Array<{ id: string; position: [number, number]; rotation: number }>,
  ) => void
  setDragValid: (valid: boolean) => void
  endDrag: () => void
}

export const PLACEMENT_INITIAL: Pick<
  PlacementSlice,
  | 'activeDefId'
  | 'armedVariantProps'
  | 'stampMode'
  | 'cursor'
  | 'ghostWorld'
  | 'ghostValid'
  | 'ghostRotation'
  | 'draggingItemId'
  | 'dragOriginal'
  | 'dragValid'
  | 'dragOffset'
  | 'dragPointerId'
  | 'dragGroupOriginals'
  | 'dragGuides'
  | 'dragSpacings'
  | 'dragClearance'
  | 'dragWallGaps'
  | 'rotatingGizmo'
  | 'pendingEdit'
  | 'reopenCatalogAfterPlace'
> = {
  activeDefId: null,
  armedVariantProps: null,
  stampMode: false,
  pendingEdit: null,
  reopenCatalogAfterPlace: false,
  cursor: null,
  ghostWorld: null,
  ghostValid: false,
  ghostRotation: 0,
  draggingItemId: null,
  dragOriginal: null,
  dragValid: true,
  dragOffset: [0, 0],
  dragPointerId: null,
  dragGroupOriginals: [],
  dragGuides: [],
  dragSpacings: [],
  dragClearance: null,
  dragWallGaps: null,
  rotatingGizmo: false,
}

export const createPlacementSlice: SliceCreator<PlacementSlice, RootState> = (set, get) => ({
  ...PLACEMENT_INITIAL,
  // Arming a new placement resets any dialed-in ghost rotation. A plain single-add
  // arm also clears stamp mode (only `startStamp` opts into sticky placement) AND
  // any variant chosen for a previous armed def (CATALOG-VARIANT) — a fresh arm
  // always starts from the def's plain defaults unless `armWithVariant` says
  // otherwise.
  setActiveDefId: (id) =>
    set({ activeDefId: id, ghostRotation: 0, stampMode: false, armedVariantProps: null }),
  setArmedVariantProps: (armedVariantProps) => set({ armedVariantProps }),
  armWithVariant: (defId, props) =>
    set({ activeDefId: defId, ghostRotation: 0, stampMode: false, armedVariantProps: props }),
  startStamp: (defId) =>
    set((s) =>
      // Toggling the same already-armed stamp off is a cancel.
      s.activeDefId === defId && s.stampMode
        ? {
            activeDefId: null,
            stampMode: false,
            cursor: null,
            ghostWorld: null,
            ghostValid: false,
            ghostRotation: 0,
            armedVariantProps: null,
          }
        : { activeDefId: defId, stampMode: true, ghostRotation: 0, armedVariantProps: null },
    ),
  setStampMode: (on) => set({ stampMode: on }),
  setCursor: (cursor) => set({ cursor }),
  setGhostWorld: (ghostWorld, ghostValid) => set({ ghostWorld, ghostValid }),
  rotateGhost: (deltaRad) => set((s) => ({ ghostRotation: s.ghostRotation + deltaRad })),
  setReopenCatalogAfterPlace: (reopenCatalogAfterPlace) => set({ reopenCatalogAfterPlace }),
  setPendingEdit: (pendingEdit) => set({ pendingEdit }),
  confirmPendingEdit: () => {
    const reopen = get().reopenCatalogAfterPlace
    set({ pendingEdit: null, reopenCatalogAfterPlace: false })
    // A mobile long-press placement hid the catalog; bring it back now that the
    // placement is committed.
    if (reopen) get().setCatalogOpen(true)
  },
  cancelPendingEdit: () => {
    const p = get().pendingEdit
    const reopen = get().reopenCatalogAfterPlace
    if (p?.priorItems) {
      // Restore the exact pre-edit items array reference — for a placement this
      // removes the just-added item; for a transform it reverts every affected
      // item to its pre-gesture position/rotation. Because the reference matches
      // the gesture's history snapshot, dropRedundantHistory then removes the
      // now-dead undo step. Placement also clears the (now-gone) selection.
      const selReset =
        p.kind === 'placement' ? { selectedItemId: null, selectedItemIds: [] as string[] } : {}
      set({ items: p.priorItems, ...selReset })
      get().dropRedundantHistory()
    } else if (p) {
      // Fallback (no captured snapshot): restore transforms item-by-item.
      for (const o of p.originals) {
        get().moveItem(o.id, o.position)
        get().rotateItem(o.id, o.rotation)
      }
      get().dropRedundantHistory()
    }
    set({ pendingEdit: null, reopenCatalogAfterPlace: false })
    if (reopen) get().setCatalogOpen(true)
  },
  cancelPlacement: () => {
    const reopen = get().reopenCatalogAfterPlace
    set({
      activeDefId: null,
      stampMode: false,
      cursor: null,
      ghostWorld: null,
      ghostValid: false,
      ghostRotation: 0,
      reopenCatalogAfterPlace: false,
      armedVariantProps: null,
    })
    // An aborted long-press placement (Escape / right-click / drag end off-canvas)
    // should restore the catalog the long-press hid.
    if (reopen) get().setCatalogOpen(true)
  },
  startDrag: (id, original, offset, pointerId, groupOriginals) => {
    // Starting a fresh gesture commits any edit still awaiting confirmation
    // (the user moved on) so we never stack two pending edits.
    if (get().pendingEdit) get().confirmPendingEdit()
    // Snapshot before any per-frame moveItem fires so undo restores the
    // pre-drag transform of every dragged item in one step.
    get().pushHistory()
    set({
      draggingItemId: id,
      dragOriginal: original,
      dragOffset: offset,
      dragPointerId: pointerId,
      dragValid: true,
      dragGroupOriginals: groupOriginals ?? [],
    })
  },
  setDragValid: (valid) => set({ dragValid: valid }),
  setDragGuides: (dragGuides) => set({ dragGuides }),
  setDragSpacings: (dragSpacings) => set({ dragSpacings }),
  setDragClearance: (dragClearance) => set({ dragClearance }),
  setDragWallGaps: (dragWallGaps) => set({ dragWallGaps }),
  setRotatingGizmo: (rotatingGizmo) => set({ rotatingGizmo }),
  endDrag: () =>
    set({
      draggingItemId: null,
      dragOriginal: null,
      dragOffset: [0, 0],
      dragPointerId: null,
      dragValid: true,
      dragGroupOriginals: [],
      dragGuides: [],
      dragSpacings: [],
      dragClearance: null,
      dragWallGaps: null,
    }),
})
