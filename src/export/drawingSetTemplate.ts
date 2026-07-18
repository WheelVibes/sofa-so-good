/**
 * User-editable drawing-set handover metadata (TODO G5 — title-block
 * metadata): project/client identity + the drawn-by/checked-by/revision
 * fields a construction drawing set's title block carries. Mirrors
 * `quoteTemplate.ts`'s shape exactly (pure, serialisable, no I/O) so it
 * round-trips through the save schema / share links the same way.
 */

/** Supported ISO 216 paper sizes for the drawing set (TODO G2 follow-up —
 *  user-customizable paper). */
export type DrawingSetPaperSize = 'a4' | 'a3' | 'a2' | 'a1'

/** Sheet orientation. */
export type DrawingSetOrientation = 'landscape' | 'portrait'

/** User-editable identity fields shown in every sheet's title block. */
export interface DrawingSetTemplate {
  /** Project name; empty = fall back to the plan's own name. */
  projectName: string
  /** Project/site address; empty = omit the line. */
  projectAddress: string
  /** Client name; empty = omit the line. */
  client: string
  /** Drawn-by name/initials; empty = omit the line. */
  drawnBy: string
  /** Checked-by name/initials; deliberately left blank by default (a real
   *  handover leaves this for a second reviewer to sign). */
  checkedBy: string
  /** Current revision letter, e.g. "A". */
  revision: string
  /** Free-text note for the current revision's row in the revision table
   *  (e.g. "Issued for tender"); empty = a generic "Initial issue". */
  revisionNote: string
  /** Paper size for every sheet's `@page`/sheet-box CSS. Default 'a4'. */
  paperSize: DrawingSetPaperSize
  /** Sheet orientation. Default 'landscape'. */
  orientation: DrawingSetOrientation
}

/** Reproduces sensible, mostly-empty defaults — behaviour is unchanged
 *  (generic title block, A4 landscape) until the user fills in a field. */
export const DEFAULT_DRAWING_SET_TEMPLATE: DrawingSetTemplate = {
  projectName: '',
  projectAddress: '',
  client: '',
  drawnBy: '',
  checkedBy: '',
  revision: 'A',
  revisionNote: '',
  paperSize: 'a4',
  orientation: 'landscape',
}

/** True when any field differs from the default (used to decide whether to
 *  persist the template in the save schema — omit when it's the default). */
export function isNonDefaultDrawingSetTemplate(t: DrawingSetTemplate): boolean {
  const d = DEFAULT_DRAWING_SET_TEMPLATE
  return (
    t.projectName !== d.projectName ||
    t.projectAddress !== d.projectAddress ||
    t.client !== d.client ||
    t.drawnBy !== d.drawnBy ||
    t.checkedBy !== d.checkedBy ||
    t.revision !== d.revision ||
    t.revisionNote !== d.revisionNote ||
    t.paperSize !== d.paperSize ||
    t.orientation !== d.orientation
  )
}

/** Merge a partial serialised template with the default (fills in missing fields). */
export function mergeDrawingSetTemplate(partial: Partial<DrawingSetTemplate>): DrawingSetTemplate {
  return { ...DEFAULT_DRAWING_SET_TEMPLATE, ...partial }
}
