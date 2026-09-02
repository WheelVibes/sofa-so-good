/**
 * User-editable drawing-set handover metadata (TODO G5 — title-block
 * metadata): project/client identity + the drawn-by/checked-by/revision
 * fields a construction drawing set's title block carries. Mirrors
 * `quoteTemplate.ts`'s shape exactly (pure, serialisable, no I/O) so it
 * round-trips through the save schema / share links the same way.
 */

/** Supported ISO 216 paper sizes for the drawing set (TODO G2 follow-up —
 *  user-customizable paper). */
type DrawingSetPaperSize = 'a4' | 'a3' | 'a2' | 'a1'

/** Sheet orientation. */
type DrawingSetOrientation = 'landscape' | 'portrait'

/**
 * One PRIOR issue of the set. A professional drawing set's revision table is
 * an audit trail: it proves which sheet a contractor holds is current, and
 * what changed at each issue. Rendering only the current letter — as this file
 * did before — means a set reissued at Rev C shows "C" with no record that A
 * and B ever existed, which is the one thing the table exists to record.
 */
export interface DrawingSetRevision {
  /** Revision letter, e.g. "A". */
  letter: string
  /** Issue date as free text, exactly as it should print (this module is pure
   *  and serialisable — it never reads a clock). */
  date: string
  /** What changed at this issue, e.g. "Issued for tender". */
  note: string
}

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
  /**
   * PRIOR issues, oldest first — the revision history above the current row.
   * Absent/empty reproduces the previous single-row behaviour exactly, so
   * existing saves are unaffected. `revision`/`revisionNote` below remain THE
   * CURRENT issue (unchanged semantics), so this is purely additive.
   */
  revisions?: DrawingSetRevision[]
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
    (t.revisions?.length ?? 0) > 0 ||
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

/**
 * Every row the Revisions table should print, oldest first: the stored history
 * followed by the current issue. `currentDate` is injected (this module never
 * reads a clock) and only labels the current row — historical rows print their
 * own stored dates.
 *
 * A blank current letter falls back to 'A' and a blank note to 'Initial issue',
 * matching the previous single-row rendering. A history entry whose letter
 * duplicates the current one is dropped: re-issuing the same letter is a user
 * error, and printing it twice would make the table contradict itself.
 */
export function drawingSetRevisionRows(
  t: DrawingSetTemplate,
  currentDate: string,
): DrawingSetRevision[] {
  const letter = t.revision.trim() || 'A'
  const history = (t.revisions ?? []).filter((r) => r.letter.trim() && r.letter.trim() !== letter)
  return [
    ...history.map((r) => ({
      letter: r.letter.trim(),
      date: r.date.trim(),
      note: r.note.trim() || 'Issued',
    })),
    { letter, date: currentDate, note: t.revisionNote.trim() || 'Initial issue' },
  ]
}

/**
 * The next revision letter after `letter`: A → B … Z → AA → AB. Blank or
 * unrecognised input starts at 'A'. Uppercase-only, since a revision letter is
 * a drawing-office convention rather than free text.
 */
export function nextRevisionLetter(letter: string): string {
  const cur = letter.trim().toUpperCase()
  if (!/^[A-Z]+$/.test(cur)) return 'A'
  // Odometer increment: carry while the rightmost character is 'Z'.
  const chars = cur.split('')
  let i = chars.length - 1
  while (i >= 0) {
    if (chars[i] === 'Z') {
      chars[i] = 'A'
      i -= 1
    } else {
      chars[i] = String.fromCharCode(chars[i]!.charCodeAt(0) + 1)
      return chars.join('')
    }
  }
  return `A${chars.join('')}`
}

/**
 * Issue the set: file the current revision into the history and advance to the
 * next letter with an empty note, ready for the user to describe the next
 * change. `issuedDate` is injected (this module never reads a clock) and is
 * stamped on the row being filed, since that is the date it actually went out.
 *
 * Append-only by design — a revision table a user can silently rewrite is not
 * an audit trail. Editing the CURRENT row's fields stays possible (it hasn't
 * been issued yet); filed rows are not editable from here.
 */
export function issueRevision(t: DrawingSetTemplate, issuedDate: string): DrawingSetTemplate {
  const letter = t.revision.trim() || 'A'
  return {
    ...t,
    revisions: [
      ...(t.revisions ?? []),
      { letter, date: issuedDate, note: t.revisionNote.trim() || 'Initial issue' },
    ],
    revision: nextRevisionLetter(letter),
    revisionNote: '',
  }
}
