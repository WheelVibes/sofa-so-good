/**
 * Recent catalog search terms, persisted per-device in localStorage. Pure +
 * dependency-free (storage access is guarded) so the dedup/cap logic is unit
 * tested without a DOM. Most-recent-first, de-duplicated case-insensitively,
 * capped to a small list.
 */

const LS_KEY = 'hdb_recent_searches'
const MAX = 6

/** Parse a stored JSON array of strings, ignoring bad/again-typed data. */
export function parseRecent(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .slice(0, MAX)
  } catch {
    return []
  }
}

/**
 * Insert `query` at the front of `list`, dropping any prior case-insensitive
 * duplicate and capping the length. Blank queries are ignored (returns the list
 * unchanged). Pure — does not touch storage.
 */
export function addRecent(list: string[], query: string): string[] {
  const q = query.trim()
  if (!q) return list
  const lower = q.toLowerCase()
  const rest = list.filter((s) => s.toLowerCase() !== lower)
  return [q, ...rest].slice(0, MAX)
}

/** Read the recent list from localStorage (safe in non-browser envs). */
export function loadRecent(): string[] {
  try {
    return parseRecent(globalThis.localStorage?.getItem(LS_KEY))
  } catch {
    return []
  }
}

/** Add `query` to the persisted recents and return the new list. No-op for blanks. */
export function pushRecent(query: string): string[] {
  const next = addRecent(loadRecent(), query)
  try {
    globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(next))
  } catch {
    /* storage full / unavailable — non-critical */
  }
  return next
}

/** Clear the persisted recent searches. */
export function clearRecent(): void {
  try {
    globalThis.localStorage?.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}
