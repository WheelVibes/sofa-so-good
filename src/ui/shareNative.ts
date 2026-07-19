/**
 * Native OS share-sheet helpers for the hero card (UX round-3 #1, feature
 * `shareCardNative`). Pure + DOM-light so it's unit-testable with a fake
 * `navigator`-shaped object; the only browser API surface used is
 * `navigator.canShare`/`navigator.share` + the `File` constructor (both
 * present in any environment that could plausibly call this).
 *
 * Web Share API Level 2 file-sharing pattern (documented sources, followed
 * verbatim — do not "simplify" away any of these steps):
 *  - Feature-detect with `navigator.canShare({ files })` BEFORE calling
 *    `navigator.share()` — canShare is the documented way to check file
 *    support (MDN "Navigator: canShare() method"; web.dev "Integrate with
 *    the OS sharing UI with the Web Share API": "the sample handles feature
 *    detection by testing for navigator.canShare() rather than for
 *    navigator.share()").
 *  - `share()`/`canShare()` "must be invoked in response to a user action
 *    such as a click" — transient activation (MDN Navigator/share()
 *    "Security"; web.dev: "It must be invoked in response to a user action
 *    such as a click. Invoking it through the onload handler is impossible.").
 *    This is the well-known iOS Safari trap: any significant `await` (e.g.
 *    building the PNG) BEFORE calling `share()` can burn through the
 *    transient-activation window, so `share()` rejects with `NotAllowedError`
 *    as if untriggered by a gesture. The caller (`shareNative.ts`'s consumer)
 *    must build the Blob first, and only start the click→share() chain once
 *    the blob is ready — the click handler here awaits nothing before
 *    calling `navigator.share()` beyond constructing the `File` itself.
 *  - `AbortError` means the user dismissed the OS share sheet (MDN
 *    Navigator/share() "Exceptions": "AbortError — The user canceled the
 *    share operation…") — this is a normal, silent outcome, never an error
 *    toast.
 */

/** The subset of `Navigator` this module needs — lets tests pass a fake. */
export interface ShareCapableNavigator {
  canShare?: (data?: { files?: File[] }) => boolean
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>
}

/** Outcome of {@link shareCardFile}. */
export type ShareFileResult = 'shared' | 'aborted' | 'unsupported' | 'failed'

/**
 * True when `nav` both exposes `canShare` and reports it can share at least
 * one file of the given `mimeType` (a throwaway probe `File` — `canShare`
 * only inspects the file's `type`, not its bytes). Defensive against a
 * `canShare` that throws (some older/partial polyfills do) — treated as
 * unsupported rather than propagating.
 */
export function canNativeShareFiles(
  nav: ShareCapableNavigator | undefined | null,
  mimeType = 'image/png',
): boolean {
  if (!nav || typeof nav.canShare !== 'function' || typeof nav.share !== 'function') return false
  try {
    const probe = new File([''], 'probe', { type: mimeType })
    return nav.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/**
 * Share a single file (e.g. the rendered hero-card PNG blob) via the native
 * OS share sheet. Returns a result instead of throwing so callers never need
 * a try/catch: `'unsupported'` when the platform can't share this file (no
 * toast — caller falls back to download), `'aborted'` when the user cancelled
 * the sheet (no toast — this is expected, not a failure), `'shared'` on
 * success, `'failed'` for any other rejection (caller may toast an error).
 */
export async function shareCardFile(
  nav: ShareCapableNavigator | undefined | null,
  blob: Blob,
  filename: string,
  opts: { title?: string; text?: string } = {},
): Promise<ShareFileResult> {
  if (!nav || typeof nav.share !== 'function') return 'unsupported'
  const file = new File([blob], filename, { type: blob.type || 'image/png' })
  if (typeof nav.canShare === 'function') {
    let ok = false
    try {
      ok = nav.canShare({ files: [file] })
    } catch {
      ok = false
    }
    if (!ok) return 'unsupported'
  }
  try {
    await nav.share({ files: [file], title: opts.title, text: opts.text })
    return 'shared'
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return 'aborted'
    return 'failed'
  }
}
