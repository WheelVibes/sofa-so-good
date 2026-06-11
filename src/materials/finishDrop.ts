/**
 * Drag-and-drop finishes (Q31) — the pure, render-agnostic core for dragging a
 * material swatch onto a target to apply it. Two halves, both unit-testable
 * without a DOM/GPU:
 *  - a typed dataTransfer payload (encode on dragstart, decode on drop), and
 *  - `resolveFinishDrop(target, payload)` mapping a drop target descriptor to an
 *    application action the caller dispatches to the store.
 *
 * Consumers: `ui/FinishPicker.tsx` swatches set the payload on dragstart; DOM
 * drop zones (Layers-panel item rows + the 3D canvas raycast surface,
 * `scene/FinishDropSurface.tsx`) decode it + resolve the action, then commit
 * via `state/finishDropApply.ts`. Keeping the routing here means every drop
 * surface shares one tested decision table. All surfaces gate on the
 * `finishDnd` feature flag.
 */

/** Custom MIME for the drag payload so we never clash with text/uri drags. */
export const FINISH_DND_MIME = 'application/x-sofa-finish'

export interface FinishDragPayload {
  /** Material/finish id (a catalog finish id, a hex colour, or `mat:<id>`). */
  finishId: string
  /** Human label for the drag image / debugging (optional). */
  label?: string
}

/** Serialise a payload for `DataTransfer.setData`. */
export function encodeFinishDrag(payload: FinishDragPayload): string {
  return JSON.stringify(payload)
}

/** Parse a `DataTransfer.getData` string; null on anything malformed/empty. */
export function decodeFinishDrag(raw: string | null | undefined): FinishDragPayload | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as unknown
    if (v && typeof v === 'object' && typeof (v as FinishDragPayload).finishId === 'string') {
      const p = v as FinishDragPayload
      if (p.finishId.length === 0) return null
      return { finishId: p.finishId, label: typeof p.label === 'string' ? p.label : undefined }
    }
  } catch {
    // not our payload
  }
  return null
}

/** A place a dragged finish can land. */
export type FinishDropTarget =
  | { kind: 'floor'; roomId: string }
  | { kind: 'wall'; roomId: string }
  | { kind: 'item'; itemId: string }

/** The resulting store mutation the caller should perform. */
export type FinishDropAction =
  | { type: 'floor'; roomId: string; finishId: string }
  | { type: 'wall'; roomId: string; finishId: string }
  | { type: 'item'; itemId: string; finishId: string }

/**
 * Resolve a drop into a concrete action. Returns null when either side is
 * missing or empty, so callers can no-op safely on a stray/foreign drop.
 */
export function resolveFinishDrop(
  target: FinishDropTarget | null | undefined,
  payload: FinishDragPayload | null | undefined,
): FinishDropAction | null {
  if (!target || !payload || !payload.finishId) return null
  switch (target.kind) {
    case 'floor':
      return target.roomId
        ? { type: 'floor', roomId: target.roomId, finishId: payload.finishId }
        : null
    case 'wall':
      return target.roomId
        ? { type: 'wall', roomId: target.roomId, finishId: payload.finishId }
        : null
    case 'item':
      return target.itemId
        ? { type: 'item', itemId: target.itemId, finishId: payload.finishId }
        : null
    default:
      return null
  }
}
