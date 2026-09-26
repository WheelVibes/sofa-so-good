import { PRE_SHARE_SLOT_PREFIX } from './LocalStorageAdapter'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `before-shared-link-YYYY-MM-DD-HH-MM-SS[-N]` (see `sharedLinkBackup.ts`). */
const PRE_SHARE_RE = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})(?:-(\d+))?$/

/**
 * The name a saved-layout row (and the recovery toast) shows for a slot id
 * (R7-AA).
 *
 * User-named slots show as saved. A shared-link recovery copy's id is a
 * machine timestamp (`before-shared-link-2026-09-26-00-14-05`) that truncated
 * to the same "before-shared-link-2026-09-2…" in every list, so up to three
 * copies were told apart only by their saved-at line. They read instead as
 * "Before shared link · 26 Sep, 00:14:05" — the time the link was opened, to
 * the second, because several hops can land in one minute. A de-duplication
 * suffix (`-2`) shows as "(2)". An id that doesn't parse falls back to itself.
 */
export function slotDisplayName(slot: string): string {
  if (!slot.startsWith(PRE_SHARE_SLOT_PREFIX)) return slot
  const m = PRE_SHARE_RE.exec(slot.slice(PRE_SHARE_SLOT_PREFIX.length))
  if (!m) return slot
  const [, , mo, d, h, mi, sec, dup] = m
  const month = MONTHS[Number(mo) - 1]
  if (!month) return slot
  const when = `${Number(d)} ${month}, ${h}:${mi}:${sec}`
  return `Before shared link · ${when}${dup ? ` (${dup})` : ''}`
}
