/**
 * Shared caps + the pure clamp for `ItemMeta.custom` (ITEM-META, user-defined
 * key/value fields) — imported by both the schema import boundary
 * (`state/schema.ts`) and the live-edit setter (`state/slices/itemsSlice.ts`)
 * so the two never drift. Matches the file's SEC-001 convention: clamp/drop,
 * never reject the whole record.
 */

/** Max number of custom key/value entries kept per item. */
export const CUSTOM_META_MAX_ENTRIES = 20
/** Max characters kept for a custom field's key (excess is truncated). */
export const CUSTOM_META_KEY_MAX = 40
/** Max characters kept for a custom field's value (excess is truncated). */
export const CUSTOM_META_VALUE_MAX = 500

export interface CustomMetaEntry {
  key: string
  value: string
}

/**
 * Normalize one raw (untrusted) entry: trims + length-caps both fields.
 * Returns `null` when either side is blank after trimming (dropped, not
 * kept as an empty string) or the input isn't a plain `{key, value}` shape.
 */
function clampEntry(raw: unknown): CustomMetaEntry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { key, value } = raw as Record<string, unknown>
  if (typeof key !== 'string' || typeof value !== 'string') return null
  const trimmedKey = key.trim().slice(0, CUSTOM_META_KEY_MAX)
  const trimmedValue = value.trim().slice(0, CUSTOM_META_VALUE_MAX)
  if (trimmedKey === '' || trimmedValue === '') return null
  return { key: trimmedKey, value: trimmedValue }
}

/**
 * Normalize a raw (untrusted) `custom` field into a clean, order-preserving
 * `CustomMetaEntry[]` — trims/length-caps every entry, drops blank-key/
 * blank-value entries, caps the total at `CUSTOM_META_MAX_ENTRIES` (earliest
 * entries win), and returns `undefined` for anything malformed (not an
 * array) or that normalizes to empty — never throws, matching the
 * neutralize-not-reject SEC-001 pattern used for `price`/`url` above.
 */
export function clampCustomMetaEntries(raw: unknown): CustomMetaEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: CustomMetaEntry[] = []
  for (const item of raw) {
    if (out.length >= CUSTOM_META_MAX_ENTRIES) break
    const entry = clampEntry(item)
    if (entry) out.push(entry)
  }
  return out.length > 0 ? out : undefined
}
