# Mobile / touch + accessibility UX audit — 2026-06-19

Scope: pure-client, evidence-based audit of (a) mobile/touch ergonomics + responsiveness
and (b) accessibility (keyboard, ARIA, focus, contrast-via-tokens). Correctness, perf and
photoreal are covered by other audits and intentionally out of scope here.

**Headline:** mobile/touch + a11y coverage is already strong. The repo has a real
`useIsMobile`/`body.mobile` bottom-sheet system (`src/styles/responsive.css`), a shared
`Modal` with focus trap + focus restore + `aria-modal` (`src/ui/Modal.tsx`), a full
OKLCH token system across light/dark × 5 themes with **no** color hex in mainstream UI,
proper pointer-based multi-touch in both the 3D camera (`OrbitControls` `touches`) and the
2D plan editor (`touchPts` pinch map), `aria-label`s on icon buttons, and keyboard-operable
swatch tiles. The findings below are real but mostly **localized** to a few non-`Modal`
custom dialogs (several dev-only), a couple of cross-cutting CSS gaps, and one missing
screen-reader announcement. None of the mainstream design loop is unusable on mobile.

Severity key: **high** = unusable-on-mobile or blocks keyboard/AT users; **med** =
degraded but workable; **low** = polish / edge nitpick.

---

## Findings (ranked)

### UX-001 — Toasts have no `aria-live` region (screen readers hear nothing) — **high**
- **File:** `src/ui/notifications/NotificationContainer.tsx:37`
- **Scenario:** Every success/error/progress notification renders into
  `<div className="toast-host">` with no `aria-live`/`role`. When an import finishes, a save
  errors, or a render completes, a sighted user sees the toast but a screen-reader user gets
  **no announcement at all** — the only feedback channel for many async actions is silent to
  AT. Toasts are a primary feedback surface (import done, save failed, copied link, etc.).
- **Fix direction:** Add `role="status"` + `aria-live="polite"` (and `aria-atomic` per toast)
  to `toast-host`; for error toasts (`n.kind === 'error'`) consider `role="alert"` /
  `aria-live="assertive"` on that toast so failures interrupt. `LoadingOverlay` and
  `FpsCounter` already model this (`role="status"` / `aria-live="polite"`).
- **Verify:** RTL test asserting `toast-host` carries `aria-live`; manual VoiceOver/NVDA pass
  triggering a notification and confirming it is spoken.

### UX-002 — Bottom-sheet panel close buttons are 26px tap targets on mobile — **med**
- **Files:** `src/styles/components.css:89` (`.icon-btn { width:26px; height:26px }`),
  `src/styles/responsive.css:153-154` (the 44px hit-area `::after` is scoped only to
  `.m-sheet-head .icon-btn`).
- **Scenario:** On a 390px phone the catalog, inspector, finish picker, Accessibility/Daylight/
  Clearance `.aux` panels, etc. dock as bottom sheets, but their header close **X** is a plain
  `.icon-btn` (26×26px) — well under the 44px touch-target guideline. Only the mobile *menu*
  sheet's X (`.m-sheet-head`) and the room-editor toolbar X get the 44px treatment; the panel
  sheets do not. Dismissing a sheet on a phone is a fiddly tap.
- **Fix direction:** Extend the existing `::after` invisible-hit-area pattern (or a `min-width/
  min-height:44px`) to `body.mobile .panel-head .icon-btn` so every bottom-docked sheet's
  close control meets 44px. Keep the 26px visual.
- **Verify:** Screenshot at 390×844 with the catalog sheet open; assert computed hit box ≥44px
  (or a CSS snapshot test).

### UX-003 — `UploadModelDialog` is a non-`Modal` overlay: no focus trap/restore, no dialog role, hardcoded color — **med** (dev-only path)
- **File:** `src/ui/upload/UploadModelDialog.tsx:256-266` (overlay/header), `:294`
  (`border-blue-500`), `:257` (`w-[560px] max-w-[90vw]`), close button `×` literal at `:265`.
- **Scenario:** This bespoke `.modal-overlay` does **not** build on the shared `Modal`. As a
  result: (1) no `role="dialog"`/`aria-modal`, so AT doesn't announce it as a dialog;
  (2) no focus move-in or focus-restore-on-close and no Tab focus trap — a keyboard user can
  Tab out into the page behind it; (3) the close control is a bare `×` glyph in a `<button>`
  whose `aria-label="Close"` is present (good) but it is **not** `aria-hidden` text; (4) it
  uses Tailwind color literal `border-blue-500` (line 294) — violates the no-hardcoded-color
  rule and won't track themes. Also `text-base`/`shadow-2xl`/`hover:bg-[...]` ad-hoc classes.
  This is the IKEA/bulk-upload path (dev-gated), so impact is limited, but it is the largest
  single concentration of the issues.
