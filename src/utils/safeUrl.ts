/** URL scheme sanitizer — the single trust boundary for any URL that
 *  originates from imported / user-supplied / scraped data before it is
 *  rendered into an `href`/`src` or otherwise navigated to.
 *
 *  A crafted `.sofa.json` can carry furniture defs whose `sourceUrl`,
 *  IKEA product `documents[].url`, or image URLs are
 *  `javascript:…` / `data:text/html,…`. Rendered straight into an anchor's
 *  `href`, clicking it executes script in the app origin (XSS). This util is
 *  applied (a) at the schema/import boundary (`state/schema.ts`) so bad data
 *  never enters state, and (b) at every render sink as defense in depth.
 *
 *  Only an allowlist of safe schemes is permitted. Schemes are matched after
 *  stripping leading/trailing whitespace and control characters and lowering
 *  case, because `java\tscript:`, ` javascript:`, and `JavaScript:` all parse
 *  as `javascript:` in browsers and would bypass a naive prefix check.
 */

/** Schemes we allow for navigable links (`href`). */
const SAFE_LINK_SCHEMES = ['http:', 'https:', 'mailto:']

/** Remove ASCII control chars (incl. tab / newline / NUL / DEL) and
 *  surrounding whitespace. Browsers ignore these inside a scheme, so we must
 *  too before testing — `java\tscript:alert(1)` is a live `javascript:` URL. */
function normalize(url: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars is the point
  return url.replace(/[\u0000-\u0020\u007f]/g, '').trim()
}

/** Extract the lowercased scheme (`http:`, `javascript:`, …) of a URL, or
 *  `undefined` when the URL is scheme-relative (`//host`) or path-relative. */
function schemeOf(normalized: string): string | undefined {
  // A scheme is [a-z][a-z0-9+.-]* followed by ':'. Protocol-relative `//` and
  // relative paths/fragments have no scheme.
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(normalized)
  return m ? `${m[1].toLowerCase()}:` : undefined
}

/**
 * Returns the URL when it is safe to use as a navigable link `href`, else
 * `undefined`. Safe = an allowlisted scheme (`http`/`https`/`mailto`), OR a
 * relative URL (no scheme: path-relative, fragment, query, or
 * protocol-relative `//host`, which inherits the page's https scheme).
 * Rejects `javascript:`, `data:`, `vbscript:`, `file:`, and any other scheme.
 *
 * Empty / whitespace-only / non-string input → `undefined`.
 */
export function safeUrl(url: string | null | undefined): string | undefined {
  if (typeof url !== 'string') return undefined
  const normalized = normalize(url)
  if (normalized === '') return undefined
  const scheme = schemeOf(normalized)
  // No scheme → relative or protocol-relative URL: safe (inherits page origin/scheme).
  if (scheme === undefined) return url
  if (SAFE_LINK_SCHEMES.includes(scheme)) return url
  return undefined
}

/** Convenience alias for `href={…}` props: returns a safe URL or `undefined`
 *  so the attribute is omitted (and the element falls back to inert text). */
export const safeHref = safeUrl

/** Sanitize a URL field for storage: returns the URL when safe, else
 *  `undefined` so the field is dropped from state (keeps imports
 *  back-compatible — the rest of the record is preserved). */
export const sanitizeUrlField = safeUrl
