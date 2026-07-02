/** Pure pagination arithmetic for a bounded list view. Given a total item
 *  count, a page size, and a requested page index, returns the clamped page and
 *  the `[start, end)` slice bounds plus the total page count. Clamps a page that
 *  is out of range (e.g. the underlying list shrank while the user sat on a later
 *  page) back into `[0, pageCount)`, and always reports at least one page so an
 *  empty list renders a stable (empty) window rather than negative bounds. */
export function pageWindow(
  total: number,
  pageSize: number,
  page: number,
): { page: number; start: number; end: number; pageCount: number } {
  // A non-positive page size degrades to "everything on one page" rather than
  // dividing by zero.
  if (pageSize <= 0) return { page: 0, start: 0, end: total, pageCount: 1 }
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const clamped = Math.min(Math.max(0, Math.trunc(page)), pageCount - 1)
  const start = clamped * pageSize
  const end = Math.min(start + pageSize, total)
  return { page: clamped, start, end, pageCount }
}
