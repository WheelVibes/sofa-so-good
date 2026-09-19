/**
 * Single source of truth for the mobile/desktop breakpoint (TB-10).
 *
 * The app switches to its mobile layout (bottom-sheet panels, the hamburger
 * toolbar, viewport-fit modals) at **≤640px**, driven from JS by toggling the
 * `body.mobile` class (see `App.tsx`) and by the `useIsMobile()` hook. Import
 * these constants instead of re-typing the literal.
 *
 * **Landscape phones (M2, mobile-ux audit 2026-09-19).** Width alone missed
 * every phone rotated to landscape — 844px-wide, so it fell through to the
 * desktop/tablet chrome (full toolbar island, floating side panels, no 44px
 * tap-target lift) at touch-hostile sizes. Added clause:
 * `(pointer: coarse) and (max-height: 500px)`. The matrix this was chosen
 * against (real device sizes, not guesses):
 *   - iPhone portrait (390×844, coarse) → mobile (width clause, unchanged)
 *   - iPhone landscape (844×390, coarse) → mobile (NEW: height clause; no
 *     current phone's landscape height reaches 500px)
 *   - iPad portrait/landscape (≥744 both axes, coarse) → unchanged (every
 *     iPad is ≥744px tall in EITHER orientation, so it never satisfies
 *     `max-height: 500px` — still classified purely by the width clause,
 *     i.e. never mobile, same as before)
 *   - A short desktop browser window (any width, `pointer: fine`) → unchanged
 *     (`pointer: coarse` excludes a mouse-driven window regardless of height)
 * `pointer: coarse` is the same primitive `WalkJoystick`/`WalkHud` already use
 * to detect touch; `hover: none` was considered but some coarse-pointer
 * hybrids (a touchscreen laptop) still report `hover: hover`, and the goal is
 * "no fine pointer", not "no hover". iOS Safari (the platform this app ships
 * a PWA for) has reported `pointer: coarse` since 13.4 (verified via web
 * search, not memory, per root CLAUDE.md's platform-quirk rule) — always
 * true on an iPhone/iPad's touchscreen, never on a trackpad/mouse. The OR is
 * written as a comma-separated media query LIST (`(max-width…), (pointer…)`),
 * not the newer `or` keyword — both parse identically, but the comma form has
 * been universally supported since CSS3 media queries with zero version risk,
 * where `or` is Media Queries Level 4 (Safari ≥16.4/Chrome ≥111/Firefox
 * ≥118); no reason to take on that risk for a query this simple.
 *
 * CSS caveat: media queries cannot read a JS constant or a `var()`, so the CSS
 * layer keeps the literal — the desktop-only rules gate on `min-width: 641px`
 * (= `MOBILE_MAX_WIDTH + 1`) and the mobile rules key off the `body.mobile`
 * class this module's query drives. Those CSS literals carry a comment pointing
 * back here; keep all four in sync if the breakpoint ever moves. Two of those
 * `min-width: 641px` desktop-only blocks (`.app-shell:has(.dock-panel…)` in
 * components.css, `.inspector .insp-head-btns` in parts.css) additionally
 * needed a `body:not(.mobile)` guard once width alone stopped implying
 * desktop — a landscape phone is 844px wide (>641) but must NOT get the
 * docked side-panel rail or the desktop icon-button grid now that a width
 * ≥641px can still be "mobile".
 */

/** The widest viewport still treated as "mobile" (inclusive), in CSS px. */
const MOBILE_MAX_WIDTH = 640

/** A touch-primary viewport at or under this CSS-px height is a phone in
 *  landscape, however wide — see the M2 note above. No current tablet is
 *  this short in either orientation. */
const MOBILE_LANDSCAPE_MAX_HEIGHT = 500

/** `matchMedia` query that is true on mobile-width viewports OR a touch
 *  device short enough to be a landscape phone (M2). A comma-separated media
 *  query list, not the `and`/`or` Level-4 syntax — see the note above. */
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px), ((pointer: coarse) and (max-height: ${MOBILE_LANDSCAPE_MAX_HEIGHT}px))`
