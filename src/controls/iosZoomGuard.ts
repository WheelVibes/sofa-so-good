/**
 * Stop iOS Safari from auto-zooming when a text field smaller than 16px gains
 * focus — WITHOUT bumping every field to an ugly 16px on mobile, and WITHOUT the
 * zoom-in / zoom-out flicker the previous focus-driven approach caused.
 *
 * Mechanism (web-documented — verified, not reasoned from memory):
 *  - iOS performs the focus-zoom only when the page is zoomable (no
 *    `maximum-scale`) AND the focused control's font is < 16px.
 *  - The old guard added `maximum-scale=1` on `focusin` and removed it on
 *    `focusout`. Rewriting the viewport meta *after* the field is focused makes
 *    iOS begin its auto-zoom and then snap back when the meta re-parses → a
 *    visible zoom-in-then-out flicker on every tap (and a zoom-out on blur).
 *    This is the reported bug.
 *  - Since iOS 10, Safari deliberately IGNORES `maximum-scale`/`user-scalable=no`
 *    for USER-initiated pinch-zoom (an accessibility decision), so a *permanent*
 *    `maximum-scale=1` suppresses only the automatic focus-zoom — the user can
 *    still pinch-zoom the page. No dynamic viewport rewrite ⇒ no flicker.
 *
 * We therefore set the constraint ONCE at boot, and only on iOS. Android/Chrome
 * honour `maximum-scale` per spec (so a permanent one there would block their
 * pinch-zoom) but never focus-zoom in the first place, so they are left with the
 * freely-zoomable base viewport.
 *
 * Harmless + idempotent — safe to call once at boot.
 *
 * Sources:
 *  - https://weblog.west-wind.com/posts/2023/Apr/17/Preventing-iOS-Textbox-Auto-Zooming-and-ViewPort-Sizing
 *  - https://medium.com/@yoelnacho/disable-viewport-zooming-ios-10-safari-6d5abf8bf325
 *  - https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/
 */

const BASE_VIEWPORT = 'width=device-width, initial-scale=1.0, viewport-fit=cover'
const IOS_VIEWPORT = `${BASE_VIEWPORT}, maximum-scale=1.0`

let installed = false

/** iOS (incl. iPadOS 13+, which reports as a desktop "MacIntel" but has touch). */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iP(hone|od|ad)/.test(ua)) return true
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
}

export function installIosZoomGuard(): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  // Only iOS focus-zooms; leave every other platform freely pinch-zoomable.
  if (!isIOS()) return
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return
  if (meta.getAttribute('content') !== IOS_VIEWPORT) meta.setAttribute('content', IOS_VIEWPORT)
}
