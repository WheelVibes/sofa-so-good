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

/** Schemes safe to bind to an image `src` / SVG `<image href>`: the local
 *  object/data-image URLs an upload produces, plus remote http(s) and relative.
 *  Notably allows `blob:` and `data:` (needed for user-uploaded/generated
 *  images) but still rejects `javascript:`/`vbscript:` and other script-capable
 *  schemes, and — for `data:` — anything that isn't an image MIME. */
const SAFE_IMAGE_SCHEMES = ['http:', 'https:', 'blob:']

/**
 * Returns the URL when it is safe to bind to an image source (`<img src>` /
 * SVG `<image href>`), else `undefined`. Accepts http(s), `blob:` object URLs,
 * relative/protocol-relative URLs, and `data:image/*` — but rejects
 * `javascript:`, `data:text/html`, and any other script-capable scheme, so a
 * tainted URL can never be reinterpreted as HTML/script (CodeQL js/xss).
 */
export function safeImageSrc(url: string | null | undefined): string | undefined {
  if (typeof url !== 'string') return undefined
  const normalized = normalize(url)
  if (normalized === '') return undefined
  const scheme = schemeOf(normalized)
  const allowed =
    scheme === undefined || // relative / protocol-relative
    SAFE_IMAGE_SCHEMES.includes(scheme) ||
    // Allow only image data URIs (`data:image/png;…`), never `data:text/html`.
    (scheme === 'data:' && /^data:image\//i.test(normalized))
  if (!allowed) return undefined
  // Escape the HTML meta-characters so the value can never break out of an
  // attribute or be reinterpreted as markup (CodeQL js/xss). A well-formed
  // blob:/data:image/http(s) image URL contains none of these, so this is a
  // no-op on every real trace image — but it makes the sanitization explicit
  // in the returned value's dataflow.
  return url.replace(/[<>"']/g, (c) => encodeURIComponent(c))
}