- **Fix direction:** Reparent onto the shared `Modal` (gets focus trap + restore + role +
  responsive width clamp for free), or at minimum add `role="dialog" aria-modal` + a
  focus-trap effect; replace `border-blue-500` with `var(--accent)`/token classes.
- **Verify:** RTL test asserting `role="dialog"` + focus lands inside on open + Escape restores
  focus; grep confirms no `border-blue-500` remains.

### UX-004 — `CompassModal` custom overlay lacks dialog role / focus management + hardcoded chrome — **med**
- **File:** `src/ui/toolbar/CompassModal.tsx:83-86`
- **Scenario:** The "Sun direction" dial is a custom `.modal-overlay` (not the shared `Modal`).
  The inner panel (`max-h-[90vh] … bg-[var(--surface-solid)] p-5 shadow-xl`, line 85) has no
  `role="dialog"`, no `aria-modal`, no focus-trap, no focus-restore. A keyboard user opening it
  can Tab behind it; AT doesn't announce a dialog. (`useModalGuard` suppresses hotkeys but does
  not manage focus.) The SVG dial itself is pointer-driven (good) but has no keyboard path to
  change the heading (arrow keys) — keyboard users can't set sun direction here.
- **Fix direction:** Move onto the shared `Modal`; add `role="slider"` + arrow-key handling on
  the dial (or expose the numeric heading as a focusable input — there is already a degree
  readout at line 96).
- **Verify:** RTL: open → focus inside, Escape restores; keyboard arrow changes `orientationDeg`.

### UX-005 — Hardcoded `text-green-600` status color (won't track theme/contrast) — **low** (dev-only path)
- **File:** `src/ui/catalog/RemoteBrowseTab.tsx:130,145`
- **Scenario:** The CC0 provider status pill uses Tailwind `text-green-600` for the "ready"
  state instead of a token. It's the only non-token color in a status indicator; on dark themes
  the fixed green can read off and it bypasses the token contrast guarantees. (`error` uses the
  proper `var(--danger)`.) Dev-only Browse tab, so low blast radius.
- **Fix direction:** Add/derive a success token (e.g. reuse `--accent`/a `--ok` token) and drop
  the literal. Same applies to the inline `border-blue-500 hover:bg-blue-50` in
  `src/ui/inspector/IkeaBody.tsx:301` and `text-white` literals in
  `src/scene/TapeMeasure.tsx:185` / `src/ui/Crosshair.tsx:9-10` (the latter two are
  intentional overlay-on-3D white with `mix-blend-difference`, lower priority).
- **Verify:** Grep for `-green-|-blue-|-red-|text-white|bg-white` under `src/ui`; confirm only
  the documented intentional cases remain.

### UX-006 — No global `prefers-reduced-motion` handling for sheet/fade animations — **low/med**
- **Files:** `src/styles/responsive.css:12-13` (`@keyframes sheetUp`/`sheetDrop` applied to
  every bottom sheet + menu), various `animation: fade/sheetUp` usages; the only
  `prefers-reduced-motion` rule today is `src/styles/app.css:194` (just `.walk-hud`).
- **Scenario:** A user with "Reduce motion" enabled still gets the full slide-up sheet
  transforms, fade overlays, and spinner animations across the app. Vestibular-sensitive users
  aren't accommodated app-wide; only the walk HUD opts out.
- **Fix direction:** Add a global `@media (prefers-reduced-motion: reduce)` block that neutralizes
  `animation`/`transition` (or swaps slide for instant/opacity) on `.catalog,.inspector,.aux,
  .m-sheet,.modal-overlay > .panel,.toast`, etc.
- **Verify:** Emulate reduced-motion in DevTools; confirm sheets appear without slide; a CSS
  snapshot for the media block.

### UX-007 — Toolbar tooltips are hover-only (no `:focus`), so keyboard users get no label hint — **low**
- **File:** `src/ui/toolbar/Tooltip.tsx:32-34` (`onPointerEnter`/`onPointerLeave`/`onPointerDown`)
- **Scenario:** Tooltips open on `onPointerEnter` only — tabbing to a toolbar `IconButton` with
  the keyboard never reveals the tooltip (label + shortcut chip). AT is fine (every button has
  `aria-label`), but a sighted keyboard user gets no on-screen hint of the shortcut. Minor since
  the accessible name is present.
