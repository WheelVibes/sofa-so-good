/**
 * Pure validation for the "Notes & link" inspector section's custom URL field
 * (ITEM-META). Blank input is always valid (the field is optional) — only a
 * non-empty value that isn't a well-formed http/https URL is flagged, so a
 * user can leave the field empty without ever seeing an error.
 */

/** Returns an error message for an invalid non-empty URL, else `null`. Empty/
 *  whitespace-only input is treated as "no URL" (valid). Requires an
 *  absolute `http:`/`https:` URL — mirrors `ui/shoplist.ts:sanitizeUrl`'s
 *  scheme restriction (the strictest of the app's URL policies), since this
 *  is a user-typed field, not an imported one. */
export function validateItemUrl(raw: string): string | null {
  const value = raw.trim()
  if (value === '') return null
  if (!/^https?:\/\//i.test(value)) return 'Enter a link starting with http:// or https://'
  try {
    void new URL(value)
  } catch {
    return 'That doesn’t look like a valid URL'
  }
  return null
}
