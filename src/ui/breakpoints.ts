/**
 * Single source of truth for the mobile/desktop breakpoint (TB-10).
 *
 * The app switches to its mobile layout (bottom-sheet panels, the hamburger
 * toolbar, viewport-fit modals) at **≤640px**, driven from JS by toggling the
 * `body.mobile` class (see `App.tsx`) and by the `useIsMobile()` hook. Import
 * these constants instead of re-typing the literal.
 *
 * CSS caveat: media queries cannot read a JS constant or a `var()`, so the CSS
 * layer keeps the literal — the desktop-only rules gate on `min-width: 641px`
 * (= `MOBILE_MAX_WIDTH + 1`) and the mobile rules key off the `body.mobile`
 * class this module's query drives. Those CSS literals carry a comment pointing
 * back here; keep all four in sync if the breakpoint ever moves.
 */

/** The widest viewport still treated as "mobile" (inclusive), in CSS px. */
export const MOBILE_MAX_WIDTH = 640

/** `matchMedia` query that is true on mobile-width viewports. */
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`