- **Fix direction:** Also open on `onFocus` / close on `onBlur` (guard to keyboard focus so it
  doesn't double-fire after a click).
- **Verify:** RTL/keyboard: focus a toolbar button → tooltip content visible.

### UX-008 — `NotificationDetailsModal` doesn't use the shared `Modal` — **low**
- **File:** `src/ui/notifications/NotificationContainer.tsx:127-133`
- **Scenario:** The "import errors" detail dialog is a hand-rolled `.modal-overlay > .panel`
  with no `role="dialog"`/`aria-modal`, no focus trap/restore. Lower priority than UX-003/004
  because it's a short list dialog, but it's the same shared-primitive bypass.
- **Fix direction:** Reparent onto `Modal`.
- **Verify:** RTL: `role="dialog"` present, focus trapped.

### UX-009 — `UploadMaterialDialog` custom overlay lacks dialog role / focus management — **low** (dev-only)
- **File:** `src/ui/upload/UploadMaterialDialog.tsx:97`
- **Scenario:** Same pattern as UX-003 (custom `.modal-overlay`, no `role`/focus trap). Dev-only
  upload path; folded in here for completeness so the cluster gets fixed together.
- **Fix direction:** Reparent onto `Modal` (or add role + focus trap).
- **Verify:** RTL dialog-role + focus assertions.

---

## Found solid (do NOT re-audit — coverage is genuinely good)

- **Bottom-sheet responsiveness** — `src/styles/responsive.css` is thorough: tablet/compact/
  mobile breakpoints, catalog/inspector/aux/finish/plan-props all convert to inset floating
  sheets with grab handles, nav cluster hidden on touch, mobile collapsed toolbar + master-
  detail menu sheet, very-short-viewport handling, and per-screen (Edit Room / 2D / Walk) rules.
- **Safe-area insets** — `env(safe-area-inset-*)` used consistently for the mobile toolbar,
  menu sheet, all bottom sheets, FPS HUD, walk HUD, and budget HUD.
- **iOS zoom trap avoided** — `responsive.css:79-83` bumps text inputs to 16px on mobile to stop
  Safari's focus auto-zoom, deliberately preferring that over a `maximum-scale` lock (keeps
  pinch-zoom working). Good, considered call.
- **Shared `Modal`** (`src/ui/Modal.tsx`) — focus trap (Tab/Shift+Tab cycling), focus move-in on
  open + restore on close, `role="dialog"` + `aria-modal` + `aria-label`, Escape, backdrop
  click, inline-width clamp to `calc(100vw - 24px)`, modal-guard registration. This is the
  correct primitive; most issues above are dialogs that simply didn't use it.
- **`ConfirmDialog`** (`src/ui/upload/ConfirmDialog.tsx`) — `role="alertdialog"`, `aria-modal`,
  focus on cancel. Good pattern even though it's not the shared Modal.
- **3D touch** — `OrbitCamera.tsx:392` sets `touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}`
  (one-finger orbit, two-finger pinch-zoom + pan); `FirstPersonCamera` has touch-look; walk mode
  has a translucent `WalkJoystick` (pointer-capture, propagation-stopped) and `MobileLongPress`
  maps long-press → right-click. Comprehensive touch story.
- **2D plan editor touch** — `FloorPlanEditor.tsx` uses pointer events with a `touchPts` map +
  `setPointerCapture` for multi-touch pinch/pan, and a non-passive `wheel` listener for zoom;
  the rail reflows to a horizontal scroller on mobile. Drop targets are `<div>`s (per the rule).
- **Token system** — `src/styles/tokens.css` is a full OKLCH system, 5 themes × light/dark, with
  semantic `--text/--surface/--accent/--danger/--border` etc. Mainstream UI uses token classes;
  the only color literals are the documented intentional cases (rainbow conic-gradient picker
  indicators, white 3D overlays via `mix-blend-difference`) plus the dev-only leaks in UX-003/005.
- **Icon-button labeling** — `IconButton.tsx` always sets `aria-label`; 338 `aria-*`/`role`
  occurrences across 89 files; swatch tiles (`finish/swatches.tsx`) are keyboard-operable
  (`role="button"` + `tabIndex` + Enter/Space) and degrade to a labeled `<select>` on mobile;
  progress bars carry `role="progressbar"` + `aria-value*`.
- **Mobile finish picker** — swatch grid is replaced by a compact labeled dropdown + live
  preview on phones (`swatches.tsx:179`), avoiding the thin-strip 3-up grid; DnD-to-apply is
  correctly desktop-only with tap-to-apply on touch.

---

## Suggested fix order
1. UX-001 (toast `aria-live`) — small, high AT impact, isolated.
2. UX-002 (44px sheet close targets) — one CSS rule, common-path mobile.
3. UX-003 / UX-004 / UX-008 / UX-009 — reparent the four non-`Modal` overlays onto the shared
   `Modal` (knocks out focus-trap + role + the `border-blue-500` color leak together).
4. UX-006 (`prefers-reduced-motion` global block) — one media query.
5. UX-005 / UX-007 — polish.
