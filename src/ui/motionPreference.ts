/**
 * U4 — the single shared "should motion be reduced right now?" gate.
 *
 * The app already honours `prefers-reduced-motion` at every animation call
 * site, but until now that was an invisible OS-only dependency: a user who
 * wants less motion but doesn't know their OS exposes this setting (or is on
 * a shared/borrowed device where they can't change it) had no in-app way to
 * ask for it. WCAG 2.2 Success Criterion 2.3.3 (Animation from Interactions)
 * lists "allowing users to set a preference that prevents animation" as an
 * accepted technique in its own right, alongside honouring the OS media
 * query — see the W3C WAI Understanding doc:
 * https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
 * Smashing Magazine's "Respecting Users' Motion Preferences" documents the
 * same in-page-toggle pattern in practice, explicitly for users who are
 * unaware of (or can't reach) the OS-level setting:
 * https://www.smashingmagazine.com/2021/10/respecting-users-motion-preferences/
 *
 * The in-app control is `AppearanceSlice.reduceMotion` (tri-state, surfaced
 * in `toolbar/AppearancePopover.tsx`, persisted like the theme/mode prefs —
 * `state/storage/appearancePrefs.ts`). It follows the exact same shape as
 * `modePref: 'light' | 'dark' | 'auto'`: `'system'` (the default) defers
 * entirely to the OS query, while an explicit `'on'`/`'off'` WINS over the OS
 * setting either way — picking "off" here means motion plays even if the OS
 * itself asks to reduce it, which is what a user picking an explicit value
 * expects (mirrors `modePref: 'light'` overriding an OS dark preference).
 *
 * Every existing `window.matchMedia('(prefers-reduced-motion: reduce)')`
 * call site now routes through this helper instead of querying the media
 * query directly — see `docs/audit/product-ux-2026-09-25.md` §5 U4 for the
 * full call-site list.
 *
 * **This helper only covers the JS half.** The app's *principal* animation
 * suppressor is CSS — the blanket `@media (prefers-reduced-motion: reduce)`
 * block in `styles/app.css` plus `parts.css`, `LoadingOverlay`,
 * `TierChangeVeil` and index.html's boot loader — and a media query cannot see
 * a store field. The preference reaches those through the `[data-reduce-motion]`
 * attribute on `<html>`, written by
 * `state/storage/appearancePrefs.ts:applyAppearance` (and pre-paint by the
 * index.html boot script); that file's docblock is the reference for the CSS
 * pattern. Until it existed (MOTION-PREF-CSS, review finding C2) both of this
 * feature's shipped captions were false. If you add a new animation, gate it on
 * BOTH: `shouldReduceMotion()` in JS, the doubled MOTION-PREF-CSS selector form
 * in CSS.
 */
import type { ReduceMotionPref } from '../state/slices/appearanceSlice'
import { useStore } from '../state/store'

/** The raw OS-level query, safe to call outside a DOM environment (tests,
 *  SSR-style module init). */
function prefersReducedMotionOS(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Resolve whether motion should be reduced right now. Reads the store fresh
 * on every call (matches the non-reactive, read-at-call-time style every
 * existing call site already had for the OS query) — callers that need to
 * re-render live when the user flips the in-app toggle mid-session should
 * also select `s.reduceMotion` themselves (see `useAmbientFx.ts`).
 */
export function shouldReduceMotion(): boolean {
  return reduceMotionFor(useStore.getState().reduceMotion)
}

/**
 * The same resolution as {@link shouldReduceMotion}, against a pref the caller has ALREADY
 * selected out of the store.
 *
 * Exists for the React call sites that must re-render when the in-app toggle flips: they subscribe
 * with `useStore((s) => s.reduceMotion)` and then need the resolved boolean to be a function of
 * that subscribed value, not of a fresh `getState()` read that the dependency array cannot see.
 * `useWetGlass.ts` is the first such caller.
 */
export function reduceMotionFor(pref: ReduceMotionPref): boolean {
  if (pref === 'on') return true
  if (pref === 'off') return false
  return prefersReducedMotionOS()
}
