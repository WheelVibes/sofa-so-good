import type { Tool } from './planConstants'

/** Inputs to the "does this canvas-pan release clear the selection?" decision. */
export interface PanReleaseTap {
  /** Whether the pan gesture actually moved the view (a drag, not a tap). */
  moved: boolean
  /** The active tool — only the pointer/`select` tool deselects on a bare tap. */
  tool: Tool
  /** Whether this gesture's pointer-down landed on a selectable plan element
   *  (wall/room/opening/item/…). In View mode such a tap selects the element and
   *  then bubbles to the canvas pan; clearing here would immediately undo it. */
  tappedElement: boolean
}

/**
 * True when the release of a canvas-pan gesture should clear the selection.
 *
 * A bare tap on empty canvas (no move) with the select tool deselects — this is
 * how View mode + touch clear the selection (they pan instead of marquee). But a
 * tap that landed on an element must NOT clear: the element's pointer-down already
 * selected it (View-mode tap-to-inspect), and the same gesture bubbled here as a
 * zero-move pan. Consulting `tappedElement` prevents the select→deselect flicker.
 */
export function clearsSelectionOnPanRelease({
  moved,
  tool,
  tappedElement,
}: PanReleaseTap): boolean {
  return !moved && tool === 'select' && !tappedElement
}
