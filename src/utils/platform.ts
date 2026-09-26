/**
 * Small platform-detection helpers shared by anything that has to branch on a
 * capability the DOM has no feature-detect for (iOS's Add-to-Home-Screen path,
 * standalone/installed display mode). Kept in one place so every caller shares
 * the same (narrow, documented) sniff instead of re-deriving it — `isIos` used
 * to live privately inside `ui/viewInAr.ts`; `pwa/installPrompt.ts` needs the
 * exact same check for the iOS coachmark (R7-M / U2), so it moved here.
 */

/** iOS (iPhone/iPad) — the platform whose Safari launches AR Quick Look directly
 *  from an `<a rel="ar">`, and the platform with no `beforeinstallprompt` event
 *  at all (Safari has never implemented it — MDN, "Window: beforeinstallprompt
 *  event", and multiple 2026 PWA-on-iOS guides confirm no change as of 2026).
 *  There is no reliable feature-detect for "this is iOS" (the event's own
 *  absence isn't iOS-specific — desktop Firefox/Safari lack it too), so this
 *  stays a UA/platform sniff; iPadOS reports as desktop Safari, so also catch
 *  the touch-Mac case. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
}

/**
 * True when the app is currently running as an installed/standalone app —
 * ORs the `display-mode` media query (Chromium/Firefox/Android, and iOS too
 * once installed) with the legacy `navigator.standalone` boolean Safari still
 * exposes. Neither signal alone covers every browser; combining both is the
 * documented cross-platform pattern. [web.dev, PWA detection](https://web.dev/learn/pwa/detection), 2026.
 */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false
  const viaMediaQuery =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  const viaIosLegacyFlag = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return viaMediaQuery || viaIosLegacyFlag
}
